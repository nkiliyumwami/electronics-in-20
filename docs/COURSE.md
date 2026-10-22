# Electronics in 20% (for IoT beginners): course map and full lesson content

The electronics an IoT beginner needs, taught by building **Plant Buddy**, a battery-powered ESP32 plant monitor (soil sensor, BME280, status LED, pump).

_Generated from `src/content/` by `npm run docs`. Do not edit by hand._

**24 lessons in 7 modules, plus a 15-minute capstone: about 2 h 57 min in total.**

## Course map

| # | Lesson | Min | "I can now…" |
|---|---|---|---|
| **M1** | **Electricity your ESP32 runs on** | **20** | |
| 1.1 | Voltage, current, resistance | 6 | Explain voltage, current and resistance with water pipes; Explain why "3.3 V" always means "compared with GND" |
| 1.2 | Ohm's law: a resistor for your status LED | 7 | Pick a safe resistor for an LED on an ESP32 pin; Work out voltage, current or resistance from the other two |
| 1.3 | Using a multimeter on your project | 7 | Check the 3.3 V supply of an ESP32 project; Measure the current an LED or sensor draws |
| **M2** | **Wiring circuits that work** | **25** | |
| 2.1 | Breadboards and jumper wires | 6 | Read which breadboard holes are connected; Place an ESP32 and parts so every leg gets its own strip |
| 2.2 | GND: the shared reference | 6 | Connect a module so its signals mean the same thing to the ESP32 |
| 2.3 | Opens and shorts: why your board resets | 7 | Tell an open from a short by the symptoms; Find a broken jumper wire with the continuity beeper |
| 2.4 | Series and parallel: sharing the 3V3 rail | 6 | Power several modules from one 3.3 V rail; Add up the current a rail has to supply |
| **M3** | **Inputs: reading the world** | **28** | |
| 3.1 | Buttons, pull-ups and debouncing | 7 | Read a button reliably with INPUT_PULLUP; Explain floating pins and contact bounce |
| 3.2 | Voltage dividers and the ADC | 8 | Read a battery voltage safely on an ADC pin; Pick ADC1 pins so readings work with Wi-Fi on |
| 3.3 | Analog sensors: calibrating soil moisture | 6 | Calibrate an analog sensor into useful units |
| 3.4 | 5 V modules and a 3.3 V ESP32 | 7 | Connect a 5 V module to a 3.3 V ESP32 without damaging it |
| **M4** | **Outputs: making things happen** | **21** | |
| 4.1 | LEDs and PWM brightness | 6 | Dim an LED or slow a motor with PWM; Fit an LED the right way round |
| 4.2 | A MOSFET switch for the pump | 8 | Switch a pump or motor from a GPIO pin with a MOSFET |
| 4.3 | Motors, relays and flyback diodes | 7 | Protect the ESP32 from motor kickback with a flyback diode; Choose a safe way to switch bigger loads |
| **M5** | **Talking to sensors** | **21** | |
| 5.1 | Reading a module's pinout and datasheet | 7 | Find the four key facts in a module's datasheet; Wire an I2C sensor module to the ESP32 |
| 5.2 | I2C: two wires, many sensors | 8 | Wire several I2C sensors to one ESP32; Fix an I2C address clash |
| 5.3 | UART and SPI at a glance | 6 | Wire a UART module such as a GPS; Recognise which bus a module uses |
| **M6** | **Power for a device that lasts** | **28** | |
| 6.1 | Powering an ESP32: USB, VIN, 3V3 and batteries | 7 | Choose a safe way to power an ESP32; Run an ESP32 from a Li-ion battery |
| 6.2 | Wi-Fi bursts, brownouts and capacitors | 7 | Stop brownout resets during Wi-Fi |
| 6.3 | Battery life and deep sleep | 8 | Estimate battery life from a wake-sleep cycle; Use deep sleep to make a battery last months |
| 6.4 | Regulators: LDO or buck? | 6 | Choose between an LDO and a buck converter; Predict how hot a linear regulator will get |
| **M7** | **From breadboard to a reliable device** | **19** | |
| 7.1 | Debugging a dead device | 8 | Bring up a new build safely with a current-limited supply; Track down a short with the meter |
| 7.2 | Making it permanent | 6 | Choose how to turn a prototype into a lasting device |
| 7.3 | Safety: mains, Li-ion and outdoors | 5 | Know which jobs need certified products, never DIY |
| ★ | Capstone: build Plant Buddy | 15 | Wire a complete ESP32 device, budget its battery, and debug it |

## Module 1: Electricity your ESP32 runs on

_Voltage, current and resistance, seen through the 3.3 V pins of an ESP32._

### 1.1 Voltage, current, resistance (6 min)

**Opening prompt (before any reading):** Drag the supply voltage and watch the glowing charges speed up. Then make the resistor bigger.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Electricity is easiest to picture as water in pipes. **Voltage** is pressure: the push that makes charge move. **Current** is flow: how much charge passes a point each second. **Resistance** is how narrow the pipe is, so how hard it is for the flow to get through.
>
> Voltage is always a difference *between two points*. When a tutorial says "the ESP32 runs on 3.3 V" or "this pin is HIGH", it quietly means "3.3 V higher than GND". That is why every module you connect needs a GND wire as well.
>
> In a single loop, current is the same everywhere. Whatever flows out of the supply has to flow back in.

**Key takeaway:** Voltage pushes, current flows, resistance resists. A voltage is always measured against a second point, usually GND.

**Skills unlocked:** Explain voltage, current and resistance with water pipes; Explain why "3.3 V" always means "compared with GND"

**Q1.** A tutorial says "connect the sensor's VCC to 3.3 V". Compared with what is that 3.3 V?

- ✅ GND, the 0 V reference of the ESP32: _"3.3 V" means "3.3 V higher than GND". The reference is so common that tutorials leave it out._
- ❌ Nothing: 3.3 V is a complete measurement: _A single point has no voltage on its own. Voltage is a difference, so there is always a second point._
- ❌ The 5 V coming from USB: _Voltages on the board are measured from GND, not from 5 V. Measured from 5 V, the 3V3 pin would read 1.7 V *lower*._
- ❌ The current flowing into the sensor: _Current is a separate thing. The statement needs a reference point, and that point is GND._

  Hint: Think of the meter's two probes. Where does the black one go?

**Q2.** Which one is measured *across* a part, from one side of it to the other?

- ✅ Voltage: _Voltage is the pressure difference between the two sides of the part._
- ❌ Current: _Current is measured *through* a part: the flow passing along the wire, like a flow meter cut into a pipe._
- ❌ Both: _Only voltage. Current is the flow passing through, not a difference between two sides._

  Hint: Pressure difference or flow rate: which one needs two points?

**Q3 (do it in 3D).** Place the two probes so the meter reads **0 V**, while the supply is still switched on (above 1 V).

- Scene check: `zeroVolts`
- Hint: Put both probes on the same wire. A wire has almost no resistance, so there is no pressure difference along it.
- On success: _Same wire, same pressure, so no difference: 0 V. The supply's push only shows up *across* the resistor._

### 1.2 Ohm's law: a resistor for your status LED (7 min)

**Opening prompt (before any reading):** Tap GPIO 16 to switch the status LED on. Then slide the resistor smaller and see how far the pin can be pushed.

**The one live formula:** `V = I × R`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> An ESP32 pin set HIGH gives 3.3 V. A red LED uses about 2.0 V of that, and what is left, 1.3 V, lands across the resistor. **Ohm's law** then fixes the current: V = I × R, so I = 1.3 V ÷ R. With 220 Ω that is about 6 mA: clearly lit, and easy on the pin.
>
> A smaller resistor means more current. An ESP32 pin can supply about 40 mA at most; design for 20 mA or less. Leave the resistor out and nothing limits the current except the pin itself, which is how pins die.
>
> Heat is tiny here: the resistor turns about 8 mW into warmth. Power starts to matter in Module 4, when the ESP32 switches a pump.

**Key takeaway:** Every LED on a GPIO pin needs a resistor: R = (3.3 V − LED voltage) ÷ current. Aim for 5–15 mA.

**Skills unlocked:** Pick a safe resistor for an LED on an ESP32 pin; Work out voltage, current or resistance from the other two

**Q1.** Your ESP32 pin gives 3.3 V, the red LED needs 2.0 V, and you fit a 330 Ω resistor. How much current flows?

