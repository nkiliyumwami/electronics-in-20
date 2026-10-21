// Schematic symbols shown in part tooltips. 56×32 viewBox, drawn with currentColor.

const S = (body: string) =>
  `<svg viewBox="0 0 56 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const SYMBOLS = {
  battery: S('<path d="M2 16h20M34 16h20M22 6v20M28 11v10M30 16h4"/><path d="M14 8h4M16 6v4" stroke-width="1.5"/>'),
  resistor: S('<path d="M2 16h10l3-6 5 12 5-12 5 12 5-12 5 12 3-6h11"/>'),
  led: S('<path d="M2 16h16M38 16h16M18 7v18l18-9zM36 7v18"/><path d="M28 6l5-5M32 9l5-5M30 1h3v3M34 4h3v3" stroke-width="1.5"/>'),
  diode: S('<path d="M2 16h16M38 16h16M18 7v18l18-9zM36 7v18"/>'),
  capacitor: S('<path d="M2 16h22M32 16h22M24 6v20M32 6v20"/>'),
  electrolytic: S('<path d="M2 16h22M33 16h21M24 6v20M36 6c-4 6-4 14 0 20"/><path d="M16 7h4M18 5v4" stroke-width="1.5"/>'),
  mosfet: S('<path d="M2 22h14M16 10v12M20 8v4M20 14v4M20 20v4M20 10h14V2M20 22h14v8M20 16h8l-3-3M28 16l-3 3M34 16h-6"/>'),
  button: S('<path d="M2 20h14M40 20h14M16 20l2 0M38 20l0 0M18 12h20M28 12V5M23 5h10"/><circle cx="17" cy="20" r="1.5"/><circle cx="39" cy="20" r="1.5"/>'),
  switch: S('<path d="M2 18h14M40 18h14M16 18l22-9"/><circle cx="16" cy="18" r="1.5"/><circle cx="40" cy="18" r="1.5"/>'),
  ground: S('<path d="M28 2v14M16 16h24M20 21h16M24 26h8"/>'),
  wire: S('<path d="M2 16h52"/><circle cx="8" cy="16" r="2" fill="currentColor"/><circle cx="48" cy="16" r="2" fill="currentColor"/>'),
  multimeter: S('<circle cx="28" cy="16" r="12"/><path d="M2 16h14M40 16h14M22 13l6 8 6-8"/>'),
  ammeter: S('<circle cx="28" cy="16" r="12"/><path d="M2 16h14M40 16h14M23 22l5-12 5 12M25 18h6"/>'),
  motor: S('<circle cx="28" cy="16" r="12"/><path d="M2 16h14M40 16h14M22 21V11l6 7 6-7v10"/>'),
  chip: S('<rect x="16" y="4" width="24" height="24" rx="2"/><path d="M10 9h6M10 16h6M10 23h6M40 9h6M40 16h6M40 23h6"/><circle cx="21" cy="9" r="1.5"/>'),
  fuse: S('<rect x="14" y="10" width="28" height="12" rx="2"/><path d="M2 16h52"/>'),
  bulb: S('<circle cx="28" cy="16" r="12"/><path d="M2 16h14M40 16h14M20 8l16 16M36 8L20 24"/>'),
  supply: S('<rect x="8" y="4" width="40" height="24" rx="3"/><path d="M16 16h8M20 12v8M32 16h8"/>'),
  via: S('<circle cx="28" cy="16" r="10"/><circle cx="28" cy="16" r="4"/>'),
  trace: S('<path d="M2 22h14l8-12h30" stroke-width="5"/>'),
  plane: S('<rect x="4" y="6" width="48" height="20" rx="2" fill="currentColor" fill-opacity="0.25"/><path d="M28 2v6M18 8h20" />'),
  pcb: S('<rect x="4" y="4" width="48" height="24" rx="3"/><circle cx="10" cy="10" r="2"/><path d="M14 22h12l6-8h14"/>'),
  connector: S('<rect x="18" y="6" width="20" height="20" rx="2"/><path d="M2 12h20M2 20h20"/><circle cx="24" cy="12" r="1.5"/><circle cx="24" cy="20" r="1.5"/>'),
  probe: S('<path d="M4 28L30 8M30 8l8-6 4 4-6 8zM30 8l6 6"/>'),
  breadboard: S('<rect x="3" y="5" width="50" height="22" rx="2"/><path d="M9 11h0M15 11h0M21 11h0M27 11h0M33 11h0M39 11h0M45 11h0M9 21h0M15 21h0M21 21h0M27 21h0M33 21h0M39 21h0M45 21h0" stroke-width="3"/>'),
  regulator: S('<rect x="16" y="6" width="24" height="18" rx="2"/><path d="M2 12h14M40 12h14M28 24v6"/><text x="22" y="18" font-size="7" stroke="none" fill="currentColor">REG</text>'),
  inductor: S('<path d="M2 18h8c0-8 8-8 8 0 0-8 8-8 8 0 0-8 8-8 8 0 0-8 8-8 8 0h8"/>'),
  sensor: S('<rect x="14" y="6" width="28" height="20" rx="2"/><path d="M8 11h6M8 16h6M8 21h6"/><circle cx="28" cy="16" r="4"/>'),
  pin: S('<path d="M2 16h30"/><rect x="32" y="10" width="20" height="12" rx="2"/>'),
  meter: S('<rect x="10" y="4" width="36" height="24" rx="3"/><path d="M16 22a12 12 0 0 1 24 0M28 22l6-9"/>'),
  stencil: S('<rect x="4" y="6" width="48" height="20" rx="2"/><rect x="12" y="12" width="6" height="8"/><rect x="24" y="12" width="6" height="8"/><rect x="36" y="12" width="6" height="8"/>'),
  oven: S('<rect x="4" y="6" width="48" height="20" rx="2"/><path d="M10 20c4-8 8 4 12-4s8 4 12-4 8 4 12-4"/>'),
  pump: S('<circle cx="28" cy="16" r="11"/><path d="M2 16h15M39 16h15M28 7l7 9h-14z"/>'),
  pipe: S('<path d="M2 10h52M2 22h52"/><path d="M8 16h40" stroke-dasharray="3 4"/>'),
  tank: S('<path d="M12 4v22h32V4"/><path d="M12 16h32" stroke-dasharray="3 3"/>'),
  valve: S('<path d="M2 16h16M38 16h16M18 6v20l18-10z"/>'),
  tap: S('<path d="M2 20h18v-6h16v6h18M28 14V6M22 6h12"/>'),
};

export type SymbolKey = keyof typeof SYMBOLS;

export function symbolSvg(k: SymbolKey): string {
  return SYMBOLS[k];
}
