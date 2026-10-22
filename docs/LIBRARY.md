# Component and interaction library

How the course is put together, and how to add a lesson. Every lesson is two files: **content** (pure data, checked by `npm run verify`) and a **scene** (a function that builds the 3D view and the controls).

## Folder map

```
src/
  content/        Pure data: lessons (m1.ts … m7.ts), modules, glossary, the
                  night-light board design (nightlight.ts), the 3.5 datasheet.
  lessons/
    scenes/lX_Y.ts   One scene per lesson (default export: SceneFactory).
    kit.ts           Breadboard bench, wire paths, flows, the standard water loop.
    registry.ts      Lesson id → lazy scene import.
    types.ts         SceneCtx / SceneHandle contracts.
  three/          3D building blocks: stage, component library, PCB, water kit,
                  particles, effects, schematic symbols.
  tools/          Reusable interactive tools: multimeter, exploded view,
                  breadboard wiring, schematic editor.
  sim/            Circuit solver, physics helpers, DRC, ERC. No 3D, no DOM.
  core/           Quiz, control panel builder, progress store, DOM helpers.
  capstone/       The capstone page.
scripts/          verify (content maths), checks (independent recomputation),
                  solver tests, e2e task tests, smoke screenshots, docs export.
```

Units: in 3D, **1 unit = 1 cm**. Circuit boards are described in **millimetres** (`PcbBoard.at(x, y)` converts). The solver works in volts, amps, ohms, farads and henries.

## Adding a lesson in five steps

1. **Content**: add a `LessonContent` object to the module's file in `src/content/`. Use at most 150 words of explanation, at most 2 sentences of opening prompt, 3 questions (at least one `kind: 'task'`) and at most one `formula`.
2. **Checks**: add an entry for each question that contains numbers to `scripts/checks.ts`. Recompute the answer from first principles, give the value of each wrong choice's stated mistake, and list every number allowed in the texts. Then run `npm run verify`.
3. **Scene**: create `src/lessons/scenes/lX_Y.ts` exporting `default function scene(ctx: SceneCtx): SceneHandle`.
4. **Register** it in `src/lessons/registry.ts`.
5. **Test**: add a scenario to `scripts/e2e.mjs` that performs the 3D task through the panel controls and triggers any failure state. Then run `npm run e2e`.

### A minimal scene

```ts
import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, up, waterLoop } from '../kit';
import { resistor } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { fmt } from '../../sim/physics';

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let V = 5, R = 1000;
  const b = bench(ctx);                                   // mini breadboard + battery
  const H = b.bb.hole;                                    // hole(col, row) → position
  const res = resistor(R, H(11, 2).distanceTo(H(5, 2)));
  res.group.position.copy(H(11, 2).lerp(H(5, 2), 0.5));
  stage.real.add(res.group);
  stage.part(res.group, { name: 'Resistor', job: 'Resists the flow of current.', symbol: 'resistor' });
  const red = batteryPts(b.plus, 1, H(11, 0)), black = batteryPts(b.minus, -1, H(5, 0));
  addWire(ctx, red, 'red'); addWire(ctx, black, 'black');
  const flow = flowAlong(stage.real, dense([...red, up(H(11, 2), 0.3), up(H(5, 2), 0.3), ...[...black].reverse()]));
  const w = waterLoop(ctx);                               // the water twin
  const ro = panel.readout('Current');
  panel.slider({ label: 'Battery', min: 0, max: 12, step: 0.1, value: V, format: (v) => `${v.toFixed(1)} V`,
    onInput: (v) => { V = v; update(); } });
  function update() {
    const I = V / R;
    flow.speed = w.flow.speed = currentToSpeed(I, 0.005);  // speed shows current
    ro.set(fmt(I, 'A'));
  }
  stage.onUpdate((dt) => { flow.update(dt); w.flow.update(dt); });
  update();
  stage.enableWater();                                    // Real / Both / Water toggle
  stage.frame({ dir: new THREE.Vector3(0.12, 1.35, 1), animate: false });
  return { check: (task) => ({ ok: task === 'myTask' && V > 4 }) };
}
```

## The scene contract (`lessons/types.ts`)

| `ctx.` | What it is |
|---|---|
| `stage` | The 3D viewport (see below). |
| `panel` | The control panel builder (see below). |
| `fx`, `fxWater` | Smoke, sparks and flashes for the real and water views. |
| `fail({ title, text, undo?, undoLabel?, good? })` | The "What happened?" card, with Undo. Use `good: true` for a success card. |
| `clearFail()` | Dismisses the card. |

A scene returns `{ check(task) → { ok, msg? } }`. The quiz calls `check` with the question's `task` key when the learner presses "Check my scene". Return a helpful `msg` for "not yet".

**Failure pattern.** When something breaks, play an effect (`fx.flash`, `fx.sparks`, `fx.smoke`), put the model into its broken state, then call `ctx.fail` with a two-to-four sentence explanation that includes the actual numbers, and an `undo` that restores a safe state.