- Answer: **3.939 mA** (±2%; units accepted: mA, A)
- Hint: First find the voltage left for the resistor: 3.3 V − 2.0 V. Then I = V ÷ R.
- On a right answer: _3.3 V − 2.0 V = 1.3 V across the resistor, and 1.3 V ÷ 330 Ω ≈ 3.9 mA. Lit, a bit dim._
- If they enter 10 mA: _You used the full 3.3 V. The LED takes 2.0 V first, so only 1.3 V is across the resistor._
- If they enter 6.061 mA: _That is the LED's 2.0 V divided by 330 Ω. The resistor gets what is left: 3.3 V − 2.0 V = 1.3 V._
- If they enter 254 mA: _That is R ÷ V (330 ÷ 1.3). Current is V ÷ R: 1.3 V ÷ 330 Ω._

**Q2.** Plant Buddy has 3 status LEDs (red, 2.0 V), each on its own pin at about 10 mA. Which resistor do you fit to each one?

- ✅ 150 Ω: _The ideal is 1.3 V ÷ 10 mA = 130 Ω. 150 Ω is a common value just above it and gives 8.7 mA: bright enough, safe for the pin._
- ❌ 33 Ω: _1.3 V ÷ 33 Ω ≈ 39 mA, right at the pin's 40 mA maximum and double the LED's 20 mA rating._
- ❌ 330 Ω: _That works, but gives only 3.9 mA: noticeably dimmer than the 10 mA you wanted._
- ❌ 1.3 kΩ: _That is 1.3 V ÷ 1 mA, a slipped decimal point. It gives only 1.0 mA, a very dim glow._

  Hint: R = (3.3 V − 2.0 V) ÷ 10 mA. Then pick the nearest standard value that keeps the current at or below 10 mA.

**Q3 (do it in 3D).** Pick a resistor so the LED runs at between **5 and 15 mA**, with GPIO 16 switched HIGH.

- Scene check: `led5to15`
- Hint: Start at 220 Ω, then try one or two steps smaller.
- On success: _220 Ω gives 5.9 mA, 150 Ω gives 8.7 mA and 100 Ω gives 13.0 mA. All three suit a status LED; 220 Ω is the classic choice._

### 1.3 Using a multimeter on your project (7 min)

**Opening prompt (before any reading):** Drag the red and black probes onto the circuit, or pick points in the controls. Start by checking the 3V3 pin against GND.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A multimeter is the first tool to buy for IoT work. Turn the dial to choose what it measures.
>
> **Voltage:** touch the probes to two points without disconnecting anything. The first check on any project: black on GND, red on 3V3. You should see about 3.3 V.
>
> **Current:** current has to flow *through* the meter. Pull one wire out of the circuit and let the meter bridge the gap, like a flow meter cut into a pipe.
>
> In current mode the meter is almost a plain wire. Never put it straight across 3V3 and GND: that is a short circuit, and the meter's fuse blows to protect it.
>
> **Resistance:** only on parts with the power off.

**Key takeaway:** Measure voltage across, current through. First check on any board: 3.3 V between 3V3 and GND.

**Skills unlocked:** Check the 3.3 V supply of an ESP32 project; Measure the current an LED or sensor draws

**Q1.** To measure the current through Plant Buddy's status LED, you have to…

- ❌ touch the probes to both legs of the LED: _That measures the voltage across the LED, not the current through it._
- ✅ break the circuit and let the meter bridge the gap: _All the current has to pass through the meter, like a flow meter cut into a pipe._
- ❌ unplug the USB and measure resistance: _With the power off no current flows at all, and resistance mode measures something else._

  Hint: Current is flow. Where would you put a flow meter in a pipe?

**Q2.** The dial is on amps, and you touch the probes to the ESP32's 3V3 and GND pins. What happens?

- ❌ It shows how much current the ESP32 draws: _To measure that, the meter must be *in* the supply line. Across 3V3 and GND it is a shortcut instead._
- ✅ A short circuit: a big current rushes through the meter and its fuse blows: _The meter is nearly a wire, so it shorts 3V3 to GND. The fuse blows (and the ESP32 resets)._
- ❌ Nothing, it reads 0: _Current mode is almost a wire, so a lot flows, not nothing._

  Hint: In current mode the meter is almost a plain wire.

**Q3 (do it in 3D).** Measure the current through the LED. The meter has to actually show it.

- Scene check: `measureLedCurrent`
- Hint: Amps mode, then put the probes on the two ends of the link wire's gap, after taking the link out.
- On success: _About 5.9 mA: (3.3 V − 2.0 V) ÷ 220 Ω. The meter's own tiny resistance barely changes it._

## Module 2: Wiring circuits that work

_Breadboards, jumper wires, GND, and the opens and shorts behind most "it doesn't work" moments._

### 2.1 Breadboards and jumper wires (6 min)

**Opening prompt (before any reading):** Tap any hole to light up every hole joined to it underneath. Then move the LED until it lights.

**Water view:** no

**Explanation**

> A breadboard hides metal strips under its holes. In the middle, each short column of 5 holes (a–e, and separately f–j) is one strip: anything plugged into the same strip is connected. The long red and blue **rails** along the edges run the whole length and carry 3.3 V and GND.
>
> The groove down the middle separates the two halves. The ESP32 sits across it, so each of its pins gets a strip of its own.
>
> The ESP32 DevKit is wide: on a standard breadboard it leaves just one free hole next to each pin. That is room for one jumper wire per pin, so plan your wiring.
>
> A part with both legs in the same strip is bypassed: the current takes the metal strip instead.

**Key takeaway:** Same strip = connected. Give each leg of a part its own column, and use the rails for 3.3 V and GND.

**Skills unlocked:** Read which breadboard holes are connected; Place an ESP32 and parts so every leg gets its own strip

**Q1.** You plug an LED's two legs into holes 12a and 12c. What happens?

- ✅ It never lights: both legs are on the same strip, which bypasses it: _The strip connects the two legs directly, so the current goes through the metal, not the LED._
- ❌ It lights normally: _Both legs sit on one strip, so there is no voltage across the LED. It stays dark._
- ❌ It lights only if you add a resistor: _A resistor does not help while the strip bypasses the LED. Move one leg to another column._

  Hint: Holes a to e in one column share a single metal strip.

**Q2.** Why does the ESP32 DevKit sit across the groove in the middle of the breadboard?

- ✅ So each pin gets its own strip; otherwise opposite pins would be joined together: _Across the groove, the left and right rows of pins land on different strips, so no two pins are shorted._
- ❌ To keep the board cool: _The groove has nothing to do with cooling. It keeps the two rows of pins electrically apart._
- ❌ Because the rails only work in the middle: _The rails run along the outer edges. The groove keeps the two rows of pins apart._

  Hint: What would happen to two pins opposite each other if they were on the same side?

**Q3 (do it in 3D).** Move the LED so it lights up.

- Scene check: `ledLit`
- Hint: The resistor ends in one column; the LED's other leg needs a column of its own that is wired to GND.
- On success: _Now each leg has its own strip: one shared with the resistor, one with the wire to GND. The current has to pass through the LED._

### 2.2 GND: the shared reference (6 min)

**Opening prompt (before any reading):** The ESP32 reads a sensor box that runs on its own battery, but the readings glitch. Press the sensor's test button a few times, then add one wire to fix it.

**Water view:** no

**Explanation**

> A signal wire carries a voltage, and a voltage only means something compared with a reference. The sensor says "HIGH" by putting 3.3 V on its output, *measured from its own GND*.
>
> If the ESP32's GND is not joined to the sensor's GND, they share no reference. To the ESP32 the signal floats and drifts with every bit of electrical noise, so the readings glitch.
>
> The fix is one wire: GND to GND. Every module you connect needs it, even one with its own power supply. The GND wire also gives the signal's current a path home.
>
> Wiring rule for every module: power, GND, signal.

**Key takeaway:** Every module shares GND with the ESP32. A signal without a shared GND is meaningless.

**Skills unlocked:** Connect a module so its signals mean the same thing to the ESP32

**Q1.** A sensor box with its own battery is joined to the ESP32 by a single signal wire. Why do the readings glitch?

- ✅ There is no shared GND, so the signal's voltage has no reference: _Without a shared GND, the signal is not measured from anything the ESP32 knows about, so it reads noise._
- ❌ The signal wire is too thin: _Thickness hardly matters for a tiny signal current. The two sides just do not share a reference._
- ❌ The two batteries cancel each other out: _The batteries are not connected to each other, so they cannot cancel. What is missing is a shared GND._

  Hint: A voltage is always measured from somewhere. Where is the ESP32 measuring from?

**Q2.** In an ESP32 project, what is GND?

- ✅ The 0 V reference that every voltage is measured from, shared by all modules: _That is all GND is: the agreed 0 V point, wired to every module._
- ❌ A wire that has to go into the earth: _Mains equipment is sometimes earthed for safety, but in a project GND just means the shared 0 V reference._
- ❌ Where used-up current disappears: _Current is never used up. It flows back to its source, usually along the GND wire._

  Hint: Think back to the meter: it always needs a reference point.

