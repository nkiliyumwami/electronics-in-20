# Component and interaction library

How the course is put together, and how to add a lesson. Every lesson is two files: **content** (pure data, checked by `npm run verify`) and a **scene** (a function that builds the 3D view and the controls).

The course teaches the electronics an IoT beginner needs, through one running project: **Plant Buddy**, an ESP32 plant monitor. Scenes use the IoT kit below so every lesson happens on the same bench.

## Folder map

```
src/
  content/        Pure data: lessons (m1.ts … m7.ts), modules, glossary,
                  the capstone's numbers and faults (capstone.ts).
  lessons/
    scenes/lX_Y.ts   One scene per lesson (default export: SceneFactory).
    kit.ts           espBench (ESP32 on a breadboard), the old battery bench,
                     wire paths, flows, the standard water loop.
    pumpRig.ts       The MOSFET pump driver shared by 4.2 and 4.3.
    packets.ts       Labelled data packets travelling along wires (5.2, 5.3).
    registry.ts      Lesson id → lazy scene import.
    types.ts         SceneCtx / SceneHandle contracts.
  three/          3D building blocks: stage, component library (lib.ts), the IoT
                  kit (iot.ts), bench supply, water kit, particles, effects, symbols.
  tools/          Reusable interactive tools: multimeter, breadboard wiring.
  sim/            Circuit solver and physics helpers. No 3D, no DOM.
  core/           Quiz, control panel builder, progress store, DOM helpers.
  capstone/       The capstone page (build Plant Buddy).
scripts/          verify (content maths), checks (independent recomputation),
                  solver tests, e2e task tests, smoke screenshots, docs export.
```

Units: in 3D, **1 unit = 1 cm** (breadboard pitch 0.254). The solver works in volts, amps, ohms, farads and henries.

## Adding a lesson in five steps

1. **Content**: add a `LessonContent` object to the module's file in `src/content/`. Use at most 150 words of explanation, at most 2 sentences of opening prompt, 3 questions (at least one `kind: 'task'`) and at most one `formula`. Frame it around an IoT situation, ideally Plant Buddy.
2. **Checks**: add an entry for each question that contains numbers to `scripts/checks.ts`. Recompute the answer from first principles, give the value of each wrong choice's stated mistake, and list every number allowed in the texts. Then run `npm run verify`.
3. **Scene**: create `src/lessons/scenes/lX_Y.ts` exporting `default function scene(ctx: SceneCtx): SceneHandle`.
4. **Register** it in `src/lessons/registry.ts`.
5. **Test**: add a scenario to `scripts/e2e.mjs` that performs the 3D task through the panel controls and triggers any failure state. Then run `npm run e2e`.

### A minimal scene