## Stage (`three/stage.ts`)

- `stage.real` / `stage.water`: groups for the real circuit and its water twin. Call `stage.enableWater(gap)` after building both to get the **Real / Both / Water** toggle (phones start in Real).
- `stage.part(obj, { name, job, symbol, actions? })`: tap shows a tooltip with the name, a one-sentence job and the schematic symbol. `actions` adds buttons (e.g. "Flip it around"). Every part also appears in the keyboard-accessible **Parts** list under the stage.
- `stage.onTap(obj, fn)`: direct manipulation (runs instead of the tooltip).
- `stage.draggable(obj, { plane?, onStart?, onMove(p), onEnd(p) })`: drag on a plane, with orbit controls paused. **Every drag needs a keyboard equivalent in the panel.**
- `stage.label(text, parent, offset, cls)`: crisp HTML label pinned to a 3D point. `cls`: `big`, `good`, `warn`, `bad`, `water`. Returns `{ set(text, cls?), show(bool) }`.
- `stage.frame({ dir, pad, objects, animate })`: fits the camera to the content. `stage.focusObjects = [...]` limits what the real view frames. `stage.focus(obj, distance)` flies to one object, and "⟲ View" resets.
- `stage.onUpdate((dt, t) => …)`: per-frame callback. It also runs on the no-WebGL fallback.
- No WebGL (or `?nowebgl`): the stage shows a diagram built from the registered parts, and all panel controls keep working.
- Quality: `HIGH_QUALITY` (desktops and laptops, or forced with `?hq`) turns on soft real-time shadows from the key light, plus a shadow-catching floor fitted to the content. Touch devices (or `?lowq`) keep the cheap blob shadows. Solid meshes cast shadows automatically; set `userData.noShadow` to opt out.
- **Beginner guidance** (built in, no scene code needed):
  - Hovering a part with a mouse tints it with a soft amber glow, and tapping a part flashes it, so it is always clear what is interactive.
  - Tapping a name in the **Parts** list spotlights that part in 3D: a bobbing arrow plus a glow, for about three seconds.
  - **▶ Tour** (top right) walks through every part in turn, with the arrow on the part and its card along the bottom edge. Tapping the scene or **Stop** ends it.
  - On load the camera swings in from a wider angle, and labels pop briefly when their state changes (for example, to `good` or `bad`).
  - Solving a "do it in 3D" question sets off a confetti burst above the scene.
  - Unless the scene sets a hint, the first panel control pulses (`.start-here`) until the learner touches anything.
- `stage.hint(obj, text)`: a "start here" arrow with a short label (for example, "Tap to press" or "Drag me onto the circuit") for lessons whose first action happens in 3D. It disappears on the first tap, drag, tooltip action or control input, and it replaces the panel pulse. Used in 1.3, 2.1, 3.3, 3.4, 5.3 and 6.2.
- `stage.spotlight(obj, seconds)` and `stage.flashGlow(obj, seconds)` can also be called from scenes to draw the eye. Glows are additive overlays that reuse the part's geometry and never change its materials, so scenes keep full control of colours and brightness.
- `CALM_MOTION` is true with `prefers-reduced-motion` and in automated browsers. It switches off the intro swing, the bobbing, the pulsing and the pops, while keeping the arrows and glows themselves.
- `?debug` exposes the stage as `window.__stage`. `node scripts/closeup.mjs <route> <camera x,y,z> <target x,y,z> <name>` uses it to take close-up screenshots.

## Control panel (`core/panel.ts`)

`slider({ label, min, max, value, step?, log?, snap?, nudge?, format, onInput })` (log scale for R and C; `nudge` adds −/+ buttons), `toggle(label, value, fn)`, `segmented(label, options, value, fn)`, `select(label, options, value, fn)`, `button(label, fn, cls?, parent?)`, `row()`, `readout(label)` → `set(text, state)`, `formula(title)` → `set(html)` (the live formula), `note(text)`, `bar(label)`, `chart(label, height)` (a canvas: draw with `prepCanvas` and `cssVar` for theme colours), and `custom(el)`. Every control is a labelled native element.

## Component library (`three/lib.ts`)

