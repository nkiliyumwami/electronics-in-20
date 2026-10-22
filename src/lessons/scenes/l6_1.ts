import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { marking, mesh, std, wire, type WireObj } from '../../three/lib';
import { cell18650 } from '../../three/iot';

// 6.1 Powering the ESP32: USB, VIN, 3V3, and an 18650 cell (three ways).
type Source = 'usb' | 'adapter5' | 'bench33' | 'cellVin' | 'cell33' | 'cellLdo';
const SOURCES: { value: Source; label: string }[] = [
  { value: 'usb', label: 'USB cable (5 V)' },
  { value: 'adapter5', label: '5 V adapter → VIN pin' },
  { value: 'bench33', label: '3.3 V regulated supply → 3V3 pin' },
  { value: 'cellVin', label: '18650 cell → VIN pin' },
  { value: 'cell33', label: '18650 cell → 3V3 pin (no regulator)' },
  { value: 'cellLdo', label: '18650 cell → low-dropout 3.3 V module → 3V3' },
];
export const AMS_DROP = 1.1; // the DevKit's AMS1117 needs this much headroom
export const LDO_DROP = 0.2; // a low-dropout 3.3 V module
export const ABS_MAX = 3.6;
export const MIN_OK = 3.0;

/** 3V3 rail voltage for a source and (for the cell) its voltage. */
export function railV(src: Source, vb: number): number {
  switch (src) {
    case 'usb':
    case 'adapter5':
      return Math.min(3.3, 5 - AMS_DROP);
    case 'bench33':
      return 3.3;
    case 'cellVin':
      return Math.max(0, Math.min(3.3, vb - AMS_DROP));
    case 'cell33':
      return vb;
    case 'cellLdo':
      return Math.max(0, Math.min(3.3, vb - LDO_DROP));
  }
}

