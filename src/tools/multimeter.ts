import * as THREE from 'three';
import type { Elem, Solution } from '../sim/solver';
import { fmt } from '../sim/physics';
import type { Stage } from '../three/stage';
import { M, mesh, std } from '../three/lib';
import type { Panel } from '../core/panel';
import { h } from '../core/dom';

export type MeterMode = 'V' | 'A' | 'OHM' | 'BEEP';

export interface ProbePoint {
  id: string;
  label: string;
  /** Circuit node this point touches. Changes are allowed (e.g. after breaking a wire). */
  node: string;
  /** Position in the meter's parent space. */
  pos: THREE.Vector3;
}

const MODE_LABEL: Record<MeterMode, string> = { V: 'Volts (V)', A: 'Amps (A)', OHM: 'Ohms (Ω)', BEEP: 'Continuity ♪' };
const SHUNT = 0.5; // Ω, meter resistance in current mode
const FUSE_A = 0.4; // A
const R_VOLT = 10e6; // Ω, meter input resistance in voltage mode

/**
 * A multimeter usable in any scene. The scene owns the circuit solve:
 *   const sol = new Circuit([...myElems, ...meter.elements()]).dc();
 *   meter.read(sol, powered);
 */
export class Multimeter {
  readonly group = new THREE.Group();
  mode: MeterMode;
  red: string | null = null;
  black: string | null = null;
  fuseBlown = false;
  /** Last reading in base units (V, A or Ω); NaN = no reading. */
  value = NaN;
  text = '- - -';
  beeping = false;
  onFuseBlown: (() => void) | null = null;
  onChange: (() => void) | null = null;

  private stage: Stage;
  private parent: THREE.Object3D;
  private points: ProbePoint[];
  private modes: MeterMode[];
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private dial = new THREE.Group();
  private probes: { which: 'red' | 'black'; g: THREE.Group; cable: THREE.Mesh; park: THREE.Vector3; jack: THREE.Vector3 }[] = [];
  private markers = new Map<string, THREE.Mesh>();
  private selRed: HTMLSelectElement | null = null;
  private selBlack: HTMLSelectElement | null = null;
  private modeBtns: HTMLButtonElement[] = [];
  private audio: AudioContext | null = null;
  private beepTimer = 0;
  private probeY = 0.05;

  constructor(
    stage: Stage,
    parent: THREE.Object3D,
    points: ProbePoint[],
    opts: { modes?: MeterMode[]; mode?: MeterMode; at?: THREE.Vector3; rotY?: number; probeY?: number; scale?: number } = {},
  ) {
    this.stage = stage;
    this.parent = parent;
    this.points = points;
    this.modes = opts.modes ?? ['V', 'A', 'OHM'];
    this.mode = opts.mode ?? this.modes[0];
    this.probeY = opts.probeY ?? 0.05;
    this.canvas.width = 256;
    this.canvas.height = 112;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.buildBody();
    this.group.position.copy(opts.at ?? new THREE.Vector3(0, 0, 3));
    this.group.rotation.y = opts.rotY ?? 0;
    this.group.scale.setScalar(opts.scale ?? 1);
    parent.add(this.group);
    this.buildProbes();
    this.buildMarkers();
    this.draw();
    stage.part(this.group, {
      name: 'Multimeter',
      job: 'Measures voltage across two points, current flowing through it, or resistance of an unpowered part.',
      symbol: 'multimeter',
    });
  }

