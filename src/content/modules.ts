import type { ModuleInfo } from './types.ts';

export const MODULES: ModuleInfo[] = [
  { n: 1, title: 'The big three', blurb: 'Voltage, current and resistance: the three ideas everything else is built on.' },
  { n: 2, title: "Circuits that work (and why they don't)", blurb: 'Ground, shorts, opens, and how parts share voltage and current.' },
  { n: 3, title: "The five parts you'll see everywhere", blurb: 'Resistors, capacitors, diodes, transistors and chips: what each one is for.' },
  { n: 4, title: 'Digital basics', blurb: 'How chips turn voltages into 1s and 0s, and how they talk to each other.' },
  { n: 5, title: 'Powering things', blurb: 'Batteries, regulators and the little capacitors that keep chips happy.' },
  { n: 6, title: 'From idea to circuit board', blurb: 'Schematic, footprints, layers and checks: designing a real board.' },
  { n: 7, title: 'Make it real', blurb: 'How boards are made and assembled, and how to switch one on safely.' },
];
