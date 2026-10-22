import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, glowSprite, marking, mesh, std, wire, type BreadboardObj, type WireColor, type WireObj } from './lib';

// The IoT kit: an ESP32 DevKit, Dupont jumpers, sensor modules, a pump and a
// battery. Beginner-first: labels are big and readable, details stay simple.
// Units: 1 = 1 cm (breadboard pitch 0.254).

const P = 0.254;

// ------------------------------------------------------------------ ESP32
/**
 * The 30-pin ESP32 DevKit V1 pinout, counted from the USB end. Silkscreen
 * names follow the board ("D16" means GPIO 16).
 *   front: the row nearest the viewer once it sits on a breadboard.
 */
export const ESP32_FRONT = ['3V3', 'GND', 'D15', 'D2', 'D4', 'D16', 'D17', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23'] as const;
export const ESP32_BACK = ['VIN', 'GND2', 'D13', 'D12', 'D14', 'D27', 'D26', 'D25', 'D33', 'D32', 'D35', 'D34', 'VN', 'VP', 'EN'] as const;
export type Esp32Pin = (typeof ESP32_FRONT)[number] | (typeof ESP32_BACK)[number];

const silkName = (p: string) => (p === 'GND2' ? 'GND' : p);

/** What a pin is, for tooltips and lesson logic. */
export function pinInfo(p: Esp32Pin): { gpio?: number; kind: 'power' | 'gnd' | 'gpio' | 'input-only' | 'enable'; adc?: 1 | 2; note?: string } {
  if (p === '3V3' || p === 'VIN') return { kind: 'power' };
  if (p === 'GND' || p === 'GND2') return { kind: 'gnd' };
  if (p === 'EN') return { kind: 'enable' };
  const gpio = p === 'VP' ? 36 : p === 'VN' ? 39 : p === 'RX0' ? 3 : p === 'TX0' ? 1 : Number(p.slice(1));
  const adc1 = [32, 33, 34, 35, 36, 39];
  const adc2 = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27];
  const kind = gpio >= 34 ? 'input-only' : 'gpio';
  return { gpio, kind, adc: adc1.includes(gpio) ? 1 : adc2.includes(gpio) ? 2 : undefined };
}

export interface Esp32Obj {
  group: THREE.Group;
  /** Pin base (where it enters the breadboard), in the board group's space. */
  pin(p: Esp32Pin): THREE.Vector3;
  /** Light a pin's header with a colour ring (null = off). */
  markPin(p: Esp32Pin, color: string | null): void;
  /** The blue on-board LED (GPIO 2) and the red power LED. */
  setBlueLed(on: boolean): void;
  setPower(on: boolean): void;
  usbEnd: THREE.Vector3;
}