**Q3 (do it in 3D).** Add a wire so the ESP32 reads the sensor's button correctly every time, with no glitches and no faults.

- Scene check: `fixGround`
- Hint: Connect the sensor box's GND to the ESP32's GND. Drag between the two pins, or use the "Add a wire" controls.
- On success: _With one shared GND, both sides agree on what 0 V is, so the sensor's HIGH is HIGH for the ESP32 too._

### 2.3 Opens and shorts: why your board resets (7 min)

**Opening prompt (before any reading):** Break this working circuit two ways: pull out a jumper, then bridge 3V3 to GND. Every mistake can be undone.

**Water view:** no

**Explanation**

> Most "it doesn't work" moments are one of two faults. An **open** is a gap: a jumper not pushed fully in, or a wire broken inside its insulation. No path, no current, so the LED or sensor just stays dead.
>
> A **short** is a shortcut: 3V3 touching GND through a stray wire, or two legs on the same strip. A huge current flows, the voltage collapses, and the ESP32 resets, or your computer switches the USB port off to protect itself.
>
> To hunt an open, unplug the USB and set the meter to continuity. It beeps when two points are connected, so test each jumper from end to end.

**Key takeaway:** Dead circuit: look for an open. Resetting board or a USB port that cuts out: look for a short.

**Skills unlocked:** Tell an open from a short by the symptoms; Find a broken jumper wire with the continuity beeper

**Q1.** Your ESP32 keeps resetting, and the computer warns that the USB device draws too much power. Short or open?

- ✅ A short: _A short lets a huge current flow, so the voltage collapses and the USB port protects itself._
- ❌ An open: _An open stops current flowing, so nothing would draw too much power. This is a short._

  Hint: Which fault makes a lot of current flow?

**Q2.** With the USB unplugged, you hold the meter on continuity across a jumper wire, end to end. It stays silent. What does that tell you?

- ✅ The jumper is broken inside: it is an open: _Silence means no connection between its two ends. Replace that jumper._
- ❌ The jumper is fine: _A good jumper connects its two ends, so the meter would beep._
- ❌ There is a short somewhere else: _Continuity across one wire only tests that wire. Silence means this wire is open._

  Hint: The beeper sounds when two points are connected.

**Q3 (do it in 3D).** Tap **Start the fault hunt**. One jumper is secretly broken. Find it with the beeper, then replace only that wire.

- Scene check: `faultHunt`
- Hint: USB unplugged, meter on continuity, probes on both ends of each jumper in turn.
- On success: _Testing each wire end to end finds an open in seconds, without unplugging anything else._

### 2.4 Series and parallel: sharing the 3V3 rail (6 min)

**Opening prompt (before any reading):** Switch between series and parallel, then pull one LED out. Which wiring keeps the other one lit?

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Parts can share a supply two ways. In **parallel**, each part connects straight across 3V3 and GND, so each gets the full 3.3 V and works on its own. That is how every module in Plant Buddy is powered: straight off the rails.
>
> In **series**, parts sit one after another in a single loop. The same current flows through all of them, and they share the voltage. Pull one out and the loop is broken for all of them.
>
> Currents in parallel add up: the rail supplies the sum of what every module draws. Voltages in series add up too: two red LEDs need 2.0 + 2.0 = 4.0 V, more than 3.3 V, so in series on a 3.3 V supply they stay dark.

**Key takeaway:** Power modules in parallel from the rails: each gets 3.3 V, and their currents add up.

**Skills unlocked:** Power several modules from one 3.3 V rail; Add up the current a rail has to supply

**Q1.** From the 3V3 rail, the soil sensor draws 5 mA and the status LED 6 mA, both in parallel. How much current does the rail supply?

- Answer: **11 mA** (±1%; units accepted: mA, A)
- Hint: In parallel, the currents add up.
- On a right answer: _5 mA + 6 mA = 11 mA. Each part takes its own share, and the rail supplies the total._
- If they enter 6 mA: _That is only the biggest current. In parallel, every branch adds to the total: 5 mA + 6 mA._

**Q2.** Two red LEDs (2.0 V each) and a resistor are wired in series to a 3.3 V pin. Why don't they light?

- ✅ Together they need 4.0 V, more than the 3.3 V available: _2.0 V + 2.0 V = 4.0 V. With only 3.3 V, no current flows, so neither lights._
- ❌ The resistor is too big: _No resistor value helps: the two LEDs alone need 4.0 V and the pin gives only 3.3 V._
- ❌ LEDs can never be wired in series: _They can, with a high enough supply, such as 5 V. On 3.3 V it is not enough._

  Hint: In series, the voltages add up.

**Q3 (do it in 3D).** Set things up so that one LED is pulled out and the other one is **still lit**.

- Scene check: `oneOutOtherLit`
- Hint: Which wiring gives each LED its own path to GND?
- On success: _In parallel each LED has its own path from 3V3 to GND, so removing one does not affect the other. That is why modules hang off the rails in parallel._

## Module 3: Inputs: reading the world

_Buttons, the ADC, sensors and 5 V modules: getting clean readings into the ESP32._

### 3.1 Buttons, pull-ups and debouncing (7 min)

**Opening prompt (before any reading):** Don't touch the button: watch the pin's reading on its own. Then turn on the pull-up.

**Water view:** no

**Explanation**

> A button connects a pin to GND while it is pressed. When it is not pressed, the pin is connected to nothing: it **floats**, picks up noise like an antenna, and reads HIGH, LOW, HIGH at random.
>
> A **pull-up** resistor gently holds the pin at 3.3 V, so it reads HIGH until the button pulls it down to GND. The ESP32 has one built in: `pinMode(pin, INPUT_PULLUP)`. Careful: GPIO 34 to 39 have no internal pull-ups, so add a 10 kΩ resistor to 3V3 there.
>
> Button contacts also **bounce**: one press makes and breaks contact several times within a few milliseconds, so your code sees several presses. **Debouncing** means ignoring changes for about 20–50 ms after the first one.

**Key takeaway:** Every button pin needs a pull-up (built in, or 10 kΩ to 3V3) and debouncing in code.

**Skills unlocked:** Read a button reliably with INPUT_PULLUP; Explain floating pins and contact bounce

**Q1.** A button connects GPIO 27 to GND, and there is no pull-up. The button is not pressed. What does the pin read?

- ✅ Random HIGHs and LOWs: the pin is floating: _Connected to nothing, the pin picks up noise and changes its mind all the time._
- ❌ Always LOW: _Only while pressed is it tied to GND. Released, it is connected to nothing, so it floats._
- ❌ Always HIGH: _That needs a pull-up to 3.3 V, and there isn't one. It floats._

  Hint: What is the pin connected to while the button is open?

**Q2.** With INPUT_PULLUP on and the button wired to GND, what does the pin read while the button is pressed?

- ✅ LOW: _The button ties the pin straight to GND. The weak pull-up only takes over again when you let go._
- ❌ HIGH: _HIGH is what it reads when *not* pressed. Pressed, the button pulls it to GND._
- ❌ It floats: _With a pull-up fitted, the pin never floats: HIGH when released, LOW when pressed._

  Hint: The pull-up resistor is weak; the button is a direct path to GND.

**Q3 (do it in 3D).** Make one press of the button count **exactly once** on the counter.

- Scene check: `countOnce`
- Hint: You need two fixes: a pull-up, so the pin does not float, and debouncing, so the bounces are ignored. Then reset the counter and press once.
- On success: _The pull-up gives the pin a definite HIGH, and debouncing ignores the contact bounce. One press, one count._

### 3.2 Voltage dividers and the ADC (8 min)

**Opening prompt (before any reading):** Drain the battery with the slider and watch the ESP32's reading. Then try reading the battery without the divider.

**The one live formula:** `Vout = Vin × R2 ÷ (R1 + R2)`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> An ESP32 can measure a voltage on its **ADC** pins and turn it into a number from 0 to 4095. It can only measure up to 3.3 V, though, and a full Li-ion battery is 4.2 V. Feed that straight in and you exceed the pin's 3.6 V limit.
>
> A **voltage divider** fixes it: two resistors in series share the voltage in proportion to their size. Two equal resistors halve it, so 4.2 V becomes 2.1 V, inside the ADC's most accurate range (about 0.15 to 2.5 V). In code, multiply back by 2.
>
> Use big values such as 100 kΩ: the divider then drains only 21 µA from the battery. And use ADC1 pins (GPIO 32 to 39): the ADC2 pins stop working while Wi-Fi is on.

**Key takeaway:** Never put more than 3.3 V on an ESP32 pin. Scale bigger voltages down with a divider and multiply back in code.

**Skills unlocked:** Read a battery voltage safely on an ADC pin; Pick ADC1 pins so readings work with Wi-Fi on

