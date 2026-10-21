import { h, uid } from './dom';

// Builder for the HTML control panel under each 3D scene. Every control is a
// native element with a label, so everything works by keyboard and screen reader.

export interface SliderOpts {
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  /** Logarithmic scale (for resistances, capacitances). */
  log?: boolean;
  format: (v: number) => string;
  onInput: (v: number) => void;
  /** Snap the value after mapping (e.g. round to 3 significant figures). */
  snap?: (v: number) => number;
  /** Show −/+ buttons for fine steps. */
  nudge?: boolean;
}

export interface Slider {
  el: HTMLElement;
  get(): number;
  set(v: number, fire?: boolean): void;
  disable(d: boolean): void;
}

export interface Readout {
  el: HTMLElement;
  set(text: string, state?: 'good' | 'bad' | 'warn' | ''): void;
}

const LOG_STEPS = 1000;

export class Panel {
  el: HTMLElement;
  private readoutGrid: HTMLElement | null = null;

  constructor(host: HTMLElement) {
    this.el = h('div', { class: 'panel', role: 'group', 'aria-label': 'Scene controls' });
    host.append(this.el);
  }

  slider(o: SliderOpts, parent: HTMLElement = this.el): Slider {
    const id = uid('s');
    const out = h('output', { for: id });
    const range = h('input', { type: 'range', id, 'aria-label': o.label }) as HTMLInputElement;
    let value = o.value;
    const toPos = (v: number) =>
      o.log ? (Math.log(v / o.min) / Math.log(o.max / o.min)) * LOG_STEPS : v;
    const fromPos = (p: number) => {
      const v = o.log ? o.min * Math.pow(o.max / o.min, p / LOG_STEPS) : p;
      return o.snap ? o.snap(v) : v;
    };
    if (o.log) {
      range.min = '0';
      range.max = String(LOG_STEPS);
      range.step = '1';
    } else {
      range.min = String(o.min);
      range.max = String(o.max);
      range.step = String(o.step ?? (o.max - o.min) / 100);
    }
    const show = () => {
      out.textContent = o.format(value);
      range.setAttribute('aria-valuetext', o.format(value));
    };
    const set = (v: number, fire = false) => {
      value = Math.min(o.max, Math.max(o.min, v));
      range.value = String(toPos(value));
      show();
      if (fire) o.onInput(value);
    };
    range.addEventListener('input', () => {
      value = fromPos(Number(range.value));
      show();
      o.onInput(value);
    });
    const nudge = (dir: number) => {
      if (o.log) {
        const p = Math.round(toPos(value)) + dir;
        set(fromPos(Math.min(LOG_STEPS, Math.max(0, p))), true);
      } else {
        const st = o.step ?? (o.max - o.min) / 100;
        set(Math.round((value + dir * st) / st) * st, true);
      }
    };
    const row = h(
      'div',
      { class: 'row' },
      o.nudge ? h('button', { class: 'btn small', type: 'button', 'aria-label': `Decrease ${o.label}`, onclick: () => nudge(-1) }, '−') : null,
      range,
      o.nudge ? h('button', { class: 'btn small', type: 'button', 'aria-label': `Increase ${o.label}`, onclick: () => nudge(1) }, '+') : null,
    );
    const el = h('div', { class: 'ctl' }, h('label', { for: id }, h('span', null, o.label), out), row);
    parent.append(el);
    set(o.value);
    return {
      el,
      get: () => value,
      set,
      disable: (d) => {
        range.disabled = d;
      },
    };
  }

  toggle(label: string, value: boolean, onChange: (v: boolean) => void, parent: HTMLElement = this.el) {
    const btn = h('button', { class: 'btn', type: 'button', 'aria-pressed': String(value) }, label);
    let v = value;
    btn.addEventListener('click', () => {
      v = !v;
      btn.setAttribute('aria-pressed', String(v));
      onChange(v);
    });
    parent.append(btn);
    return {
      el: btn,
      get: () => v,
      set: (nv: boolean, fire = false) => {
        v = nv;
        btn.setAttribute('aria-pressed', String(v));
        if (fire) onChange(v);
      },
    };
  }