function esp32Silk(): THREE.CanvasTexture {
  // 5.1 × 2.6 board, drawn looking down with the USB end on the left.
  const W = 5.1, D = 2.6, ppu = 200;
  const c = document.createElement('canvas');
  c.width = W * ppu;
  c.height = D * ppu;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b2433';
  g.fillRect(0, 0, c.width, c.height);
  // Copper-ish edge outline.
  g.strokeStyle = '#33415a';
  g.lineWidth = 6;
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  const X = (x: number) => (x + W / 2) * ppu;
  const Z = (z: number) => (z + D / 2) * ppu;
  // Pin labels next to the headers, readable from the front (USB on the left).
  for (let k = 0; k < 15; k++) {
    const x = PIN_X0 + k * P;
    for (const [list, z, align] of [[ESP32_FRONT, PIN_Z - 0.3, 'bottom'], [ESP32_BACK, -PIN_Z + 0.3, 'top']] as const) {
      const name = silkName(list[k]);
      const power = name === '3V3' || name === 'VIN';
      const gnd = name === 'GND';
      g.fillStyle = power ? '#ff8a80' : gnd ? '#b0bec5' : '#ffffff';
      g.font = `bold ${Math.round(0.13 * ppu)}px system-ui, sans-serif`;
      g.save();
      g.translate(X(x), Z(z));
      g.rotate(-Math.PI / 2);
      g.textAlign = align === 'bottom' ? 'left' : 'right';
      g.fillText(name, 0, 0);
      g.restore();
    }
  }
  // Button labels and the board name.
  g.fillStyle = '#d7dce4';
  g.textAlign = 'center';
  g.font = `bold ${Math.round(0.12 * ppu)}px system-ui, sans-serif`;
  g.fillText('EN', X(-2.05), Z(-0.62));
  g.fillText('BOOT', X(-2.05), Z(0.62));
  g.font = `bold ${Math.round(0.16 * ppu)}px system-ui, sans-serif`;
  g.fillText('ESP32 DEVKIT', X(-0.75), Z(0));
  // Antenna zig-zag on the module's tail.
  g.strokeStyle = '#c9a54a';
  g.lineWidth = 5;
  g.beginPath();
  const ax = 2.25;
  for (let i = 0; i <= 8; i++) {
    const zz = -0.75 + i * 0.19;
    g.lineTo(X(ax + (i % 2 ? 0.28 : 0)), Z(zz));
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Header layout in board space (USB end at -x).
const PIN_X0 = -1.95;
const PIN_Z = 1.162; // rows b and i of the breadboard
const LIFT = 0.42; // header plastic height: the PCB sits this far above the breadboard

export function esp32(): Esp32Obj {
  const g = new THREE.Group();
  const W = 5.1, D = 2.6, T = 0.16;
  const pcbTop = LIFT + T;
  const silk = esp32Silk();
  const pcb = mesh(new THREE.BoxGeometry(W, T, D), std('#1b2433', 0.5), [0, LIFT + T / 2, 0]);
  const top = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: silk, roughness: 0.55 }), [0, pcbTop + 0.002, 0], [-Math.PI / 2, 0, 0]);
  g.add(pcb, top);
  // ESP32-WROOM module: metal shield + antenna tail.
  const shield = mesh(new THREE.BoxGeometry(1.76, 0.3, 1.75), M.steel(), [1.2, pcbTop + 0.15, 0]);
  const shieldText = marking(1.5, 0.9, ['ESP32-WROOM-32', 'Wi-Fi + Bluetooth'], '#4a4f55');
  shieldText.position.set(1.2, pcbTop + 0.302, 0);
  const tail = mesh(new THREE.BoxGeometry(0.62, 0.06, 1.75), std('#1e2a3e', 0.5), [2.35, pcbTop + 0.03, 0]);
  g.add(shield, shieldText, tail);
  // Micro-USB port.
  const usb = mesh(new RoundedBoxGeometry(0.6, 0.26, 0.75, 2, 0.04), M.steel(), [-2.38, pcbTop + 0.13, 0]);
  usb.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.55), std('#111', 0.8), [-0.26, 0, 0]));
  g.add(usb);
  // EN and BOOT buttons, regulator, USB chip.
  for (const z of [-0.95, 0.95]) {
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.14, 0.32), std('#d9d9d9', 0.4), [-2.05, pcbTop + 0.07, z * 0.62]));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 14), M.plasticBlack(), [-2.05, pcbTop + 0.18, z * 0.62]));
  }
  const reg = mesh(new THREE.BoxGeometry(0.36, 0.14, 0.62), M.plasticDark(), [-1.35, pcbTop + 0.07, 0.35]);
  const regText = marking(0.3, 0.5, ['AMS1117', '3.3'], '#bfc4ca');
  regText.rotation.z = Math.PI / 2;
  regText.position.set(-1.35, pcbTop + 0.142, 0.35);
  const uart = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), M.plasticDark(), [-1.3, pcbTop + 0.04, -0.45]);
  g.add(reg, regText, uart);
  // LEDs: red power, blue on GPIO 2.
  const redMat = std('#ff3a2a', 0.3, 0, { emissive: new THREE.Color('#ff2010'), emissiveIntensity: 0.05 });
  const blueMat = std('#3a7bff', 0.3, 0, { emissive: new THREE.Color('#2a6bff'), emissiveIntensity: 0.05 });
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.1), redMat, [-1.7, pcbTop + 0.03, -0.75]));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.1), blueMat, [-1.7, pcbTop + 0.03, 0.75]));
  const redGlow = glowSprite('#ff3020', 0.6);
  redGlow.position.set(-1.7, pcbTop + 0.1, -0.75);
  const blueGlow = glowSprite('#3070ff', 0.7);
  blueGlow.position.set(-1.7, pcbTop + 0.1, 0.75);
  redGlow.visible = blueGlow.visible = false;
  g.add(redGlow, blueGlow);
  // Headers: black plastic strip + gold pins going into the breadboard.
  const pos = new Map<string, THREE.Vector3>();
  const rings = new Map<string, THREE.Mesh>();
  const ringGeo = new THREE.TorusGeometry(0.1, 0.03, 8, 20);
  for (const [list, z] of [[ESP32_FRONT, PIN_Z], [ESP32_BACK, -PIN_Z]] as const) {
    g.add(mesh(new THREE.BoxGeometry(15 * P, LIFT - 0.02, 0.25), M.plasticBlack(), [PIN_X0 + 7 * P, (LIFT - 0.02) / 2, z]));
    list.forEach((name, k) => {
      const x = PIN_X0 + k * P;
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), M.gold(), [x, pcbTop + 0.06, z]));
      pos.set(name, new THREE.Vector3(x, 0, z));
      const ring = mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffb020' }), [x, pcbTop + 0.03, z], [-Math.PI / 2, 0, 0]);
      ring.visible = false;
      ring.userData.noShadow = true;
      g.add(ring);
      rings.set(name, ring);
    });
  }
  return {
    group: g,
    pin: (p) => pos.get(p)!.clone(),
    markPin: (p, color) => {
      const r = rings.get(p)!;
      r.visible = !!color;
      if (color) (r.material as THREE.MeshBasicMaterial).color.set(color);
    },
    setBlueLed: (on) => {
      blueMat.emissiveIntensity = on ? 3 : 0.05;
      blueGlow.visible = on;
    },
    setPower: (on) => {
      redMat.emissiveIntensity = on ? 2.5 : 0.05;
      redGlow.visible = on;
    },
    usbEnd: new THREE.Vector3(-2.68, pcbTop + 0.13, 0),
  };
}

