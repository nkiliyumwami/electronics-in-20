// Capstone data (pure, so scripts/verify.ts can check it).
export const CAPSTONE = {
  capacity: 2500, // mAh
  awakeMa: 100,
  awakeS: 5,
  sleepMa: { devkit: 5, lowpower: 0.01 },
  intervals: [1, 5, 10, 30, 60], // minutes between wake-ups
  targetDays: 90,
  faults: [
    {
      id: 'adc',
      symptom: 'Soil readings are fine on USB, but turn to nonsense once Wi-Fi connects.',
      fixes: [
        { text: 'Move the soil sensor\'s AOUT from D4 to D32', correct: true, why: 'D4 is an ADC2 pin, and Wi-Fi takes ADC2 over. D32 is on ADC1, which keeps working.' },
        { text: 'Calibrate the sensor again', why: 'Calibration cannot fix a pin that stops reading while Wi-Fi is on.' },
        { text: 'Power the sensor from 5 V', why: 'More voltage would not help, and the output could then go over 3.3 V.' },
      ],
    },
    {
      id: 'led',
      symptom: 'The status LED flashed very brightly once, and has never lit since.',
      fixes: [
        { text: 'Fit a new LED with a 220 Ω resistor in series', correct: true, why: 'With no resistor nothing limited the current, so the LED burned out. 220 Ω keeps it near 6 mA.' },
        { text: 'Use a bigger LED', why: 'Any LED burns out without a resistor. The resistor is what limits the current.' },
        { text: 'Blink it less often', why: 'It is not about how often: without a resistor, every flash is far too much current.' },
      ],
    },
    {
      id: 'pump',
      symptom: 'The ESP32 resets every time the pump switches off.',
      fixes: [
        { text: 'Fit a flyback diode across the pump, stripe towards +5 V', correct: true, why: 'At switch-off the pump\'s coil kicks back with a voltage spike. The diode gives that current a safe loop.' },
        { text: 'Use a thicker USB cable', why: 'A thin cable causes dips when things switch *on*. A reset at switch-*off* is the coil\'s spike.' },
        { text: 'Water the plant less often', why: 'Fewer switch-offs means fewer resets, but every one still happens. Fit a flyback diode.' },
      ],
    },
  ] as { id: string; symptom: string; fixes: { text: string; correct?: boolean; why: string }[] }[],
};

/** Battery life in days for a board type and a wake-up interval (minutes). */
export function budgetDays(board: keyof typeof CAPSTONE.sleepMa, everyMin: number): number {
  const period = everyMin * 60;
  const avg = (CAPSTONE.awakeS * CAPSTONE.awakeMa + (period - CAPSTONE.awakeS) * CAPSTONE.sleepMa[board]) / period;
  return CAPSTONE.capacity / avg / 24;
}