**Q1.** A divider has R1 = 100 kΩ on top and R2 = 47 kΩ at the bottom, fed from 5 V USB. What voltage reaches the ADC pin?

- Answer: **1.599 V** (±1%; units accepted: V)
- Hint: Vout = Vin × R2 ÷ (R1 + R2). The pin sits across R2, the bottom resistor.
- On a right answer: _5 V × 47 kΩ ÷ 147 kΩ ≈ 1.60 V: well inside the ADC's range._
- If they enter 3.401 V: _That is the voltage across R1, the top resistor. The pin sits across R2: use R2 on top of the fraction._
- If they enter 2.35 V: _You divided by R1 only. Divide by the total, R1 + R2 = 147 kΩ._

**Q2.** The battery reading works on USB, but turns to nonsense once Wi-Fi starts. The divider goes to GPIO 4. Why?

- ✅ GPIO 4 is an ADC2 pin, and ADC2 can't be used while Wi-Fi is on. Move it to GPIO 32 to 39.: _Wi-Fi takes over ADC2. The ADC1 pins (GPIO 32 to 39) keep working._
- ❌ The battery goes flat when Wi-Fi starts: _Wi-Fi uses more current, but the reading would drop a little, not turn to nonsense. ADC2 is the problem._
- ❌ The resistors are too big: _Big resistors are fine for a slow battery reading. The pin choice is the problem._
- ❌ The ADC needs 5 V: _The ADC works on 3.3 V. The problem is that GPIO 4 belongs to ADC2._

  Hint: Not every ADC pin works all the time.

**Q3 (do it in 3D).** Choose R1 and R2 so a full battery (4.2 V) gives **1.8–2.5 V** at the pin, and the divider draws **less than 50 µA**.

- Scene check: `dividerSafe`
- Hint: Equal resistors halve the voltage. Then make them big enough that 4.2 V ÷ (R1 + R2) is under 50 µA.
- On success: _100 kΩ and 100 kΩ give 2.1 V and draw 21 µA. 10 kΩ pairs give the same voltage but waste 210 µA, all day, every day._

### 3.3 Analog sensors: calibrating soil moisture (6 min)

**Opening prompt (before any reading):** Let the soil dry out and water it again, watching the raw reading. Then record a dry and a wet reading to calibrate.

**The one live formula:** `% wet = (DRY − reading) ÷ (DRY − WET) × 100`

**Water view:** no

**Explanation**

> Most sensors don't speak percent. The capacitive soil sensor puts out a voltage, and the ESP32's ADC turns it into a raw number from 0 to 4095. Odd but true: *wetter soil gives a lower number*.
>
> To turn raw numbers into something useful, **calibrate**: read the sensor in dry soil and in soaked soil, note both numbers, and scale every reading between them. Every sensor reads a little differently, so calibrate each one.
>
> Two habits help. Power the sensor from a GPIO pin and switch it on only while reading, which saves battery. And take a few readings and average them, because single readings jitter.

**Key takeaway:** Raw sensor numbers mean nothing until you calibrate: record dry and wet, then scale between them.

**Skills unlocked:** Calibrate an analog sensor into useful units

**Q1.** Your sensor reads 2900 in dry soil and 1300 in soaked soil. Now it reads 2300. How wet is the soil, in percent?

- Answer: **37.5 %** (±2%; units accepted: %)
- Hint: Measure down from the dry reading: (2900 − 2300) ÷ (2900 − 1300) × 100.
- On a right answer: _(2900 − 2300) ÷ 1600 × 100 = 37.5%. A bit on the dry side: time to water soon._
- If they enter 62.5 %: _That is how *dry* it is. Wetter soil gives lower numbers, so measure down from the dry reading: (2900 − 2300) ÷ 1600._
- If they enter 56.17 %: _That is the raw number as a share of 4095. Use the two calibration readings instead._

**Q2.** Why calibrate each soil sensor yourself, instead of copying the numbers from a tutorial?

- ✅ Every sensor, and every soil, reads a little differently: _Small differences in the board, the supply and the soil shift the raw numbers. Your own dry and wet readings are the only reliable reference._
- ❌ Tutorials always use 5 V sensors: _Many do use 5 V, but even at the same voltage two sensors read differently. Calibrate each one._
- ❌ Calibration makes the sensor more sensitive: _It does not change the sensor; it just maps its numbers to percent correctly._

  Hint: Are two sensors, and two pots of soil, ever exactly alike?

**Q3 (do it in 3D).** Calibrate the sensor (record dry and wet), then bring the soil to **40–60%**.

- Scene check: `calibrated4060`
- Hint: Let it dry fully and tap Record DRY, water it fully and tap Record WET. Then let it dry until the percent reads 40–60.
- On success: _With two calibration points, the raw reading becomes a percent you can trust, and a threshold such as "water below 30%"._

### 3.4 5 V modules and a 3.3 V ESP32 (7 min)

**Opening prompt (before any reading):** Drag the sensor's output voltage up and watch how the ESP32 reads it. Then find out what happens above 3.6 V.

**Water view:** no

**Explanation**

> ESP32 pins are 3.3 V pins. They read anything above about 2.5 V as HIGH and below about 0.8 V as LOW; in between, they may go either way. The absolute maximum is 3.6 V: more than that slowly cooks the pin.
>
> Many cheap modules run on 5 V, and their outputs swing all the way to 5 V. Wired straight to the ESP32, one may work for a while, and then the pin dies.
>
> For a signal coming *into* the ESP32, a voltage divider is the simple fix: 1 kΩ on top and 2 kΩ below turns 5 V into 3.3 V. For two-way signals such as I2C, use a small level-shifter board. Simplest of all: choose modules that run on 3.3 V.

**Key takeaway:** Never feed 5 V into an ESP32 pin. Scale it down with a divider or a level shifter, or pick 3.3 V modules.

**Skills unlocked:** Connect a 5 V module to a 3.3 V ESP32 without damaging it

**Q1.** The ESP32 reads HIGH above 0.75 × its 3.3 V supply. What is that threshold?

- Answer: **2.475 V** (±1%; units accepted: V)
- Hint: Multiply: 0.75 × 3.3 V.
- On a right answer: _0.75 × 3.3 V = 2.475 V, about 2.5 V. A 3.3 V output easily clears it, and so does 5 V, which is exactly the danger._
- If they enter 3.75 V: _That is 0.75 × 5 V. The ESP32 runs on 3.3 V._

**Q2.** A 5 V sensor's output goes through 1 kΩ (top) and 2 kΩ (bottom) to the ESP32 pin. What does the pin see when the sensor outputs 5 V?

- ✅ 3.33 V: _5 V × 2 kΩ ÷ 3 kΩ ≈ 3.33 V: a clear HIGH, under the 3.6 V limit._
- ❌ 1.67 V: _That is the voltage across the top 1 kΩ resistor (5 V × 1 ÷ 3). The pin sits across the bottom one._
- ❌ 2.5 V: _Halving needs two equal resistors. Here the bottom one is twice the top one._
- ❌ 5 V: _A divider always lowers the voltage; that is its job._

  Hint: Vout = Vin × R2 ÷ (R1 + R2), with R2 the bottom resistor.

**Q3 (do it in 3D).** Connect the 5 V sensor so that its HIGH reads as **HIGH** on the ESP32, without going over the **3.6 V** limit.

- Scene check: `safeHigh`
- Hint: Turn the divider on, then set the sensor's output to its HIGH level, 5 V.
- On success: _Through the divider, the sensor's 5 V arrives as about 3.33 V: a solid HIGH, safely under 3.6 V._

## Module 4: Outputs: making things happen

_LEDs, PWM, and switching a pump or a relay without hurting the ESP32._

### 4.1 LEDs and PWM brightness (6 min)

**Opening prompt (before any reading):** Slide the duty cycle and watch the pin switch on and off. Then tap the LED to flip it around.

**Water view:** no

**Explanation**

> An ESP32 pin is either fully on (3.3 V) or fully off (0 V). To dim an LED, it switches on and off very fast, thousands of times a second. This is **PWM**, pulse-width modulation. The **duty cycle** is the share of time it is on: at 25% the LED looks about a quarter as bright, because your eye averages the flicker.
>
> In Arduino code, `analogWrite(pin, value)` sets it, with 0–255 meaning 0–100%. The same trick sets a motor's speed or a fan's.
>
> An LED only conducts one way. The long leg (+) goes towards the pin, the short leg by the flat edge towards GND. Fitted backwards it just stays dark; at 3.3 V no harm is done.

**Key takeaway:** PWM dims by switching fast: the duty cycle sets the average. LEDs work one way round only.

**Skills unlocked:** Dim an LED or slow a motor with PWM; Fit an LED the right way round

**Q1.** With PWM at a 25% duty cycle, what is the *average* voltage on a 3.3 V pin?