/**
 * Put the ESP32 on a breadboard the way it really fits: pins in rows b and i,
 * so only rows a and j stay free. `col` is the column of the pin nearest the USB end.
 */
export function plugIn(bb: BreadboardObj, esp: Esp32Obj, col: number) {
  const a = bb.hole(col, 1);
  esp.group.position.set(a.x - PIN_X0, 0, 0);
  bb.group.add(esp.group);
  /** Free hole next to a pin (row a for the back row, row j for the front row). */
  const free = (p: Esp32Pin) => {
    const k = (ESP32_FRONT as readonly string[]).indexOf(p);
    return k >= 0 ? bb.hole(col + k, 9) : bb.hole(col + (ESP32_BACK as readonly string[]).indexOf(p), 0);
  };
  /** Breadboard column of a pin. */
  const colOf = (p: Esp32Pin) => {
    const k = (ESP32_FRONT as readonly string[]).indexOf(p);
    return col + (k >= 0 ? k : (ESP32_BACK as readonly string[]).indexOf(p));
  };
  return { free, colOf };
}

// ------------------------------------------------------------ jumpers
export interface JumperObj {
  group: THREE.Group;
  wire: WireObj;
  set(a: THREE.Vector3, b: THREE.Vector3, h?: number): void;
}

/** The lead's path for a jumper between a and b (also used for flow particles). */
export function jumperRoute(a: THREE.Vector3, b: THREE.Vector3, h = 0.9): THREE.Vector3[] {
  const top = Math.max(a.y, b.y) + h;
  return [
    new THREE.Vector3(a.x, a.y + 0.7, a.z),
    new THREE.Vector3(a.x, top, a.z),
    new THREE.Vector3(b.x, top, b.z),
    new THREE.Vector3(b.x, b.y + 0.7, b.z),
  ];
}

