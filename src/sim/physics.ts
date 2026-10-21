// Small physics / engineering helpers shared by scenes and the verify script.
// No runtime imports, so Node can load this file directly.

/** Format a value with an SI prefix: fmt(0.0136, 'A') → "13.6 mA". */
export function fmt(value: number, unit: string, digits = 3): string {
  if (!isFinite(value)) return `— ${unit}`;
  const a = Math.abs(value);
  if (a < 1e-12) return `0 ${unit}`;
  const prefixes: [number, string][] = [
    [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  // Ohms read better as "250 Ω" than "250 Ω"; keep plain for < 1000.
  for (const [scale, p] of prefixes) {
    if (a >= scale * 0.9995) {
      const n = value / scale;
      return `${trim(n, digits)} ${p}${unit}`;
    }
  }
  return `${trim(value / 1e-12, digits)} p${unit}`;
}

function trim(n: number, digits: number): string {
  const s = Number(n.toPrecision(digits));
  return String(s);
}

// ---------------------------------------------------------------------------
// IPC-2221 trace heating (external layers).
//   I = k · ΔT^0.44 · A^0.725, with k = 0.048 for outer layers,
//   ΔT in °C and A = cross-section in square mils.
// 1 oz/ft² copper is 1.378 mil (35 µm) thick.
export const IPC_K_EXTERNAL = 0.048;
export const OZ1_THICKNESS_MIL = 1.378;
const MM_PER_MIL = 0.0254;

export function traceAreaMil2(widthMm: number, thicknessMil = OZ1_THICKNESS_MIL): number {
  return (widthMm / MM_PER_MIL) * thicknessMil;
}

/** Temperature rise (°C) of an outer-layer trace carrying `amps`. */
export function traceRise(widthMm: number, amps: number, thicknessMil = OZ1_THICKNESS_MIL): number {
  const area = traceAreaMil2(widthMm, thicknessMil);
  return Math.pow(amps / (IPC_K_EXTERNAL * Math.pow(area, 0.725)), 1 / 0.44);
}

/** Minimum outer-layer trace width (mm) for a given current and allowed rise. */
export function traceWidthFor(amps: number, riseC: number, thicknessMil = OZ1_THICKNESS_MIL): number {
  const area = Math.pow(amps / (IPC_K_EXTERNAL * Math.pow(riseC, 0.44)), 1 / 0.725);
  return (area / thicknessMil) * MM_PER_MIL;
}

// ---------------------------------------------------------------------------
// Resistor colour code.
export const BAND_COLORS = [
  { name: 'black', hex: '#1b1b1b' },
  { name: 'brown', hex: '#7a4a24' },
  { name: 'red', hex: '#d22b2b' },
  { name: 'orange', hex: '#f07f1a' },
  { name: 'yellow', hex: '#f2cf1d' },
  { name: 'green', hex: '#2f9e44' },
  { name: 'blue', hex: '#2366d1' },
  { name: 'violet', hex: '#8a3fc7' },
  { name: 'grey', hex: '#8c8c8c' },
  { name: 'white', hex: '#f4f4f4' },
] as const;
export const GOLD = { name: 'gold', hex: '#c9a227' };
export const SILVER = { name: 'silver', hex: '#c0c0c0' };
export const BROWN_TOL = { name: 'brown', hex: '#7a4a24' };

/**
 * Bands for a resistance. Uses 4 bands (2 digits, ±5% gold) when the value has
 * two significant figures, otherwise 5 bands (3 digits, ±1% brown).
 */
export function resistorBands(ohms: number): { name: string; hex: string }[] {
  const two = roundSig(ohms, 2);
  const useTwo = Math.abs(two - ohms) / ohms < 1e-6;
  const sig = useTwo ? 2 : 3;
  const v = roundSig(ohms, sig);
  let exp = Math.floor(Math.log10(v)) - (sig - 1);
  let digits = Math.round(v / Math.pow(10, exp));
  if (digits >= Math.pow(10, sig)) { digits /= 10; exp += 1; }
  const ds = String(digits).padStart(sig, '0').split('').map(Number);
  const bands: { name: string; hex: string }[] = ds.map((d) => BAND_COLORS[d]);
  if (exp >= 0) bands.push(BAND_COLORS[exp]);
  else if (exp === -1) bands.push(GOLD);
  else bands.push(SILVER);
  bands.push(useTwo ? GOLD : BROWN_TOL);
  return bands;
}

export function roundSig(x: number, sig: number): number {
  if (x === 0) return 0;
  const p = Math.pow(10, sig - Math.floor(Math.log10(Math.abs(x))) - 1);
  return Math.round(x * p) / p;
}

/** E12 standard values in one decade. */
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/** Nearest E12 value (by ratio). */
export function nearestE12(ohms: number): number {
  const dec = Math.pow(10, Math.floor(Math.log10(ohms)));
  let best = 0, bestErr = Infinity;
  for (const m of [...E12.map((e) => e * dec), 10 * dec]) {
    const err = Math.abs(Math.log(m / ohms));
    if (err < bestErr) { bestErr = err; best = m; }
  }
  return roundSig(best, 2);
}

/** Map 0..1 heat to an RGB colour: cool blue → green → yellow → orange → red. */
export function heatColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [0.2, 0.45, 0.95]],
    [0.35, [0.2, 0.8, 0.45]],
    [0.6, [0.98, 0.85, 0.2]],
    [0.8, [1.0, 0.5, 0.1]],
    [1, [0.95, 0.12, 0.08]],
  ];
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (x - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}
