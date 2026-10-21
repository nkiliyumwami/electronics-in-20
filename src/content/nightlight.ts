// The capstone "night-light" board as pure data (mm). Used by the 3D builder,
// the DRC lessons and the verify script.
//
// Circuit: 5 V battery (J1) → MCU U1 (SOIC-8) with decoupling C1 and a button SW1
// (pull-up R1). U1 drives MOSFET Q1, which switches a 3 A LED strip on J2.
// U1 also lights an indicator LED D1 through R2. Bottom layer: ground plane.
import type { Design, PadD, TraceD, ViaD } from '../sim/drc.ts';
import type { ErcPin } from '../sim/erc.ts';

export const STRIP_AMPS = 3;
export const BOARD = { w: 50, h: 30 };

export interface NightLightOpts {
  powerWidth?: number; // mm, the two 3 A traces
  missing?: string[]; // trace ids left unrouted
  noR1?: boolean; // pull-up left out (ERC demo)
  badClearance?: boolean; // IND trace squeezed past a ground via (DRC demo)
}

export function nightlightDesign(o: NightLightOpts = {}): Design {
  const pads: PadD[] = [];
  const traces: TraceD[] = [];
  const P = (id: string, net: string, x: number, y: number, w: number, h: number, extra: Partial<PadD> = {}) => pads.push({ id, net, x, y, w, h, ...extra });
  // Connectors (through-hole): J1 battery (JST-PH, 2.0 mm pitch), J2 LED strip (JST-XH, 2.5 mm pitch).
  P('J1.1', '+5V', 4, 6, 1.4, 1.4, { round: true, drill: 0.8 });
  P('J1.2', 'GND', 4, 8, 1.4, 1.4, { round: true, drill: 0.8 });
  P('J2.1', '+5V', 46, 6, 1.7, 1.7, { round: true, drill: 1.0 });
  P('J2.2', 'DRAIN', 46, 8.5, 1.7, 1.7, { round: true, drill: 1.0 });
  // U1, SOIC-8 at (20, 18): pins 1–4 down the left, 8–5 down the right (1.27 mm pitch).
  const uNets = ['NC', 'BTN', 'IND', 'GND', 'GATE', 'NC', 'NC', '+5V'];
  for (let i = 0; i < 4; i++) P(`U1.${i + 1}`, uNets[i], 17.3, 16.1 + i * 1.27, 1.6, 0.6);
  for (let i = 0; i < 4; i++) P(`U1.${8 - i}`, uNets[7 - i], 22.7, 16.1 + i * 1.27, 1.6, 0.6);
  // C1 100 nF (0805) right next to U1 pin 8.
  P('C1.1', '+5V', 24.05, 14.5, 1.0, 1.3);
  P('C1.2', 'GND', 25.95, 14.5, 1.0, 1.3);
  // R1 10 kΩ pull-up (0805, vertical).
  if (!o.noR1) {
    P('R1.1', '+5V', 12, 12.05, 1.3, 1.0);
    P('R1.2', 'BTN', 12, 13.95, 1.3, 1.0);
  }
  // SW1 6 × 6 mm tactile switch: top pads BTN, bottom pads GND.
  P('SW1.1', 'BTN', 6.75, 19.75, 1.4, 1.0);
  P('SW1.2', 'BTN', 13.25, 19.75, 1.4, 1.0);
  P('SW1.3', 'GND', 6.75, 24.25, 1.4, 1.0);
  P('SW1.4', 'GND', 13.25, 24.25, 1.4, 1.0);
  // R2 220 Ω + D1 indicator LED (0805).
  P('R2.1', 'IND', 27.05, 22, 1.0, 1.3);
  P('R2.2', 'LED_A', 28.95, 22, 1.0, 1.3);
  P('D1.A', 'LED_A', 32.05, 22, 1.0, 1.3);
  P('D1.K', 'GND', 33.95, 22, 1.0, 1.3);
  // Q1 SOT-23: gate and source at the bottom, drain at the top.
  P('Q1.G', 'GATE', 39.05, 15.1, 0.8, 0.9);
  P('Q1.S', 'GND', 40.95, 15.1, 0.8, 0.9);
  P('Q1.D', 'DRAIN', 40, 12.9, 0.8, 0.9);

  const T = (id: string, net: string, pts: [number, number][], width: number) => {
    if (!o.missing?.includes(id)) traces.push({ id, net, pts, width });
  };
  const pw = o.powerWidth ?? 0.9;
  // The 3 A path: J1 → J2 along y = 6, and J2.2 → Q1 drain.
  T('P5V', '+5V', [[4, 6], [46, 6]], pw);
  T('PDRAIN', 'DRAIN', [[46, 8.5], [40, 8.5], [40, 12.9]], pw);
  // +5V branches.
  T('5V_U1', '+5V', [[22.7, 6], [22.7, 13.2], [24.05, 13.2], [24.05, 14.5]], 0.4);
  T('5V_U1b', '+5V', [[22.7, 13.2], [22.7, 16.1]], 0.4);
  if (!o.noR1) T('5V_R1', '+5V', [[12, 6], [12, 12.05]], 0.3);
  // Signals.
  T('GATE', 'GATE', [[22.7, 19.91], [32, 19.91], [36, 15.1], [39.05, 15.1]], 0.25);
  T('BTN', 'BTN', [[17.3, 17.37], [12, 17.37], [12, 19.75], [13.25, 19.75]], 0.25);
  if (!o.noR1) T('BTN_R1', 'BTN', [[12, 13.95], [12, 17.37]], 0.25);
  T('SW_PAIR', 'BTN', [[6.75, 19.75], [13.25, 19.75]], 0.25);
  // IND swings wide around U1's ground via. The DRC demo squeezes it past the via.
  T('IND', 'IND', o.badClearance
    ? [[17.3, 18.64], [15.0, 18.64], [15.0, 21.75], [18.5, 21.75], [18.5, 24.0], [26.2, 24.0], [27.05, 22]]
    : [[17.3, 18.64], [15.0, 18.64], [15.0, 24.0], [26.2, 24.0], [27.05, 22]], 0.25);
  T('LED_A', 'LED_A', [[28.95, 22], [32.05, 22]], 0.25);
  // Ground connections to vias (the plane joins them underneath).
  T('GND_U1', 'GND', [[17.3, 19.91], [16.2, 21.2]], 0.3);
  T('GND_SW', 'GND', [[6.75, 24.25], [13.25, 24.25]], 0.3);
  T('GND_C1', 'GND', [[25.95, 14.5], [27.3, 14.5]], 0.4);
  T('GND_Q1', 'GND', [[40.95, 15.1], [42.3, 16.4]], 0.4);
  T('GND_D1', 'GND', [[33.95, 22], [35.3, 22]], 0.3);
  T('GND_SW2', 'GND', [[10, 24.25], [10, 25.8]], 0.3);
  const vias: ViaD[] = [
    { id: 'V_U1', net: 'GND', x: 16.2, y: 21.2, drill: 0.3, ring: 0.6 },
    { id: 'V_C1', net: 'GND', x: 27.3, y: 14.5, drill: 0.3, ring: 0.6 },
    { id: 'V_Q1', net: 'GND', x: 42.3, y: 16.4, drill: 0.3, ring: 0.6 },
    { id: 'V_D1', net: 'GND', x: 35.3, y: 22, drill: 0.3, ring: 0.6 },
    { id: 'V_SW', net: 'GND', x: 10, y: 25.8, drill: 0.3, ring: 0.6 },
  ];
  return { pads, traces, vias };
}