  // ---------------------------------------------------------------- model
  private buildBody() {
    const g = new THREE.Group();
    g.rotation.x = -0.35;
    g.position.y = 0.35;
    const bumper = mesh(new THREE.BoxGeometry(1.25, 0.28, 2.1), std('#f2b51f', 0.6), [0, 0, 0]);
    const face = mesh(new THREE.BoxGeometry(1.05, 0.06, 1.9), std('#2c2f33', 0.5), [0, 0.15, 0]);
    const lcd = mesh(new THREE.PlaneGeometry(0.9, 0.42), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }), [0, 0.185, -0.6], [-Math.PI / 2, 0, 0]);
    const dialBase = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 32), std('#45494e', 0.5), [0, 0.19, 0.1]);
    this.dial.position.set(0, 0.23, 0.1);
    this.dial.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24), std('#1d1f21', 0.4)));
    this.dial.add(mesh(new THREE.BoxGeometry(0.05, 0.03, 0.22), std('#ffffff', 0.4), [0, 0.05, -0.1]));
    g.add(bumper, face, lcd, dialBase, this.dial);
    // Jacks: black COM (left), red (right).
    const jackBlack = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), std('#111', 0.4), [-0.25, 0.19, 0.7]);
    const jackRed = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), std('#b3221a', 0.4), [0.25, 0.19, 0.7]);
    g.add(jackBlack, jackRed);
    this.group.add(g);
    this.bodyGroup = g;
  }
  private bodyGroup!: THREE.Group;

  private buildProbes() {
    this.group.updateMatrix();
    for (const which of ['black', 'red'] as const) {
      const g = new THREE.Group();
      const color = which === 'red' ? '#c62b22' : '#1c1d1f';
      // Probe lies roughly flat, tip pointing down/forward to the touched point.
      const handle = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 16), std(color, 0.45), [0, 0.62, 0.32], [-0.6, 0, 0]);
      const guard = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), std(color, 0.45), [0, 0.32, 0.12], [-0.6, 0, 0]);
      const tip = mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.36, 8), M.steel(), [0, 0.13, 0.03], [-0.6, 0, 0]);
      // Generous invisible grab volume for touch.
      const grab = mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), [0, 0.45, 0.2]);
      g.add(handle, guard, tip, grab);
      const jackLocal = new THREE.Vector3(which === 'red' ? 0.25 : -0.25, 0.19, 0.7);
      const park = new THREE.Vector3(which === 'red' ? 0.9 : -0.9, 0, 0.9).applyMatrix4(this.group.matrix);
      const cable = new THREE.Mesh(new THREE.BufferGeometry(), std(color, 0.6));
      this.parent.add(g, cable);
      const p = { which, g, cable, park, jack: jackLocal };
      this.probes.push(p);
      this.stage.part(g, {
        name: which === 'red' ? 'Red probe (+)' : 'Black probe (COM, −)',
        job: which === 'red'
          ? 'Drag it onto a test point. The meter shows the red point compared with the black one.'
          : 'Drag it onto a test point. This is the reference side of the measurement.',
        symbol: 'probe',
      });
      this.stage.draggable(g, {
        plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.parentWorldY() + this.probeY)),
        onMove: (wp) => {
          const lp = this.parent.worldToLocal(wp.clone());
          g.position.set(lp.x, this.probeY, lp.z);
          this.updateCable(p);
          this.highlightNear(lp);
        },
        onEnd: (wp) => {
          const lp = this.parent.worldToLocal(wp.clone());
          const near = this.nearest(lp);
          this.setProbe(which, near ? near.id : null);
          this.highlightNear(null);
        },
      });
    }
    this.layoutProbes();
  }

  private parentWorldY() {
    return this.parent.getWorldPosition(new THREE.Vector3()).y;
  }

  private buildMarkers() {
    const geo = new THREE.TorusGeometry(0.13, 0.025, 8, 24);
    for (const p of this.points) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthTest: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(p.pos).setY(p.pos.y + 0.03);
      m.renderOrder = 5;
      this.parent.add(m);
      this.markers.set(p.id, m);
    }
  }

  private highlightNear(lp: THREE.Vector3 | null) {
    const near = lp ? this.nearest(lp) : null;
    for (const [id, m] of this.markers) {
      const mm = m.material as THREE.MeshBasicMaterial;
      mm.opacity = lp ? (near?.id === id ? 1 : 0.55) : 0;
      mm.color.set(near?.id === id ? '#ffb000' : '#ffffff');
    }
  }

  private nearest(lp: THREE.Vector3): ProbePoint | null {
    let best: ProbePoint | null = null;
    let bd = 0.55;
    for (const p of this.points) {
      const d = Math.hypot(p.pos.x - lp.x, p.pos.z - lp.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private layoutProbes() {
    for (const p of this.probes) {
      const id = p.which === 'red' ? this.red : this.black;
      const pt = this.points.find((x) => x.id === id);
      if (pt) {
        p.g.position.set(pt.pos.x + (p.which === 'red' ? 0.05 : -0.05), pt.pos.y + this.probeY, pt.pos.z);
      } else {
        p.g.position.copy(p.park);
      }
      this.updateCable(p);
    }
  }

  private updateCable(p: (typeof this.probes)[number]) {
    this.group.updateMatrixWorld(true);
    const jw = this.bodyGroup.localToWorld(p.jack.clone());
    const start = this.parent.worldToLocal(jw);
    const end = p.g.position.clone().add(new THREE.Vector3(0, 0.95, 0.6));
    const mid = start.clone().lerp(end, 0.5);
    mid.y = Math.min(start.y, end.y) - 0.1;
    const curve = new THREE.CatmullRomCurve3([start, start.clone().add(new THREE.Vector3(0, 0.1, 0.25)), mid, end]);
    p.cable.geometry.dispose();
    p.cable.geometry = new THREE.TubeGeometry(curve, 40, 0.025, 6, false);
  }

  // ------------------------------------------------------------ behaviour
  setProbe(which: 'red' | 'black', pointId: string | null) {
    if (which === 'red') this.red = pointId;
    else this.black = pointId;
    if (this.selRed) this.selRed.value = this.red ?? '';
    if (this.selBlack) this.selBlack.value = this.black ?? '';
    this.layoutProbes();
    this.onChange?.();
  }

  setMode(m: MeterMode) {
    this.mode = m;
    const idx = (['V', 'A', 'OHM', 'BEEP'] as MeterMode[]).indexOf(m);
    this.dial.rotation.y = -idx * 0.7 + 0.9;
    this.modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    this.onChange?.();
  }

  setPoints(points: ProbePoint[]) {
    this.points = points;
  }

  /** Node of a placed probe, or null. */
  nodeOf(which: 'red' | 'black'): string | null {
    const id = which === 'red' ? this.red : this.black;
    return this.points.find((p) => p.id === id)?.node ?? null;
  }

  /** Elements the meter adds to the circuit (include them in your solve). */
  elements(): Elem[] {
    const a = this.nodeOf('red');
    const b = this.nodeOf('black');
    if (!a || !b || a === b) return [];
    if (this.mode === 'V') return [{ kind: 'R', id: '__meter', a, b, r: R_VOLT }];
    if (this.mode === 'A') return this.fuseBlown ? [] : [{ kind: 'R', id: '__meter', a, b, r: SHUNT }];
    return [{ kind: 'I', id: '__meter', p: a, n: b, i: 1e-3 }];
  }

  /**
   * Update the reading from a solution that included elements().
   * `powered`: whether the circuit has live sources (Ω/continuity need it off).
   */
  read(sol: Solution, powered: boolean) {
    const a = this.nodeOf('red');
    const b = this.nodeOf('black');
    let value = NaN;
    let text = '- - -';
    let beep = false;
    if (a && b) {
      if (this.mode === 'V') {
        value = a === b ? 0 : sol.vab(a, b);
        text = `${value.toFixed(Math.abs(value) < 10 ? 2 : 1)} V`;
      } else if (this.mode === 'A') {
        if (this.fuseBlown) {
          value = 0;
          text = 'FUSE';
        } else {
          value = a === b ? 0 : sol.i('__meter');
          if (Math.abs(value) > FUSE_A) {
            this.fuseBlown = true;
            this.onFuseBlown?.();
            value = 0;
            text = 'FUSE';
          } else {
            text = Math.abs(value) < 1 ? `${(value * 1000).toFixed(1)} mA` : `${value.toFixed(2)} A`;
          }
        }
      } else {
        if (powered) {
          text = 'Err';
          value = NaN;
        } else {
          const r = a === b ? 0 : sol.vab(a, b) / 1e-3;
          if (r > 20e6) {
            text = 'OL';
            value = Infinity;
          } else {
            value = r;
            text = r < 1 ? `${r.toFixed(2)} Ω` : fmt(r, 'Ω');
          }
          beep = this.mode === 'BEEP' && r < 30;
        }
      }
    }
    if (text !== this.text || beep !== this.beeping) {
      this.text = text;
      this.value = value;
      if (beep && !this.beeping) this.beep();
      this.beeping = beep;
      this.draw();
      this.syncLive();
    } else {
      this.value = value;
    }
  }

  replaceFuse() {
    this.fuseBlown = false;
    this.onChange?.();
  }

  private beep() {
    const now = performance.now();
    if (now - this.beepTimer < 300) return;
    this.beepTimer = now;
    try {
      this.audio ??= new AudioContext();
      const o = this.audio.createOscillator();
      const g = this.audio.createGain();
      o.frequency.value = 2400;
      g.gain.value = 0.04;
      o.connect(g).connect(this.audio.destination);
      o.start();
      o.stop(this.audio.currentTime + 0.18);
    } catch {
      /* audio not available: the display still shows ♪ */
    }
  }

  private draw() {
    const g = this.canvas.getContext('2d')!;
    g.fillStyle = '#b8c7a4';
    g.fillRect(0, 0, 256, 112);
    g.fillStyle = '#1b2414';
    g.font = 'bold 50px ui-monospace, Consolas, monospace';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText(this.text, 244, 64);
    g.font = 'bold 20px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(this.mode === 'OHM' ? 'Ω' : this.mode === 'BEEP' ? '♪ CONT' : this.mode === 'A' ? 'A  DC' : 'V  DC', 12, 20);
    if (this.beeping) {
      g.fillText('BEEP', 180, 20);
    }
    this.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------ controls
  private live: HTMLElement | null = null;
  private syncLive() {
    if (this.live) this.live.textContent = `Meter: ${this.text}${this.beeping ? ' (beep)' : ''}`;
  }

  /** Keyboard-accessible controls: mode, red/black probe point, fuse. */
  controls(panel: Panel) {
    const wrap = h('div', { class: 'ctl' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Meter mode' });
    for (const m of this.modes) {
      const b = h('button', { type: 'button', 'data-mode': m, 'aria-pressed': String(m === this.mode) }, MODE_LABEL[m]) as HTMLButtonElement;
      b.addEventListener('click', () => this.setMode(m));
      this.modeBtns.push(b);
      seg.append(b);
    }
    wrap.append(h('span', { class: 'lab' }, 'Meter dial'), seg);
    panel.custom(wrap);
    const mk = (which: 'red' | 'black') => {
      const sel = h('select', { 'aria-label': `${which} probe position` }) as HTMLSelectElement;
      sel.append(h('option', { value: '' }, 'Not touching'));
      for (const p of this.points) sel.append(h('option', { value: p.id }, p.label));
      sel.addEventListener('change', () => this.setProbe(which, sel.value || null));
      return sel;
    };
    this.selRed = mk('red');
    this.selBlack = mk('black');
    const row = h(
      'div',
      { class: 'btnrow' },
      h('label', { class: 'ctl' }, h('span', { class: 'lab', style: { color: '#c62b22' } }, 'Red probe'), this.selRed),
      h('label', { class: 'ctl' }, h('span', { class: 'lab' }, 'Black probe'), this.selBlack),
    );
    panel.custom(row);
    this.live = h('p', { class: 'note', 'aria-live': 'polite', style: { margin: 0 } }, 'Meter: - - -');
    panel.custom(this.live);
    this.setMode(this.mode);
  }

  refreshPointOptions() {
    for (const sel of [this.selRed, this.selBlack]) {
      if (!sel) continue;
      const v = sel.value;
      sel.innerHTML = '';
      sel.append(h('option', { value: '' }, 'Not touching'));
      for (const p of this.points) sel.append(h('option', { value: p.id }, p.label));
      sel.value = v;
    }
  }
}
