import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mesh, std, M } from './lib';

/** A bench power supply: rounded case, printed panel, live display, two knobs, output button, binding posts. */
export interface BenchSupply {
  group: THREE.Group;
  /** Red (+) and black (−) binding-post tips, in the group's local space. */
  plus: THREE.Vector3;
  minus: THREE.Vector3;
  /** Update the display and knobs. */
  show(o: { v: number; i: number; cc: boolean; vset: number; vmax: number; ilim: number; on: boolean }): void;
}

export function benchSupply(): BenchSupply {
  const ps = new THREE.Group();
  // Case: rounded metal box with side vents and rubber feet; dark printed front panel.
  ps.add(mesh(new RoundedBoxGeometry(3, 1.6, 2.2, 4, 0.09), std('#d6d8d3', 0.45, 0.35), [0, 0.8, 0]));
  ps.add(mesh(new RoundedBoxGeometry(2.86, 1.46, 0.08, 3, 0.03), std('#2f3237', 0.5), [0, 0.8, 1.09]));
  for (let i = 0; i < 7; i++) for (const x of [-1.505, 1.505]) ps.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 1.2), std('#4a4d52', 0.7), [x, 0.6 + i * 0.12, -0.2]));
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) ps.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), M.rubber(), [x, -0.02, z]));
  const pc = document.createElement('canvas');
  pc.width = 1024;
  pc.height = 520;
  {
    const g = pc.getContext('2d')!;
    const X = (x: number) => (x / 2.86 + 0.5) * 1024;
    const Y = (y: number) => (1 - (y - 0.07) / 1.46) * 520;
    g.fillStyle = '#c9ccd1';
    g.textAlign = 'center';
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText('VOLTAGE', X(-0.6), Y(0.2));
    g.fillText('CURRENT LIMIT', X(0), Y(0.2));
    g.fillText('OUTPUT', X(0.75), Y(0.2));
    g.font = 'bold 38px system-ui, sans-serif';
    g.fillText('+', X(1.32), Y(0.79));
    g.fillText('−', X(1.32), Y(0.44));
  }
  const ptex = new THREE.CanvasTexture(pc);
  ptex.colorSpace = THREE.SRGBColorSpace;
  ptex.anisotropy = 8;
  ps.add(mesh(new THREE.PlaneGeometry(2.86, 1.46), new THREE.MeshStandardMaterial({ map: ptex, transparent: true, roughness: 0.6 }), [0, 0.8, 1.135]));
  // Display bezel and the live display.
  ps.add(mesh(new RoundedBoxGeometry(2.5, 0.85, 0.06, 2, 0.02), std('#111214', 0.35), [0, 1.15, 1.13]));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  ps.add(mesh(new THREE.PlaneGeometry(2.36, 0.72), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [0, 1.15, 1.166]));
  // Knobs with grip ridges and a pointer line; they turn with the settings.
  const knob = (x: number) => {
    const k = new THREE.Group();
    k.position.set(x, 0.48, 1.14);
    k.add(mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.14, 28), std('#1d1e20', 0.4), [0, 0, 0.07], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      k.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 0.12), std('#2b2d30', 0.5), [Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.07], [0, 0, a]));
    }
    k.add(mesh(new THREE.BoxGeometry(0.025, 0.12, 0.01), std('#f4f4f0', 0.3), [0, 0.08, 0.145]));
    ps.add(k);
    return k;
  };
  const knobV = knob(-0.6);
  const knobI = knob(0);
  const btnMat = std('#3a3d42', 0.4, 0, { emissive: new THREE.Color('#2bd16b'), emissiveIntensity: 0 });
  ps.add(mesh(new RoundedBoxGeometry(0.36, 0.22, 0.1, 2, 0.03), btnMat, [0.75, 0.48, 1.16]));
  // Binding posts: coloured collar, threaded post, nut.
  const post = (y: number, color: string) => {
    const g = new THREE.Group();
    g.position.set(1.1, y, 1.13);
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), std(color, 0.4), [0, 0, 0.04], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), M.steel(), [0, 0, 0.16], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 6), std(color, 0.35), [0, 0, 0.2], [Math.PI / 2, 0, 0]));
    ps.add(g);
  };
  post(0.75, '#c0281f');
  post(0.4, '#151515');

  return {
    group: ps,
    plus: new THREE.Vector3(1.1, 0.75, 1.3),
    minus: new THREE.Vector3(1.1, 0.4, 1.3),
    show: ({ v, i, cc, vset, vmax, ilim, on }) => {
      knobV.rotation.z = -(vset / vmax) * 4.5 + 2.25;
      knobI.rotation.z = -(Math.log(ilim / 0.01) / Math.log(300)) * 4.5 + 2.25;
      btnMat.emissiveIntensity = on ? 1.5 : 0;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#0d1410';
      g.fillRect(0, 0, 512, 160);
      g.font = 'bold 64px ui-monospace, Consolas, monospace';
      g.fillStyle = '#ff5a3c';
      g.fillText(`${v.toFixed(2)}V`, 18, 78);
      g.fillStyle = '#ffc93c';
      g.fillText(i < 1 ? `${(i * 1000).toFixed(0)}mA` : `${i.toFixed(2)}A`, 270, 78);
      g.font = 'bold 26px system-ui';
      g.fillStyle = '#7f8c84';
      g.fillText(`set ${vset.toFixed(1)}V`, 22, 130);
      g.fillText(`limit ${ilim < 1 ? (ilim * 1000).toFixed(0) + 'mA' : ilim.toFixed(2) + 'A'}`, 272, 130);
      g.fillStyle = cc ? '#ff3b30' : '#2a3b30';
      g.fillText('CC', 452, 130);
      g.fillStyle = on && !cc ? '#2bd16b' : '#2a3b30';
      g.fillText('CV', 452, 40);
      tex.needsUpdate = true;
    },
  };
}
