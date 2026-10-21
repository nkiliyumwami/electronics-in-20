import { h } from '../core/dom';

// Placeholder until the capstone is built (Module 7 step).
export async function capstonePage(main: HTMLElement): Promise<() => void> {
  main.append(h('h1', null, 'Capstone'), h('p', null, 'Coming soon.'));
  return () => {};
}
