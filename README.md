# Electronics in 20%

An interactive 3D course that teaches the small part of electronics that explains most of it. It takes an adult beginner from "what is voltage?" to "I can design and order my first circuit board" in about **2 h 56 min**: 24 lessons of 5–8 minutes in 7 modules, plus a 15-minute capstone.

Every lesson starts with a 3D scene to play with. Then comes a short explanation (150 words at most), one key takeaway and three quick questions, one of which is done in the 3D scene. Mistakes are safe: burn a resistor, blow a fuse or cook a MOSFET, read what happened, then press Undo.

Built with Vite, TypeScript and Three.js. There is no backend; progress is saved in the browser's `localStorage`.

## Run it

Requires Node.js 20 or newer (tested with 22.23).

```bash
npm install
npm run dev
```

Vite prints a **Local** URL for this computer and one or more **Network** URLs, for example `http://10.10.5.109:5173/`. Open the Network URL on a phone connected to the same Wi-Fi to test on mobile. The dev server listens on the LAN (`--host`) on purpose. If the phone cannot connect, allow Node.js through the Windows firewall for private networks.

> **Note for this machine:** Sophos Web Protection shows a "Warning: Uncategorized" page in front of `http://localhost`. Press **Continue** to reach the dev server. This is your organisation's web filter, not part of the app. The automated tests avoid it by loading the production build from disk.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-check and build to `dist/` (static files, work offline). |
| `npm run preview` | Serve the build on the LAN. |
| `npm run verify` | Content checks: word limits, prompt length, question structure, time budget, every numeric answer recomputed, every wrong-answer explanation compared with the mistake it describes, every number in a hint or feedback text audited, and DRC/ERC on the capstone board. |
| `npm run test:solver` | Circuit solver tests. |
| `npm run e2e` | Builds, then performs every "do it in 3D" task and failure state through the real UI in headless Chrome. `QUERY=nowebgl` runs the same suite on the 2D fallback. |
| `npm run smoke -- /lesson/1.2` | Screenshot plus console-error check for any routes. `WIDTH=360` tests phone width, `DARK=1` dark mode. |
| `npm run docs` | Regenerates `docs/COURSE.md` from the content. |
| `npm run check` | Type-check, solver tests and verify. |

## What's where

- **`docs/COURSE.md`**: course map (lesson, minutes, "I can now…" skill) and the full content of every lesson, including the questions, answers, hints and wrong-answer explanations. Generated from `src/content/`.
- **`docs/LIBRARY.md`**: the component and interaction library, and how to add a lesson.
- `src/content/`: all lesson text as data. `src/lessons/scenes/`: one 3D scene per lesson. `src/capstone/`: the capstone.

## Design notes

- **One mental model.** Voltage = pressure, current = flow, resistance = narrowness, capacitor = tank, diode = one-way valve, transistor = a tap turned by a small hand. Fifteen lessons have a **Real / Both / Water** toggle. Particle density is constant: speed shows current, and gauges show voltage as pressure.
- **Real numbers.** A small modified-nodal-analysis solver drives every scene (diodes, MOSFETs, capacitors, inductors and current-limited supplies included). Trace heating uses IPC-2221 (outer layer, 1 oz copper): at 3 A, +20 °C needs 0.9 mm, the middle of the 0.2–1.6 mm slider. The capstone board is checked by a real geometric DRC.
- **Accessibility.** Every 3D drag or tap has a panel equivalent. All controls are labelled native elements. Each scene lists its parts as buttons that open the same tooltip. Values are always shown as text, never as colour alone. The app supports reduced motion and light/dark themes.
- **No WebGL?** The stage shows a diagram of the scene's parts, and every control, readout and task still works. The e2e suite passes in this mode.

### Deviations from the brief, and why

- **Water view:** included where the analogy holds (15 lessons). It is left out of 3.5 (chip internals), 4.1 and 4.3 (logic levels and buses), 6.1, 6.2 and 6.4 (schematic, footprints, checks), Module 7 (manufacturing) and the capstone, because a forced analogy would confuse more than help.
- **Lesson 1.2** uses V = I × R as its live formula, and shows power as the heat meter (as agreed).
- **Q1 of 1.2:** the "0.2 mA" option now has its own explanation (1 ÷ 5 with R in kΩ), separate from "200 mA" (1000 ÷ 5).
- **Answers that aren't standard values** (250 Ω, 200 Ω) are accepted exactly, and the feedback names the nearest standard value (270 Ω, 220 Ω).
- **No GSAP:** a small built-in tween in the exploded-view controller covers the animations, which saves a dependency.
- **Footprint matching (6.2)** uses tap-part-then-tap-pads instead of free dragging, which works better on phones and has a keyboard path. Bulbs in 2.3 and the multimeter probes can be dragged.

### Known limits

- Frame rate was measured only in headless Chrome with software rendering, which says nothing about a real GPU. Check 60 fps on a mid-range laptop and a phone before release.
- Phone layout was tested by emulation at 360 px width, not on a physical device.