- Answer: **0.825 V** (±1%; units accepted: V)
- Hint: On for a quarter of the time at 3.3 V, off the rest: 0.25 × 3.3 V.
- On a right answer: _0.25 × 3.3 V ≈ 0.83 V on average. The pin is still only ever 0 V or 3.3 V; it is the average your eye sees._
- If they enter 2.475 V: _That is the share of time it is *off* (75%). Use the on share: 25%._

**Q2.** Your new status LED stays dark. The pin works and the resistor is fine. What is the most likely mistake?

- ✅ The LED is in backwards: _Flip it: long leg (+) towards the pin, flat edge towards GND._
- ❌ The PWM frequency is too high: _Fast PWM is exactly what makes the flicker invisible. The LED is most likely backwards._
- ❌ LEDs need 5 V: _A red LED needs only about 2.0 V, so 3.3 V is plenty. Check which way round it is._

  Hint: LEDs only conduct one way.

**Q3 (do it in 3D).** Dim the LED to a duty cycle of **20–30%**, with the LED fitted the right way round.

- Scene check: `dim2030`
- Hint: Slide the duty cycle down to about a quarter. If it is dark, tap the LED to flip it.
- On success: _Around 25% duty, the LED glows gently: a nice night-time status light that also saves power._

### 4.2 A MOSFET switch for the pump (8 min)

**Opening prompt (before any reading):** Try running the pump straight from GPIO 26. Then switch it through the MOSFET, and drag the gate voltage to halfway.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Plant Buddy's pump needs about 150 mA at 5 V. A GPIO pin gives 3.3 V and about 20 mA. Wire the pump straight to the pin and it won't start, and the pin is badly overloaded.
>
> A **MOSFET** is an electronic switch. The pin only puts a voltage on its **gate**; almost no current flows into it. The pump's big current flows from the 5 V supply through the MOSFET's **drain** and **source** to GND. Choose a *logic-level* MOSFET, one that switches fully on at 3.3 V.
>
> Drive it fully on or fully off. Half-on, it acts like a resistor and heats up. A 10 kΩ resistor from gate to GND keeps the pump off while the ESP32 boots.

**Key takeaway:** A pin controls, a MOSFET carries: use a logic-level MOSFET for anything over about 20 mA.

**Skills unlocked:** Switch a pump or motor from a GPIO pin with a MOSFET

**Q1.** Why can't the 5 V pump run straight from a GPIO pin?

- ✅ It needs about 150 mA at 5 V; a pin gives 3.3 V and about 20 mA: _Too little voltage and far too little current. The pin can control the pump, but not power it._
- ❌ Pumps only run on AC: _Small hobby pumps run on DC. The problem is the current a pin can give._
- ❌ The pin is input-only: _GPIO 26 can be an output. It just cannot supply 150 mA._

  Hint: Compare what the pump needs with what a pin can give.

**Q2.** Why should the MOSFET be driven fully on or fully off, never halfway?

- ✅ Half-on, it acts like a resistor and heats up: _Fully on it has almost no resistance, and fully off no current flows. In between, current and voltage meet in the MOSFET and turn into heat._
- ❌ Halfway, the ESP32 resets: _The ESP32 is fine; it is the MOSFET that suffers, getting hot._
- ❌ It would run the pump backwards: _A DC pump only runs one way here. The danger is heat in the MOSFET._

  Hint: Watch the MOSFET's temperature when the gate is at half voltage.

**Q3 (do it in 3D).** Run the pump from GPIO 26 **through the MOSFET**, fully on, without overheating anything.

- Scene check: `pumpOn`
- Hint: Choose the MOSFET wiring, set the gate to 3.3 V (pin HIGH) and switch on.
- On success: _At 3.3 V on the gate, a logic-level MOSFET is fully on and stays cool, while the pump gets its 150 mA from the 5 V supply._

### 4.3 Motors, relays and flyback diodes (7 min)

**Opening prompt (before any reading):** Switch the pump on and then off, and watch the MOSFET. Then fit the diode and try again.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A motor's coil stores energy while current flows. Switch it off suddenly and that energy has to go somewhere: the voltage across the coil spikes to dozens of volts, which can destroy the MOSFET or reset the ESP32.
>
> A **flyback diode** across the motor gives the current a safe loop to fade away in. It sits backwards (stripe towards +), so it does nothing while the motor runs. Pumps, motors, solenoid valves and relay coils all need one.
>
> A **relay module** is a switch flipped by an electromagnet, with the ESP32 side and the load side kept apart. Ready-made modules include the diode. In this course, relays switch low voltages only; for mains, buy a certified smart plug.

**Key takeaway:** Every motor, pump, valve or relay coil needs a flyback diode across it, stripe towards +.

**Skills unlocked:** Protect the ESP32 from motor kickback with a flyback diode; Choose a safe way to switch bigger loads

**Q1.** What does a flyback diode across the pump do?

- ✅ Gives the coil's current a safe loop at switch-off, so no voltage spike: _The current keeps circling through the diode and fades away, instead of forcing a spike across the MOSFET._
- ❌ Makes the pump run faster: _While running, the diode is reverse-biased and does nothing at all._
- ❌ Stops the pump running backwards: _A DC pump only runs one way here. The diode is about the switch-off spike._

  Hint: What happens to the coil's energy at switch-off?

**Q2.** You want Plant Buddy to switch a mains (230 V or 120 V) grow lamp. What is the safe choice?

- ✅ A certified smart plug, controlled over Wi-Fi: _All the dangerous wiring is inside a tested, sealed product. Your ESP32 just sends it a message._
- ❌ A relay module wired into the lamp cable: _That puts mains voltage on an open hobby board, a real shock and fire risk. Use a certified smart plug._
- ❌ A bigger MOSFET: _MOSFET circuits for mains are for experienced designers only. Use a certified smart plug._

  Hint: This course stays at 5 V and below for a reason.

**Q3 (do it in 3D).** Switch the pump **on**, then **off** again **without a spike**.

- Scene check: `offNoSpark`
- Hint: Fit the flyback diode first, stripe towards +5 V.
- On success: _With the diode in place, the coil's current fades safely through it, and the MOSFET never sees the spike._

## Module 5: Talking to sensors

_Datasheets, I2C, UART and SPI: how modules and the ESP32 understand each other._

### 5.1 Reading a module's pinout and datasheet (7 min)

**Opening prompt (before any reading):** Tap each pin on the BME280 board to see what it does, and check its facts sheet below. Then wire it to the ESP32.

**Water view:** no

**Explanation**

> Before you wire any module, find four facts on its product page or datasheet: the **supply voltage**, the **logic level**, **how it talks** (I2C and its address, SPI, UART or analog) and the **current** it draws.
>
> For Plant Buddy's BME280 board: supply 3.3 V (this version has no regulator, so 5 V would damage it), 3.3 V logic, I2C at address 0x76, and only a few microamps when it measures once a second. Ideal for a battery device.
>
> The pin names are printed on the board. On the ESP32, the default I2C pins are D21 (**SDA**, data) and D22 (**SCL**, clock). Wire VIN, GND, SCL and SDA, and it is ready.

**Key takeaway:** Check supply voltage, logic level, interface and current before you wire any module.

**Skills unlocked:** Find the four key facts in a module's datasheet; Wire an I2C sensor module to the ESP32

**Q1.** The module's page says "VIN: 3.3 V only". Where do you connect VIN?

- ✅ The ESP32's 3V3 pin: _The 3V3 pin gives a regulated 3.3 V, exactly what the module wants._
- ❌ The ESP32's VIN pin: _On USB power, the VIN pin carries 5 V, which would damage a 3.3 V-only module._
- ❌ Any GPIO pin set HIGH: _It would give 3.3 V, but only for small currents. Use the 3V3 pin for power._

  Hint: Which ESP32 pin carries 3.3 V, and which carries the USB's 5 V?

**Q2.** Which fact tells you the BME280 is a good fit for a battery-powered Plant Buddy?

- ✅ It draws only a few microamps when measuring once a second: _Microamps barely touch a battery, so the sensor can stay connected all the time._
- ❌ It uses I2C: _I2C saves pins, not energy. The tiny current draw is what suits a battery._
- ❌ It is purple: _The board colour tells you nothing about current draw._

  Hint: What matters most when the energy comes from a battery?

**Q3 (do it in 3D).** Wire the BME280 to the ESP32: power, GND and the two I2C pins.

- Scene check: `wireBme`
- Hint: VIN → 3V3, GND → GND, SCL → D22, SDA → D21.
- On success: _Power from 3V3, a shared GND, and the two I2C wires on the ESP32's default pins. The sensor answers at 0x76._

### 5.2 I2C: two wires, many sensors (8 min)

