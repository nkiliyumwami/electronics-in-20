# Electronics in 20%: course map and full lesson content

_Generated from `src/content/` by `npm run docs`. Do not edit by hand._

**24 lessons in 7 modules, plus a 15-minute capstone: about 2 h 56 min in total.**

## Course map

| # | Lesson | Min | "I can now…" |
|---|---|---|---|
| **M1** | **The big three** | **20** | |
| 1.1 | Voltage, current, resistance | 6 | Explain voltage, current and resistance with water pipes; Explain why voltage is always between two points |
| 1.2 | Ohm's law and power | 7 | Work out voltage, current or resistance from the other two; Spot a resistor that will overheat |
| 1.3 | Using a multimeter | 7 | Measure the voltage across a part; Measure current safely by breaking the circuit |
| **M2** | **Circuits that work (and why they don't)** | **19** | |
| 2.1 | Ground, the 0 V reference | 6 | Connect two boards so their signals mean the same thing |
| 2.2 | Shorts and opens | 6 | Tell a short from an open; Find a broken connection with the continuity beeper |
| 2.3 | Series and parallel | 7 | Predict what happens when parts are chained or side by side; Add up resistors in series and in parallel |
| **M3** | **The five parts you'll see everywhere** | **36** | |
| 3.1 | Resistors and the voltage divider | 7 | Make a lower voltage from a higher one with two resistors |
| 3.2 | Capacitors (tiny rechargeable buckets) | 8 | Use a capacitor to smooth power or create a delay; Fit an electrolytic capacitor the right way round |
| 3.3 | Diodes and LEDs | 7 | Pick the right resistor for any LED; Spot a diode that is in backwards |
| 3.4 | Transistors as switches (MOSFET) | 8 | Let a tiny chip pin switch a motor or LED strip; Protect a switch from a motor's kickback |
| 3.5 | Chips and microcontrollers | 6 | Find a chip's limits in its datasheet |
| **M4** | **Digital basics** | **18** | |
| 4.1 | Logic levels (1s and 0s are voltage ranges) | 5 | Check whether two chips can talk without a level shifter |
| 4.2 | Pull-up resistors, floating inputs and button bounce | 7 | Wire a button so it reads reliably |
| 4.3 | How chips talk (I2C, SPI, UART) | 6 | Recognise I2C, SPI and UART on a schematic |
| **M5** | **Powering things** | **19** | |
| 5.1 | Batteries and power budgets | 6 | Estimate battery life from a power budget; Size a supply for peak current, not the average |
| 5.2 | Regulators (linear vs switching) | 7 | Choose between a linear regulator and a switcher; Predict how hot a linear regulator will get |
| 5.3 | Decoupling capacitors | 6 | Place decoupling capacitors where they actually work |
| **M6** | **From idea to circuit board** | **29** | |
| 6.1 | Schematic → netlist | 8 | Draw a simple schematic and explain what a net is |
| 6.2 | Footprints | 6 | Match a part to the correct footprint |
| 6.3 | Layers, traces, vias and the ground plane | 8 | Read the layers of a 2-layer board; Size a power trace for its current; Keep the ground plane solid |
| 6.4 | Design rule checks | 7 | Run DRC and ERC, and fix what they flag |
| **M7** | **Make it real** | **20** | |
| 7.1 | Fabrication files, BOM, and how boards are made | 7 | Prepare a complete order package (Gerbers, drill file, BOM) |
| 7.2 | Assembly and reflow | 6 | Explain how parts are soldered by machine, and why the paste matters |
| 7.3 | First power-on (bring-up) | 7 | Bring up a new board safely with a current limit |
| ★ | Capstone: the night-light board | 15 | Design a simple board end to end, ready to order |

## Module 1: The big three

_Voltage, current and resistance: the three ideas everything else is built on._

### 1.1 Voltage, current, resistance (6 min)

**Opening prompt (before any reading):** Drag the battery slider and watch the glowing charges speed up. Then make the resistor bigger.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Electricity is easiest to picture as water in pipes. **Voltage** is pressure: the push that makes charge move. **Current** is flow: how much charge passes a point each second. **Resistance** is how narrow the pipe is, so how hard it is for the flow to get through.
>
> Voltage is always a difference *between two points*, just as water only flows when the pressure at one end is higher than at the other. That is why a meter has two probes. When someone says "this pin is at 3.3 V", they quietly mean "3.3 V higher than ground".
>
> In a single loop, current is the same everywhere. Whatever flows out of the battery has to flow back in.

**Key takeaway:** Voltage pushes, current flows, resistance resists. Voltage is always measured between two points.

**Skills unlocked:** Explain voltage, current and resistance with water pipes; Explain why voltage is always between two points

**Q1.** Someone says "the voltage at this pin is 3.3 V". What is missing?

- ❌ Nothing, that is a complete measurement: _A single point has no voltage on its own. Voltage is a difference, so there must be a second point._
- ✅ The second point it is compared with (usually ground): _"3.3 V" really means "3.3 V higher than ground". The reference is just so common that people leave it out._
- ❌ The current flowing through the pin: _Current is a separate thing. Even without it, the statement is incomplete, because voltage needs a reference point._
- ❌ The unit should be amps: _Volts is the right unit for voltage. What is missing is the second point._

  Hint: Think of the meter's two probes. Where does the second one go?

**Q2.** Which one is measured *across* a part, from one side of it to the other?

- ✅ Voltage: _Voltage is the pressure difference between the two sides of the part._
- ❌ Current: _Current is measured *through* a part: the flow passing along the wire, like a flow meter cut into a pipe._
- ❌ Both: _Only voltage. Current is the flow passing through, not a difference between two sides._

  Hint: Pressure difference or flow rate: which one needs two points?

**Q3 (do it in 3D).** Place the two probes so the meter reads **0 V**, while the battery is still switched on (above 1 V).

- Scene check: `zeroVolts`
- Hint: Put both probes on the same wire. A wire has almost no resistance, so there is no pressure difference along it.
- On success: _Same wire, same pressure, so no difference: 0 V. The battery's push only shows up *across* the resistor._

### 1.2 Ohm's law and power (7 min)

**Opening prompt (before any reading):** Drag the voltage up and watch the resistor. Try to make it smoke.

**The one live formula:** `V = I × R`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Ohm's law ties the big three together: **voltage = current × resistance**. Keep the voltage the same and double the resistance, and the current halves. Raise the voltage and more current pushes through the same resistor. If you know any two, you can work out the third.
>
> Wherever current is forced through resistance, energy turns into heat. The heat meter shows that rate, called power and measured in watts. Because current rises with voltage, heat climbs fast. Double the current through the same resistor and you get four times the heat. That is the smoke you just made.
>
> Every resistor has a power rating. The tiny ones on most boards handle ¼ W or less. Go past it and the part cooks.

**Key takeaway:** Know two of V, I and R and you can find the third. Heat rises fast with current, and every part has a limit.

**Skills unlocked:** Work out voltage, current or resistance from the other two; Spot a resistor that will overheat

**Q1.** There are 5 V across a 1 kΩ resistor. How much current flows?

- ❌ 5 A: _That would be 5 V ÷ 1 Ω. The "k" matters: 1 kΩ is 1000 Ω, so the current is a thousand times smaller._
- ✅ 5 mA: _5 V ÷ 1000 Ω = 0.005 A, which is 5 mA._
- ❌ 0.2 mA: _That is 1 ÷ 5: the "1" from 1 kΩ on top and the voltage underneath. Voltage goes on top: 5 ÷ 1000 Ω = 0.005 A = 5 mA._
- ❌ 200 mA: _That is 1000 ÷ 5, resistance divided by voltage. Flip it: I = V ÷ R = 5 ÷ 1000._

  Hint: I = V ÷ R. Write 1 kΩ as 1000 Ω first.

**Q2.** A resistor has 5 V across it and 100 mA flowing through it. How much power is it turning into heat?

- Answer: **0.5 W** (±1%; units accepted: W, mW)
- Hint: Power = voltage × current. Change 100 mA to amps first: 0.1 A.
- On a right answer: _5 V × 0.1 A = 0.5 W. That is double what a typical ¼ W resistor can take, so it would smoke._
- If they enter 500 W: _Right, that's 500 mW. Enter it in watts: 0.5, or switch the unit to mW._
- If they enter 0.0005 W: _That is 0.5 mW, a thousand times too small. The number 0.5 is right in watts: switch the unit to W, or enter 500 mW._

**Q3 (do it in 3D).** Set the battery to **5 V**, then adjust the resistor until exactly **20 mA** flows.

- Scene check: `set20mA`
- Hint: Tap R on the triangle: R = V ÷ I = 5 ÷ 0.02.
- On success: _250 Ω gives exactly 20 mA. Shops sell standard values, so in real life you would buy 270 Ω, which gives about 18.5 mA._

### 1.3 Using a multimeter (7 min)

**Opening prompt (before any reading):** Drag the red and black probes onto the circuit, or pick points in the controls. Start by reading the voltage across the LED.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A multimeter is the one tool on every electronics bench. Turn the dial to choose what it measures.
>
> **Voltage:** touch the probes to both sides of a part, without disconnecting anything. The meter compares the two points, like a pressure gauge across a narrowing.
>
> **Current:** current is flow, so it has to pass *through* the meter. You break the circuit and let the meter bridge the gap, like a flow meter cut into a pipe.
>
> In current mode the meter is nearly a plain wire inside. Put it straight across a battery and you have made a short: a huge current rushes through, and the meter's fuse blows to protect it.
>
> **Resistance:** only measure it on parts with the power off.

**Key takeaway:** Measure voltage across a part. Measure current through it.

**Skills unlocked:** Measure the voltage across a part; Measure current safely by breaking the circuit

**Q1.** To measure the current through a part, you have to…

- ❌ touch the probes to both sides of it: _That measures voltage. Current has to flow through the meter, so the meter must become part of the loop._
- ✅ break the circuit and put the meter in the gap: _The meter becomes part of the loop, so the same current flows through it and through the part._
- ❌ take the part out and measure it on its own: _That measures the part's resistance, not the current flowing in the working circuit._

  Hint: Current is flow. How would you measure the flow in a water pipe?

**Q2.** The dial is on amps. You touch the probes straight across the battery. What happens?

- ❌ It shows the battery's voltage: _In current mode the meter is almost a wire, so it cannot read voltage. It shorts the battery instead._
- ✅ The meter's fuse blows: _The meter shorts the battery, a huge current flows, and the fuse sacrifices itself._
- ❌ Nothing happens: it reads 0 A: _A low-resistance path straight across a battery is a short. The current is anything but zero._

  Hint: In current mode the meter is nearly a plain wire.

**Q3 (do it in 3D).** Measure the current through the LED. The meter has to actually show it.

- Scene check: `measureLedCurrent`
- Hint: Set the dial to amps, tap "Break the circuit" to open the gap next to the LED, then put one probe on each side of the gap.
- On success: _About 13.6 mA. In a single loop the same current flows through every part, so that is the LED current too._

## Module 2: Circuits that work (and why they don't)

_Ground, shorts, opens, and how parts share voltage and current._

### 2.1 Ground, the 0 V reference (6 min)

**Opening prompt (before any reading):** Board B's LED should copy board A's button, but it glitches. Press A's button a few times, then add one wire to fix it.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Voltage only means something between two points, so every circuit needs an agreed reference. That reference is **ground**: the point we call 0 V. When a chip says its output is at 3.3 V, it means 3.3 V above *its own* ground.
>
> Two boards running on separate batteries each have their own ground, and nothing joins them. To board B, board A's signal is a voltage measured from nowhere in particular, so B reads random noise.
>
> Join the two grounds with a wire and both boards share one 0 V. Now A's 3.3 V means 3.3 V to B as well. The ground wire also gives the signal's current a way back home, because every current needs a loop.
>
> Rule of thumb: boards that share a signal must share ground.

**Key takeaway:** Ground is the agreed 0 V reference. Circuits that talk to each other must share it.

**Skills unlocked:** Connect two boards so their signals mean the same thing

**Q1.** Two boards, each with its own battery, are joined by a single signal wire. Why does the receiver glitch?

- ❌ The signal wire is too thin: _Thickness hardly matters for a tiny signal current. The real problem is that the two boards do not share a reference._
- ✅ The boards do not share a 0 V reference, so the receiver cannot tell what the signal means: _Without a shared ground, the signal voltage is not measured from anything the receiver knows about, so it reads noise._
- ❌ The two batteries cancel each other out: _The batteries are not connected to each other at all, so they cannot cancel. What is missing is a shared ground._

  Hint: A voltage is always measured from somewhere. Where is the receiver measuring from?

**Q2.** In a circuit, what is "ground"?

- ✅ The point everyone agrees to call 0 V, the reference other voltages are measured from: _That is all ground is: a shared reference point, usually the battery's − side._
- ❌ A wire that has to go into the earth: _Mains equipment is sometimes connected to the earth for safety, but in a circuit "ground" just means the shared 0 V reference._
- ❌ The place where used-up current disappears: _Current is never used up. It flows back to its source, and the ground wire is often the path it takes._

  Hint: Think back to the meter: it always needs a reference point.

**Q3 (do it in 3D).** Add a wire so board B's LED copies board A's button every time, with no glitches and no faults.

- Scene check: `fixGround`
- Hint: Connect GND on board A to GND on board B. Drag between the two pins, or use the "Add a wire" controls.
- On success: _With one shared ground, both boards agree on what 0 V is, so A's HIGH is HIGH for B too, and the signal current has a path home._

### 2.2 Shorts and opens (6 min)

**Opening prompt (before any reading):** Break this working circuit two ways: cut a wire, then bridge + to −. Every mistake can be undone.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Most broken circuits fail in one of two ways.
>
> An **open** is a gap: a cut wire, a cracked solder joint, a loose connector. Current needs a complete loop, so everything stops. Nothing gets hot, it just does not work.
>
> A **short** is an unwanted shortcut, usually from + straight to −, skipping the parts that limit the current. With almost no resistance in the way, current shoots up until something gives: a wire glows, a part burns, or a fuse blows. A fuse is a deliberately weak link that melts first.
>
> To hunt either one, switch the power off and use the meter's **continuity** mode. It beeps when two points are joined with almost no resistance. No beep across a wire means it is open. A beep between + and − means a short.

**Key takeaway:** An open stops everything. A short sends current racing where it should not. Find both with the power off, using the continuity beeper.

**Skills unlocked:** Tell a short from an open; Find a broken connection with the continuity beeper

**Q1.** A board's supply rail reads 0 V, and the bench supply says it has hit its current limit. Short or open?

- ✅ A short: _The supply is pushing all the current it is allowed to, and the voltage has collapsed. The current is pouring through a path with almost no resistance._
- ❌ An open: _An open stops current, so the supply would show almost no current and the full voltage. This is the opposite._

  Hint: Which one lets a huge current flow: a missing path, or a shortcut?

**Q2.** With the power off, you put the meter on continuity across a broken trace. What happens?

- ❌ It beeps: _It beeps only for a near-zero resistance path. A broken trace is a gap, so there is no path._
- ✅ No beep, and the screen shows OL (open): _There is no path between the probes, so the meter reads "OL" (open, over limit) and stays silent._
- ❌ The meter's fuse blows: _Continuity mode uses a tiny test current from the meter's own battery, so nothing gets stressed._

  Hint: The meter beeps only when the two points are joined.

**Q3 (do it in 3D).** Tap **Start the fault hunt**. One wire is secretly broken. Find it with the beeper, then replace only that wire.

- Scene check: `repairFault`
- Hint: Disconnect the battery, set the dial to continuity, and put the probes on the two ends of each wire in turn. The one that stays silent is broken.
- On success: _You found the open without guessing: the broken wire was the only one that did not beep._

### 2.3 Series and parallel (7 min)

**Opening prompt (before any reading):** Switch between series and parallel, then drag a bulb out of its socket. Which one keeps the other bulb lit?

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Parts can be joined in two basic ways.
>
> **Series** means one after another, in a single loop. The same current flows through every part, so if one part fails, the whole chain goes dark. The battery's voltage is shared out along the chain, and the resistances simply add up.
>
> **Parallel** means side by side, with each part across the same two points. Every part gets the full voltage and takes its own current, and the battery supplies the total. Remove one branch and the others carry on. Each extra path makes it easier for current to flow, so the total resistance drops: two equal resistors in parallel act like half of one.
>
> Real circuits mix both, but you can always break them down into these two patterns.

**Key takeaway:** Series: same current, and the voltages add up. Parallel: same voltage, and the currents add up.

**Skills unlocked:** Predict what happens when parts are chained or side by side; Add up resistors in series and in parallel

**Q1.** Two 1 kΩ resistors are connected in parallel. What is the total resistance?

- Answer: **500 Ω** (±1%; units accepted: Ω, kΩ)
- Hint: Two equal resistors in parallel act like half of one.
- On a right answer: _Half of 1 kΩ is 500 Ω. Two paths make it twice as easy for the current to flow._
- If they enter 2000 Ω: _That is the series total. In parallel there are two paths, so the total is *smaller* than either resistor: half of one._

**Q2.** A 470 Ω and a 220 Ω resistor are connected in series. What is the total resistance?

- Answer: **690 Ω** (±1%; units accepted: Ω, kΩ)
- Hint: In series, resistances simply add up.
- On a right answer: _470 Ω + 220 Ω = 690 Ω. The current has to fight its way through both._
- If they enter 150 Ω: _That is roughly the parallel value. In series the current must get through both resistors, one after the other, so add them up._

**Q3 (do it in 3D).** Set things up so that one bulb is out of its socket and the other one is **still lit**.

- Scene check: `oneBulbParallel`
- Hint: Which layout gives each bulb its own path to the battery?
- On success: _In parallel each bulb has its own branch, so pulling one out leaves the other branch complete._

## Module 3: The five parts you'll see everywhere

_Resistors, capacitors, diodes, transistors and chips: what each one is for._

### 3.1 Resistors and the voltage divider (7 min)

**Opening prompt (before any reading):** Slide R1 and R2 and watch the probe on the middle point. Then plug in the load.

**The one live formula:** `Vout = Vin × R2 ÷ (R1 + R2)`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Put two resistors in series across a supply and the voltage drops a little across each. The point between them sits partway between top and bottom, and you choose where by picking the two resistors. That is a **voltage divider**.
>
> If the bottom resistor, R2, is a big share of the total, the middle point sits high. If it is a small share, the point sits low. Equal resistors give exactly half.
>
> Dividers are everywhere: turning a 5 V signal into a safe 3.3 V one, reading a battery level, setting a reference. The catch is that anything connected to the middle point (a **load**) sits in parallel with R2 and drags the output down. A divider is fine for feeding a chip input, which takes almost no current, but it cannot power anything.

**Key takeaway:** Two resistors can make any lower voltage, but only for inputs that draw almost no current.

**Skills unlocked:** Make a lower voltage from a higher one with two resistors

**Q1.** The input is 10 V, R1 (top) is 8 kΩ and R2 (bottom) is 2 kΩ. What is the output voltage?

- Answer: **2 V** (±1%; units accepted: V, mV)
- Hint: Vout = Vin × R2 ÷ (R1 + R2).
- On a right answer: _10 V × 2 kΩ ÷ 10 kΩ = 2 V. R2 is a fifth of the total, so the output is a fifth of the input._
- If they enter 8 V: _That is the voltage across R1, the top resistor. The output is measured across the bottom one, R2: 10 × 2 ÷ (8 + 2)._

**Q2.** You connect a 1 kΩ load to the middle of a divider made of two 10 kΩ resistors. What happens to the output?

- ❌ It stays at half the input: _It would without the load. But the load joins R2 in parallel, so the bottom half of the divider gets much smaller._
- ✅ It drops far below half: _The load in parallel with the 10 kΩ bottom resistor acts like about 909 Ω, so the output falls to less than a tenth of the input._
- ❌ It rises above half: _Adding another path to ground can only pull the middle point down, never up._

  Hint: The load sits in parallel with the bottom resistor. What happens to a parallel pair's resistance?

**Q3 (do it in 3D).** With **no load** connected, set the input to **5 V** and pick R1 and R2 so the middle point reads **3.3 V** (±0.1 V).

- Scene check: `make33`
- Hint: You need R2 to be about two-thirds of the total. Try R1 = 1 kΩ and R2 = 2 kΩ.
- On success: _Any pair where R2 is about twice R1 works: 5 V × 2 ÷ 3 ≈ 3.3 V. This is the classic way to bring a 5 V signal down to 3.3 V._

### 3.2 Capacitors (tiny rechargeable buckets) (8 min)

**Opening prompt (before any reading):** Tap Charge and watch the tank fill. Then make it fill more slowly.

**The one live formula:** `τ = R × C`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A capacitor stores charge, like a small tank. Fill it through a resistor (a narrow pipe) and its voltage climbs quickly at first, then more and more slowly as it nears the supply.
>
> The speed is set by the **time constant**, R × C, in seconds. After one time constant the capacitor is about 63% full. After five it is basically full. A bigger resistor or a bigger capacitor means a slower fill.
>
> Because its voltage cannot jump instantly, a capacitor **smooths** power (it fills in dips) and **creates delays**.
>
> Small **ceramic** capacitors have no polarity. Bigger **electrolytic** ones do: a stripe marks the − leg. Fit one backwards and it can bulge and pop.

**Key takeaway:** Capacitors resist sudden voltage changes. R × C sets how fast they fill, which smooths power and creates delays.

**Skills unlocked:** Use a capacitor to smooth power or create a delay; Fit an electrolytic capacitor the right way round

**Q1.** A 10 kΩ resistor charges a 100 nF capacitor. What is the time constant?

- Answer: **0.001 ms** (±1%; units accepted: ms, s, µs)
- Hint: Use plain units: 10000 Ω × 0.0000001 F gives seconds.
- On a right answer: _10000 × 0.0000001 = 0.001 s, which is 1 ms. After 1 ms the capacitor is about 63% charged._
- If they enter 1 ms: _That would be true for 100 µF. Nano is a thousand times smaller than micro: 100 nF = 0.0000001 F._

**Q2.** How do you make the delay longer?

- ✅ Use a bigger resistor or a bigger capacitor: _Both make R × C bigger: a narrower pipe, or a bigger tank to fill._
- ❌ Use a smaller capacitor: _A smaller tank fills faster, so the delay gets shorter._
- ❌ Raise the supply voltage: _The capacitor then fills to a higher voltage, but it still takes R × C to reach 63% of it._

  Hint: A bigger tank, or a narrower pipe?

**Q3 (do it in 3D).** Pick R and C so the capacitor takes about **2 seconds** to reach 63% (±10%). Tap Charge to see it.

- Scene check: `tau2s`
- Hint: R × C = 2 s. For example 20 kΩ × 100 µF, or 100 kΩ × 20 µF.
- On success: _R × C ≈ 2 s, so the curve crosses the 63% line at about the 2 s mark._

### 3.3 Diodes and LEDs (7 min)

**Opening prompt (before any reading):** Flip the LED around, then try taking out its resistor. You can undo anything.

**The one live formula:** `R = (Vsupply − Vled) ÷ I`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A **diode** is a one-way valve for current. Current flows from its + leg (anode) to its − leg (cathode, marked by a stripe or a flat edge) and is blocked the other way.
>
> An **LED** is a diode that glows. It only conducts once the voltage across it reaches a threshold: about 2 V for red, about 3 V for blue or white. Past that point the current shoots up with even a little more voltage. Wire an LED straight to a battery and nothing holds that current back: it flashes and dies.
>
> So every LED needs a **series resistor**. The resistor takes the leftover voltage and sets the current. Most small LEDs are happy at 5 to 20 mA.

**Key takeaway:** Diodes let current through one way only. An LED always needs a resistor to set its current.

**Skills unlocked:** Pick the right resistor for any LED; Spot a diode that is in backwards

**Q1.** You have a 5 V supply and a red LED (2 V), and you want 15 mA. Which resistor do you need?

- Answer: **200 Ω** (±2%; units accepted: Ω, kΩ)
- Hint: R = (Vsupply − Vled) ÷ I = (5 − 2) ÷ 0.015.
- On a right answer: _(5 − 2) ÷ 0.015 = 200 Ω. The nearest standard value is 220 Ω, which gives about 13.6 mA._
- If they enter 333.3 Ω: _That is 5 V ÷ 15 mA, as if the resistor got the whole supply. The LED already takes 2 V, so the resistor only gets the 3 V that is left._

**Q2.** What does the series resistor actually set?

- ✅ The current through the LED: _The LED sits near its threshold voltage. The resistor takes the rest of the supply, and that fixes the current._
- ❌ The LED's colour: _Colour is set by the LED's material. The resistor only sets how much current flows, so how bright it is._
- ❌ The LED's voltage: _The LED's own voltage stays close to its threshold whatever you do. The resistor takes the leftover voltage, and that sets the current._

  Hint: The LED's voltage hardly changes. So what does the resistor control?

**Q3 (do it in 3D).** Light the LED at between **10 and 20 mA** without burning it out.

- Scene check: `ledSafe`
- Hint: Put the resistor back and use the calculator: (supply − LED voltage) ÷ 0.015 is a good target.
- On success: _Inside the comfortable range: bright, cool, and it will last for years._

### 3.4 Transistors as switches (MOSFET) (8 min)

**Opening prompt (before any reading):** Tap the microcontroller pin to switch the LED strip. Then drag the gate voltage to halfway and watch the MOSFET.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A microcontroller pin can only supply a few milliamps, far too little for a motor or an LED strip. A **MOSFET** solves this: it is a switch controlled by voltage. A small voltage at its **gate** opens or closes a wide channel between **drain** and **source**, like a small hand turning a big tap.
>
> Drive the gate fully on and the channel is almost a plain wire: amps flow and the MOSFET stays cool. Fully off, nothing flows. In between it is half-open, which means a resistor carrying lots of current, so it heats up fast.
>
> Motors are coils, and a coil fights any sudden stop in its current. Switch one off and it kicks back a big voltage spike. A **flyback diode** across the coil gives that current a safe loop.

**Key takeaway:** A small voltage at the gate controls a big current. Drive it fully on or fully off, and protect coils with a flyback diode.

**Skills unlocked:** Let a tiny chip pin switch a motor or LED strip; Protect a switch from a motor's kickback

**Q1.** Why should a MOSFET be driven fully on or fully off?

- ✅ Half-on, it acts like a resistor carrying a big current, so it overheats: _Fully on there is almost no voltage across it, and fully off there is no current. Only in between are both large, and voltage × current is heat._
- ❌ Half-on makes the load brighter: _Half-on gives the load less current, so it gets dimmer, and the MOSFET gets hot._
- ❌ The gate draws too much current when half-on: _The gate draws almost no current at any voltage. The heat comes from the drain-to-source channel._

  Hint: Watch the MOSFET's temperature as you move the gate slider through the middle.

**Q2.** What does a flyback diode across a motor do?

- ✅ It gives the motor's current a safe loop when the switch opens, so there is no voltage spike: _The coil keeps its current flowing for a moment. The diode lets it circle harmlessly through the motor until it dies away._
- ❌ It makes the motor spin faster: _While the motor runs, the diode is reversed and does nothing. It only matters at switch-off._
- ❌ It stops the motor from running backwards: _Direction is set by how the motor is wired. The diode only catches the switch-off kick._

  Hint: What happens to a coil's current at the instant the switch opens?

**Q3 (do it in 3D).** Switch the **motor** on, then off again **without a spark**.

- Scene check: `motorOffSafe`
- Hint: Choose the motor as the load, add the flyback diode, then switch on and off.
- On success: _With the flyback diode in place, the coil's current circles through the diode and fades away calmly._

### 3.5 Chips and microcontrollers (6 min)

**Opening prompt (before any reading):** Pull the chip apart with the slider. Then tap a pin to make it an output and switch it on.

**Water view:** no

**Explanation**

> A **microcontroller** is a whole tiny computer in one package: a processor, memory for your program, and a set of pins. Most pins are **GPIO** (general-purpose input/output). Your code decides whether each pin is an input that reads a voltage or an output that drives one, HIGH or LOW.
>
> Inside the black plastic is a silicon die a few millimetres across, joined to the pins by bond wires thinner than a hair.
>
> Every chip has a **datasheet**, and the datasheet is the truth. Read the **absolute maximum ratings** table first: the limits that can destroy the chip if you go past them, even briefly. Normal operating values are lower still.

**Key takeaway:** A microcontroller is a tiny computer with pins for hands. The datasheet is the truth: never exceed the absolute maximum ratings.

**Skills unlocked:** Find a chip's limits in its datasheet

**Q1.** The datasheet says the absolute maximum on any pin is VDD + 0.3 V, and VDD is 3.3 V. Can you connect a 5 V signal straight to a pin?

- ✅ No: the limit is 3.6 V: _3.3 + 0.3 = 3.6 V, and 5 V is well past it. Use a divider or a level shifter._
- ❌ Yes: chips can take a bit extra: _Some pins are "5 V tolerant", but only when the datasheet says so. This one does not._
- ❌ Yes, as long as it is only brief: _Absolute maximum ratings apply even to short spikes. Exceeding them for a moment can still do damage._

  Hint: Work out VDD + 0.3 V, then compare it with 5 V.

**Q2.** Open the datasheet below the scene. What is the **absolute maximum** current a single I/O pin may supply?

- Answer: **0.02 mA** (±1%; units accepted: mA, A)
- Hint: Look in the "Absolute maximum ratings" table, on the "Current per I/O pin" row.
- On a right answer: _20 mA is the never-exceed limit. Design for less: the recommended value is 8 mA._
- If they enter 0.008 mA: _That is the recommended operating value. The never-exceed limit is in the absolute maximum ratings table._

**Q3 (do it in 3D).** Make pin **PA5** an output and set it **HIGH**. The LED on that pin should light.

- Scene check: `pinHigh`
- Hint: Tap the pin in 3D (or pick PA5 in the controls), choose Output, then HIGH.
- On success: _PA5 now drives 3.3 V out through the LED's resistor. As an input, the same pin would only listen._

## Module 4: Digital basics

_How chips turn voltages into 1s and 0s, and how they talk to each other._

### 4.1 Logic levels (1s and 0s are voltage ranges) (5 min)

**Opening prompt (before any reading):** Drag the input voltage up slowly and watch where each chip changes its mind.

**The one live formula:** `HIGH threshold = 0.7 × VDD`

**Water view:** no

**Explanation**

> Digital chips think in 1s and 0s, but a wire only carries a voltage. So each chip uses **ranges**: anything near 0 V counts as LOW (0), anything near its supply voltage counts as HIGH (1).
>
> Between them is a no-man's land. A voltage there might be read either way, and the reading can flip from moment to moment. Good signals spend almost no time there.
>
> The thresholds scale with the chip's supply voltage, VDD. A common rule: HIGH is above 0.7 × VDD and LOW is below 0.3 × VDD. For a 3.3 V chip that means above 2.31 V and below 0.99 V. A 5 V chip needs 3.5 V for HIGH, which a 3.3 V output can never reach. Then you need a **level shifter**.

**Key takeaway:** 1s and 0s are voltage ranges set by each chip's supply. Check that one chip's HIGH is high enough for the other.

**Skills unlocked:** Check whether two chips can talk without a level shifter

**Q1.** Why might a 3.3 V output fail to drive a 5 V input?

- ✅ The 5 V chip needs about 3.5 V to see HIGH, and 3.3 V falls short: _0.7 × 5 V = 3.5 V. A 3.3 V HIGH lands in the undefined zone, so the 5 V chip may read it either way._
- ❌ The 3.3 V output gets damaged: _Driving an input does not hurt the output. The problem is the receiver's threshold._
- ❌ 5 V chips only understand exactly 5 V: _Every chip reads a range, not one exact value. The 5 V chip's HIGH range just starts above 3.3 V._

  Hint: Work out 0.7 × 5 V and compare it with 3.3 V.

**Q2.** A 3.3 V chip reads HIGH above 0.7 × its supply. What is that threshold?

- Answer: **2.31 V** (±0.5%; units accepted: V, mV)
- Hint: Multiply: 0.7 × 3.3.
- On a right answer: _0.7 × 3.3 = 2.31 V. Anything above that is a 1._
- If they enter 0.99 V: _That is the LOW threshold, 0.3 × 3.3. HIGH uses 0.7._

**Q3 (do it in 3D).** Find an input voltage that the **3.3 V chip** reads as HIGH but the **5 V chip** does not.

- Scene check: `between`
- Hint: You need to be above 2.31 V but below 3.5 V.
- On success: _Between 2.31 V and 3.5 V the two chips disagree. That gap is exactly why 3.3 V and 5 V parts sometimes need a level shifter._

### 4.2 Pull-up resistors, floating inputs and button bounce (7 min)

**Opening prompt (before any reading):** Don't touch the button: watch the pin's reading on its own. Then add the pull-up resistor.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> An input pin with nothing connected is **floating**. It is not tied to any voltage, so it drifts and picks up noise from nearby wires, even from your hand, and reads random 1s and 0s.
>
> The fix is a **pull-up resistor**, typically 10 kΩ, from the pin to the supply. It gently holds the pin HIGH. Pressing the button connects the pin straight to ground, which easily beats the weak pull-up, so the pin reads LOW. Pressed is 0, released is 1.
>
> Buttons have one more trick: their metal contacts **bounce**, making and breaking contact several times within a few milliseconds. A fast chip sees one press as several. Software **debouncing** waits for the signal to settle, for example 20 ms, before believing it.

**Key takeaway:** Never leave an input floating: use a pull-up (or pull-down) resistor. Debounce buttons in software.

**Skills unlocked:** Wire a button so it reads reliably

**Q1.** A button connects a pin to ground, and there is no pull-up. The button is not pressed. What does the pin read?

- ❌ HIGH: _Only if something holds it HIGH. With nothing connected, it just drifts._
- ❌ LOW: _The button is open, so nothing connects the pin to ground either._
- ✅ Random noise: the pin is floating: _Nothing holds the pin at any voltage, so it drifts and reads random values._

  Hint: With the button open, what is the pin connected to?

**Q2.** With a 10 kΩ pull-up to 3.3 V and the button to ground, what does the pin read while the button is pressed?

- ✅ LOW: _The button ties the pin directly to 0 V, which overpowers the weak pull-up._
- ❌ HIGH: _That is the reading with the button released._
- ❌ It shorts the supply: _The 10 kΩ resistor limits the current to 3.3 V ÷ 10 kΩ = 0.33 mA. Nothing is shorted._

  Hint: Pressing the button wires the pin straight to 0 V.

**Q3 (do it in 3D).** Make one press of the button count **exactly once** on the counter.

- Scene check: `onePress`
- Hint: You need two fixes: a pull-up so the pin does not float, and debouncing so the bounces are ignored. Then reset the counter and press once.
- On success: _Pull-up for a clean idle level, debounce for a clean press: one press, one count._

### 4.3 How chips talk (I2C, SPI, UART) (6 min)

**Opening prompt (before any reading):** Pick a bus and press Send. Watch which wires carry the message.

**Water view:** no

**Explanation**

> Chips on a board talk constantly: a microcontroller reads a sensor, updates a display, chats with a radio. Three simple "languages" cover most of it, and you only need to recognise them.
>
> **I2C** uses two shared wires, SDA (data) and SCL (clock), for many chips at once. Each chip has an **address**, and every message starts with the address of the chip it is meant for.
>
> **SPI** uses a clock, a data-out wire and a data-in wire, plus one **chip-select** wire per chip to say who should listen. More wires, but very fast. Common for displays and memory.
>
> **UART** is a simple chat between exactly two devices: each one's TX (transmit) goes to the other's RX (receive). There is no clock; both sides agree on the speed in advance.

**Key takeaway:** I2C: two shared wires plus addresses. SPI: fast, with one select line per chip. UART: two devices, TX crossed to RX.

**Skills unlocked:** Recognise I2C, SPI and UART on a schematic

**Q1.** Which bus lets several chips share just two wires, picking the right chip by its address?

- ✅ I2C: _SDA and SCL are shared by every chip, and the address at the start of each message says who should answer._
- ❌ SPI: _SPI picks the chip with a separate chip-select wire per chip, so it needs more wires._
- ❌ UART: _UART links exactly two devices. There is no addressing._

  Hint: Which one starts every message with an address?

**Q2.** On a UART link, what does the microcontroller's TX pin connect to?

- ✅ The other device's RX: _Transmit goes to receive, in both directions: TX to RX and RX to TX._
- ❌ The other device's TX: _Then both transmitters talk into each other and nobody listens. TX must cross over to RX._
- ❌ Ground: _The grounds are joined too, but the data travels from TX to the other side's RX._

  Hint: One side talks, the other side listens.

**Q3 (do it in 3D).** Using the bus where both sensors share the same two wires, send a request to the sensor at address **0x48**.

- Scene check: `i2cSend`
- Hint: Choose I2C, pick the temperature sensor (0x48), and press Send.
- On success: _Both sensors saw the message on the shared wires, but only 0x48 recognised its address and answered._

## Module 5: Powering things

_Batteries, regulators and the little capacitors that keep chips happy._

### 5.1 Batteries and power budgets (6 min)

**Opening prompt (before any reading):** Switch parts on and off and watch the battery drain. Time runs fast here: one second is one hour.

**The one live formula:** `Battery life (h) = capacity (mAh) ÷ average current (mA)`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A battery's **capacity** is printed in milliamp-hours (mAh): how many milliamps it can supply, for how many hours. A 2000 mAh cell gives 20 mA for 100 hours, or 200 mA for 10 hours.
>
> To estimate battery life, add up the **average** current of everything that is on, then divide the capacity by it. Real life gives a bit less, so leave a margin.
>
> Averages hide peaks. A radio might sleep at almost nothing, then burst at 800 mA for a few milliseconds. The battery and everything in the power path must handle that **peak**, or the voltage sags and the chip resets.
>
> A lithium-ion cell's voltage also falls as it empties: about 4.2 V when full and 3.0 V when empty. Your circuit has to keep working across that whole range.

**Key takeaway:** Battery life is capacity divided by average current. Size the power path for the peak current.

**Skills unlocked:** Estimate battery life from a power budget; Size a supply for peak current, not the average

**Q1.** A device draws 25 mA on average from a 2000 mAh battery. Ideally, how many hours will it last?

- Answer: **80 hours** (±1%; units accepted: hours, days)
- Hint: Hours = mAh ÷ mA.
- On a right answer: _2000 ÷ 25 = 80 hours, a little over 3 days. Expect somewhat less in practice._
- If they enter 50000 hours: _That is capacity × current. Divide instead: 2000 mAh ÷ 25 mA._

**Q2.** A sensor averages 20 mA, but its radio bursts at 800 mA. What current should the power supply be able to deliver?

- ✅ 800 mA: the peak: _If the supply cannot deliver the burst, the voltage sags exactly when the radio needs it and the chip may reset. Battery life still depends on the 20 mA average._
- ❌ 20 mA: the average: _The average sets battery life, but during each burst the supply really has to deliver 800 mA._
- ❌ 410 mA: halfway between: _There is no averaging at the moment of the burst: the full 800 mA is needed right then._

  Hint: What happens if the supply cannot deliver what the radio asks for, at the moment it asks?

**Q3 (do it in 3D).** Change the settings so the 2000 mAh battery would last **more than one week** (168 hours).

- Scene check: `week`
- Hint: You need an average below 2000 ÷ 168 ≈ 11.9 mA. The LED and the always-listening radio are the big spenders. Try sleep mode too.
- On success: _Sleeping most of the time and only waking the radio for short bursts is how gadgets run for months on one battery._

### 5.2 Regulators (linear vs switching) (7 min)

**Opening prompt (before any reading):** Power the 5 V load from 12 V with each kind of regulator. Watch which one gets hot.

**The one live formula:** `Heat = (Vin − Vout) × I`

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Most circuits need one steady voltage, but batteries and adapters supply something else, so a **regulator** sits in between.
>
> A **linear regulator** (the common kind is called an LDO) works like a tap that throttles away the extra pressure. It is simple, quiet and cheap, but it burns the difference as heat. Dropping 12 V to 5 V at half an amp wastes more power than the load uses.
>
> A **switching regulator** (a buck converter) instead switches fully on and off very fast and smooths the result. It is typically 85 to 95% efficient, so it stays cool, but its output has a small **ripple** and it needs more parts.
>
> Rule of thumb: a small drop or a tiny current suits an LDO. A big drop or a big current needs a switcher.

**Key takeaway:** A linear regulator burns the extra voltage as heat. A switcher runs cool but adds ripple. Choose based on the voltage drop and the current.

**Skills unlocked:** Choose between a linear regulator and a switcher; Predict how hot a linear regulator will get

**Q1.** An LDO turns 12 V into 5 V for a 500 mA load. How much heat does it make?

- Answer: **3.5 W** (±1%; units accepted: W, mW)
- Hint: Heat = (Vin − Vout) × I = (12 − 5) × 0.5.
- On a right answer: _7 V × 0.5 A = 3.5 W. That is more than the 2.5 W the load actually uses, and enough to burn a finger on a small regulator._
- If they enter 6 W: _That is the total power going in (12 V × 0.5 A). Only the dropped part becomes heat: (12 − 5) × 0.5._
- If they enter 2.5 W: _That is what the load uses (5 V × 0.5 A). The regulator's heat is the dropped voltage times the current._

**Q2.** Why does the switching regulator stay cool?

- ✅ Its switch is always fully on or fully off, so it never sits half-open burning power: _Just like the MOSFET: fully on means almost no voltage across it, fully off means no current. Either way, little heat._
- ❌ It has a bigger heatsink: _It usually has a smaller one. It simply wastes much less power in the first place._
- ❌ It makes the load draw less current: _The load draws the same 5 V and the same current either way. The switcher just wastes far less getting there._

  Hint: Remember the MOSFET lesson: when does a switch get hot?

**Q3 (do it in 3D).** Power the 5 V load at **500 mA** from **12 V** without the regulator overheating (it must stay under 100 °C).

- Scene check: `cool5V`
- Hint: At 12 V in, the LDO would have to burn 3.5 W. Which regulator wastes less?
- On success: _The buck converter wastes only about a quarter of a watt here, so it stays barely warm._

### 5.3 Decoupling capacitors (6 min)

**Opening prompt (before any reading):** Watch the chip's supply voltage dip each time it gets busy. Then drag the little capacitor closer to its power pin.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> Digital chips do not draw a steady current. On every clock tick, thousands of transistors switch at once and gulp a burst of current lasting a few billionths of a second.
>
> The supply cannot respond that fast. It is far away, and the long trace to the chip behaves like a heavy column of water that resists sudden changes in flow (it has **inductance**). So during each burst the voltage at the chip's pin dips. Dip too far and the chip glitches or resets.
>
> A **decoupling capacitor** is a tiny local tank right next to the pin. It covers each burst instantly, then refills from the supply. It only works when it is **close**: millimetres, not centimetres.
>
> Standard practice: one 100 nF ceramic capacitor per power pin, as close as you can get it.

**Key takeaway:** Put a 100 nF capacitor at every power pin, millimetres away.

**Skills unlocked:** Place decoupling capacitors where they actually work

**Q1.** Where should a chip's 100 nF decoupling capacitor go?

- ✅ Right next to the power pin, with short connections to power and ground: _Close means very little trace between the tank and the pin, so it can respond instantly._
- ❌ Next to the power supply, where the power comes in: _That is the far end of the long trace: each burst still has to travel the whole way._
- ❌ Anywhere on the board, since it is all the same net: _It is the same net electrically, but every millimetre of trace adds inductance that slows the capacitor down._

  Hint: What did the dip do as you dragged the capacitor along the trace?

**Q2.** Without a decoupling capacitor, why does the chip's supply dip during a burst?

- ✅ The long trace's inductance stops the current from rising fast enough: _Like a heavy column of water, the current in a long trace cannot speed up instantly, so the pin briefly runs short._
- ❌ The supply voltage is set too low: _Between bursts the voltage is fine. The dips only come with sudden changes in current._
- ❌ The chip draws too much current on average: _The average is small. It is the sudden bursts that the trace cannot keep up with._

  Hint: The dips only appear at the moment the current suddenly changes.

**Q3 (do it in 3D).** Place the decoupling capacitor so the dip is **smaller than 0.1 V** and the chip stops resetting.

- Scene check: `capClose`
- Hint: Fit the capacitor, then drag it (or use the slider) until it is just a few millimetres from the pin.
- On success: _A few millimetres from the pin, the local tank catches each burst before the long trace even notices._

## Module 6: From idea to circuit board

_Schematic, footprints, layers and checks: designing a real board._

### 6.1 Schematic → netlist (8 min)

**Opening prompt (before any reading):** Connect pins in the schematic: tap one pin, then another. Watch each connection light up on the real board.

**Water view:** no

**Explanation**

> A **schematic** is the circuit's map: symbols for parts, lines for connections. It says nothing about where parts sit on the board, only what connects to what.
>
> Every group of pins joined together is called a **net**, and each net gets a name, like GND or +5V. The full list of nets, with every pin on each one, is the **netlist**.
>
> The netlist is the contract between your schematic and your board. In the layout, every pin in a net must be joined by copper, and nothing else may touch it. Design tools show connections still to be made as thin lines called a **ratsnest**.
>
> The schematic is the single source of truth: if something needs to change, change it there first.

**Key takeaway:** The schematic is the single source of truth. The netlist is the contract the layout must honour.

**Skills unlocked:** Draw a simple schematic and explain what a net is

**Q1.** What is a net?

- ✅ A group of pins that are all connected together: _A net can join two pins or two hundred. Everything on it sits at the same voltage._
- ❌ A single wire between exactly two pins: _A net can join any number of pins. GND often joins dozens._
- ❌ The copper on the board: _Copper is how the layout makes a net real. The net itself is the idea: these pins are connected._

  Hint: Look at the netlist under the schematic. How many pins does GND have?

**Q2.** While laying out the board you notice the LED should go to a different pin. What do you change first?

- ✅ The schematic, then update the layout from it: _Change the source of truth first, and the netlist and layout follow._
- ❌ Just move the trace in the layout: _Then the schematic and the board disagree, and the next update or check will flag it or undo your change._
- ❌ Nothing: the factory will notice: _The factory builds exactly what your files say. It does not check your circuit._

  Hint: Which document is the single source of truth?

**Q3 (do it in 3D).** Wire the schematic so that **all 5 nets** are complete and nothing is joined that should not be.

- Scene check: `allNets`
- Hint: The goal nets are listed under the schematic. Check them off one by one: +5V, GATE, LED_A, DRAIN and GND.
- On success: _Five nets, matching the netlist exactly. Press the button in the simulation: it switches the MOSFET, and the LED lights._

### 6.2 Footprints (6 min)

**Opening prompt (before any reading):** Pick a part from the tray, then a pad pattern on the board. Can you match all four?

**Water view:** no

**Explanation**

> A **footprint** is the pattern of copper pads (and holes) a part is soldered onto. Every part in your schematic needs one, and it has to match the real part exactly: the number of pins, the spacing between them (the **pitch**) and the pad sizes. Get it wrong and the part will not fit, which you usually discover when the boards arrive.
>
> Footprints come from the part's datasheet, which shows a recommended pad layout. Design tools have big libraries, but always compare with the datasheet.
>
> Watch the size codes on small parts. **0805** is an imperial code: 0.08 × 0.05 inch, which is 2.0 × 1.25 mm, or **2012** in metric. Some suppliers use metric codes, and the same four digits can then mean a much smaller part.

**Key takeaway:** The footprint must match the datasheet exactly: pins, pitch and pad size. Check whether a size code is imperial or metric.

**Skills unlocked:** Match a part to the correct footprint

**Q1.** An "0805" resistor uses the imperial size code. How big is it?

- ✅ 2.0 × 1.25 mm (metric code 2012): _0.08 inch ≈ 2.0 mm and 0.05 inch ≈ 1.25 mm, so the metric code is 2012._
- ❌ 0.8 × 0.5 mm, read straight from the code: _That reads the digits as millimetres. 0805 is in hundredths of an inch, which is about 2.5 times bigger._
- ❌ 8 × 5 mm: _Far too big. 0805 means 0.08 × 0.05 inch, about 2.0 × 1.25 mm._

  Hint: The digits are hundredths of an inch: 0.08 × 0.05 inch. One inch is 25.4 mm.

**Q2.** Where should the exact pad sizes for a new footprint come from?

- ✅ The part's datasheet (its recommended land pattern): _The manufacturer tells you exactly which pads its part needs._
- ❌ Measuring the part with a ruler: _Too rough. Pads need the right size and extra margin for solder, which the datasheet specifies._
- ❌ Any footprint with the right number of pins: _Pin count is not enough. Pitch, pad size and spacing must match too._

  Hint: What is "the truth" for any part?

**Q3 (do it in 3D).** Put **all four parts** on their correct footprints.

- Scene check: `matchAll`
- Hint: Compare the pin count first, then the spacing. Tap a part to read its size, then tap the pads that match.
- On success: _Every part sits on pads made for it. That is what lets a machine place and solder them automatically._

### 6.3 Layers, traces, vias and the ground plane (8 min)

**Opening prompt (before any reading):** This is a real circuit board. Drag the slider to pull it apart.

**Water view:** yes (Real / Both / Water toggle)

**Explanation**

> A circuit board is a sandwich. In the middle is a stiff fibreglass core. Copper sits on each side, etched into **traces**, which are flat wires. Green solder mask covers the copper so solder only sticks where it should, and white silkscreen prints the labels.
>
> A **via** is a tiny plated hole that carries a connection from one copper layer to the other.
>
> Traces have resistance, so thin ones carrying lots of current get hot. Signal traces can be thin (about 0.25 mm), while power traces need to be wider. A trace-width calculator gives the exact figure.
>
> On a 2-layer board, make the bottom layer one unbroken sheet of copper connected to ground: a **ground plane**. Current always returns to its source, and it prefers the path right underneath its own trace. Cut the plane and it detours, making a loop that broadcasts noise.

**Key takeaway:** Size power traces for their current, and keep one solid ground plane under your signals.

**Skills unlocked:** Read the layers of a 2-layer board; Size a power trace for its current; Keep the ground plane solid

**Q1.** What is a via?

- ❌ A component that blocks current: _That would be an insulator. A via is a conductor, joining layers._
- ✅ A plated hole that connects copper layers: _Its copper-plated barrel joins the top copper to the bottom copper._
- ❌ A hole for a mounting screw: _Mounting holes are bigger and usually not connected to any net. Vias carry signals and power between layers._
- ❌ A test point: _A test point is a pad you can probe. A via is a plated hole joining layers (though you can sometimes probe one)._

  Hint: Tap the highlighted via and watch which layers it lights up.

**Q2 (do it in 3D).** The LED strip trace carries **3 A**. Widen it until it stays under **+20 °C**.

- Scene check: `traceCool`
- Hint: Drag the trace-width slider and watch the colour and the temperature rise. Use the keyboard arrows for fine steps.
- On success: _About 0.9 mm keeps a 3 A trace within +20 °C on 1 oz outer copper (IPC-2221). The starting 0.4 mm would have run at about +76 °C._

**Q3.** To make room for a quick trace, someone cuts a slot in the ground plane right under a fast signal. What happens?

- ❌ Nothing: ground is ground: _Ground is a path, not just a label. The return current has to physically flow back through it._
- ✅ The return current detours around the slot, making a bigger loop and more noise: _The loop between the signal and its return gets much bigger, and a big loop acts like an antenna._
- ❌ The signal gets faster: _If anything it gets worse: the detour adds inductance and noise._
- ❌ The board shorts out: _Nothing is shorted. The problem is the detour the return current has to take._

  Hint: Watch the return current on the bottom layer when you cut the slot.

### 6.4 Design rule checks (7 min)

**Opening prompt (before any reading):** This board has four hidden problems. Run the checks and fix each one.

**Water view:** no

**Explanation**

> Before you order, two automatic checkers go through your design.
>
> **ERC** (electrical rule check) reads the schematic and flags logic problems: an input with nothing driving it, two outputs fighting each other, a pin left unconnected that should not be.
>
> **DRC** (design rule check) reads the layout and compares it with the factory's limits: copper too close to other copper, traces too thin, holes too small, connections not yet routed, parts not sitting on their pads.
>
> Every error comes with a location. Fix it, or, if you are sure it is intended, mark it as reviewed with a note. The goal is a report with **zero unexplained errors**. It takes minutes, and saves a board re-spin that costs weeks.

**Key takeaway:** ERC checks the schematic's logic. DRC checks the physical layout. Ship with zero unexplained errors.

**Skills unlocked:** Run DRC and ERC, and fix what they flag

**Q1.** What is the difference between DRC and ERC?

- ✅ DRC checks the physical layout against the factory's rules. ERC checks the schematic's logic.: _Exactly: ERC asks "does this circuit make sense?" and DRC asks "can the factory build this?"_
- ❌ They are two names for the same check: _They read different documents and catch different mistakes. You need both._
- ❌ ERC checks the layout, DRC checks the schematic: _The other way round: Design Rule Check covers the layout; Electrical Rule Check covers the schematic._

  Hint: One reads the schematic, the other reads the board layout.

**Q2.** DRC flags something you have checked and know is harmless, such as a deliberate gap. What should you do?

- ✅ Mark it as reviewed with a note, so the report shows zero unexplained errors: _Then the next person, or future you, can see it was a decision and not a mistake._
- ❌ Ignore it: factories fix small things: _Factories build exactly what your files say. And an ignored error hides the next real one._
- ❌ Delete the rule so it stops complaining: _That hides real errors of the same kind too._

  Hint: The goal is zero *unexplained* errors.

**Q3 (do it in 3D).** Fix all **four** problems, so that both DRC and ERC report zero errors.

- Scene check: `cleanReport`
- Hint: Run DRC (three layout problems) and ERC (one schematic problem). Tap each error to jump to it and fix it, then run both checks again.
- On success: _Zero errors in both checks: this board is ready to export for manufacturing._

## Module 7: Make it real

_How boards are made and assembled, and how to switch one on safely._

### 7.1 Fabrication files, BOM, and how boards are made (7 min)

**Opening prompt (before any reading):** Step through the factory and watch which file drives each step. Then fix the parts list so it can be ordered.

**Water view:** no

**Explanation**

> A board factory never opens your design tool. You send a zip of standard files: **Gerber files**, one per layer (each copper layer, solder mask, silkscreen and the board outline), plus a **drill file** listing every hole.
>
> The factory starts with fibreglass covered in copper on both sides. It drills the holes and plates them with copper, which turns holes into vias. Then it prints your trace pattern and etches away all the copper that is not part of it. Solder mask, silkscreen and a thin protective finish on the pads come last.
>
> For assembly you also send a **BOM** (bill of materials: every part, with its exact manufacturer part number) and a **pick-and-place file** saying where each part goes. A missing or vague part number is the most common reason orders get stuck.

**Key takeaway:** Gerbers and a drill file make the bare board. A BOM and a placement file get it assembled. Every BOM line needs an exact part number.

**Skills unlocked:** Prepare a complete order package (Gerbers, drill file, BOM)

**Q1.** Which file tells the factory where to drill the holes?

- ✅ The drill file: _Drill files (often in "Excellon" format) list every hole's position and size._
- ❌ The top copper Gerber: _Gerbers describe the flat pattern on each layer, like copper and mask. Holes have their own file._
- ❌ The BOM: _The BOM lists the parts to buy and fit. It says nothing about the bare board._

  Hint: Step through the factory: which file is shown at the drilling step?

**Q2.** Your assembled-board order is stuck at the factory. What is the most likely cause?

- ✅ A BOM line without an exact manufacturer part number: _"100 nF capacitor" could be a thousand different parts. The factory has to stop and ask._
- ❌ The silkscreen text is too small: _At worst it prints a bit blurry, or you get a warning. It rarely stops an order._
- ❌ The board is green: _Green is the default solder-mask colour. Any colour is fine._

  Hint: Look at the BOM below the scene.

**Q3 (do it in 3D).** Fix the BOM so the factory can source every part.

- Scene check: `fixBom`
- Hint: One line has a vague description instead of a part number. Pick the exact part that matches its value **and** its footprint.
- On success: _Every line now names one exact part, in the right package. This order can go through without questions._

### 7.2 Assembly and reflow (6 min)

**Opening prompt (before any reading):** Run the assembly line step by step. Then make the paste uneven and watch a part stand on its end.

**Water view:** no

**Explanation**

> Most boards are assembled by machines, and the process is the same everywhere.
>
> First a thin steel **stencil** with holes over each pad is laid on the board, and a blade wipes **solder paste** (tiny solder balls in sticky flux) through it. A **pick-and-place** machine then sets each part onto its paste, slightly imperfectly. Finally the board rides through a **reflow oven** that follows a temperature profile: warm up, soak, a short peak around 240 °C to melt the solder, then cool.
>
> Molten solder has strong surface tension. It pulls each part onto the centre of its pads, so slightly crooked parts **self-align**. But if one pad gets much more paste than the other, the solder on that side can pull the part upright: a **tombstone**.

**Key takeaway:** Stencil, paste, pick-and-place, reflow. Molten solder pulls parts straight, and uneven paste can stand them on end.

**Skills unlocked:** Explain how parts are soldered by machine, and why the paste matters

**Q1.** Why do slightly crooked parts end up straight after reflow?

- ✅ Molten solder's surface tension pulls them onto the centre of their pads: _Liquid solder wants the smallest surface, so it drags the part until it sits evenly on both pads._
- ❌ The oven's fans blow them straight: _The airflow is gentle, and if anything it would knock parts out of place. The solder does the aligning._
- ❌ The pick-and-place machine comes back to fix them: _Once the board enters the oven, nobody touches it. The molten solder does the work._

  Hint: Watch the parts at the moment the solder melts.

**Q2.** What causes tombstoning?

- ✅ Uneven solder paste or heating, so one end's solder pulls harder: _The side that melts first, or has more solder, wins the tug of war and lifts the other end._
- ❌ Too much solder mask: _Solder mask sits between the pads, not on them. The cause is unbalanced solder._
- ❌ Using an LED instead of a resistor: _Any small two-pad part can tombstone. It is about the solder, not the type of part._

  Hint: Try the uneven paste setting.

**Q3 (do it in 3D).** Run the full line with even paste, so every part solders flat with **no tombstones**.

- Scene check: `noTombstone`
- Hint: Choose even paste, then press "Run the whole line" (or step through it) and let the reflow finish.
- On success: _Even paste on both pads means a fair tug of war: the part settles flat and centred._

### 7.3 First power-on (bring-up) (7 min)

**Opening prompt (before any reading):** This brand-new board hides a short. Set the bench supply's current limit before you switch on, or see what happens.

**Water view:** no

**Explanation**

> A brand-new board is guilty until proven innocent. Switch it on carelessly and a single solder bridge can cook a part in a second. Professionals follow the same order every time:
>
> 1. **Inspect**: look for bridges and missing or rotated parts.
>
> 2. **Check for shorts**: with the power off, measure the resistance between the supply rail and ground. It should not be near 0 Ω.
>
> 3. **Power up with a current limit**: set the supply's limit just above what the board should draw, say 50 mA. A short then makes the supply report the fault instead of burning anything.
>
> 4. **Check the rails**: measure each supply voltage.
>
> 5. **Check the signals**: test each function one by one.

**Key takeaway:** Inspect, check for shorts, power up with a current limit, check the rails, then the signals. The current limit turns disasters into clues.

**Skills unlocked:** Bring up a new board safely with a current limit

**Q1.** What is the very first thing to do with a freshly assembled board?

- ✅ Inspect it closely for solder bridges and missing or rotated parts: _Many faults are visible, and looking costs nothing and risks nothing._
- ❌ Plug it into full power to see if it works: _If there is a short, full power can burn a part or a trace before you can react._
- ❌ Measure the rail voltages: _That needs power. Look first, and check for shorts second._

  Hint: Your eyes are the cheapest test equipment.

**Q2.** You switch on with a 50 mA limit. The supply jumps into current limit and the voltage drops to 0.1 V. What does that tell you?

- ✅ There is a short: the board is drawing every milliamp it is allowed: _The supply is protecting the board and telling you there is a low-resistance path. Time to find it with the meter._
- ❌ The board is working normally: _A working board would sit at the set voltage, drawing its normal current._
- ❌ The supply is broken: _It is doing exactly its job: limiting the current and telling you about it._

  Hint: What kind of path takes all the current while the voltage collapses?

**Q3 (do it in 3D).** Bring the board up safely: find and remove the short, then power it **with a current limit** until the rail reads 5 V.

- Scene check: `bringUp`
- Hint: Inspect, then use the meter on ohms between the +5V and GND test points. Remove the bridge, set the limit to 100 mA or less, and switch on.
- On success: _The rail sits at 5 V and the board draws only its normal few milliamps. That is a successful bring-up._

## Later, if you're curious (glossary of what was cut)

- **Semiconductor doping**: Adding tiny amounts of other elements to silicon so it conducts in controlled ways. It is how diodes and transistors are made.
- **Inductor**: A coil of wire that resists changes in current, the way a capacitor resists changes in voltage. Think of it as a heavy water wheel that is slow to start and slow to stop.
- **Transformer**: Two coils sharing a magnetic core. They swap voltage for current (step up or step down) in AC circuits such as wall chargers.
- **Crystal / oscillator**: A tiny vibrating quartz part that gives a chip a very steady clock frequency.
- **Op-amp**: An amplifier chip that compares two voltages. With a few resistors it can amplify, filter or compare signals.
- **Kirchhoff's laws**: The formal names for "currents into a junction equal currents out" and "voltages around a loop add up to zero". You already used both in the series and parallel lesson.
- **Impedance**: Resistance generalised to signals that change: capacitors and inductors "resist" differently at different frequencies.
- **Resonance**: The frequency at which an inductor and a capacitor swap energy back and forth most easily, like a swing pushed at just the right moment.
- **Filters**: Combinations of resistors, capacitors and inductors that let some frequencies through and block others, for example to clean up audio or sensor signals.
- **Flip-flops and registers**: The smallest memory cells in digital chips. Each remembers a single 1 or 0 until the next clock tick.
- **Clocks**: The steady beat that tells digital circuits when to take their next step.
- **Setup and hold time**: How long a digital signal must stay steady before and after a clock tick to be read correctly.
- **ADC**: Analog-to-digital converter: measures a voltage and turns it into a number, for example to read a temperature sensor.
- **DAC**: Digital-to-analog converter: turns a number into a voltage, for example to make sound.
- **Signal integrity**: Keeping fast signals clean as they travel along traces, without ringing, reflections or interference.
- **Controlled impedance**: Designing trace width and layer spacing precisely so very fast signals do not reflect along the trace.
- **Differential pairs**: Two traces carrying opposite copies of a signal (USB, Ethernet). The receiver looks at the difference, which cancels out noise.
- **EMC**: Electromagnetic compatibility: making sure a product neither radiates too much noise nor gets upset by other devices' noise.
- **RF**: Radio frequency design: antennas, Wi-Fi, Bluetooth. Traces start behaving like antennas, so layout rules get much stricter.
- **Thermal design**: Getting heat out of hot parts with copper area, vias, heatsinks and airflow.
- **Power integrity**: Keeping supply voltages steady across a whole board, even when chips suddenly demand bursts of current. Decoupling caps are the first step.