/**
 * Dupont jumper wire between two breadboard holes (or pins): male plugs with
 * black housings at both ends, a coloured lead arching between them.
 */
export function jumper(a: THREE.Vector3, b: THREE.Vector3, color: WireColor = 'yellow', h = 0.9): JumperObj {
  const g = new THREE.Group();
  const housing = new THREE.BoxGeometry(0.24, 0.62, 0.24);
  const pinG = new THREE.BoxGeometry(0.05, 0.18, 0.05);
  const ends = [0, 1].map(() => {
    const e = new THREE.Group();
    e.add(mesh(housing, M.plasticBlack(), [0, 0.39, 0]));
    e.add(mesh(pinG, M.gold(), [0, 0.04, 0]));
    g.add(e);
    return e;
  });
  const pts = jumperRoute;
  const w = wire(pts(a, b, h), color, 0.042, 0.35);
  g.add(w.mesh);
  const set = (a: THREE.Vector3, b: THREE.Vector3, hh = h) => {
    ends[0].position.copy(a);
    ends[1].position.copy(b);
    w.setPoints(pts(a, b, hh));
  };
  set(a, b, h);
  return { group: g, wire: w, set };
}

// ------------------------------------------------------- 18650 battery
export interface Cell18650Obj {
  group: THREE.Group;
  /** Lead ends (red +, black −) in local space, for jumpers. */
  plus: THREE.Vector3;
  minus: THREE.Vector3;
  /** Charge gauge, 3.0 V (empty) … 4.2 V (full). */
  setVoltage(v: number): void;
}

export function cell18650(): Cell18650Obj {
  const g = new THREE.Group();
  const holder = mesh(new RoundedBoxGeometry(7.6, 1.0, 2.1, 3, 0.12), M.plasticBlack(), [0, 0.5, 0]);
  const cell = mesh(new THREE.CylinderGeometry(0.9, 0.9, 6.5, 32), std('#2e7bd6', 0.35), [0, 1.02, 0], [0, 0, Math.PI / 2]);
  const nub = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 24), M.steel(), [3.31, 1.02, 0], [0, 0, Math.PI / 2]);
  const label = marking(4.0, 1.0, ['18650 Li-ion', '3.7 V  2500 mAh'], '#ffffff');
  label.position.set(-0.3, 1.93, 0);
  // Springs/contacts at the ends.
  g.add(holder, cell, nub, label);
  g.add(mesh(new THREE.BoxGeometry(0.08, 1.4, 1.4), M.steel(), [3.62, 1.02, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.08, 1.4, 1.4), M.steel(), [-3.62, 1.02, 0]));
  // Charge gauge: a bar on the front that empties.
  const gaugeBg = mesh(new THREE.BoxGeometry(3.0, 0.32, 0.04), std('#2a2c2f', 0.6), [0, 0.5, 1.07]);
  const fillMat = std('#2f9e44', 0.5, 0, { emissive: new THREE.Color('#2f9e44'), emissiveIntensity: 0.4 });
  const fill = mesh(new THREE.BoxGeometry(2.9, 0.24, 0.05), fillMat, [0, 0.5, 1.08]);
  g.add(gaugeBg, fill);
  return {
    group: g,
    plus: new THREE.Vector3(3.75, 0.4, 0.6),
    minus: new THREE.Vector3(-3.75, 0.4, 0.6),
    setVoltage: (v) => {
      const t = Math.max(0.02, Math.min(1, (v - 3.0) / 1.2));
      fill.scale.x = t;
      fill.position.x = -1.45 + 1.45 * t;
      const col = t > 0.5 ? '#2f9e44' : t > 0.2 ? '#e0a020' : '#d6312b';
      fillMat.color.set(col);
      fillMat.emissive.set(col);
    },
  };
}

// ------------------------------------------------------ plant & soil
export interface PlantObj {
  group: THREE.Group;
  /** 0 = bone dry, 1 = soaked. Darkens the soil and perks the leaves up. */
  setMoisture(m: number): void;
  /** Top of the soil, local. */
  soilTop: THREE.Vector3;
}