**Opening prompt (before any reading):** Call an address and watch which sensor answers. Then add a second BME280 and make both work.

**Water view:** no

**Explanation**

> **I2C** lets many sensors share just two wires: **SDA** (data) and **SCL** (clock), plus power and GND. On the ESP32 they are D21 and D22 by default.
>
> Every device on the bus has an **address**, a number such as 0x76. The ESP32 calls an address, and only that device answers. Two devices with the same address answer at once, and you get garbage.
>
> Many boards let you change the address, often with a solder jumper or a spare pin: the BME280 can be 0x76 or 0x77. Run an *I2C scanner* sketch first; it lists every address it finds.
>
> Both wires need pull-up resistors, and most modules already have them.

**Key takeaway:** I2C: two shared wires, one unique address per device. Clashing addresses mean garbage.

**Skills unlocked:** Wire several I2C sensors to one ESP32; Fix an I2C address clash

**Q1.** Which bus lets several sensors share just two wires, picking each one by its address?

- ✅ I2C: _SDA and SCL are shared by every device, and each device answers only to its own address._
- ❌ SPI: _SPI needs a separate chip-select wire for each device, so the wire count grows._
- ❌ UART: _UART is a conversation between exactly two devices._

  Hint: Which one has addresses?

**Q2.** You add a second BME280 to the bus, and now both read nonsense. Why?

- ✅ Both answer at the same address, 0x76, talking over each other: _Change one board to 0x77 (its address jumper) and both work._
- ❌ The bus can only carry one sensor: _I2C carries many sensors, as long as each has its own address._
- ❌ The 3V3 pin cannot power two sensors: _Two BME280s draw only microamps. The problem is the shared address._

  Hint: What is the default address of every BME280 board?

**Q3 (do it in 3D).** Add a second BME280 and make **both sensors answer** correctly.

- Scene check: `twoBme`
- Hint: Set the new board's address jumper to 0x77, then call each address.
- On success: _One sensor at 0x76, one at 0x77: each answers only to its own address, on the same two wires._

### 5.3 UART and SPI at a glance (6 min)

**Opening prompt (before any reading):** Pick a bus and press Send, and watch which wires carry the message. Then get the GPS module talking.

**Water view:** no

**Explanation**

> **UART** (serial) is a conversation between two devices. Each has a **TX** (transmit) and an **RX** (receive) pin, and you cross them: GPS TX to ESP32 RX, ESP32 TX to GPS RX. Both must use the same speed, such as 9600 baud. The ESP32's spare UART uses D16 (RX2) and D17 (TX2).
>
> **SPI** is the fast one, used by SD cards and displays. It has a clock, a data wire in each direction and one **CS** (chip select) wire per device: the ESP32 pulls a device's CS LOW to talk to it.
>
> Rule of thumb: sensors are usually I2C, GPS and modems UART, screens and SD cards SPI.

**Key takeaway:** UART: cross TX and RX, and match the speed. SPI: fast, with one CS wire per device.

**Skills unlocked:** Wire a UART module such as a GPS; Recognise which bus a module uses

**Q1.** On a UART link, what does the GPS module's TX pin connect to?

- ✅ The ESP32's RX pin: _One side's transmit goes to the other side's receive._
- ❌ The ESP32's TX pin: _Two transmitters wired together would both talk and nobody would listen. Cross them._
- ❌ SDA: _SDA belongs to I2C. UART uses TX and RX._

  Hint: Someone talking needs someone listening.

**Q2.** Your GPS module prints garbled characters, but the wiring is right. What is the likely cause?

- ✅ The baud rates don't match, for example 9600 on the GPS and 115200 in your code: _Different speeds chop every character up wrongly. Set the same baud rate on both sides._
- ❌ The GPS needs an I2C address: _UART has no addresses. Check the baud rate._
- ❌ TX and RX should not be crossed: _They should be crossed, and the wiring is right. The speed is the problem._

  Hint: Both sides of a UART must agree on something before they talk.

**Q3 (do it in 3D).** Get the GPS module talking to the ESP32: wire its TX correctly and match the speed.

- Scene check: `gpsTalk`
- Hint: GPS TX → D16 (RX2), and set the speed to 9600 baud, the GPS default.
- On success: _TX crossed to RX and both sides at 9600 baud: position data comes through cleanly._

## Module 6: Power for a device that lasts

_USB, batteries, regulators, Wi-Fi bursts and deep sleep._

### 6.1 Powering an ESP32: USB, VIN, 3V3 and batteries (7 min)

**Opening prompt (before any reading):** Pick a power source and the pin it goes into, and watch the 3.3 V rail. Then find a safe way to run Plant Buddy from the 18650 battery.

**Water view:** no

**Explanation**

> The ESP32 chip needs 3.0 to 3.6 V. A DevKit board gives you three ways in. **USB** is the easiest: 5 V goes into the board's regulator, which makes 3.3 V. The **VIN** pin takes the same route for a 5 V supply. The **3V3** pin skips the regulator, so feed it only a clean, regulated 3.3 V.
>
> Batteries are trickier. A Li-ion cell gives 4.2 V when full and about 3.0 V when empty. The board's AMS1117 regulator needs about 1.1 V of headroom, so through VIN a half-empty cell leaves the ESP32 starved. Wired straight to 3V3, a full cell's 4.2 V is over the 3.6 V limit.
>
> The fix: a low-dropout 3.3 V regulator module between the cell and the 3V3 pin. And never power from USB and VIN at the same time.

**Key takeaway:** USB or 5 V into VIN; only regulated 3.3 V into 3V3. A Li-ion cell needs a low-dropout regulator.

**Skills unlocked:** Choose a safe way to power an ESP32; Run an ESP32 from a Li-ion battery

**Q1.** The board's regulator needs its input to be 1.1 V above its 3.3 V output. What is the lowest VIN that still gives a full 3.3 V?

- Answer: **4.4 V** (±1%; units accepted: V)
- Hint: The input has to be the output plus the headroom: 3.3 V + 1.1 V.
- On a right answer: _3.3 V + 1.1 V = 4.4 V. A Li-ion cell (4.2 V full) is already below that, which is why it needs a low-dropout regulator instead._
- If they enter 2.2 V: _That is 3.3 V − 1.1 V. The regulator needs *more* at its input than its output: add the headroom._

**Q2.** Why not wire a full 18650 cell (4.2 V) straight to the 3V3 pin?

- ✅ 4.2 V is over the ESP32's 3.6 V maximum: _The 3V3 pin goes straight to the chip, with no regulator in between. 4.2 V can damage it._
- ❌ It would work, but drain the cell faster: _The real problem is damage: 4.2 V is over the chip's 3.6 V limit._
- ❌ The 3V3 pin only works with USB connected: _The 3V3 pin accepts any clean 3.3 V supply. The cell's 4.2 V is simply too high._

  Hint: Compare the cell's voltage with the ESP32's maximum.

**Q3 (do it in 3D).** Power Plant Buddy from the 18650 cell so that the rail stays between **3.0 and 3.6 V** whether the cell is full or nearly empty.

- Scene check: `batterySafe`
- Hint: Try the cell through the low-dropout regulator module into 3V3, and drag the cell from full to empty.
- On success: _The low-dropout regulator needs only about 0.2 V of headroom, so from 4.2 V down to about 3.5 V the rail stays at 3.3 V, and the chip is never over its limit._

### 6.2 Wi-Fi bursts, brownouts and capacitors (7 min)

**Opening prompt (before any reading):** Turn Wi-Fi on and watch the 3.3 V rail dip with every burst. Then fit a capacitor and move it close to the ESP32.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Most of the time an ESP32 sips current. But when Wi-Fi transmits, it gulps about 250 mA in short bursts. A long thin USB cable, breadboard jumpers or a weak battery can't deliver that instantly, so the 3.3 V rail dips.
>
> If it dips too far, the chip's **brownout detector** resets it to stay safe. The serial monitor shows "Brownout detector was triggered", and the board reboots every time it tries to connect.
>
> The fix is an energy store right next to the chip: a **capacitor** of a few hundred microfarads between 3V3 and GND, as close to the pins as you can. During a burst it supplies the current, and the supply refills it in between. A 100 nF ceramic beside it catches the fastest spikes.

**Key takeaway:** Wi-Fi bursts need a big capacitor right at the ESP32's 3V3 and GND pins.

**Skills unlocked:** Stop brownout resets during Wi-Fi

**Q1.** Your ESP32 reboots every time it connects to Wi-Fi, and the serial monitor says "Brownout detector was triggered". What is the most likely cause?