/** Where the 3D parts sit (board mm) and their rotation about the vertical axis. */
export const PLACEMENT: Record<string, { x: number; y: number; rot: number }> = {
  J1: { x: 4, y: 7, rot: 0 },
  J2: { x: 46, y: 7.25, rot: Math.PI },
  U1: { x: 20, y: 18, rot: Math.PI / 2 },
  C1: { x: 25, y: 14.5, rot: 0 },
  R1: { x: 12, y: 13, rot: Math.PI / 2 },
  SW1: { x: 10, y: 22, rot: 0 },
  R2: { x: 28, y: 22, rot: 0 },
  D1: { x: 33, y: 22, rot: 0 },
  Q1: { x: 40, y: 14, rot: 0 },
};

/** Bill of materials (used by 7.1 and the capstone). */
export const BOM = [
  { ref: 'U1', value: 'ATtiny85 microcontroller', footprint: 'SOIC-8', mpn: 'ATTINY85-20SU' },
  { ref: 'Q1', value: 'N-MOSFET 30 V 5.7 A', footprint: 'SOT-23', mpn: 'AO3400A' },
  { ref: 'C1', value: '100 nF 50 V X7R', footprint: '0805', mpn: 'CL21B104KBCNNNC' },
  { ref: 'R1', value: '10 kΩ 1%', footprint: '0805', mpn: 'RC0805FR-0710KL' },
  { ref: 'R2', value: '220 Ω 1%', footprint: '0805', mpn: 'RC0805FR-07220RL' },
  { ref: 'D1', value: 'Red LED', footprint: '0805', mpn: 'LTST-C170KRKT' },
  { ref: 'SW1', value: 'Tactile switch 6 × 6 mm', footprint: 'SMD 6x6', mpn: 'TS-1187A-B-A-B' },
  { ref: 'J1', value: '2-pin battery connector', footprint: 'JST-PH 2.0 mm', mpn: 'S2B-PH-K-S' },
  { ref: 'J2', value: '2-pin LED strip connector', footprint: 'JST-XH 2.5 mm', mpn: 'B2B-XH-A' },
];

/** Pin types for the electrical rule check. */
export function nightlightErcPins(o: NightLightOpts = {}): ErcPin[] {
  const type = (id: string): ErcPin['type'] => {
    if (id === 'U1.2') return 'input';
    if (id === 'U1.3' || id === 'U1.5') return 'output';
    if (id.startsWith('R')) return 'resistor';
    if (id.startsWith('J1') || id === 'U1.8' || id === 'U1.4') return 'power';
    return 'passive';
  };
  return nightlightDesign(o).pads.filter((p) => p.net !== 'NC').map((p) => ({ id: p.id, net: p.net, type: type(p.id) }));
}
