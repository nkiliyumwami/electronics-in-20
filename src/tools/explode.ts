import * as THREE from 'three';
import type { Panel, Slider } from '../core/panel';
import type { Stage } from '../three/stage';

export interface ExplodeItem {
  obj: THREE.Object3D;
  /** Offset applied at full explosion (local units). */
  offset: THREE.Vector3;
  /** Optional extra rotation at full explosion. */
  rot?: THREE.Euler;
}

/**
 * Exploded-view controller for any assembly. 0 = assembled, 1 = fully apart.
 * Comes with a slider and an "Explode / Collapse" button.
 */
export class Exploder {
  private items: { obj: THREE.Object3D; base: THREE.Vector3; baseRot: THREE.Euler; offset: THREE.Vector3; rot?: THREE.Euler }[];
  private f = 0;
  private target: number | null = null;
  private slider: Slider | null = null;
  private btn: HTMLButtonElement | null = null;
  onChange: ((f: number) => void) | null = null;

  constructor(stage: Stage, items: ExplodeItem[]) {
    this.items = items.map((i) => ({ obj: i.obj, base: i.obj.position.clone(), baseRot: i.obj.rotation.clone(), offset: i.offset, rot: i.rot }));
    stage.onUpdate((dt) => {
      if (this.target === null) return;
      const d = this.target - this.f;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
      this.set(this.f + step);
      if (Math.abs(this.target - this.f) < 1e-4) this.target = null;
    });
  }

  get value() {
    return this.f;
  }

  set(f: number) {
    this.f = Math.max(0, Math.min(1, f));
    const e = this.f * this.f * (3 - 2 * this.f);
    for (const it of this.items) {
      it.obj.position.copy(it.base).addScaledVector(it.offset, e);
      if (it.rot) it.obj.rotation.set(it.baseRot.x + it.rot.x * e, it.baseRot.y + it.rot.y * e, it.baseRot.z + it.rot.z * e);
    }
    this.slider?.set(this.f);
    if (this.btn) this.btn.textContent = this.f > 0.5 ? 'Collapse' : 'Explode';
    this.onChange?.(this.f);
  }

  animateTo(f: number) {
    this.target = Math.max(0, Math.min(1, f));
  }

  toggle() {
    this.animateTo(this.f > 0.5 ? 0 : 1);
  }

  controls(panel: Panel, label = 'Explode view') {
    this.slider = panel.slider({
      label,
      min: 0,
      max: 1,
      step: 0.01,
      value: this.f,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => {
        this.target = null;
        this.set(v);
      },
    });
    const row = panel.row();
    this.btn = panel.button('Explode', () => this.toggle(), 'btn', row);
    return row;
  }
}
