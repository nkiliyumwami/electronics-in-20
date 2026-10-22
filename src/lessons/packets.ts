import * as THREE from 'three';
import type { Stage } from '../three/stage';
import { std } from '../three/lib';

/** Little labelled blocks of data travelling along a wire (bus lessons). */
export class Packets {
  private list: { curve: THREE.Curve<THREE.Vector3>; t: number; dur: number; obj: THREE.Mesh; label: ReturnType<Stage['label']>; done: () => void }[] = [];
  private geo = new THREE.BoxGeometry(0.26, 0.16, 0.16);
  constructor(private stage: Stage, private parent: THREE.Object3D) {}

  /** Send a packet along a polyline; resolves when it arrives. */
  send(points: THREE.Vector3[], color: string, text: string, dur = 1.4): Promise<void> {
    return new Promise((done) => {
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
      const obj = new THREE.Mesh(this.geo, std(color, 0.3, 0, { emissive: new THREE.Color(color), emissiveIntensity: 1.2 }));
      obj.userData.noFrame = true;
      this.parent.add(obj);
      const label = this.stage.label(text, obj, new THREE.Vector3(0, 0.4, 0));
      this.list.push({ curve, t: 0, dur, obj, label, done });
      this.place(this.list[this.list.length - 1]);
    });
  }

  get busy() {
    return this.list.length > 0;
  }

  clear() {
    for (const p of this.list) {
      this.stage.unlabel(p.label);
      p.obj.removeFromParent();
    }
    this.list = [];
  }

  private place(p: (typeof this.list)[number]) {
    p.obj.position.copy(p.curve.getPointAt(Math.min(1, p.t)));
  }

  update(dt: number) {
    for (const p of [...this.list]) {
      p.t += dt / p.dur;
      this.place(p);
      if (p.t >= 1) {
        this.stage.unlabel(p.label);
        p.obj.removeFromParent();
        (p.obj.material as THREE.Material).dispose();
        this.list = this.list.filter((x) => x !== p);
        p.done();
      }
    }
  }
}