export function pottedPlant(): PlantObj {
  const g = new THREE.Group();
  const potPts = [
    [0, 0],
    [1.2, 0],
    [1.25, 0.1],
    [1.55, 2.0],
    [1.75, 2.05],
    [1.75, 2.45],
    [1.6, 2.45],
    [1.5, 2.1],
    [0, 2.1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(potPts, 36), std('#c8643c', 0.8)));
  const soilMat = std('#7a5534', 0.95);
  const soil = mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.1, 32), soilMat, [0, 2.2, 0]);
  g.add(soil);
  // Stem + leaves; leaves droop when the soil is dry.
  const leafMat = std('#3f9e3a', 0.6);
  const stem = mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8), std('#4f8a35', 0.6), [0, 3.0, 0]);
  g.add(stem);
  const leaves: THREE.Group[] = [];
  const leafGeo = new THREE.SphereGeometry(0.5, 12, 8);
  leafGeo.scale(1, 0.18, 0.5);
  leafGeo.translate(0.5, 0, 0);
  for (let i = 0; i < 6; i++) {
    const lg = new THREE.Group();
    lg.position.set(0, 2.5 + (i % 3) * 0.45, 0);
    lg.rotation.y = (i * Math.PI * 2) / 6 + i * 0.3;
    lg.add(mesh(leafGeo, leafMat));
    g.add(lg);
    leaves.push(lg);
  }
  const dry = new THREE.Color('#b08a5a'), wet = new THREE.Color('#3e2a1a');
  const leafDry = new THREE.Color('#9aa53a'), leafWet = new THREE.Color('#3f9e3a');
  return {
    group: g,
    soilTop: new THREE.Vector3(0, 2.25, 0),
    setMoisture: (m) => {
      const t = Math.max(0, Math.min(1, m));
      soilMat.color.copy(dry).lerp(wet, t);
      leafMat.color.copy(leafDry).lerp(leafWet, Math.min(1, t * 1.6));
      for (const l of leaves) l.rotation.z = -0.15 - (1 - Math.min(1, t * 1.6)) * 0.75;
    },
  };
}

/** Capacitive soil-moisture sensor (v1.2 style), standing upright, pins at the top. */
export function soilSensor(): { group: THREE.Group; pins: Record<'GND' | 'VCC' | 'AOUT', THREE.Vector3> } {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const w = 1.15, L = 5.0;
  shape.moveTo(-w, 0);
  shape.lineTo(-w, L - 1.0);
  shape.lineTo(w, L - 1.0);
  shape.lineTo(w, 0);
  shape.lineTo(0.0, -1.0);
  shape.lineTo(-w, 0);
  const board = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false }), std('#151719', 0.5), [0, 0, -0.08]);
  g.add(board);
  const txt = marking(2.0, 2.4, ['Capacitive', 'Soil Moisture', 'Sensor'], '#f2f2f2');
  txt.rotation.set(0, 0, 0);
  txt.position.set(0, 1.6, 0.085);
  g.add(txt);
  // Electronics band and the connector at the top.
  g.add(mesh(new THREE.BoxGeometry(2.3, 0.6, 0.06), std('#e8e2c8', 0.6), [0, 3.55, 0.1]));
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.5, 0.5), std('#f1ede0', 0.6), [0, 4.25, 0.3]));
  const pins = {} as Record<'GND' | 'VCC' | 'AOUT', THREE.Vector3>;
  (['GND', 'VCC', 'AOUT'] as const).forEach((n, i) => {
    pins[n] = new THREE.Vector3((i - 1) * 0.254, 4.5, 0.3);
  });
  const lab = marking(1.4, 0.4, ['GND VCC AOUT'], '#f2f2f2');
  lab.rotation.set(0, 0, 0);
  lab.position.set(0, 3.55, 0.135);
  g.add(lab);
  return { group: g, pins };
}

