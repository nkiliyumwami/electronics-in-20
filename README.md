# Electronics in 20% (for IoT beginners)

An interactive 3D course that teaches **the electronics an IoT beginner needs, and nothing more**. It is not training to become an electronics engineer: it fills the electricity gap that people starting with IoT have, always in the line of IoT. In about **2 h 57 min** (24 lessons of 5–8 minutes in 7 modules, plus a 15-minute capstone) learners build **Plant Buddy**, a battery-powered ESP32 plant monitor with a soil-moisture sensor, a BME280, a status LED and a small pump.

Every lesson starts with a 3D scene on a real-looking bench (ESP32 DevKit, breadboard, Dupont jumpers, resistors, sensors). Then comes a short explanation (150 words at most), one key takeaway and three quick questions, one of which is done in the 3D scene. Mistakes are safe: burn an LED, short the 3.3 V rail, overload a pin or cook a MOSFET, read what happened, then press Undo.

Built with Vite, TypeScript and Three.js. There is no backend; progress is saved in the browser's `localStorage`. Live at https://nkiliyumwami.github.io/electronics-in-20/ (deployed by GitHub Actions on every push to `main`).

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
| `npm run verify` | Content checks: word limits, prompt length, question structure, time budget, every numeric answer recomputed, every wrong-answer explanation compared with the mistake it describes, and every number in a hint or feedback text audited. |
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

- **IoT first.** Every lesson answers "why does Plant Buddy need this?": the LED resistor on a GPIO pin, a divider to read the battery on an ADC1 pin, a MOSFET for the pump, I2C for the BME280, deep sleep for battery life. Engineer-level topics (PCB layout, trace maths, DRC, manufacturing) were cut; they are listed in the in-app glossary as "later, if you're curious".
- **Beginner-first 3D.** Clarity beats realism: big readable pin labels, name tags on the pins in use, glow and arrows on what to touch, a guided part tour. The ESP32 DevKit plugs into rows b and i like the real 30-pin board, leaving one free hole per pin.
- **One mental model.** Voltage = pressure, current = flow, resistance = narrowness, capacitor = tank, diode = one-way valve, MOSFET = a tap turned by a small hand. Nine lessons have a **Real / Both / Water** toggle; ESP32 scenes open in the Real view. Particle density is constant: speed shows current.
- **Real numbers.** A small modified-nodal-analysis solver drives the circuits (diodes, MOSFETs, current-limited supplies). ESP32 facts used throughout: 3.3 V pins, 3.6 V absolute maximum, about 40 mA per pin (design for 20 mA), HIGH above 0.75 × 3.3 V, ADC 0–4095 most accurate up to about 2.5 V, ADC2 unusable with Wi-Fi, no internal pull-ups on GPIO 34–39, AMS1117 dropout about 1.1 V, Wi-Fi bursts about 250 mA.
- **Accessibility.** Every 3D drag or tap has a panel equivalent. All controls are labelled native elements. Each scene lists its parts as buttons that spotlight the part and open its tooltip. Values are always shown as text, never as colour alone. The app supports reduced motion and light/dark themes.
- **No WebGL?** The stage shows a diagram of the scene's parts, and every control, readout and task still works.

### Known limits

- Frame rate was measured only in headless Chrome with software rendering, which says nothing about a real GPU. Check 60 fps on a mid-range laptop and a phone before release.
- Phone layout was tested by emulation at 360 px width, not on a physical device.
