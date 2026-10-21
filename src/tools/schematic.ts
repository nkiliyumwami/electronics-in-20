import { h } from '../core/dom';

// A small 2D schematic editor: tap a pin, then another, to draw a wire.
// Connected pins form nets; the live netlist is compared with the goal nets.

export type SchSym = 'battery' | 'resistor' | 'led' | 'mosfet' | 'button' | 'capacitor' | 'chip' | 'connector';
export interface SchPin { id: string; x: number; y: number; label?: string }
export interface SchPart { ref: string; sym: SchSym; x: number; y: number; vertical?: boolean; value: string; pins: SchPin[]; chipPins?: { left: string[]; right: string[] } }

export const NET_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0ca678', '#e03131', '#5c7cfa'];

export class SchematicEditor {
  readonly el: HTMLElement;
  wires: [string, string][] = [];
  onChange: (() => void) | null = null;
  private svg: SVGSVGElement;
  private parts: SchPart[];
  private pins = new Map<string, SchPin & { part: SchPart }>();
  private goal: Record<string, string[]>;
  private selected: string | null = null;
  private netlistEl: HTMLElement;
  private wiresEl: HTMLElement;
  private width: number;
  private height: number;

  constructor(parts: SchPart[], goal: Record<string, string[]>, opts: { width?: number; height?: number } = {}) {
    this.parts = parts;
    this.goal = goal;
    this.width = opts.width ?? 640;
    this.height = opts.height ?? 330;
    for (const p of parts) for (const pin of p.pins) this.pins.set(pin.id, { ...pin, part: p });
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('class', 'schem');
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-label', 'Schematic editor. Tap a pin, then another pin, to connect them.');
    this.netlistEl = h('div', { class: 'note', 'aria-live': 'polite' });
    this.wiresEl = h('div', { class: 'btnrow' });
    this.el = h('div', { class: 'ctl' });
    this.el.append(this.svg);
    this.render();
  }

  /** Keyboard alternative: From/To pin pickers. */
  controls(): HTMLElement {
    const opt = () => [...this.pins.values()].map((p) => h('option', { value: p.id }, `${p.id}${p.label ? ` (${p.label})` : ''}`));
    const from = h('select', { 'aria-label': 'Connect from pin' }, opt()) as HTMLSelectElement;
    const to = h('select', { 'aria-label': 'Connect to pin' }, opt()) as HTMLSelectElement;
    to.selectedIndex = 1;
    const add = h('button', { class: 'btn', type: 'button' }, 'Connect');
    add.addEventListener('click', () => this.connect(from.value, to.value));
    return h(
      'div',
      { class: 'ctl' },
      h('span', { class: 'lab' }, 'Connect two pins (keyboard)'),
      h('div', { class: 'btnrow' }, h('label', null, 'From ', from), h('label', null, 'To ', to), add),
      h('span', { class: 'lab' }, 'Wires (tap to remove)'),
      this.wiresEl,
      h('span', { class: 'lab' }, 'Netlist'),
      this.netlistEl,
    );
  }