// --------------------------------------------------------- modules
/** BME280 temperature/humidity/pressure breakout, lying flat with 4 pins along its front edge. */
export function bme280(): { group: THREE.Group; pins: Record<'VIN' | 'GND' | 'SCL' | 'SDA', THREE.Vector3>; setAddress(a: string): void } {
  const g = new THREE.Group();
  const top = 0.42 + 0.16;
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.16, 1.3), std('#6a3fa0', 0.45), [0, 0.42 + 0.08, -0.4]));
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.1, 0.25), M.steel(), [0.25, top + 0.05, -0.55]));
  const header = mesh(new THREE.BoxGeometry(4 * P, 0.4, 0.25), M.plasticBlack(), [0, 0.2, 0]);
  g.add(header);
  const pins = {} as Record<'VIN' | 'GND' | 'SCL' | 'SDA', THREE.Vector3>;
  (['VIN', 'GND', 'SCL', 'SDA'] as const).forEach((n, i) => {
    const x = (i - 1.5) * P;
    pins[n] = new THREE.Vector3(x, 0, 0);
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), M.gold(), [x, top + 0.05, 0]));
  });
  let lab = marking(1.3, 0.9, ['BME280', 'I2C 0x76', 'VIN GND SCL SDA'], '#ffffff');
  lab.position.set(0, top + 0.004, -0.5);
  g.add(lab);
  return {
    group: g,
    pins,
    setAddress: (a) => {
      g.remove(lab);
      lab = marking(1.3, 0.9, ['BME280', `I2C ${a}`, 'VIN GND SCL SDA'], '#ffffff');
      lab.position.set(0, top + 0.004, -0.5);
      g.add(lab);
    },
  };
}

/** Mini submersible pump in a cup of water, with an outlet tube. */
export function pumpInCup(): { group: THREE.Group; setRunning(on: boolean, t: number): void; tubeEnd: THREE.Vector3; leads: THREE.Vector3 } {
  const g = new THREE.Group();
  const cupPts = [
    [0, 0],
    [1.3, 0],
    [1.55, 3.0],
    [1.5, 3.0],
    [1.25, 0.08],
    [0, 0.08],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(cupPts, 32), M.glass()));
  const water = mesh(new THREE.CylinderGeometry(1.45, 1.27, 2.0, 32), M.water(), [0, 1.08, 0]);
  g.add(water);
  const body = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 24), std('#202326', 0.5), [0, 0.75, 0]);
  const cap = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16), std('#e9e6dc', 0.5), [0, 1.55, 0]);
  g.add(body, cap);
  const lab = marking(0.9, 0.5, ['PUMP', '3–5 V'], '#ffffff');
  lab.rotation.set(0, 0, 0);
  lab.position.set(0, 0.85, 0.51);
  g.add(lab);
  // Outlet tube: up and out over the rim.
  const tubePath = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 3.6, 0), new THREE.Vector3(0.8, 4.1, 0), new THREE.Vector3(2.4, 4.0, 0), new THREE.Vector3(3.2, 3.3, 0)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(tubePath, 40, 0.12, 10, false), M.pipe()));
  // Drops falling from the tube end while it runs.
  const drops: THREE.Mesh[] = [];
  const dropGeo = new THREE.SphereGeometry(0.08, 8, 6);
  for (let i = 0; i < 6; i++) {
    const d = mesh(dropGeo, M.water(), [3.2, 3.2, 0]);
    d.visible = false;
    g.add(d);
    drops.push(d);
  }
  return {
    group: g,
    tubeEnd: new THREE.Vector3(3.2, 3.3, 0),
    leads: new THREE.Vector3(0, 1.6, 0),
    setRunning: (on, t) => {
      drops.forEach((d, i) => {
        d.visible = on;
        const f = (t * 1.6 + i / drops.length) % 1;
        d.position.set(3.25, 3.2 - f * 1.6, 0);
      });
    },
  };
}

