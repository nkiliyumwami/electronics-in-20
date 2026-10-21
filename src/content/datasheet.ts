// The mini datasheet shown in lesson 3.5 (a generic microcontroller).
// Shared by the scene and the verify script so the question can never drift
// from what the viewer shows.
export interface DsRow {
  param: string;
  min?: number;
  max: number;
  unit: string;
  note?: string;
}

export const DATASHEET = {
  part: 'MCU-32 (generic 3.3 V microcontroller)',
  absMax: [
    { param: 'Supply voltage VDD', min: -0.3, max: 4.0, unit: 'V' },
    { param: 'Voltage on any I/O pin', min: -0.3, max: 3.6, unit: 'V', note: 'VDD + 0.3 V' },
    { param: 'Current per I/O pin', max: 20, unit: 'mA', note: 'sourced or sunk' },
    { param: 'Total current, all pins', max: 80, unit: 'mA' },
    { param: 'Storage temperature', min: -65, max: 150, unit: '°C' },
  ] as DsRow[],
  operating: [
    { param: 'Supply voltage VDD', min: 1.8, max: 3.6, unit: 'V' },
    { param: 'Current per I/O pin', max: 8, unit: 'mA', note: 'recommended' },
    { param: 'Input HIGH threshold', min: 2.31, max: 3.6, unit: 'V', note: '0.7 × VDD' },
    { param: 'Input LOW threshold', min: -0.3, max: 0.99, unit: 'V', note: '0.3 × VDD' },
  ] as DsRow[],
};