- ✅ The supply can't deliver the Wi-Fi current bursts, so the voltage dips: _Each burst pulls the rail down; when it falls below the brownout level, the chip resets. A capacitor at the pins fixes it._
- ❌ The Wi-Fi password is wrong: _A wrong password just fails to connect; it does not reset the chip. A brownout is a power problem._
- ❌ The code has an endless loop: _That would trigger a watchdog reset, with a different message. "Brownout" means the voltage dipped._

  Hint: What changes the moment Wi-Fi starts transmitting?

**Q2.** Where should the capacitor go?

- ✅ Right at the ESP32's 3V3 and GND pins: _Close by, it supplies each burst before the long wiring even notices._
- ❌ At the far end of the breadboard, where the power comes in: _Then each burst still has to travel along the jumpers and rails, and the dip comes back._
- ❌ In series with the 3V3 wire: _A capacitor in series would block the supply. It goes *across* 3V3 and GND._

  Hint: What happened to the dip as you moved the capacitor?

**Q3 (do it in 3D).** Stop the brownout resets: keep the rail **above 3.0 V** during Wi-Fi bursts.

- Scene check: `noBrownout`
- Hint: Fit a big capacitor (a few hundred microfarads) and place it right at the ESP32.
- On success: _A big capacitor at the pins covers each burst, so the rail barely dips and the ESP32 stays connected._

### 6.3 Battery life and deep sleep (8 min)

**Opening prompt (before any reading):** Change how often Plant Buddy wakes up and watch the battery drain. Time runs fast here: one second is one day.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Battery capacity is given in **milliamp-hours** (mAh). A 2500 mAh cell can supply 2500 mA for one hour, or 25 mA for 100 hours. Battery life ≈ capacity ÷ average current.
>
> An ESP32 with Wi-Fi on draws about 100 mA, so a 2500 mAh cell would be flat in about a day. The trick is **deep sleep**: the chip switches almost everything off, wakes on a timer, measures, sends, and sleeps again. Asleep, the chip draws about 10 µA.
>
> So the *average* current counts, set by how long and how often you are awake. One catch: a DevKit's USB chip, regulator and power LED keep drawing a few milliamps while the ESP32 sleeps. For battery projects, use a low-power board.

**Key takeaway:** Battery life ≈ mAh ÷ average current. Sleep most of the time, wake briefly, and watch what the board itself draws.

**Skills unlocked:** Estimate battery life from a wake-sleep cycle; Use deep sleep to make a battery last months

**Q1.** Plant Buddy averages 25 mA from a 2500 mAh battery. Ideally, how many hours will it last?

- Answer: **100 h** (±1%; units accepted: h)
- Hint: Battery life = capacity ÷ average current = 2500 mAh ÷ 25 mA.
- On a right answer: _2500 mAh ÷ 25 mA = 100 hours, about four days. Real batteries give a bit less._
- If they enter 62500 h: _That is 2500 × 25. Divide instead: capacity ÷ current._
- If they enter 0.01 h: _That is 25 ÷ 2500, upside down. Capacity goes on top: 2500 mAh ÷ 25 mA._

**Q2.** Asleep, the ESP32 chip draws 10 µA, but your DevKit board still draws 5 mA. Why?

- ✅ The board's USB chip, regulator and power LED stay on: _They are not part of the ESP32 and know nothing about deep sleep. Low-power boards leave them out._
- ❌ Deep sleep does not work on DevKit boards: _The ESP32 sleeps fine. It is the extra parts on the board that keep drawing current._
- ❌ The battery leaks 5 mA: _Batteries self-discharge far more slowly than that. The board's extra parts are to blame._

  Hint: The ESP32 is not the only thing on the board.

**Q3 (do it in 3D).** Change the settings so the 2500 mAh battery would last **more than 90 days**.

- Scene check: `over90days`
- Hint: Use deep sleep, a low-power board, and wake up less often.
- On success: _Waking every 10 minutes for 5 seconds on a low-power board averages under 1 mA: about four months on one charge._

### 6.4 Regulators: LDO or buck? (6 min)

**Opening prompt (before any reading):** Power the 5 V pump and board from the 12 V solar battery with each kind of regulator. Watch which one gets hot.

**The one live formula:** `Heat = (Vin − Vout) × I`

**Water view:** no

**Explanation**

> An outdoor Plant Buddy might run from a 12 V solar battery, but its board and pump need 5 V. A **regulator** sits in between.
>
> A **linear regulator** (an LDO) works like a tap that throttles away the extra pressure. It is simple, quiet and cheap, but it burns the difference as heat. Dropping 12 V to 5 V at half an amp wastes more power than the load uses.
>
> A **switching regulator** (a buck converter) switches fully on and off very fast and smooths the result. At 85 to 95% efficiency it stays cool. Cheap buck modules cost about the same as an LDO.
>
> Rule of thumb: small drop or tiny current, an LDO is fine. Big drop or big current, use a buck.

**Key takeaway:** An LDO burns the extra voltage as heat; a buck converter runs cool. Choose by the voltage drop and the current.

**Skills unlocked:** Choose between an LDO and a buck converter; Predict how hot a linear regulator will get

**Q1.** An LDO turns 12 V into 5 V for a 500 mA load. How much heat does it make?

- Answer: **3.5 W** (±1%; units accepted: W, mW)
- Hint: Heat = (Vin − Vout) × I = (12 − 5) × 0.5.
- On a right answer: _7 V × 0.5 A = 3.5 W. That is more than the 2.5 W the load actually uses, and enough to burn a finger on a small regulator._
- If they enter 6 W: _That is the total power going in (12 V × 0.5 A). Only the dropped part becomes heat: (12 − 5) × 0.5._
- If they enter 2.5 W: _That is what the load uses (5 V × 0.5 A). The regulator's heat is the dropped voltage times the current._

**Q2.** Why does the buck converter stay cool?

- ✅ Its switch is always fully on or fully off, so it never sits half-open burning power: _Just like the MOSFET: fully on means almost no voltage across it, fully off means no current. Either way, little heat._
- ❌ It has a bigger heatsink: _It usually has a smaller one. It simply wastes much less power in the first place._
- ❌ It makes the load draw less current: _The load draws the same 5 V and the same current either way. The buck just wastes far less getting there._

  Hint: Remember the MOSFET lesson: when does a switch get hot?

**Q3 (do it in 3D).** Power the 5 V load at **500 mA** from **12 V** without the regulator overheating (it must stay under 100 °C).

- Scene check: `cool5V`
- Hint: At 12 V in, the LDO would have to burn 3.5 W. Which regulator wastes less?
- On success: _The buck converter wastes only about a quarter of a watt here, so it stays barely warm._

## Module 7: From breadboard to a reliable device

_Debugging, making it permanent, and staying safe._

### 7.1 Debugging a dead device (8 min)

**Opening prompt (before any reading):** This rewired Plant Buddy hides a short. Set the bench supply's current limit before you switch on, or see what happens.

**Water view:** no

**Explanation**

> When a project is dead, don't guess: work from the power outward. Does the board get power? Is the power LED on? Are there 3.3 V between 3V3 and GND?
>
> Power a new or rewired build from a **bench supply with a current limit**, set just above what it should draw, such as 100 mA. If there is a short, the supply holds the current at the limit and the voltage collapses, instead of something burning.
>
> Then hunt with the power off. On resistance mode, close to 0 Ω between 3V3 and GND means a short. Look for stray wire ends, bent legs and solder blobs between pins.
>
> Only when the power is right, move on to the wiring, and then to the code.

**Key takeaway:** Debug from the power outward, and switch new builds on with a current limit first.

**Skills unlocked:** Bring up a new build safely with a current-limited supply; Track down a short with the meter

**Q1.** Plant Buddy is completely dead. What do you check first?

- ✅ Whether there are 3.3 V between 3V3 and GND: _Without power nothing else can work, so it is the first and quickest check._
- ❌ The Wi-Fi password in the code: _Code comes last. A dead board is a power problem until proven otherwise._
- ❌ Whether the soil sensor is calibrated: _Calibration cannot make a board dead. Check the power first._

  Hint: Work from the power outward.

**Q2.** You switch on with a 100 mA limit. The supply jumps into current limit and the voltage drops to 0.1 V. What does that tell you?

- ✅ There is a short between the supply and GND: _Only a near-zero resistance pulls the full 100 mA at 0.1 V. The limit saved the board._
- ❌ The board is working and needs more current: _A working board would sit at 3.3 V drawing tens of milliamps. At 0.1 V it is shorted._
- ❌ There is an open somewhere: _An open draws no current at all. Here the current is at its limit, so it is a short._

  Hint: A big current at almost no voltage: what kind of path is that?

**Q3 (do it in 3D).** Bring Plant Buddy up safely: find and remove the short, then power it **with a current limit** until the rail reads 3.3 V.

- Scene check: `bringUp`
- Hint: Power off, meter on Ω between 3V3 and GND, tap the culprit to remove it, then switch on with a limit.
- On success: _Current limit first, short found and removed with the power off, then a clean 3.3 V: the safe way to bring up any new build._

