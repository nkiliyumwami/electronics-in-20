import * as THREE from 'three';
import type { Stage } from '../three/stage';
import { wire, WIRE_COLORS, type WireColor, type WireObj } from '../three/lib';
import type { Panel } from '../core/panel';
import { h } from '../core/dom';

export interface Snap {
  id: string;
  label: string;
  /** Position in the parent's space (top of the hole / pin). */
  pos: THREE.Vector3;
}

export interface PlacedWire {
  id: string;
  a: string;
  b: string;
  color: WireColor;
  obj: WireObj;
}

/**
 * Breadboard-style wiring: drag from one hole/pin to another (or tap one, then
 * the other) to add a jumper wire. Keyboard users pick From/To in the panel.
 */
export class Wiring {
  wires: PlacedWire[] = [];
  color: WireColor = 'yellow';
  onChange: (() => void) | null = null;
  /** Return false to refuse a wire (with a message shown by the caller). */
  canConnect: (a: string, b: string) => boolean = () => true;

  private stage: Stage;
  private parent: THREE.Object3D;
  private snaps: Snap[];
  private markers = new Map<string, THREE.Mesh>();
  private ghost: WireObj | null = null;
  private selected: string | null = null;
  private list: HTMLElement | null = null;
  private n = 0;
  private height: number;

  constructor(stage: Stage, parent: THREE.Object3D, snaps: Snap[], opts: { height?: number } = {}) {
    this.stage = stage;
    this.parent = parent;
    this.snaps = snaps;
    this.height = opts.height ?? 0.6;
    const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 16);
    for (const s of snaps) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffb000', emissiveIntensity: 0, transparent: true, opacity: 0.35 }));
      m.position.copy(s.pos).setY(s.pos.y + 0.03);
      parent.add(m);
      this.markers.set(s.id, m);
      stage.draggable(m, {
        plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(parent.getWorldPosition(new THREE.Vector3()).y + s.pos.y + 0.03)),
        onStart: () => this.highlight(s.id),
        onMove: (wp) => {
          const lp = parent.worldToLocal(wp.clone());
          this.showGhost(s.pos, lp);
        },
        onEnd: (wp) => {
          const lp = parent.worldToLocal(wp.clone());
          this.hideGhost();
          const target = this.nearest(lp);
          if (!target || target.id === s.id) {
            this.tap(s.id);
            return;
          }
          this.selected = null;
          this.highlight(null);
          this.add(s.id, target.id);
        },
      });
    }
  }

  private nearest(lp: THREE.Vector3): Snap | null {
    let best: Snap | null = null;
    let bd = 0.4;
    for (const s of this.snaps) {
      const d = Math.hypot(s.pos.x - lp.x, s.pos.z - lp.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private tap(id: string) {
    if (this.selected && this.selected !== id) {
      const a = this.selected;
      this.selected = null;
      this.highlight(null);
      this.add(a, id);
    } else {
      this.selected = id;
      this.highlight(id);
    }
  }

  private highlight(id: string | null) {
    for (const [sid, m] of this.markers) {
      const mm = m.material as THREE.MeshStandardMaterial;
      mm.emissiveIntensity = sid === id ? 1.2 : 0;
      mm.opacity = sid === id ? 1 : 0.35;
    }
  }

  private arc(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
    const up = this.height;
    return [a.clone(), a.clone().setY(a.y + up), b.clone().setY(b.y + up), b.clone()];
  }

  private showGhost(a: THREE.Vector3, b: THREE.Vector3) {
    const pts = this.arc(a, b.clone().setY(a.y));
    if (!this.ghost) {
      this.ghost = wire(pts, this.color, 0.04, 0.2);
      (this.ghost.mesh.material as THREE.MeshStandardMaterial).transparent = true;
      (this.ghost.mesh.material as THREE.MeshStandardMaterial).opacity = 0.6;
      this.parent.add(this.ghost.mesh);
    } else this.ghost.setPoints(pts);
  }

  private hideGhost() {
    if (this.ghost) {
      this.parent.remove(this.ghost.mesh);
      this.ghost.mesh.geometry.dispose();
      this.ghost = null;
    }
  }

  add(a: string, b: string, color: WireColor = this.color): PlacedWire | null {
    if (a === b) return null;
    if (this.wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return null;
    if (!this.canConnect(a, b)) return null;
    const sa = this.snaps.find((s) => s.id === a)!;
    const sb = this.snaps.find((s) => s.id === b)!;
    const obj = wire(this.arc(sa.pos, sb.pos), color, 0.045, 0.2);
    this.parent.add(obj.mesh);
    const w: PlacedWire = { id: `w${++this.n}`, a, b, color, obj };
    this.wires.push(w);
    this.stage.part(obj.mesh, { name: `Jumper wire (${color})`, job: 'Connects two points so they share the same voltage. Remove it from the wire list below.', symbol: 'wire' });
    this.renderList();
    this.onChange?.();
    return w;
  }

  remove(id: string) {
    const w = this.wires.find((x) => x.id === id);
    if (!w) return;
    this.parent.remove(w.obj.mesh);
    w.obj.mesh.geometry.dispose();
    this.wires = this.wires.filter((x) => x.id !== id);
    this.renderList();
    this.onChange?.();
  }

  clear() {
    for (const w of [...this.wires]) this.remove(w.id);
  }

  /** Pairs of connected snap ids. */
  connections(): [string, string][] {
    return this.wires.map((w) => [w.a, w.b]);
  }

  has(a: string, b: string) {
    return this.wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
  }

  labelOf(id: string) {
    return this.snaps.find((s) => s.id === id)?.label ?? id;
  }

  controls(panel: Panel) {
    const from = h('select', { 'aria-label': 'Wire from' }) as HTMLSelectElement;
    const to = h('select', { 'aria-label': 'Wire to' }) as HTMLSelectElement;
    for (const s of this.snaps) {
      from.append(h('option', { value: s.id }, s.label));
      to.append(h('option', { value: s.id }, s.label));
    }
    if (this.snaps.length > 1) to.selectedIndex = 1;
    const color = h('select', { 'aria-label': 'Wire colour' }) as HTMLSelectElement;
    for (const c of WIRE_COLORS) color.append(h('option', { value: c }, c));
    color.value = this.color;
    color.addEventListener('change', () => (this.color = color.value as WireColor));
    const add = h('button', { class: 'btn', type: 'button' }, 'Add wire');
    add.addEventListener('click', () => this.add(from.value, to.value));
    panel.custom(
      h(
        'div',
        { class: 'ctl' },
        h('span', { class: 'lab' }, 'Add a wire (or drag between two pins in 3D)'),
        h('div', { class: 'btnrow' }, h('label', null, 'From ', from), h('label', null, 'To ', to), h('label', null, 'Colour ', color), add),
      ),
    );
    this.list = h('div', { class: 'btnrow', 'aria-live': 'polite' });
    panel.custom(this.list);
    this.renderList();
  }

  private renderList() {
    if (!this.list) return;
    this.list.innerHTML = '';
    if (!this.wires.length) {
      this.list.append(h('span', { class: 'note' }, 'No extra wires yet.'));
      return;
    }
    for (const w of this.wires) {
      this.list.append(h('button', { class: 'btn small', type: 'button', onclick: () => this.remove(w.id), 'aria-label': `Remove wire from ${this.labelOf(w.a)} to ${this.labelOf(w.b)}` }, `✕ ${this.labelOf(w.a)} → ${this.labelOf(w.b)}`));
    }
  }
}
