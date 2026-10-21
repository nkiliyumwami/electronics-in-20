import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { contactShadow, mesh, qfp, smallBoard, std, wire, type WireColor, type WireObj } from '../../three/lib';
import { Flow } from '../../three/particles';
import { h } from '../../core/dom';
import { dense } from '../kit';

type Bus = 'i2c' | 'spi' | 'uart';
interface Dev {
  id: 'temp' | 'light' | 'gps';
  name: string;
  addr: string;
  pos: THREE.Vector3;
  group: THREE.Group;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let bus: Bus = 'i2c';
  let target: Dev['id'] = 'temp';
  let solved = false;

  const base = smallBoard(9, 6);
  stage.real.add(base, contactShadow(12, 9));
  stage.part(base, { name: 'Carrier board', job: 'Holds a microcontroller and a few modules it talks to.', symbol: 'pcb' });
  const mcu = qfp(1.2, 8);
  mcu.group.position.set(-3, 0, 0);
  stage.real.add(mcu.group);
  stage.part(mcu.group, { name: 'Microcontroller', job: 'The boss of the conversation: it starts every exchange.', symbol: 'chip' });
  stage.label('MCU', mcu.group, new THREE.Vector3(0, 0.6, 0), 'big');

  const mkDev = (id: Dev['id'], name: string, addr: string, pos: THREE.Vector3, color: string): Dev => {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.1, 1.1), std(color, 0.5), [0, 0.05, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), std('#222', 0.5), [0, 0.16, 0]));
    if (id === 'gps') g.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.6), std('#d9c27a', 0.4, 0.4), [0, 0.3, 0]));
    stage.real.add(g);
    stage.part(g, { name, job: id === 'gps' ? 'Talks over UART: a two-way chat with exactly one partner.' : `A sensor on the shared bus. On I2C its address is ${addr}.`, symbol: 'sensor' });
    stage.label(id === 'gps' ? name : `${name} · ${addr}`, g, new THREE.Vector3(0, 0.7, 0));
    return { id, name, addr, pos, group: g };
  };
  const devs: Record<Dev['id'], Dev> = {
    temp: mkDev('temp', 'Temp sensor', '0x48', new THREE.Vector3(1.6, 0, -1.6), '#5a2d82'),
    light: mkDev('light', 'Light sensor', '0x23', new THREE.Vector3(3.2, 0, 1.6), '#1d4f91'),
    gps: mkDev('gps', 'GPS module', '', new THREE.Vector3(2.4, 0, 0), '#2a2a2a'),
  };

  // ---- wires per bus (all start at the MCU's right edge)
  const y = 0.18;
  const P = (x: number, z: number) => new THREE.Vector3(x, y, z);
  interface Line { name: string; color: WireColor; trunk: THREE.Vector3[]; branch: Partial<Record<Dev['id'], THREE.Vector3[]>>; objs: WireObj[]; label?: ReturnType<typeof stage.label> }
  const L = (name: string, color: WireColor, trunk: THREE.Vector3[], branch: Line['branch'] = {}): Line => ({ name, color, trunk, branch, objs: [] });
  // Shared lines: a trunk from the MCU to a split point, then one branch per device.
  const shared = (name: string, color: WireColor, z0: number, xs: number, zt: number, zl: number) =>
    L(name, color, [P(-2.3, z0), P(xs, z0)], { temp: [P(xs, z0), P(xs, zt), P(0.9, zt)], light: [P(xs, z0), P(xs, zl), P(2.5, zl)] });
  const lines: Record<Bus, Line[]> = {
    i2c: [shared('SDA', 'blue', -0.2, -0.4, -1.6, 1.4), shared('SCL', 'yellow', 0.2, -0.1, -1.35, 1.75)],
    spi: [
      shared('SCK', 'yellow', -0.3, -0.6, -1.75, 1.3),
      shared('MOSI', 'green', -0.1, -0.35, -1.55, 1.5),
      shared('MISO', 'purple', 0.1, -0.1, -1.35, 1.7),
      L('CS1', 'orange', [P(-2.3, -0.5), P(-0.9, -0.5), P(-0.9, -2.0), P(0.9, -2.0)]),
      L('CS2', 'white', [P(-2.3, 0.4), P(0.2, 0.4), P(0.2, 1.95), P(2.5, 1.95)]),
    ],
    uart: [L('TX → RX', 'green', [P(-2.3, -0.2), P(1.7, -0.2)]), L('RX ← TX', 'purple', [P(-2.3, 0.2), P(1.7, 0.2)])],
  };
  for (const b of Object.keys(lines) as Bus[]) {
    for (const l of lines[b]) {
      for (const pts of [l.trunk, ...Object.values(l.branch)]) {
        const w = wire(pts!, l.color, 0.035, 0.12);
        stage.real.add(w.mesh);
        stage.part(w.mesh, { name: `${l.name} wire`, job: lineJob(b, l.name), symbol: 'wire' });
        l.objs.push(w);
      }
      l.label = stage.label(l.name, stage.real, l.trunk[0].clone().add(new THREE.Vector3(0.45, 0.25, 0)));
    }
  }
  function lineJob(b: Bus, name: string) {
    if (b === 'i2c') return name === 'SDA' ? 'I2C data, shared by every chip on the bus.' : 'I2C clock: the boss sets the pace for everyone.';
    if (b === 'spi') {
      if (name.startsWith('CS')) return 'Chip select: one wire per chip. Pulled LOW to say "you, listen".';
      return name === 'SCK' ? 'SPI clock.' : name === 'MOSI' ? 'Data from the boss to the chip.' : 'Data from the chip back to the boss.';
    }
    return 'UART: TX on one side goes to RX on the other.';
  }

  // Clock ticks on the clock line.
  const clockFlow = new Flow(new THREE.CatmullRomCurve3(dense([...lines.i2c[1].trunk, ...lines.i2c[1].branch.light!.slice(1)]), false, 'catmullrom', 0.05), { color: '#ffd23a', spacing: 0.5, radius: 0.04, closed: false });
  stage.real.add(clockFlow.mesh);

  // ---- packets
  interface Packet { curve: THREE.CatmullRomCurve3; t: number; dur: number; obj: THREE.Mesh; label: ReturnType<typeof stage.label>; done: () => void }
  let packets: Packet[] = [];
  const packetGeo = new THREE.BoxGeometry(0.22, 0.14, 0.14);
  const send = (pts: THREE.Vector3[], text: string, color: string, done: () => void = () => {}, dur = 1.4) => {
    const curve = new THREE.CatmullRomCurve3(dense(pts, 0.1), false, 'catmullrom', 0.02);
    const obj = new THREE.Mesh(packetGeo, std(color, 0.3, 0, { emissive: new THREE.Color(color), emissiveIntensity: 1.2 }));
    obj.userData.noFrame = true;
    stage.real.add(obj);
    const label = stage.label(text, obj, new THREE.Vector3(0, 0.35, 0), 'warn');
    packets.push({ curve, t: 0, dur, obj, label, done });
  };
  // Path from the MCU along a line to a device: trunk, then that device's branch.
  const pathTo = (l: Line, dev: Dev): THREE.Vector3[] => [...l.trunk, ...(l.branch[dev.id]?.slice(1) ?? [])];
  const flash = (dev: Dev, text: string, cls: string) => {
    const l = stage.label(text, dev.group, new THREE.Vector3(0, 1.15, 0), cls);
    setTimeout(() => l.show(false), 1800);
  };

  // ---- controls
  const busSeg = panel.segmented('Bus', [{ value: 'i2c', label: 'I2C (2 wires)' }, { value: 'spi', label: 'SPI (fast)' }, { value: 'uart', label: 'UART (2 devices)' }], bus, (v) => setBus(v as Bus));
  void busSeg;
  const tSel = panel.select<Dev['id']>('Talk to', [{ value: 'temp', label: 'Temp sensor (0x48)' }, { value: 'light', label: 'Light sensor (0x23)' }], target, (v) => { target = v as Dev['id']; });
  const sendRow = panel.row();
  panel.button('Send', () => doSend(), 'btn primary', sendRow);
  const roW = panel.readout('Wires used');
  const log = h('ol', { class: 'note', 'aria-live': 'polite', style: { margin: '0', paddingLeft: '1.2em', maxHeight: '7.5em', overflow: 'auto' } });
  panel.custom(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Message log'), log));
  const addLog = (t: string) => {
    log.append(h('li', null, t));
    log.scrollTop = log.scrollHeight;
  };

  function setBus(b: Bus) {
    bus = b;
    for (const k of Object.keys(lines) as Bus[]) for (const l of lines[k]) { l.objs.forEach((o) => (o.mesh.visible = k === b)); l.label!.show(k === b); }
    devs.temp.group.visible = b !== 'uart';
    devs.light.group.visible = b !== 'uart';
    devs.gps.group.visible = b === 'uart';
    tSel.setOptions(b === 'uart' ? [{ value: 'gps', label: 'GPS module (the only partner)' }] : [{ value: 'temp', label: `Temp sensor${b === 'i2c' ? ' (0x48)' : ' (CS1)'}` }, { value: 'light', label: `Light sensor${b === 'i2c' ? ' (0x23)' : ' (CS2)'}` }]);
    target = b === 'uart' ? 'gps' : target === 'gps' ? 'temp' : target;
    tSel.set(target);
    const clockLine = b === 'i2c' ? lines.i2c[1] : b === 'spi' ? lines.spi[0] : null;
    clockFlow.mesh.visible = !!clockLine;
    if (clockLine) clockFlow.setPath(new THREE.CatmullRomCurve3(dense([...clockLine.trunk, ...clockLine.branch.light!.slice(1)]), false, 'catmullrom', 0.05));
    roW.set(b === 'i2c' ? '2 (shared by all)' : b === 'spi' ? '3 shared + 1 select per chip' : '2 (one each way)');
    packets.forEach((p) => { stage.real.remove(p.obj); p.label.show(false); });
    packets = [];
  }

  function doSend() {
    const dev = devs[target];
    if (bus === 'i2c') {
      const sda = lines.i2c[0];
      addLog(`I2C: MCU sends "${dev.addr}, read" on SDA. Every chip hears it.`);
      for (const other of [devs.temp, devs.light]) {
        send(pathTo(sda, other), `${dev.addr} · read`, '#ff9a1f', () => {
          if (other === dev) {
            flash(other, 'that\'s me ✓', 'good');
            send([...pathTo(sda, other)].reverse(), other.id === 'temp' ? '21.5 °C' : '320 lux', '#2bd16b', () => addLog(`${dev.name} answered.`));
            if (dev.id === 'temp') solved = true;
          } else flash(other, 'not me', '');
        });
      }
    } else if (bus === 'spi') {
      const cs = lines.spi.find((l) => l.name === (dev.id === 'temp' ? 'CS1' : 'CS2'))!;
      addLog(`SPI: MCU pulls ${cs.name} LOW to select the ${dev.name}, then clocks data out on MOSI.`);
      send(pathTo(cs, dev), 'select', '#ff5a2a', () => {
        send(pathTo(lines.spi[1], dev), 'read', '#ff9a1f', () => {
          flash(dev, 'selected ✓', 'good');
          send([...pathTo(lines.spi[2], dev)].reverse(), dev.id === 'temp' ? '21.5 °C' : '320 lux', '#2bd16b', () => addLog(`${dev.name} answered on MISO.`), 0.8);
        }, 0.8);
      }, 0.8);
    } else {
      addLog('UART: MCU\'s TX talks into the GPS module\'s RX.');
      send(lines.uart[0].trunk, '"position?"', '#ff9a1f', () => {
        flash(devs.gps, 'got it ✓', 'good');
        send([...lines.uart[1].trunk].reverse(), '"52.1N 4.3E"', '#2bd16b', () => addLog('GPS replied on its TX → MCU RX.'));
      });
    }
  }

  stage.onUpdate((dt) => {
    clockFlow.speed = packets.length ? 3 : 0.4;
    clockFlow.update(dt);
    const finished: Packet[] = [];
    for (const p of packets) {
      p.t += dt / p.dur;
      p.obj.position.copy(p.curve.getPointAt(Math.min(1, p.t))).setY(y + 0.12);
      if (p.t >= 1) finished.push(p);
    }
    for (const p of finished) {
      stage.real.remove(p.obj);
      p.label.show(false);
      packets = packets.filter((x) => x !== p);
      p.done();
    }
  });

  setBus('i2c');
  stage.frame({ dir: new THREE.Vector3(0, 1.6, 1), animate: false });

  return {
    check(task) {
      if (task !== 'i2cSend') return { ok: false };
      if (solved) return { ok: true };
      if (bus !== 'i2c') return { ok: false, msg: 'This bus does not share two wires between both sensors.' };
      return { ok: false, msg: 'Pick the temp sensor (0x48) and press Send.' };
    },
  };
}
