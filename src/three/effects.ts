import * as THREE from 'three';
import { glowTexture } from './lib';

interface Puff {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
}

interface Emitter {
  pos: THREE.Vector3;
  t: number;
  dur: number;
  acc: number;
  rate: number;
  dark: boolean;
}

/** Smoke, sparks and flashes. Scenes call these on failures. */
export class Effects {
  readonly group = new THREE.Group();
  private puffs: Puff[] = [];
  private emitters: Emitter[] = [];
  private sparkList: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private flashes: { s: THREE.Sprite; life: number; max: number; size: number }[] = [];
  private sparkGeo = new THREE.SphereGeometry(0.025, 6, 4);
  private sparkMat = new THREE.MeshBasicMaterial({ color: '#ffd36b' });
  private confettiList: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number }[] = [];
  private confettiGeo = new THREE.PlaneGeometry(0.09, 0.05);
  private reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(parent: THREE.Object3D) {
    this.group.userData.noFrame = true;
    parent.add(this.group);
  }

  /** Continuous smoke from a point for `dur` seconds (Infinity = until stop()). */
  smoke(pos: THREE.Vector3, dur = 3, rate = 14, dark = false) {
    const e: Emitter = { pos: pos.clone(), t: 0, dur, acc: 0, rate: this.reduced ? rate / 3 : rate, dark };
    this.emitters.push(e);
    return () => {
      e.dur = 0;
    };
  }

  sparks(pos: THREE.Vector3, count = 40, color = '#ffd36b') {
    const n = this.reduced ? Math.ceil(count / 4) : count;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, color === '#ffd36b' ? this.sparkMat : new THREE.MeshBasicMaterial({ color }));
      m.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5).normalize().multiplyScalar(1.5 + Math.random() * 2.5);
      this.group.add(m);
      this.sparkList.push({ m, v, life: 0.5 + Math.random() * 0.5 });
    }
  }

  flash(pos: THREE.Vector3, color = '#fff2b0', size = 2.5) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(pos);
    this.group.add(s);
    this.flashes.push({ s, life: 0.45, max: 0.45, size });
  }

  /** A happy burst of paper confetti (used when a 3D task is solved). */
  confetti(pos: THREE.Vector3, count = 70) {
    const colors = ['#2f9e44', '#ffb020', '#3d7bd9', '#e8590c', '#f5f4ef', '#d6336c'];
    const n = this.reduced ? 0 : count;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(pos);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (0.6 + Math.random() * 1.6), 2.2 + Math.random() * 2.2, Math.sin(a) * (0.6 + Math.random() * 1.6));
      this.group.add(m);
      this.confettiList.push({ m, v, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0), life: 1.6 + Math.random() * 0.8 });
    }
    this.flash(pos, '#b6f0c8', 3);
  }

  clear() {
    this.emitters = [];
    for (const p of this.puffs) this.group.remove(p.s);
    for (const s of this.sparkList) this.group.remove(s.m);
    for (const f of this.flashes) this.group.remove(f.s);
    for (const c of this.confettiList) this.group.remove(c.m);
    this.confettiList = [];
    this.puffs = [];
    this.sparkList = [];
    this.flashes = [];
  }

  update(dt: number) {
    for (const e of this.emitters) {
      e.t += dt;
      e.acc += dt * e.rate;
      while (e.acc >= 1 && e.t < e.dur) {
        e.acc -= 1;
        if (this.puffs.length > 120) break;
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTexture(), color: e.dark ? '#3d3a37' : '#8b8885', transparent: true, depthWrite: false, opacity: 0.55 }),
        );
        s.position.copy(e.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15));
        s.scale.setScalar(0.25);
        this.group.add(s);
        this.puffs.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.7 + Math.random() * 0.4, (Math.random() - 0.5) * 0.25), life: 0, max: 2 + Math.random(), grow: 0.6 + Math.random() * 0.4 });
      }
    }
    this.emitters = this.emitters.filter((e) => e.t < e.dur);
    this.puffs = this.puffs.filter((p) => {
      p.life += dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(0.25 + p.life * p.grow);
      (p.s.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - p.life / p.max);
      if (p.life >= p.max) {
        this.group.remove(p.s);
        p.s.material.dispose();
        return false;
      }
      return true;
    });
    this.sparkList = this.sparkList.filter((s) => {
      s.life -= dt;
      s.v.y -= 6 * dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.life <= 0) {
        this.group.remove(s.m);
        return false;
      }
      return true;
    });
    this.confettiList = this.confettiList.filter((c) => {
      c.life -= dt;
      c.v.y -= 4.5 * dt;
      c.v.multiplyScalar(1 - 1.6 * dt); // paper flutters: strong air drag
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      (c.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, c.life / 0.5);
      if (c.life <= 0) {
        this.group.remove(c.m);
        (c.m.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    this.flashes = this.flashes.filter((f) => {
      f.life -= dt;
      const k = f.life / f.max;
      f.s.scale.setScalar(f.size * (1.4 - k * 0.4));
      (f.s.material as THREE.SpriteMaterial).opacity = Math.max(0, k);
      if (f.life <= 0) {
        this.group.remove(f.s);
        f.s.material.dispose();
        return false;
      }
      return true;
    });
  }
}