| Builder | Notes |
|---|---|
| `resistor(ohms, span)` | Correct 4/5-band colour code; `setValue`, `setHeat(0..1)`, `setBurnt`. Always pair it with a text label for the value. |
| `led(color, span)` | 5 mm; anode (long leg) at −X; `setLight(0..1.5)`, `setDead`, `flip`. `LED_COLORS` holds the forward voltages. |
| `battery()` | Lying cell with a **pressure gauge** (`setVoltage(v, vmax)`); `plus`/`minus` tip positions. |
| `breadboard(cols, rails)` | `hole(col, row)`; rows 0–4 = a–e, 5–9 = f–j. Use 17 columns without rails for the mini board. The printed top shows row letters and column numbers. **`col` is 0-based but the board prints `col + 1`**, so any text that names a column must use the printed number. |
| `wire(points, color)` / `roundedPath` | Insulated jumper; `setGlow` for shorts. |
| `ceramicCap()`, `electrolyticCap()` | The electrolytic has a stripe on −, `setPop(0..1)` and `flip`. |
| `mosfetTO220()`, `sot23()`, `chipPassive(l, w, 'R'/'C')`, `smdLed()`, `qfp()`, `dip()` | Packages at true size (0805 = 0.2 × 0.125 units). |
| `button()`, `motor()`, `bulb()`, `fuse()`, `smallBoard()`, `headerPin()`, `contactShadow()`, `arrow()` | Misc. |
| `marking(w, d, lines, color?)`, `smdCode(ohms)` | Printed or laser-etched text on package tops ("ATTINY85", "A09T"), and SMD resistor codes (10 kΩ → "103"). `qfp`, `dip`, `sot23`, `chipPassive`, `mosfetTO220` and `soic8` take a marking argument. |
| `M.*` materials, `setHeat`, `setHeatMap`, `glowSprite` | Shared materials are never disposed. **Clone a material before changing its colour.** |

**Water kit (`three/water.ts`):** `pipe`, `gauge`, `pump` (`setPressure`, `spin`), `narrowing` (`setNarrow`, `setHeat`), `tank` (`setLevel`), `checkValve` (`setOpen`), `tapValve` (a tap with a small hand). `lessons/kit.ts → waterLoop()` builds the standard pump–pipe–narrowing loop.

**Flow particles (`three/particles.ts`):** `new Flow(curve, { spacing, color })`. **Density is fixed and only speed changes**: `flow.speed = currentToSpeed(amps, ref)`. Voltage is shown as pressure (gauges), never as particle count. Each charge carries a soft halo (a second instanced mesh sharing the same matrices), so the flow reads at a glance even when the charges are small.

## Circuit boards (`three/pcb.ts`, `content/nightlight.ts`)

- `new PcbBoard(wmm, hmm)`, then `pad(id, net, x, y, w, h, { round?, drill? })`, `trace(id, net, pts, width)` (with `setWidth` and `material`), `via(id, net, x, y)`, `setSlots([...])` (ground-plane cut-outs), `silkDraw = (ctx2d, px) => …`, and finally `finish()`.
- Real layers in `board.layers`: `silkTop`, `maskTop` (with pad openings), `cuTop`, `core`, `cuBot` (the ground plane, with antipads), `maskBot`. `explodeItems(gap)` feeds the `Exploder`.
- `nightLight(opts)` builds the capstone board from **pure design data** (`nightlightDesign`), with parts at `PLACEMENT`. The same data drives DRC/ERC and is checked by `npm run verify`.
- Part models: `soic8()`, `jst2(pitch)`, `tactSmd()`. `PART_INFO` holds tooltip texts.

## Tools

- **Multimeter** (`tools/multimeter.ts`): `new Multimeter(stage, parent, probePoints, { modes, at })`. Probe points map 3D positions to circuit nodes. Include `meter.elements()` in your solve, then call `meter.read(solution, powered)`. It supports V / A (with a fuse that can blow) / Ω / continuity (with a beep), and `meter.controls(panel)` adds the keyboard probe pickers.
- **Exploded view** (`tools/explode.ts`): `new Exploder(stage, [{ obj, offset }])`, `controls(panel)`, `animateTo(0..1)`.
- **Breadboard wiring** (`tools/wiring.ts`): snap points; drag or tap-tap to add a wire, colour choice, remove list; `canConnect` lets you veto a wire.
- **Schematic editor** (`tools/schematic.ts`): `new SchematicEditor(parts, goalNets)`, with `nets()`, `status()` (complete nets and shorts) and `controls()` for keyboard wiring.

## Simulation (`sim/`)

- `new Circuit(elements).dc()` or `.step(dt)` (modified nodal analysis). Elements: `R`, `V` (with optional series resistance), `I`, `SUPPLY` (CV/CC with current limit), `D` (diode/LED, piecewise linear), `SW`, `M` (MOSFET, resistance from `mosfetR(vgs)`), `C`, `L`. Results: `v(node)`, `vab`, `i(id)`, `p(id)`, `on(id)`.
- `physics.ts`: `fmt` (SI prefixes), `traceRise` / `traceWidthFor` (IPC-2221 external, 1 oz), `resistorBands`, `nearestE12`, `heatColor`.
- `drc.ts`: `runDrc(design, rules)` finds clearance, shorts, unrouted nets, trace width and annular ring problems. `erc.ts`: `runErc(pins)` finds floating inputs.

## Rules every lesson follows

- The learner manipulates the scene before reading more than two sentences.
- One mental model: voltage = pressure, current = flow, resistance = narrowness, capacitor = tank, diode = one-way valve, transistor = tap with a small hand.
- At most one formula, shown live with real values.
- Every component has a tooltip; every drag has a keyboard alternative; colour is never the only signal (labels carry the value).
- Failure is safe: an effect, a "What happened?" card with numbers, and Undo.