### 7.2 Making it permanent (6 min)

**Opening prompt (before any reading):** Compare a breadboard, a perfboard and a custom PCB build of Plant Buddy. Then set it up to survive a year in the garden.

**Water view:** no

**Explanation**

> Breadboards are perfect for experimenting, but jumper wires wiggle loose, especially in a garden where things get bumped and damp.
>
> For a device that has to keep working, solder it. **Perfboard** is a board full of holes you solder parts and wires onto. Or order a custom **PCB**: you draw the connections in free software such as KiCad, and a factory makes the board for a few dollars. It pays off once you build more than one.
>
> Replace jumpers with **connectors** that lock, such as JST plugs or screw terminals, so sensors can be swapped without loose wires. Outdoors, use a sealed enclosure (IP65 or better) with a cable gland, and keep the battery out of direct sun.

**Key takeaway:** Breadboard to experiment; solder, locking connectors and a sealed box for a device that lasts.

**Skills unlocked:** Choose how to turn a prototype into a lasting device

**Q1.** Plant Buddy works on the breadboard indoors, but in the garden it fails now and then. What is the most likely culprit?

- ✅ A jumper wire working loose: an open that comes and goes: _Intermittent faults are almost always loose connections. Solder and locking connectors fix them._
- ❌ The ESP32 is too slow: _Speed does not change with location. Things that come and go point to loose connections._
- ❌ The Wi-Fi password expired: _Passwords do not cause on-and-off failures. Loose wiring does._

  Hint: Which fault comes and goes when things get bumped?

**Q2.** When is it worth ordering a custom PCB instead of soldering perfboard?

- ✅ When you build several copies, or need it small and robust: _Design once, and every copy is identical, compact and quick to assemble._
- ❌ Always, for any first prototype: _For a first prototype, a breadboard or perfboard is faster. A PCB pays off for repeats._
- ❌ Only for mains-powered devices: _PCBs suit any device. The reason to order one is several copies or a small, robust build._

  Hint: Drawing a PCB takes time once; every copy after that is cheap.

**Q3 (do it in 3D).** Set Plant Buddy up to survive **a year outdoors**.

- Scene check: `outdoorReady`
- Hint: A soldered build, connectors that lock, and an enclosure that keeps the rain out.
- On success: _Soldered joints, locking connectors and a sealed box: the three things that keep an outdoor device working._

### 7.3 Safety: mains, Li-ion and outdoors (5 min)

**Opening prompt (before any reading):** Tap each item on the bench to see how risky it is. Then sort them all.

**Water view:** no

**Explanation**

> Everything in this course runs on 5 V or less, and that is deliberate. **Mains electricity** can kill. Don't wire it yourself: to switch a lamp or a heater, use a certified smart plug.
>
> **Li-ion cells** such as the 18650 store a lot of energy. A short circuit or a crushed cell can catch fire. Use protected cells or a charger board with protection, never solder directly to a cell, and watch the first charges.
>
> Outdoors, water and sun are the enemies: seal the enclosure, and keep the battery shaded and above freezing while it charges.

**Key takeaway:** Stay at 5 V and below. Mains: buy certified. Li-ion: protected cells and chargers, never shorted.

**Skills unlocked:** Know which jobs need certified products, never DIY

**Q1.** You want Plant Buddy to switch on a grow lamp that plugs into the wall. What do you do?

- ✅ Use a certified smart plug and have the ESP32 send it a message: _The dangerous part is sealed inside a tested product. Your project stays at 5 V._
- ❌ Cut the lamp cable and wire in a relay module: _That puts mains on an open hobby board, a shock and fire risk. Use a certified smart plug._
- ❌ Drive the lamp straight from a GPIO pin: _A pin gives 3.3 V and a few milliamps, and must never meet mains. Use a smart plug._

  Hint: Who should handle the mains side?

**Q2.** Which Li-ion habit is safe?

- ✅ Charge through a charger module with protection: _Protection stops overcharge, over-discharge and short circuits, the causes of Li-ion fires._
- ❌ Solder the wires straight onto the cell: _The soldering heat can damage the cell inside. Use a holder or a cell with tabs._
- ❌ Leave a crushed cell in the device if it still works: _A damaged cell can short internally and catch fire later. Recycle it._

  Hint: Protection is the keyword.

**Q3 (do it in 3D).** Sort **every item** on the bench into the right group.

- Scene check: `sorted`
- Hint: Tap each one first: its card says how risky it is.
- On success: _Low-voltage modules are fine to experiment with, Li-ion needs care and protection, and mains is for certified products only._

## Capstone: build Plant Buddy (15 min)

1. **Power rails:** 3V3 and GND to the front rails (logic, sensors), VIN (5 V) and GND to the back rails (pump).
2. **Status LED:** D16 → 220 Ω → red LED → GND (5.9 mA). Wrong picks are explained: GPIO 34 is input-only, no resistor burns the LED, 47 Ω is too much.
3. **Sensors:** soil AOUT on D32 (ADC1; D4 is ADC2 and fails with Wi-Fi on), soil VCC on 3.3 V, BME280 SDA on D21 and SCL on D22.
4. **Pump driver:** logic-level MOSFET, 10 kΩ gate pull-down and a flyback diode; never the pump straight on a pin.
5. **Power budget:** 2500 mAh, awake 100 mA for 5 s per wake-up, more than 90 days needed. A DevKit waking every 10 min lasts 18 days; a low-power board lasts 124 days.
6. **Fix three faults** (pick the fix for each symptom):
   - _Soil readings are fine on USB, but turn to nonsense once Wi-Fi connects._ Fix: Move the soil sensor's AOUT from D4 to D32. D4 is an ADC2 pin, and Wi-Fi takes ADC2 over. D32 is on ADC1, which keeps working.
   - _The status LED flashed very brightly once, and has never lit since._ Fix: Fit a new LED with a 220 Ω resistor in series. With no resistor nothing limited the current, so the LED burned out. 220 Ω keeps it near 6 mA.
   - _The ESP32 resets every time the pump switches off._ Fix: Fit a flyback diode across the pump, stripe towards +5 V. At switch-off the pump's coil kicks back with a voltage spike. The diode gives that current a safe loop.
7. **Run it:** a time-lapse until the soil drops below 30% and the pump waters it back above 80%.
8. **Certificate** with the learner's name and the skills they unlocked.

## Later, if you're curious (glossary of what was cut)

- **Schematic capture**: Drawing your circuit as symbols in software such as KiCad. It is the first step towards ordering a custom PCB.
- **PCB layout**: Placing parts and drawing copper traces on a board design. Free tools and cheap factories make it easy once you outgrow perfboard.
- **Trace width**: How wide a copper track must be for a given current. Matters for pumps, motors and LED strips on a custom PCB.
- **Gerber files**: The files a PCB factory needs to make your board, one per layer, plus a drill file.
- **Level shifter**: A small board that translates signals between 3.3 V and 5 V in both directions, for buses like I2C.
- **Pull-up values for I2C**: Long I2C wires or many devices may need stronger pull-ups (for example 4.7 kΩ instead of 10 kΩ).
- **Op-amp**: An amplifier chip. With a few resistors it can boost a tiny sensor signal so the ADC can read it.
- **ADC calibration and filtering**: Correcting the ESP32's ADC curve and smoothing noisy readings in software for more accurate sensors.
- **Hall and current sensors**: Modules that measure a current without breaking the circuit, handy for logging how much power a device uses.
- **Solar charging**: A small solar panel and a charger module can top up Plant Buddy's cell. Size both from your power budget.
- **Buck-boost converter**: A switching regulator that gives a steady output whether the battery is above or below it.
- **Inductor**: A coil that resists changes in current. It is the heart of buck converters and the reason motors kick back.
- **ESD**: Electrostatic discharge: a static zap from your finger can damage a pin. Touch something grounded before handling boards.
- **Antennas and RF layout**: Keep metal and wires away from the ESP32's antenna end, or the Wi-Fi range drops. RF design is a deep field of its own.
- **LoRa**: A long-range, low-power radio for sensors far from Wi-Fi, at the cost of sending only small amounts of data.
- **MQTT**: A light messaging protocol many IoT devices use to send readings to a server or a dashboard.
- **Watchdog timer**: A timer that resets the chip if your code gets stuck. Its reset message is different from a brownout.
- **EMC**: Electromagnetic compatibility: a product must not disturb other devices with radio noise, and must not be upset by theirs.
- **Certification (CE, FCC, UL)**: Tests a product must pass before it can be sold. Using a pre-certified ESP32 module makes this far easier.
- **Mains design**: Designing circuits that touch 230 V or 120 V needs training, creepage rules and certification. Buy certified products instead.
