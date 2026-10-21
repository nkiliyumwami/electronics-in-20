import * as THREE from 'three';

/**
 * Glowing charge (or water) particles flowing along a path.
 * Density is constant (fixed spacing); only the speed changes with current.
 */
export class Flow {
  readonly mesh: THREE.InstancedMesh;
  private lut: THREE.Vector3[] = [];
  private length = 1;
  private offset = 0;
  private spacing: number;
  private max: number;
  /** Speed along the path in units per second (negative = reverse). */
  speed = 0;
  private dummy = new THREE.Object3D();
  private closed: boolean;

  constructor(path: THREE.Curve<THREE.Vector3>, opts: { spacing?: number; radius?: number; color?: string; max?: number; closed?: boolean } = {}) {
    this.spacing = opts.spacing ?? 0.3;
    this.max = opts.max ?? 400;
    this.closed = opts.closed ?? true;
    const color = new THREE.Color(opts.color ?? '#ff9a1f');
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(opts.radius ?? 0.045, 10, 8), m, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noFrame = true;
    this.setPath(path);
  }

  setPath(path: THREE.Curve<THREE.Vector3>) {
    this.length = Math.max(0.01, path.getLength());
    const n = Math.max(32, Math.min(2048, Math.round(this.length * 40)));
    this.lut = path.getSpacedPoints(n);
    this.mesh.count = Math.min(this.max, Math.floor(this.length / this.spacing));
    this.place();
  }

  setColor(c: string) {
    const m = this.mesh.material as THREE.MeshStandardMaterial;
    m.color.set(c);
    m.emissive.set(c);
  }

  update(dt: number) {
    this.offset += this.speed * dt;
    if (!this.closed) this.offset = ((this.offset % this.spacing) + this.spacing) % this.spacing;
    this.place();
  }

  private place() {
    const n = this.mesh.count;
    const L = this.length;
    const last = this.lut.length - 1;
    for (let i = 0; i < n; i++) {
      let d = (i * this.spacing + this.offset) % L;
      if (d < 0) d += L;
      const f = (d / L) * last;
      const k = Math.floor(f);
      const t = f - k;
      const a = this.lut[k];
      const b = this.lut[Math.min(last, k + 1)];
      this.dummy.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Map a current (A) to a particle speed with a visible floor and a ceiling. */
export function currentToSpeed(amps: number, ref: number, maxSpeed = 6): number {
  if (Math.abs(amps) < 1e-7) return 0;
  const s = (amps / ref) * 1.0;
  const sign = Math.sign(s);
  const m = Math.min(maxSpeed, Math.max(0.05, Math.abs(s)));
  return sign * m;
}
