// A tiny electrical rule check: every input pin must be driven by an output or
// held by a resistor (pull-up / pull-down). Pure data.
export interface ErcPin { id: string; net: string; type: 'input' | 'output' | 'passive' | 'resistor' | 'power' }
export interface ErcError { pin: string; msg: string }

export function runErc(pins: ErcPin[]): ErcError[] {
  const errs: ErcError[] = [];
  for (const p of pins) {
    if (p.type !== 'input') continue;
    const others = pins.filter((q) => q.net === p.net && q.id !== p.id);
    const held = others.some((q) => q.type === 'output' || q.type === 'resistor' || q.type === 'power');
    if (!held) errs.push({ pin: p.id, msg: `${p.id} is an input that can float: nothing drives it or pulls it to a fixed level (net ${p.net}).` });
  }
  return errs;
}
