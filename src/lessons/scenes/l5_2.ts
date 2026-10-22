import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { bme280, jumperRoute } from '../../three/iot';
import { marking, mesh, std, M } from '../../three/lib';
import { Packets } from '../packets';

// 5.2 I2C: a BME280 (0x76) and a BH1750 light sensor (0x23) share SDA/SCL; add a second BME280.
type Addr = '0x23' | '0x76' | '0x77';
const P = 0.254;

/** GY-302 style BH1750 light-sensor board, 5 pins along its front edge. */
function bh1750() {
  const g = new THREE.Group();
  const top = 0.42 + 0.16;
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.16, 1.4), std('#2659b3', 0.45), [0, 0.42 + 0.08, -0.5]));
  g.add(mesh(new THREE.BoxGeometry(0.35, 0.12, 0.25), M.plasticBlack(), [0, top + 0.06, -0.6]));
  g.add(mesh(new THREE.BoxGeometry(5 * P, 0.4, 0.25), M.plasticBlack(), [0, 0.2, 0]));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), M.gold(), [(i - 2) * P, top + 0.05, 0]));
  const lab = marking(1.3, 0.8, ['BH1750 light', 'I2C 0x23'], '#ffffff');
  lab.position.set(0, top + 0.004, -0.45);
  g.add(lab);
  return g;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let second = false;
  let addr2: '0x76' | '0x77' = '0x76';
  const answeredClean = new Set<Addr>();

  const b = espBench(ctx, { cols: 40 });
  const H = b.H;
  b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', 'Powers every sensor from the red rail.', 0.5);
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Every sensor shares this GND.', 0.5);
  // The bus: SCL on column 17, SDA on column 18 (rows f–j).
  const SCLc = 16, SDAc = 17;
  b.jumper(b.free('D22'), H(SCLc, 9), 'yellow', 'SCL from D22', 'The I2C clock line, shared by every sensor.', 0.8);
  b.jumper(b.free('D21'), H(SDAc, 9), 'blue', 'SDA from D21', 'The I2C data line, shared by every sensor.', 1.1);
  b.tag('D21', 'D21 SDA');
  b.tag('D22', 'D22 SCL');

  // Each module: power from the rails, SCL/SDA jumpers from the bus columns.
  const addModule = (obj: THREE.Object3D, firstCol: number, pins: string[], name: string, job: string, k: number) => {
    const g = new THREE.Group();
    const center = (pins.length - 1) / 2;
    obj.position.copy(H(firstCol, 8)).add(new THREE.Vector3(center * P, 0, 0));
    g.add(obj);
    const col = (p: string) => firstCol + pins.indexOf(p);
    const vin = pins.includes('VIN') ? 'VIN' : 'VCC';
    const j = [
      b.jumper(H(col(vin), 9), H(col(vin), 'bot+'), 'red', '', '', 0.4),
      b.jumper(H(col('GND'), 9), H(col('GND'), 'bot-'), 'black', '', '', 0.5),
      b.jumper(H(SCLc, 5 + k), H(col('SCL'), 6), 'yellow', '', '', 0.7 + k * 0.15),
      b.jumper(H(SDAc, 6 + k), H(col('SDA'), 7), 'blue', '', '', 1.0 + k * 0.15),
    ];
    for (const x of j) g.add(x.group);
    b.bb.group.add(g);
    stage.part(obj, { name, job, symbol: 'sensor' });
    const tag = stage.label('', obj, new THREE.Vector3(0, 1.6, -0.5), 'big');
    return { g, tag, sdaRoute: [...jumperRoute(H(SDAc, 6 + k), H(col('SDA'), 7), 1.0 + k * 0.15)], at: obj.position.clone().setY(1.0) };
  };
  const bmeA = addModule(bme280().group, 20, ['VIN', 'GND', 'SCL', 'SDA'], 'BME280 (address 0x76)', 'Temperature, humidity and pressure. Answers only to address 0x76.', 0);
  const light = addModule(bh1750(), 25, ['VCC', 'GND', 'SCL', 'SDA', 'ADDR'], 'BH1750 light sensor (0x23)', 'Measures light. Answers only to address 0x23.', 1);
  const bme2obj = bme280();
  const bmeB = addModule(bme2obj.group, 32, ['VIN', 'GND', 'SCL', 'SDA'], 'Second BME280', 'Another BME280. Out of the box it also answers to 0x76; its address jumper switches it to 0x77.', 2);
  bmeB.g.visible = false;
  const addrOf = { a: '0x76' as Addr, light: '0x23' as Addr };

  const packets = new Packets(stage, b.bb.group);
  const espSDA = b.free('D21').setY(0.9);
  const busRoute = (m: { sdaRoute: THREE.Vector3[]; at: THREE.Vector3 }) => [espSDA, ...jumperRoute(b.free('D21'), H(SDAc, 9), 1.1).slice(1), ...m.sdaRoute, m.at];

  // ---- controls
  const callSel = panel.select('Call address', [{ value: '0x76', label: '0x76' }, { value: '0x23', label: '0x23' }, { value: '0x77', label: '0x77' }], '0x76', () => {});
  const row = panel.row();
  const sendBtn = panel.button('Send a request', () => void send(callSel.get() as Addr), 'btn primary', row);
  const addBtn = panel.button('Add a second BME280', () => setSecond(!second), 'btn', row);
  const addrSeg = panel.segmented('Second BME280 address jumper', [{ value: '0x76', label: '0x76 (default)' }, { value: '0x77', label: '0x77' }], addr2, (v) => {
    addr2 = v as '0x76' | '0x77';
    bme2obj.setAddress(addr2);
    answeredClean.clear();
    refreshTags();
  });
  void addrSeg;
  const roL = panel.readout('Last reply');
  const roScan = panel.readout('I2C scanner');
  const note = panel.note('');

  function setSecond(v: boolean) {
    second = v;
    bmeB.g.visible = v;
    addBtn.textContent = v ? 'Remove the second BME280' : 'Add a second BME280';
    answeredClean.clear();
    refreshTags();
  }
  const devicesAt = (a: Addr) => {
    const out: { tag: (typeof bmeA)['tag']; m: typeof bmeA }[] = [];
    if (a === addrOf.a) out.push({ tag: bmeA.tag, m: bmeA });
    if (a === addrOf.light) out.push({ tag: light.tag, m: light });
    if (second && a === addr2) out.push({ tag: bmeB.tag, m: bmeB });
    return out;
  };
  function refreshTags() {
    bmeA.tag.set('0x76');
    light.tag.set('0x23');
    bmeB.tag.set(addr2, second && addr2 === '0x76' ? 'bad' : '');
    const found = [...new Set(['0x23', '0x76', ...(second ? [addr2] : [])])].sort();
    roScan.set(`found ${found.join(', ')}`);
    note.set(second && addr2 === '0x76' ? 'Two devices now share address 0x76. Both will answer at once.' : '', 'note warn');
  }

  async function send(a: Addr) {
    if (packets.busy) return;
    sendBtn.setAttribute('disabled', '');
    const targets = devicesAt(a);
    const route = busRoute(targets[0]?.m ?? bmeA);
    await packets.send(route, '#3d7bd9', `→ ${a}`, 1.2);
    if (!targets.length) {
      roL.set(`no answer from ${a} (nobody has that address)`, 'warn');
    } else if (targets.length > 1) {
      for (const t of targets) stage.flashGlow(t.m.g, 1.2);
      await Promise.all(targets.map((t) => packets.send([...busRoute(t.m)].reverse(), '#c0392b', '??', 1.2)));
      roL.set(`garbage: ${targets.length} devices answered at once`, 'bad');
      answeredClean.delete(a);
    } else {
      stage.flashGlow(targets[0].m.g, 1.0);
      await packets.send([...busRoute(targets[0].m)].reverse(), '#2f9e44', a === '0x23' ? '312 lux' : '23.4 °C', 1.2);
      roL.set(`${a} answered: ${a === '0x23' ? '312 lux' : '23.4 °C, 48% humidity'}`, 'good');
      answeredClean.add(a);
    }
    sendBtn.removeAttribute('disabled');
  }

  stage.onUpdate((dt) => packets.update(dt));
  refreshTags();
  stage.focusObjects = [b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'twoBme') return { ok: false };
      if (!second) return { ok: false, msg: 'Add the second BME280 first.' };
      if (addr2 !== '0x77') return { ok: false, msg: 'Both BME280s still answer to 0x76.' };
      if (!answeredClean.has('0x76') || !answeredClean.has('0x77')) return { ok: false, msg: 'Now call 0x76 and 0x77 and check that each one answers.' };
      return { ok: true };
    },
  };
}