/** 1-channel 5 V relay module, with screw terminals for the load side. */
export function relayModule(): { group: THREE.Group; setOn(on: boolean): void; pins: Record<'DC+' | 'DC-' | 'IN', THREE.Vector3> } {
  const g = new THREE.Group();
  const top = 0.42 + 0.16;
  g.add(mesh(new THREE.BoxGeometry(5.0, 0.16, 1.7), std('#1e4fa3', 0.45), [1.6, 0.42 + 0.08, -0.6]));
  const relay = mesh(new THREE.BoxGeometry(1.9, 1.5, 1.5), std('#2763c9', 0.4), [1.6, top + 0.75, -0.6]);
  const rTxt = marking(1.6, 1.0, ['SRD-05VDC', 'coil 5 V'], '#f2f2f2');
  rTxt.position.set(1.6, top + 1.502, -0.6);
  g.add(relay, rTxt);
  const term = mesh(new THREE.BoxGeometry(1.0, 0.8, 1.4), std('#2a8f4a', 0.5), [3.6, top + 0.4, -0.6]);
  g.add(term);
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 16), M.steel(), [3.6, top + 0.83, -1.05 + i * 0.45]));
  const warn = marking(1.6, 0.5, ['LOAD SIDE'], '#ffdf6a');
  warn.position.set(3.4, top + 0.005, 0.15);
  g.add(warn);
  const ledMat = std('#ff3a2a', 0.3, 0, { emissive: new THREE.Color('#ff2010'), emissiveIntensity: 0.05 });
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.1), ledMat, [0.2, top + 0.03, -1.2]));
  const header = mesh(new THREE.BoxGeometry(3 * P, 0.4, 0.25), M.plasticBlack(), [0, 0.2, 0]);
  g.add(header);
  const pins = {} as Record<'DC+' | 'DC-' | 'IN', THREE.Vector3>;
  (['DC+', 'DC-', 'IN'] as const).forEach((n, i) => {
    pins[n] = new THREE.Vector3((i - 1) * P, 0, 0);
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), M.gold(), [(i - 1) * P, top + 0.05, 0]));
  });
  const lab = marking(1.0, 0.3, ['DC+ DC− IN'], '#ffffff');
  lab.position.set(0, top + 0.005, -0.25);
  g.add(lab);
  return {
    group: g,
    pins,
    setOn: (on) => {
      ledMat.emissiveIntensity = on ? 2.5 : 0.05;
    },
  };
}

/** Axial diode (1N5819-style) lying along X; the grey band marks the cathode at +X. */
export function axialDiode(span = 1.016, mark = '1N5819'): { group: THREE.Group } {
  const g = new THREE.Group();
  const y = 0.25;
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16), M.plasticBlack(), [0, y, 0], [0, 0, Math.PI / 2]));
  g.add(mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.08, 16), std('#cfd3d8', 0.5), [0.18, y, 0], [0, 0, Math.PI / 2]));
  const legMat = M.lead();
  const h = span / 2;
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, h - 0.25, 6), legMat, [s * (0.25 + (h - 0.25) / 2), y, 0], [0, 0, Math.PI / 2]));
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, y, 6), legMat, [s * h, y / 2, 0]));
  }
  if (mark) {
    const t = marking(0.3, 0.12, [mark], '#d0d4da');
    t.position.set(-0.05, y + 0.105, 0);
    g.add(t);
  }
  return { group: g };
}

/** Micro-USB cable from a plug position, trailing off behind the scene. */
export function usbCable(plug: THREE.Vector3, dir = new THREE.Vector3(-1, 0, 0)): THREE.Group {
  const g = new THREE.Group();
  const head = mesh(new RoundedBoxGeometry(0.9, 0.36, 0.6, 2, 0.08), std('#202224', 0.5));
  head.position.copy(plug).addScaledVector(dir, 0.45);
  g.add(head);
  // The lead drops to the desk (the breadboard's underside, y = −0.85) and trails away.
  const start = plug.clone().addScaledVector(dir, 0.9);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const at = (d: number, y: number, s = 0) => start.clone().addScaledVector(dir, d).addScaledVector(side, s).setY(y);
  const curve = new THREE.CatmullRomCurve3([start, at(0.5, plug.y - 0.1), at(1.1, -0.6), at(1.8, -0.8, 0.3), at(3.5, -0.8, 1.2)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.09, 8, false), std('#202224', 0.6)));
  return g;
}