function box(w: number, hgt: number, d: number, color: string, lines: string[]) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, hgt, d), std(color, 0.6), [0, hgt / 2, 0]));
  const t = marking(w * 0.9, d * 0.6, lines, '#ffffff');
  t.position.y = hgt + 0.005;
  g.add(t);
  return g;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let src: Source = 'usb';
  let vb = 4.0;
  let usbToo = false;
  let damaged = false;

  const b = espBench(ctx);
  const cell = cell18650();
  cell.group.scale.setScalar(0.55);
  cell.group.position.set(-1.0, -0.85, -4.6);
  b.bb.group.add(cell.group);
  stage.part(cell.group, { name: '18650 Li-ion cell', job: '4.2 V full, about 3.0 V empty. Drag its voltage in the controls.', symbol: 'battery' });
  const ldo = box(1.4, 0.3, 1.0, '#1f5fb0', ['3.3 V LDO', 'dropout 0.2 V']);
  ldo.position.set(2.6, -0.85, -4.4);
  b.bb.group.add(ldo);
  stage.part(ldo, { name: 'Low-dropout 3.3 V regulator module', job: 'Makes a steady 3.3 V from anything above about 3.5 V: it only needs 0.2 V of headroom.', symbol: 'regulator' });
  const adapter = box(1.4, 1.0, 1.0, '#202224', ['5 V', 'adapter']);
  adapter.position.set(-4.6, -0.85, -3.0);
  b.bb.group.add(adapter);
  stage.part(adapter, { name: '5 V adapter', job: 'A phone-charger style 5 V supply, wired to the VIN pin.', symbol: 'supply' });
  const bench = box(1.8, 1.0, 1.2, '#3a3d42', ['3.3 V', 'regulated']);
  bench.position.set(-4.6, -0.85, 3.6);
  b.bb.group.add(bench);
  stage.part(bench, { name: '3.3 V regulated supply', job: 'A clean, steady 3.3 V: the only thing that belongs on the 3V3 pin.', symbol: 'supply' });
  const cellP = cell.plus.clone().multiplyScalar(0.55).add(cell.group.position);
  const cellM = cell.minus.clone().multiplyScalar(0.55).add(cell.group.position);
  const leadPts = (a: THREE.Vector3, to: THREE.Vector3) => [a, a.clone().setY(0.9), to.clone().setY(0.9), to.clone().setY(0.75), to.clone()];
  const leads: WireObj[] = [];
  const lead = (a: THREE.Vector3, to: THREE.Vector3, c: 'red' | 'black') => {
    // Leads from behind the board to a front hole go around the ESP32's USB end.
    const w = wire(a.z < 0 && to.z > 0 ? b.around(a, to, c === 'red' ? 0.9 : 1.1) : leadPts(a, to), c, 0.04, 0.25);
    b.bb.group.add(w.mesh);
    leads.push(w);
    return w;
  };
  const vinHole = b.free('VIN'), v33Hole = b.free('3V3'), gndBack = b.free('GND2'), gndFront = b.free('GND');
  const ldoIn = ldo.position.clone().add(new THREE.Vector3(-0.7, 0.2, 0));
  const ldoOut = ldo.position.clone().add(new THREE.Vector3(0.7, 0.2, 0));
  const sets: Record<Exclude<Source, 'usb'>, () => void> = {
    adapter5: () => {
      const p = adapter.position.clone().add(new THREE.Vector3(0.7, 0.5, 0));
      lead(p, vinHole, 'red');
      lead(p.clone().add(new THREE.Vector3(0, -0.2, 0.2)), gndBack, 'black');
    },
    bench33: () => {
      const p = bench.position.clone().add(new THREE.Vector3(0.9, 0.5, 0));
      lead(p, v33Hole, 'red');
      lead(p.clone().add(new THREE.Vector3(0, -0.2, -0.2)), gndFront, 'black');
    },
    cellVin: () => {
      lead(cellP, vinHole, 'red');
      lead(cellM, gndBack, 'black');
    },
    cell33: () => {
      lead(cellP, v33Hole, 'red');
      lead(cellM, gndFront, 'black');
    },
    cellLdo: () => {
      lead(cellP, ldoIn, 'red');
      lead(ldoOut, v33Hole, 'red');
      lead(cellM, gndFront, 'black');
    },
  };
  const railTag = b.tag('3V3');
  b.tag('VIN');
  const status = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.2, -0.6), 'big');

  // ---- controls
  panel.select('Power source', SOURCES, src, (v) => setSource(v as Source));
  const vS = panel.slider({ label: 'Cell voltage', min: 3.0, max: 4.2, step: 0.05, value: vb, nudge: true, format: (v) => `${v.toFixed(2)} V`, onInput: (v) => { vb = v; update(); } });
  const usbBtn = panel.toggle('USB plugged in as well (to upload code)', usbToo, (v) => {
    usbToo = v;
    update();
    if (v && src !== 'usb') twoSources();
  });
  function twoSources() {
    ctx.fail({
      title: 'Two power sources at once',
      text: 'USB and an external supply now both feed the board. They fight each other, and current can flow backwards into your computer\'s USB port or the battery. **Use one source at a time**, or a board made for it (with a diode or a power switch).',
      undo: () => {
        usbToo = false;
        usbBtn.set(false);
        update();
      },
      undoLabel: 'Unplug the USB',
    });
  }
  const roR = panel.readout('3V3 rail');
  const roS = panel.readout('ESP32');
  const note = panel.note('');

  function setSource(s: Source) {
    src = s;
    for (const w of leads) {
      w.mesh.removeFromParent();
      w.mesh.geometry.dispose();
    }
    leads.length = 0;
    if (s !== 'usb') sets[s]();
    usbToo = false;
    usbBtn.set(false);
    usbBtn.el.toggleAttribute('disabled', s === 'usb');
    damaged = false;
    update();
  }

  function update() {
    const usesCell = src.startsWith('cell');
    vS.disable(!usesCell);
    cell.setVoltage(vb);
    if (b.usb) b.usb.visible = src === 'usb' || usbToo;
    const v = railV(src, vb);
    const over = v > ABS_MAX;
    const low = v < MIN_OK;
    if (over && !damaged) {
      damaged = true;
      const p = b.esp.group.position.clone().setY(1.2);
      fx.flash(p, '#ffe0a0', 1.8);
      fx.smoke(p, 3, 10, true);
      ctx.fail({
        title: 'Over the ESP32\'s 3.6 V limit',
        text: `The 3V3 pin goes straight to the chip, with no regulator. The cell's ${vb.toFixed(2)} V is over the 3.6 V absolute maximum. **Put a low-dropout 3.3 V regulator between the cell and the 3V3 pin.**`,
        undo: () => {
          damaged = false;
          setSource('cellLdo');
          panel.el.querySelector<HTMLSelectElement>('select[aria-label="Power source"]')!.value = 'cellLdo';
        },
        undoLabel: 'Use the LDO module',
      });
    }
    b.esp.setPower(v >= 2.5 && !damaged);
    railTag.set(`3V3: ${v.toFixed(2)} V`, over ? 'pin bad' : low ? 'pin warn' : 'pin good');
    roR.set(`${v.toFixed(2)} V`, over ? 'bad' : low ? 'warn' : 'good');
    const state = damaged ? 'damaged' : over ? 'over the limit!' : low ? 'browning out: keeps resetting' : 'running';
    roS.set(state, damaged || over ? 'bad' : low ? 'warn' : 'good');
    status.set(`ESP32: ${state}`, damaged || over ? 'bad' : low ? 'warn' : 'good');
    note.set(
      src === 'cellVin' && low
        ? `The board's AMS1117 regulator needs about 1.1 V of headroom: ${vb.toFixed(2)} V in gives only ${v.toFixed(2)} V out.`
        : src === 'cellLdo'
          ? `The LDO needs only 0.2 V of headroom, so the rail holds 3.3 V down to a cell voltage of 3.5 V.`
          : '',
      low ? 'note warn' : 'note',
    );
  }

  setSource('usb');
  stage.focusObjects = [b.bb.group, cell.group, adapter, bench];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'batterySafe') return { ok: false };
      if (!src.startsWith('cell')) return { ok: false, msg: 'Power it from the 18650 cell.' };
      if (usbToo) return { ok: false, msg: 'Unplug the USB: one source at a time.' };
      // The rail must stay in range from nearly empty (3.2 V) to full (4.2 V).
      for (let v = 3.2; v <= 4.2001; v += 0.05) {
        const r = railV(src, v);
        if (r < MIN_OK || r > ABS_MAX) return { ok: false, msg: `With the cell at ${v.toFixed(2)} V the rail would be ${r.toFixed(2)} V, outside 3.0–3.6 V.` };
      }
      return { ok: true };
    },
  };
}