  segmented<T extends string>(
    label: string,
    options: { value: T; label: string }[],
    value: T,
    onChange: (v: T) => void,
    parent: HTMLElement = this.el,
  ) {
    const wrap = h('div', { class: 'ctl' });
    const lab = h('span', { class: 'lab' }, label);
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': label });
    let cur = value;
    const btns = options.map((op) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(op.value === value) }, op.label);
      b.addEventListener('click', () => set(op.value, true));
      seg.append(b);
      return b;
    });
    const set = (v: T, fire = false) => {
      cur = v;
      options.forEach((op, i) => btns[i].setAttribute('aria-pressed', String(op.value === v)));
      if (fire) onChange(v);
    };
    wrap.append(lab, seg);
    parent.append(wrap);
    return { el: wrap, get: () => cur, set };
  }

  select<T extends string>(
    label: string,
    options: { value: T; label: string }[],
    value: T,
    onChange: (v: T) => void,
    parent: HTMLElement = this.el,
  ) {
    const id = uid('sel');
    const sel = h('select', { id }) as HTMLSelectElement;
    for (const op of options) sel.append(h('option', { value: op.value }, op.label));
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value as T));
    const el = h('div', { class: 'ctl' }, h('label', { for: id }, label), sel);
    parent.append(el);
    return {
      el,
      get: () => sel.value as T,
      set: (v: T) => {
        sel.value = v;
      },
      setOptions: (opts: { value: T; label: string }[]) => {
        const cur = sel.value;
        sel.innerHTML = '';
        for (const op of opts) sel.append(h('option', { value: op.value }, op.label));
        if (opts.some((o) => o.value === cur)) sel.value = cur;
      },
    };
  }

  button(label: string, onClick: () => void, cls = 'btn', parent: HTMLElement = this.el) {
    const b = h('button', { class: cls, type: 'button' }, label);
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  }

  row(parent: HTMLElement = this.el): HTMLElement {
    const r = h('div', { class: 'btnrow' });
    parent.append(r);
    return r;
  }

  readout(label: string, initial = '—'): Readout {
    if (!this.readoutGrid) {
      this.readoutGrid = h('div', { class: 'readouts', 'aria-live': 'polite' });
      this.el.append(this.readoutGrid);
    }
    const v = h('div', { class: 'v' }, initial);
    const el = h('div', { class: 'readout' }, h('div', { class: 'k' }, label), v);
    this.readoutGrid.append(el);
    return {
      el,
      set: (text, state = '') => {
        if (v.textContent !== text) v.textContent = text;
        el.className = `readout ${state}`;
      },
    };
  }

  /** Live formula line. set() takes HTML (values are inserted by the scene). */
  formula(title = 'Live formula') {
    const body = h('div');
    const el = h('div', { class: 'formula', 'aria-live': 'polite' }, h('span', { class: 'lbl-f' }, title), body);
    this.el.append(el);
    return {
      el,
      set: (html: string) => {
        if (body.innerHTML !== html) body.innerHTML = html;
      },
    };
  }

  note(text: string, cls = 'note') {
    const el = h('p', { class: cls, style: { margin: '0' } }, text);
    this.el.append(el);
    return {
      el,
      set: (t: string, c = cls) => {
        el.textContent = t;
        el.className = c;
      },
    };
  }

  /** A horizontal bar, 0..1, coloured by the caller. */
  bar(label: string) {
    const fill = h('div');
    const text = h('output');
    const bar = h('div', { class: 'gauge-bar', role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
    const el = h('div', { class: 'ctl' }, h('span', { class: 'lab' }, h('span', null, label), text), bar);
    this.el.append(el);
    return {
      el,
      set: (frac: number, color: string, txt: string) => {
        fill.style.width = `${Math.min(100, Math.max(0, frac * 100))}%`;
        fill.style.background = color;
        text.textContent = txt;
        bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
        bar.setAttribute('aria-valuetext', txt);
      },
    };
  }

  /** A small canvas for live charts. */
  chart(label: string, height = 140) {
    const c = h('canvas', { class: 'chart', role: 'img', 'aria-label': label }) as HTMLCanvasElement;
    c.style.height = `${height}px`;
    this.el.append(c);
    return c;
  }

  custom(el: HTMLElement) {
    this.el.append(el);
    return el;
  }
}

/** Read a CSS custom property (for drawing charts in theme colours). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** Prepare a canvas for crisp drawing at device pixel ratio; returns ctx and size. */
export function prepCanvas(c: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth || 300;
  const hh = c.clientHeight || 140;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hh * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hh);
  return { ctx, w, h: hh };
}