  connect(a: string, b: string) {
    if (a === b || !this.pins.has(a) || !this.pins.has(b)) return;
    if (this.wires.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
    this.wires.push([a, b]);
    this.render();
    this.onChange?.();
  }

  removeWire(i: number) {
    this.wires.splice(i, 1);
    this.render();
    this.onChange?.();
  }

  /** Groups of connected pins (only groups with 2+ pins). */
  nets(): string[][] {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      const p = parent.get(x) ?? x;
      if (p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    for (const [a, b] of this.wires) parent.set(find(a), find(b));
    const groups = new Map<string, string[]>();
    for (const id of this.pins.keys()) {
      const r = find(id);
      (groups.get(r) ?? groups.set(r, []).get(r)!).push(id);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }

  /** Name for a group: the goal net it matches or overlaps, else "?". */
  nameOf(group: string[]): string {
    const set = new Set(group);
    for (const [name, pins] of Object.entries(this.goal)) if (pins.length === group.length && pins.every((p) => set.has(p))) return name;
    const overlaps = Object.entries(this.goal).filter(([, pins]) => pins.some((p) => set.has(p)));
    if (overlaps.length > 1) return `SHORT: ${overlaps.map(([n]) => n).join(' + ')}`;
    if (overlaps.length === 1) return `${overlaps[0][0]} (incomplete)`;
    return '?';
  }

  /** Goal status: which nets are complete, and any shorts. */
  status() {
    const nets = this.nets();
    const complete = Object.keys(this.goal).filter((name) => nets.some((g) => this.nameOf(g) === name));
    const shorts = nets.filter((g) => this.nameOf(g).startsWith('SHORT'));
    return { complete, shorts, total: Object.keys(this.goal).length, ok: complete.length === Object.keys(this.goal).length && shorts.length === 0 };
  }

  colorOf(group: string[]): string {
    const name = this.nameOf(group).split(' ')[0];
    const i = Object.keys(this.goal).indexOf(name);
    return i >= 0 ? NET_COLORS[i % NET_COLORS.length] : '#868e96';
  }

  private render() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = this.svg;
    svg.innerHTML = '';
    const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.append(e);
      return e;
    };
    // Wires first (under symbols), coloured by net.
    const nets = this.nets();
    const netOf = new Map<string, string[]>();
    for (const g of nets) for (const p of g) netOf.set(p, g);
    for (const [a, b] of this.wires) {
      const A = this.pins.get(a)!;
      const B = this.pins.get(b)!;
      const color = this.colorOf(netOf.get(a)!);
      el('path', { d: `M${A.x} ${A.y} H${B.x} V${B.y}`, fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round' });
      el('circle', { cx: B.x, cy: A.y, r: 0 });
    }
    for (const p of this.parts) this.drawPart(p, el);
    // Pins on top.
    for (const pin of this.pins.values()) {
      const g = el('g', { class: 'pin', tabindex: 0, role: 'button', 'aria-label': `Pin ${pin.id}${pin.label ? ' ' + pin.label : ''}${this.selected === pin.id ? ', selected' : ''}` });
      const inNet = netOf.get(pin.id);
      el('circle', { cx: pin.x, cy: pin.y, r: 12, fill: 'transparent' }, g);
      el('circle', { cx: pin.x, cy: pin.y, r: this.selected === pin.id ? 7 : 5, fill: inNet ? this.colorOf(inNet) : 'var(--surface)', stroke: this.selected === pin.id ? 'var(--flow)' : 'currentColor', 'stroke-width': this.selected === pin.id ? 3 : 1.5 }, g);
      const act = () => this.tap(pin.id);
      g.addEventListener('click', act);
      g.addEventListener('keydown', (e) => {
        const k = (e as KeyboardEvent).key;
        if (k === 'Enter' || k === ' ') {
          e.preventDefault();
          act();
        }
      });
    }
    // Wire list + netlist.
    this.wiresEl.innerHTML = '';
    if (!this.wires.length) this.wiresEl.append(h('span', { class: 'note' }, 'No wires yet.'));
    this.wires.forEach(([a, b], i) => this.wiresEl.append(h('button', { class: 'btn small', type: 'button', onclick: () => this.removeWire(i), 'aria-label': `Remove wire ${a} to ${b}` }, `✕ ${a}–${b}`)));
    this.netlistEl.innerHTML = '';
    const st = this.status();
    const goalList = h('ul', { style: { margin: '0 0 6px', paddingLeft: '1.1em' } });
    for (const [name, pins] of Object.entries(this.goal)) {
      const done = st.complete.includes(name);
      goalList.append(h('li', null, done ? '✓ ' : '○ ', h('strong', { style: { color: NET_COLORS[Object.keys(this.goal).indexOf(name) % NET_COLORS.length] } }, name), `: ${pins.join(', ')}`));
    }
    this.netlistEl.append(h('div', null, h('strong', null, `Goal nets (${st.complete.length}/${st.total} complete)`)), goalList);
    if (nets.length) {
      const cur = h('ul', { style: { margin: 0, paddingLeft: '1.1em' } });
      for (const g of nets) cur.append(h('li', null, h('strong', { style: { color: this.colorOf(g) } }, this.nameOf(g)), `: ${g.join(', ')}`));
      this.netlistEl.append(h('div', null, h('strong', null, 'Your netlist')), cur);
    }
  }

  private tap(id: string) {
    if (this.selected && this.selected !== id) {
      const a = this.selected;
      this.selected = null;
      this.connect(a, id);
    } else {
      this.selected = this.selected === id ? null : id;
      this.render();
    }
  }

  private drawPart(p: SchPart, el: (tag: string, a: Record<string, string | number>, parent?: Element) => Element) {
    const g = el('g', { transform: `translate(${p.x} ${p.y})${p.vertical ? ' rotate(90)' : ''}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const path = (d: string) => el('path', { d }, g);
    switch (p.sym) {
      case 'resistor':
        path('M-40 0H-24l4-8 8 16 8-16 8 16 8-16 4 8H40');
        break;
      case 'capacitor':
        path('M-40 0H-6M6 0H40M-6 -14V14M6 -14V14');
        break;
      case 'led':
        path('M-40 0H-14M14 0H40M-14 -13V13L14 0Z M14 -13V13');
        path('M2 -16l8 -8M8 -12l8 -8');
        break;
      case 'battery':
        path('M-40 0H-8M8 0H40M-8 -18V18M2 -10V10');
        el('text', { x: -24, y: -10, 'font-size': 14, stroke: 'none', fill: 'currentColor' }, g).textContent = '+';
        break;
      case 'button':
        path('M-40 0H-20M20 0H40M-20 -14H20M0 -14V-26M-8 -26H8');
        el('circle', { cx: -20, cy: 0, r: 3 }, g);
        el('circle', { cx: 20, cy: 0, r: 3 }, g);
        break;
      case 'mosfet':
        // Gate on the left (−35, 10), drain top (10, −40), source bottom (10, 40).
        path('M-35 10H-14M-14 -12V24M-8 -16V-6M-8 0V10M-8 16V26M-8 -11H10V-40M-8 21H10V40M-8 5H10V21M-2 5l6 -4M-2 5l6 4');
        break;
      case 'connector':
        path('M-14 -24H14V24H-14Z');
        break;
      case 'chip':
        path('M-40 -50H40V50H-40Z');
        break;
    }
    // Labels (not rotated), placed clear of each symbol's outline.
    let lx = p.vertical ? p.x + 16 : p.x - 22;
    let ly = p.vertical ? p.y - 4 : p.y - 30;
    if (p.sym === 'chip') {
      lx = p.x - 40;
      ly = p.y - 72;
    } else if (p.sym === 'connector') {
      lx = p.x - 14;
      ly = p.y - 46;
    } else if (p.sym === 'mosfet') {
      lx = p.x + 22;
      ly = p.y - 2;
    }
    const t = el('text', { x: lx, y: ly, 'font-size': 13, 'font-weight': 700, stroke: 'none', fill: 'currentColor' });
    t.textContent = p.ref;
    const v = el('text', { x: lx, y: ly + 15, 'font-size': 11, stroke: 'none', fill: 'currentColor', opacity: 0.75 });
    v.textContent = p.value;
    for (const pin of p.pins) {
      if (!pin.label) continue;
      const pl = el('text', { x: pin.x + 7, y: pin.y - 7, 'font-size': 10, stroke: 'none', fill: 'currentColor', opacity: 0.7 });
      pl.textContent = pin.label;
    }
  }
}
