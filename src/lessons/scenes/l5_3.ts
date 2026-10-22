import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { jumperRoute, type JumperObj } from '../../three/iot';
import { marking, mesh, std, M } from '../../three/lib';
import { Packets } from '../packets';

// 5.3 UART (a GPS module) and SPI (an SD-card module) at a glance.
const P = 0.254;

function moduleBoard(w: number, d: number, color: string, pins: string[], title: string[]) {
  const g = new THREE.Group();
  const top = 0.42 + 0.16;
  g.add(mesh(new THREE.BoxGeometry(w, 0.16, d), std(color, 0.45), [0, 0.42 + 0.08, -d / 2 + 0.15]));
  g.add(mesh(new THREE.BoxGeometry(pins.length * P, 0.4, 0.25), M.plasticBlack(), [0, 0.2, 0]));
  pins.forEach((_, i) => g.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), M.gold(), [(i - (pins.length - 1) / 2) * P, top + 0.05, 0])));
  const lab = marking(w * 0.9, 0.7, title, '#ffffff');
  lab.position.set(0, top + 0.004, -d + 0.6);
  g.add(lab);
  const pl = marking(w * 0.95, 0.22, [pins.join(' ')], '#ffffff');
  pl.position.set(0, top + 0.004, -0.2);
  g.add(pl);
  return { g, top };
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let txTo: 'D16' | 'D17' = 'D17';
  let baud = 115200;
  const GPS_BAUD = 9600;
  let lastOk = false;

  const b = espBench(ctx, { cols: 40 });
  const H = b.H;
  b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', '', 0.5);
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', '', 0.5);

  // GPS (UART): VCC GND TX RX in columns 20–23.
  const gps = moduleBoard(2.4, 2.4, '#1b3f86', ['VCC', 'GND', 'TX', 'RX'], ['GPS (UART)', '9600 baud']);
  gps.g.add(mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), std('#c9a46a', 0.6), [0, gps.top + 0.15, -1.3]));
  gps.g.position.copy(H(20, 8)).add(new THREE.Vector3(1.5 * P, 0, 0));
  b.bb.group.add(gps.g);
  stage.part(gps.g, { name: 'GPS module (UART)', job: 'Sends its position as lines of text over UART: TX → the ESP32\'s RX, at 9600 baud.', symbol: 'sensor' });
  b.jumper(H(20, 9), H(20, 'bot+'), 'red', '', '', 0.4);
  b.jumper(H(21, 9), H(21, 'bot-'), 'black', '', '', 0.5);
  const txJ: JumperObj = b.jumper(H(22, 6), b.free('D17'), 'green', 'GPS TX wire', 'The GPS talks on its TX pin. It must reach the ESP32\'s RX pin.', 1.2);
  const rxJ = b.jumper(H(23, 7), b.free('D17').add(new THREE.Vector3(0, 0, 0)), 'white', 'GPS RX wire (from ESP32 TX2)', 'The ESP32 talks to the GPS on its TX2 pin (D17).', 1.5);
  void rxJ;
  b.tag('D16', 'D16 RX2');
  b.tag('D17', 'D17 TX2');

  // SD card (SPI): CS SCK MOSI MISO VCC GND in columns 28–33.
  const sd = moduleBoard(2.6, 3.0, '#2a2c30', ['CS', 'SCK', 'MOSI', 'MISO', 'VCC', 'GND'], ['SD card (SPI)']);
  sd.g.add(mesh(new THREE.BoxGeometry(1.6, 0.18, 1.6), M.steel(), [0, sd.top + 0.09, -1.7]));
  sd.g.position.copy(H(28, 8)).add(new THREE.Vector3(2.5 * P, 0, 0));
  b.bb.group.add(sd.g);
  stage.part(sd.g, { name: 'SD-card module (SPI)', job: 'Stores data logs. SPI: clock (SCK), data out (MOSI), data in (MISO), and CS to select it.', symbol: 'chip' });
  const spi: Record<string, [THREE.Vector3, 'D5' | 'D18' | 'D23' | 'D19', string]> = {
    CS: [H(28, 6), 'D5', 'purple'],
    SCK: [H(29, 7), 'D18', 'yellow'],
    MOSI: [H(30, 6), 'D23', 'orange'],
    MISO: [H(31, 7), 'D19', 'blue'],
  };
  const spiRoutes: Record<string, THREE.Vector3[]> = {};
  Object.entries(spi).forEach(([name, [hole, pin, color]], i) => {
    const hh = 1.8 + i * 0.25;
    b.jumper(hole, b.free(pin), color as 'purple', `SPI ${name} (${pin})`, name === 'CS' ? 'Chip select: the ESP32 pulls it LOW to talk to this card.' : `The ${name} line of the SPI bus.`, hh);
    spiRoutes[name] = jumperRoute(b.free(pin), hole, hh);
  });
  b.jumper(H(32, 9), H(32, 'bot+'), 'red', '', '', 0.4);
  b.jumper(H(33, 9), H(33, 'bot-'), 'black', '', '', 0.5);

  const packets = new Packets(stage, b.bb.group);
  const monitor = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.3, -0.6), 'big');

  // ---- controls
  let bus: 'uart' | 'spi' = 'uart';
  panel.segmented('Show a bus', [{ value: 'uart', label: 'UART (GPS)' }, { value: 'spi', label: 'SPI (SD card)' }], bus, (v) => (bus = v as 'uart' | 'spi'));
  const sendBtn = panel.button('Send', () => void send(), 'btn primary');
  panel.select('GPS TX goes to', [{ value: 'D17', label: 'D17 (TX2)' }, { value: 'D16', label: 'D16 (RX2)' }], txTo, (v) => {
    txTo = v as 'D16' | 'D17';
    txJ.set(H(22, 6), b.free(txTo), 1.2);
    lastOk = false;
  });
  panel.select('Baud rate in your code', [{ value: '115200', label: '115200' }, { value: '9600', label: '9600' }], String(baud), (v) => {
    baud = Number(v);
    lastOk = false;
  });
  const roM = panel.readout('Serial monitor');
  const note = panel.note('');

  async function send() {
    if (packets.busy) return;
    sendBtn.setAttribute('disabled', '');
    if (bus === 'uart') {
      const route = [H(22, 6).setY(0.8), ...jumperRoute(H(22, 6), b.free(txTo), 1.2), b.free(txTo).setY(0.9)];
      await packets.send(route, '#2f9e44', '$GPGGA…', 1.6);
      if (txTo === 'D17') {
        roM.set('(nothing arrives)', 'warn');
        monitor.set('Serial2: (silence)', 'warn');
        note.set('GPS TX is wired to the ESP32\'s TX2: two talkers, no listener. Cross them: TX → RX.', 'note warn');
        lastOk = false;
      } else if (baud !== GPS_BAUD) {
        roM.set('ÿ¤#@¬þ±§¢… (garbled)', 'warn');
        monitor.set('Serial2: ÿ¤#@¬þ±§¢', 'warn');
        note.set(`The wiring is right, but the code listens at ${baud} baud and the GPS talks at ${GPS_BAUD}.`, 'note warn');
        lastOk = false;
      } else {
        roM.set('$GPGGA,123519,4807.038,N,01131.000,E,1,08…', 'good');
        monitor.set('Serial2: $GPGGA,123519,4807.038,N…', 'good');
        note.set('Position data arrives cleanly: TX crossed to RX, and both sides at 9600 baud.', 'note');
        lastOk = true;
      }
    } else {
      // SPI: CS goes LOW, then the clock runs while data goes out (MOSI) and comes back (MISO).
      stage.flashGlow(sd.g, 1.4);
      await packets.send(spiRoutes.CS, '#8c4bd1', 'CS LOW', 0.8);
      await Promise.all([packets.send(spiRoutes.MOSI, '#ef7d1d', 'write', 1.0), packets.send(spiRoutes.SCK, '#efc22a', 'clock', 1.0)]);
      await packets.send([...spiRoutes.MISO].reverse(), '#2a68d1', 'OK', 1.0);
      roM.set('SD: log.csv written (SPI)', 'good');
      monitor.set('SD: wrote one line to log.csv', 'good');
      note.set('SPI uses four wires: the ESP32 picks the card with CS, sets the pace on SCK, sends on MOSI and listens on MISO.', 'note');
    }
    sendBtn.removeAttribute('disabled');
  }

  stage.onUpdate((dt) => packets.update(dt));
  monitor.set('Serial2: waiting…');
  stage.focusObjects = [b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'gpsTalk') return { ok: false };
      if (txTo !== 'D16') return { ok: false, msg: 'The GPS TX still goes to the ESP32\'s TX2. Cross it to RX2 (D16).' };
      if (baud !== GPS_BAUD) return { ok: false, msg: `The code listens at ${baud} baud, but the GPS talks at ${GPS_BAUD}.` };
      if (!lastOk) return { ok: false, msg: 'Now press Send (UART) to check the data comes through.' };
      return { ok: true };
    },
  };
}
