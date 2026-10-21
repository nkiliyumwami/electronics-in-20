import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { button, contactShadow, headerPin, mesh, qfp, smallBoard, smdLed, std, M } from '../../three/lib';
import { Wiring } from '../../tools/wiring';
import { gauge, pipe, pump, WATER_BLUE } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';
import { flowAlong } from '../kit';

/** Two AA cells in a holder, lying flat. */
function aaPack() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.25, 0.32, 1.05), M.plasticBlack(), [0, 0.16, 0]));
  for (const z of [-0.26, 0.26]) {
    g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.05, 20), std('#d7a226', 0.4, 0.3), [0, 0.42, z], [0, 0, Math.PI / 2]));
    g.add(mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.35, 20), std('#222', 0.5, 0.3), [-0.35, 0.42, z], [0, 0, Math.PI / 2]));
  }
  return g;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let pressed = false;
  let vB = 1.6; // board B's input, measured from B's own ground
  let readB = false;
  let noiseT = 0;
  let fault: 'none' | 'shortA' | 'sigToGnd' = 'none';

  // ---- two boards
  const mk = (x: number, label: string) => {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    g.add(smallBoard(3, 2.4));
    const chip = qfp(0.7, 6);
    chip.group.position.set(0, 0, -0.2);
    g.add(chip.group);
    const pack = aaPack();
    pack.position.set(0, -0.16, -2.1);
    g.add(pack);
    stage.real.add(g);
    stage.part(pack, { name: `Board ${label} battery`, job: `Powers board ${label}. Its − side is board ${label}'s own ground (0 V).`, symbol: 'battery' });
    stage.part(chip.group, { name: `Board ${label} chip`, job: label === 'A' ? 'Reads the button and drives the signal pin HIGH (3.3 V) when it is pressed.' : 'Reads its input pin and copies it to the LED.', symbol: 'chip' });
    stage.part(g.children[0], { name: `Board ${label}`, job: `A small circuit board. All of board ${label}'s voltages are measured from its own GND pin.`, symbol: 'pcb' });
    return g;
  };
  const A = mk(-2.1, 'A');
  const B = mk(2.1, 'B');
  stage.real.add(contactShadow(10, 7));
  const btn = button();
  btn.group.position.set(-0.8, 0, 0.6);
  A.add(btn.group);
  stage.part(btn.group, { name: "Board A's button", job: 'Press it and board A drives its signal pin HIGH.', symbol: 'button', actions: () => [{ label: pressed ? 'Release' : 'Press', run: () => setPressed(!pressed) }] });
  stage.onTap(btn.group, () => setPressed(!pressed));
  const ledB = smdLed('#ff3020');
  ledB.group.scale.setScalar(2.4);
  ledB.group.position.set(0.8, 0, 0.6);
  B.add(ledB.group);
  const ledGlow = new THREE.PointLight('#ff4020', 0, 1.2);
  ledGlow.position.set(0.8, 0.3, 0.6);
  B.add(ledGlow);
  stage.part(ledB.group, { name: "Board B's LED", job: 'Should light whenever board B reads its input as HIGH.', symbol: 'led' });

  // Header pins on the facing edges.
  const pins = [
    { id: 'aSig', label: 'A · SIG', board: A, x: 1.2, z: -0.35 },
    { id: 'aGnd', label: 'A · GND', board: A, x: 1.2, z: 0.45 },
    { id: 'bSig', label: 'B · SIG', board: B, x: -1.2, z: -0.35 },
    { id: 'bGnd', label: 'B · GND', board: B, x: -1.2, z: 0.45 },
  ];
  for (const p of pins) {
    const hp = headerPin();
    hp.position.set(p.x, 0, p.z);
    p.board.add(hp);
    stage.label(p.label.split(' · ')[1], p.board, new THREE.Vector3(p.x, 0.9, p.z));
    stage.part(hp, { name: `${p.label} pin`, job: p.id.endsWith('Gnd') ? 'Ground: this board\'s 0 V reference.' : 'Signal pin: carries the on/off message.', symbol: p.id.endsWith('Gnd') ? 'ground' : 'pin' });
  }
  stage.real.updateMatrixWorld(true);
  const snapPos = (p: (typeof pins)[number]) => new THREE.Vector3(p.board.position.x + p.x, 0.62, p.z);
  const wiring = new Wiring(stage, stage.real, pins.map((p) => ({ id: p.id, label: p.label, pos: snapPos(p) })), { height: 0.7 });
  wiring.canConnect = (a, b) => a[0] !== b[0];
  wiring.add('aSig', 'bSig', 'yellow');
  const status = stage.label('', B, new THREE.Vector3(0, 1.3, 0.2), 'big');

  // ---- water view: A's pump drives a hose to B's gauge; the gauge needs a return pipe
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(8, 5));
  const pm = pump();
  pm.group.position.set(-2, 0.5, 0);
  wg.add(pm.group);
  const gB = gauge(0.45);
  gB.group.position.set(2, 1.0, 0);
  wg.add(gB.group);
  const hose = pipe([new THREE.Vector3(-1.45, 0.5, 0), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1.8, 0.5, 0), new THREE.Vector3(1.8, 0.75, 0)], 0.08);
  wg.add(hose.mesh);
  const retPipe = pipe([new THREE.Vector3(2.2, 0.75, 0), new THREE.Vector3(2.2, 0.15, 0), new THREE.Vector3(0, 0.15, 0.5), new THREE.Vector3(-2, 0.15, 0.5), new THREE.Vector3(-2, 0.15, 0.2)], 0.08);
  wg.add(retPipe.mesh);
  const dangling = pipe([new THREE.Vector3(2.2, 0.75, 0), new THREE.Vector3(2.2, 0.15, 0), new THREE.Vector3(2.6, 0.15, 0.6)], 0.08);
  wg.add(dangling.mesh);
  const sigFlow = flowAlong(wg, [new THREE.Vector3(-1.45, 0.5, 0), new THREE.Vector3(1.8, 0.5, 0)], WATER_BLUE, { closed: false, radius: 0.045, spacing: 0.25 });
  stage.part(pm.group, { name: "A's pump (= board A's output pin)", job: 'Pushes pressure down the hose when A\'s button is pressed.', symbol: 'pump' });
  stage.part(gB.group, { name: "B's gauge (= board B's input)", job: 'Compares the hose pressure against its reference port. With no reference pipe it has nothing to compare against.', symbol: 'meter' });
  stage.part(retPipe.mesh, { name: 'Shared return pipe (= ground wire)', job: 'Gives B\'s gauge the same reference as A\'s pump, and lets the water flow back.', symbol: 'pipe' });
  const wLabel = stage.label('', wg, new THREE.Vector3(0, 1.6, 0), 'big water');

  // ---- controls
  const row = panel.row();
  const pressBtn = panel.button("Press A's button", () => setPressed(!pressed), 'btn primary', row);
  wiring.controls(panel);
  const scope = panel.chart("Scope: board B's input voltage, measured from B's own ground", 130);
  const roA = panel.readout("A's output");
  const roB = panel.readout('B reads');
  const roG = panel.readout('Shared ground?');
  const note = panel.note('');

  function setPressed(v: boolean) {
    pressed = v;
    btn.press(v);
    pressBtn.textContent = v ? "Release A's button" : "Press A's button";
    evaluate();
  }

  function evaluate() {
    const grounded = wiring.has('aGnd', 'bGnd');
    const signal = wiring.has('aSig', 'bSig');
    const shortA = wiring.has('aGnd', 'bSig') && signal;
    const sigToGnd = wiring.has('aSig', 'bGnd');
    fault = shortA ? 'shortA' : sigToGnd ? 'sigToGnd' : 'none';
    roG.set(grounded ? 'yes' : 'no', grounded ? 'good' : 'warn');
    retPipe.mesh.visible = grounded;
    dangling.mesh.visible = !grounded;
    if (fault === 'sigToGnd') note.set("Now B's ground is wired to A's signal pin. B's input and B's 0 V are on the same wire, so B always reads LOW.", 'note warn');
    else if (!signal) note.set('There is no signal wire between the boards now.', 'note warn');
    else if (!grounded) note.set('Only the signal wire joins the boards. B has no idea what A\'s 0 V is.', 'note');
    else note.set("Shared ground: B's LED now follows A's button.", 'note');
  }

  function failShort() {
    ctx.fx.sparks(new THREE.Vector3(-0.9, 0.7, 0), 25);
    ctx.fail({
      title: "What happened? A's output pin is shorted.",
      text: "That wire joins B's input to A's ground, and the signal wire joins B's input to A's output pin. So A's pin is wired straight to its own 0 V. When it drives HIGH, it pushes current into a dead short and could be damaged.",
      undo: () => {
        const w = wiring.wires.find((x) => (x.a === 'aGnd' && x.b === 'bSig') || (x.a === 'bSig' && x.b === 'aGnd'));
        if (w) wiring.remove(w.id);
      },
      undoLabel: 'Undo (remove that wire)',
    });
  }
  wiring.onChange = evaluate;

  const hist: number[] = [];
  let lastShort = false;
  stage.onUpdate((dt, t) => {
    const grounded = wiring.has('aGnd', 'bGnd');
    const signal = wiring.has('aSig', 'bSig');
    const aOut = pressed ? 3.3 : 0;
    noiseT += dt;
    if (fault === 'sigToGnd') vB = 0;
    else if (fault === 'shortA') vB = 0;
    else if (signal && grounded) vB += (aOut - vB) * Math.min(1, dt * 40);
    else {
      // Floating: B's input wanders around with nothing to hold it.
      vB += (Math.random() - 0.5) * 6 * dt + Math.sin(t * 7.3) * 2.5 * dt + (1.65 - vB) * dt * 0.8;
      vB = Math.max(-0.4, Math.min(3.8, vB));
    }
    if (fault === 'shortA' && pressed && !lastShort) failShort();
    lastShort = fault === 'shortA' && pressed;
    readB = vB > 2.0 ? true : vB < 1.0 ? false : Math.random() < 0.5;
    ledB.lens.emissiveIntensity = readB ? 3 : 0.05;
    ledGlow.intensity = readB ? 1.5 : 0;
    // Water twin.
    pm.spin(dt, pressed ? 4 : 0);
    sigFlow.speed = pressed ? 1.5 : 0;
    sigFlow.update(dt);
    gB.set(Math.max(0, Math.min(1, vB / 3.6)));
    wLabel.set(grounded && signal ? `B's gauge: ${pressed ? 'HIGH' : 'LOW'}` : "B's gauge: wobbling (no reference)");
    roA.set(pressed ? 'HIGH (3.3 V)' : 'LOW (0 V)');
    roB.set(readB ? 'HIGH' : 'LOW', grounded && signal && readB === pressed ? 'good' : 'warn');
    status.set(grounded && signal && fault === 'none' ? (readB ? 'B: LED on' : 'B: LED off') : 'B: glitching?', grounded && signal && fault === 'none' ? 'good' : 'warn');
    // Scope trace.
    hist.push(vB);
    if (hist.length > 240) hist.shift();
    drawScope();
  });

  function drawScope() {
    const { ctx: g, w, h } = prepCanvas(scope);
    const y = (v: number) => h - 10 - ((v + 0.5) / 4.5) * (h - 20);
    g.fillStyle = cssVar('--good-soft');
    g.fillRect(0, y(3.6), w, y(2.0) - y(3.6));
    g.fillStyle = cssVar('--warn-soft');
    g.fillRect(0, y(2.0), w, y(1.0) - y(2.0));
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('HIGH', 6, y(3.3));
    g.fillText('undefined', 6, y(1.5));
    g.fillText('LOW', 6, y(0.2));
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2;
    g.beginPath();
    hist.forEach((v, i) => {
      const x = (i / 239) * w;
      if (i) g.lineTo(x, y(v));
      else g.moveTo(x, y(v));
    });
    g.stroke();
  }

  evaluate();
  stage.focusObjects = [A, B];
  stage.enableWater(2.5);
  stage.frame({ dir: new THREE.Vector3(0, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'fixGround') return { ok: false };
      if (fault !== 'none') return { ok: false, msg: 'One of your wires creates a fault. Remove it first.' };
      if (!wiring.has('aSig', 'bSig')) return { ok: false, msg: 'The signal wire is missing.' };
      if (!wiring.has('aGnd', 'bGnd')) return { ok: false, msg: 'B still has no shared reference with A.' };
      return { ok: true };
    },
  };
}