```ts
import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { led, resistor } from '../../three/lib';

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let high = false;
  const b = espBench(ctx);                                  // breadboard + ESP32 on USB
  const H = b.H;                                            // H(col, row) → hole position
  const res = resistor(220, H(18, 9).distanceTo(H(22, 9)));
  res.group.position.copy(H(18, 9).lerp(H(22, 9), 0.5));
  b.bb.group.add(res.group);
  stage.part(res.group, { name: 'Resistor, 220 Ω', job: 'Limits the LED current.', symbol: 'resistor' });
  const light = led('red');
  light.group.position.copy(H(22, 7).lerp(H(23, 7), 0.5));
  b.bb.group.add(light.group);
  b.jumper(b.free('D16'), H(18, 6), 'yellow', 'Signal wire from D16'); // free(pin): the one free hole next to a pin
  b.jumper(H(23, 8), H(23, 'bot-'), 'black', '');           // '' = minor wire, kept out of the parts list
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', '');
  const tag = b.tag('D16');                                 // name tag above the pin
  panel.toggle('D16 HIGH', high, (v) => {
    high = v;
    light.setLight(v ? 0.6 : 0);
    tag.set(v ? 'D16 HIGH' : 'D16 LOW', 'pin');
  });
  stage.focusObjects = [b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.3, 1), animate: false });
  return { check: (task) => ({ ok: task === 'ledOn' && high }) };
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

- `stage.real` / `stage.water`: groups for the real circuit and its water twin. Call `stage.enableWater(gap, start?)` after building both to get the **Real / Both / Water** toggle. ESP32 scenes pass `'real'` because the bench is wide; otherwise wide screens start side by side and phones in Real.
- `stage.part(obj, { name, job, symbol, actions? })`: tap shows a tooltip with the name, a one-sentence job and the schematic symbol. `actions` adds buttons (e.g. "Flip it around"). Every part also appears in the keyboard-accessible **Parts** list under the stage.
- `stage.onTap(obj, fn)`: direct manipulation (runs instead of the tooltip).
- `stage.draggable(obj, { plane?, onStart?, onMove(p), onEnd(p) })`: drag on a plane, with orbit controls paused. **Every drag needs a keyboard equivalent in the panel.**
- `stage.label(text, parent, offset, cls)`: crisp HTML label pinned to a 3D point. `cls`: `big`, `good`, `warn`, `bad`, `water`, `pin` (a dark silkscreen-style tag). Returns `{ set(text, cls?), show(bool) }`; `stage.unlabel(l)` removes one for good.
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
- `stage.hint(obj, text)`: a "start here" arrow with a short label (for example, "Tap to press" or "Drag me onto the circuit") for lessons whose first action happens in 3D. It disappears on the first tap, drag, tooltip action or control input, and it replaces the panel pulse. Used, for example, in 1.2 ("Tap D16"), 1.3, 2.1, 5.1 and 7.3.
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
| `battery(label?)` | Lying cell with a **pressure gauge** (`setVoltage(v, vmax)`); `plus`/`minus` tip positions. |
| `breadboard(cols, rails)` | `hole(col, row)`; rows 0–4 = a–e, 5–9 = f–j; rails `'top+'`, `'top-'`, `'bot+'`, `'bot-'`. **`col` is 0-based but the board prints `col + 1`**, so any text that names a column must use the printed number. |
| `wire(points, color)` / `roundedPath` | Insulated wire along a polyline; `setGlow` for shorts. |
| `ceramicCap()`, `electrolyticCap(h, r)` | The electrolytic's legs are one pitch apart (+ at −X), so it fits the ESP32's adjacent 3V3 and GND holes. |
| `mosfetTO220()`, `sot23()`, `chipPassive()`, `smdLed()`, `qfp()`, `dip()` | Packages at true size, with optional markings. |
| `button()`, `motor()`, `bulb()`, `fuse()`, `smallBoard()`, `headerPin()`, `contactShadow()`, `arrow()` | Misc. |
| `marking(w, d, lines, color?)` | Printed text on a top face ("BME280", "IRLZ44N"). |
| `M.*` materials, `setHeat`, `glowSprite` | Shared materials are never disposed. **Clone a material before changing its colour.** |

## IoT kit (`three/iot.ts`)

Beginner-first parts: big readable labels, simple shapes, real pinouts.

| Builder | Notes |
|---|---|
| `esp32()` | 30-pin ESP32 DevKit V1. `ESP32_FRONT` / `ESP32_BACK` list the pins from the USB end (`'GND2'` is the back-row GND). `pin(p)`, `markPin(p, color)`, `setBlueLed` (GPIO 2), `setPower` (red LED). `pinInfo(p)` gives the GPIO number, ADC1/ADC2 and input-only flags. |
| `plugIn(bb, esp, col)` | Puts it in rows b and i like the real board: only rows a and j stay free. Returns `free(pin)` and `colOf(pin)`. |
| `jumper(a, b, color, h)` / `jumperRoute()` | Dupont jumper with black housings; `set(a, b, h)` re-routes it. The route also feeds flow particles and packets. |
| `cell18650()` | Li-ion cell in a holder with a charge bar: `setVoltage(3.0…4.2)`, `plus`/`minus` lead ends. |
| `pottedPlant()` | `setMoisture(0..1)`: the soil darkens and the leaves perk up. `soilTop` for sensors. |
| `soilSensor()` | Capacitive soil sensor; `pins.GND/VCC/AOUT`. |
| `bme280()` | Purple breakout, pins VIN GND SCL SDA one pitch apart; `setAddress('0x77')`. |
| `pumpInCup()` | Pump in a glass of water with an outlet tube; `setRunning(on, t)` animates the drops. |
| `relayModule()`, `axialDiode()`, `usbCable()` | Relay with a LOAD SIDE marking, 1N5819-style diode (band = cathode at +X), micro-USB lead. |

**`espBench(ctx, { cols?, espCol?, usb? })`** (`lessons/kit.ts`) builds the standard bench: a breadboard (30 columns by default) with the ESP32 plugged in at the left and a USB cable. It returns `H`, `free(pin)`, `colOf(pin)`, `jumper(a, b, color, name, job?, h?)` (an empty name keeps a minor wire out of the parts list), `tag(pin, text?)` (a dark pin name tag), `around(a, hole)` (a lead route around the USB end instead of across the board), and `usb` (the cable, so a lesson can unplug it).

**Bench supply (`three/benchSupply.ts`):** `benchSupply()` with a live display and knobs that turn; call `show({ v, i, cc, vset, vmax, ilim, on })` every frame.

**Water kit (`three/water.ts`):** `pipe`, `gauge`, `pump` (`setPressure`, `spin`), `narrowing` (`setNarrow`, `setHeat`), `tank` (`setLevel`), `checkValve` (`setOpen`), `tapValve` (a tap with a small hand). `lessons/kit.ts → waterLoop()` builds the standard pump–pipe–narrowing loop.

**Flow particles (`three/particles.ts`):** `new Flow(curve, { spacing, color })`. **Density is fixed and only speed changes**: `flow.speed = currentToSpeed(amps, ref)`. Voltage is shown as pressure (gauges), never as particle count. Each charge carries a soft halo, so the flow reads at a glance even when the charges are small.

## Tools

- **Multimeter** (`tools/multimeter.ts`): `new Multimeter(stage, parent, probePoints, { modes, at })`. Probe points map 3D positions to circuit nodes. Include `meter.elements()` in your solve, then call `meter.read(solution, powered)`. It supports V / A (with a fuse that can blow) / Ω / continuity (with a beep), and `meter.controls(panel)` adds the keyboard probe pickers. `meter.probe('red')` returns a probe, for hints.
- **Breadboard wiring** (`tools/wiring.ts`): snap points; drag or tap-tap to add a wire, colour choice, remove list; `canConnect` lets you veto a wire.
- **Pump rig** (`lessons/pumpRig.ts`): the D26 → 220 Ω → IRLZ44N pump driver with pull-down, optional flyback diode, thermal model and water twin.
- **Packets** (`lessons/packets.ts`): `new Packets(stage, parent).send(points, color, text, dur)` returns a promise that resolves when the packet arrives.

## Simulation (`sim/`)

- `new Circuit(elements).dc()` or `.step(dt)` (modified nodal analysis). Elements: `R`, `V` (with optional series resistance), `I`, `SUPPLY` (CV/CC with current limit), `D` (diode/LED, piecewise linear), `SW`, `M` (MOSFET, resistance from `mosfetR(vgs)`), `C`, `L`. Results: `v(node)`, `vab`, `i(id)`, `p(id)`, `on(id)`.
- `physics.ts`: `fmt` (SI prefixes), `resistorBands`, `nearestE12`, `E12`, `heatColor`.

## Rules every lesson follows

- **IoT first:** every lesson answers "why does my ESP32 project need this?". In 3D, clarity beats realism.
- The learner manipulates the scene before reading more than two sentences.
- One mental model: voltage = pressure, current = flow, resistance = narrowness, capacitor = tank, diode = one-way valve, MOSFET = tap with a small hand.
- At most one formula, shown live with real values.
- Every component has a tooltip; every drag has a keyboard alternative; colour is never the only signal (labels carry the value).
- Failure is safe: an effect, a "What happened?" card with numbers, and Undo.
