import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { h } from '../core/dom';
import { symbolSvg, type SymbolKey } from './symbols';
import { isShared } from './lib';

export interface PartAction {
  label: string;
  run: () => void;
}

export interface PartInfo {
  name: string;
  job: string;
  symbol: SymbolKey;
  actions?: () => PartAction[];
}

export type ViewMode = 'real' | 'both' | 'water';

export interface Label {
  obj: CSS2DObject;
  el: HTMLElement;
  set(text: string, cls?: string): void;
  show(v: boolean): void;
}

interface Draggable {
  obj: THREE.Object3D;
  plane: THREE.Plane;
  onMove: (p: THREE.Vector3) => void;
  onEnd: (p: THREE.Vector3) => void;
  onStart?: () => void;
}

let sharedRenderer: THREE.WebGLRenderer | null | undefined;

/**
 * Rendering quality. Desktops and laptops get soft real-time shadows; touch
 * devices (phones, tablets) keep the cheap blob shadows to hold 60 fps.
 * Override with ?hq or ?lowq.
 */
export const HIGH_QUALITY = (() => {
  const q = new URLSearchParams(location.search);
  if (q.has('hq')) return true;
  if (q.has('lowq')) return false;
  return !(window.matchMedia?.('(pointer: coarse)').matches ?? false);
})();
let sharedEnv: THREE.Texture | null = null;

/** Skip decorative motion for people who ask for less of it, and for test runs. */
export const CALM_MOTION =
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) || navigator.webdriver === true;

const GLOW_COLOR = '#ffb020';

interface Glow {
  obj: THREE.Object3D;
  overlays: THREE.Mesh[];
  mat: THREE.MeshBasicMaterial;
  /** Seconds left; Infinity while held (hover, hints). */
  left: number;
  peak: number;
}

interface Pointer {
  group: THREE.Group;
  target: THREE.Object3D;
  /** Arrow tip offset from the target's world position. */
  offset: THREE.Vector3;
  left: number;
  label: Label | null;
  glow: Glow;
}

function getRenderer(): THREE.WebGLRenderer | null {
  if (sharedRenderer !== undefined) return sharedRenderer;
  try {
    if (new URLSearchParams(location.search).has('nowebgl')) throw new Error('forced fallback');
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    if (HIGH_QUALITY) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    const pm = new THREE.PMREMGenerator(r);
    sharedEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    sharedRenderer = r;
  } catch {
    sharedRenderer = null;
  }
  return sharedRenderer;
}

export function webglAvailable(): boolean {
  return getRenderer() !== null;
}

/**
 * One 3D viewport. Scenes add objects to `root` (or to the real/water twins),
 * register parts for tooltips, and subscribe to the frame loop.
 */
export class Stage {
  readonly host: HTMLElement;
  readonly el: HTMLElement;
  readonly renderer: THREE.WebGLRenderer | null;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls | null = null;
  readonly root = new THREE.Group();
  /** Real-view group and water-view twin. Scenes without water only use `real`. */
  readonly real = new THREE.Group();
  readonly water = new THREE.Group();
  private labelRenderer: CSS2DRenderer | null = null;
  private updaters = new Set<(dt: number, t: number) => void>();
  private pickables: THREE.Object3D[] = [];
  private tapHandlers = new Map<THREE.Object3D, () => void>();
  private draggables: Draggable[] = [];
  private labels: Label[] = [];
  private camAnim: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; ft: THREE.Vector3; tt: THREE.Vector3 } | null = null;
  private glows: Glow[] = [];
  private pointers: Pointer[] = [];
  private hoverGlow: Glow | null = null;
  private interacted = false;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private tooltipEl: HTMLElement | null = null;
  private resizeObs: ResizeObserver | null = null;
  private disposed = false;
  private viewMode: ViewMode = 'real';
  private hasWater = false;
  private viewSeg: HTMLElement | null = null;
  private twinGap = 1.5;
  private framePad = 1.06;
  /** Fired when the view mode changes (scenes can relayout). */
  onViewChange: ((m: ViewMode) => void) | null = null;
  readonly fallback: boolean;

  constructor(host: HTMLElement, opts: { fallbackSvg?: string; fallbackText?: string } = {}) {
    this.host = host;
    this.el = h('div', { class: 'stage' });
    host.append(this.el);
    this.renderer = getRenderer();
    this.fallback = this.renderer === null;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    this.scene.add(this.root);
    this.root.add(this.real, this.water);
    this.water.visible = false;

    // Lighting: soft hemisphere + a key light; the room environment gives metals life.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f8a, HIGH_QUALITY ? 1.0 : 1.1));
    const key = new THREE.DirectionalLight(0xffffff, HIGH_QUALITY ? 1.9 : 1.6);
    key.position.set(4, 10, 6);
    this.scene.add(key, key.target);
    this.key = key;
    if (HIGH_QUALITY) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0003;
      key.shadow.normalBias = 0.02;
      key.shadow.radius = 4;
      // An invisible floor that only shows shadows.
      this.floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.22 }));
      this.floor.rotation.x = -Math.PI / 2;
      this.floor.receiveShadow = true;
      this.floor.userData.noFrame = true;
      this.scene.add(this.floor);
    }
    if (sharedEnv) this.scene.environment = sharedEnv;

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '3D scene. Drag to rotate, pinch or scroll to zoom. Use the controls below to interact.');
      canvas.tabIndex = 0;
      this.el.append(canvas);
      this.labelRenderer = new CSS2DRenderer();
      this.labelRenderer.domElement.className = 'labels';
      this.el.append(this.labelRenderer.domElement);
      const c = new OrbitControls(this.camera, canvas);
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      c.minDistance = 2;
      c.maxDistance = 40;
      c.maxPolarAngle = Math.PI * 0.49;
      c.enablePan = true;
      c.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };
      c.listenToKeyEvents(canvas);
      (this as { controls: OrbitControls | null }).controls = c;
      this.bindPointer(canvas);
      this.renderer.setAnimationLoop(() => this.tick());
    } else {
      const fb = h('div', { class: 'fallback' });
      fb.innerHTML = opts.fallbackSvg ?? '';
      fb.append(h('p', null, opts.fallbackText ?? '3D is not available on this device, so here is a flat diagram. Every control below still works.'));
      this.el.append(fb);
    }

    // Tools: reset camera.
    const tools = h('div', { class: 'stage-tools' });
    tools.append(
      (this.tourBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-pressed': 'false', title: 'Show me each part, one at a time', onclick: () => this.toggleTour() }, '▶ Tour')),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Reset camera', title: 'Reset camera', onclick: () => this.resetCamera() }, '⟲ View'),
    );
    if (this.fallback && this.tourBtn) this.tourBtn.hidden = true; // the tour needs the 3D view
    this.el.append(tools);

    // ?debug exposes the stage for scripted close-up screenshots.
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __stage: Stage }).__stage = this;

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.el);
    this.resize();
  }

  // ------------------------------------------------------------------ loop
  onUpdate(fn: (dt: number, t: number) => void): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  /** No-WebGL fallback: a static diagram of the scene's parts (symbol + name). */
  renderFallback() {
    if (!this.fallback) return;
    const fb = this.el.querySelector('.fallback');
    if (!fb) return;
    fb.querySelector('.fb-grid')?.remove();
    const grid = h('div', { class: 'fb-grid', role: 'img', 'aria-label': 'Diagram of the parts in this scene' });
    for (const p of this.listParts()) {
      grid.append(h('div', { class: 'fb-part' }, h('div', { class: 'tt-sym', html: symbolSvg(p.info.symbol), 'aria-hidden': 'true' }), h('span', null, p.info.name)));
    }
    fb.prepend(grid);
  }

  /** Run updaters without rendering (used by the no-WebGL fallback). */
  private fallbackTimer = 0;
  startFallbackLoop() {
    if (!this.fallback || this.fallbackTimer) return;
    let last = performance.now();
    const loop = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.elapsed += dt;
      for (const u of this.updaters) u(dt, this.elapsed);
      this.fallbackTimer = requestAnimationFrame(loop);
    };
    this.fallbackTimer = requestAnimationFrame(loop);
  }

  private tick() {
    if (this.disposed || !this.renderer) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    for (const u of this.updaters) u(dt, this.elapsed);
    // Scenes add and rebuild objects over time; refresh shadow flags twice a second.
    if (HIGH_QUALITY && ++this.shadowTick % 30 === 0) this.applyShadows();
    if (this.camAnim && this.controls) {
      const a = this.camAnim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = 1 - Math.pow(1 - a.t, 3);
      this.camera.position.lerpVectors(a.from, a.to, e);
      this.controls.target.lerpVectors(a.ft, a.tt, e);
      if (a.t >= 1) this.camAnim = null;
    }
    this.controls?.update();
    this.updateGuides(dt);
    for (const l of this.labels) {
      let vis = l.el.dataset.hidden !== '1';
      let o: THREE.Object3D | null = l.obj.parent; // not l.obj itself: its own flag is the output
      while (vis && o) {
        if (!o.visible) vis = false;
        o = o.parent;
      }
      l.obj.visible = vis;
    }
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer?.render(this.scene, this.camera);
  }

  private resize() {
    const w = this.el.clientWidth || 300;
    const hh = this.el.clientHeight || 300;
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(w, hh, false);
    this.labelRenderer?.setSize(w, hh);
  }

  // ---------------------------------------------------------------- camera
  /**
   * Frame the visible content. `dir` is the viewing direction (from target to camera).
   */
  frame(opts: { dir?: THREE.Vector3; pad?: number; objects?: THREE.Object3D[]; animate?: boolean } = {}) {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (opts.objects) for (const o of opts.objects) box.union(contentBox(o));
    else {
      // Real view: frame the focus objects if set; water view: everything.
      if (this.real.visible) for (const o of this.focusObjects ?? [this.real]) box.union(contentBox(o));
      if (this.water.visible && this.hasWater) box.union(contentBox(this.water));
      if (!this.hasWater) for (const o of this.root.children) if (o !== this.real && o !== this.water) box.union(contentBox(o));
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    this.applyShadows();
    this.fitShadows(opts.objects ? box : contentBox(this.root));
    const center = box.getCenter(new THREE.Vector3());
    const dir = (opts.dir ?? this.homeDir).clone().normalize();
    this.homeDir = dir.clone();
    this.framePad = opts.pad ?? this.framePad;
    // Camera basis looking along -dir.
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const tv = Math.tan(((this.camera.fov * Math.PI) / 180) / 2);
    const th = tv * this.camera.aspect;
    let dist = 0;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
      const f = c.dot(fwd);
      dist = Math.max(dist, Math.abs(c.dot(right)) / th - f, Math.abs(c.dot(upv)) / tv - f);
    }
    dist *= this.framePad;
    const pos = center.clone().add(dir.multiplyScalar(dist));
    if (this.controls) {
      this.controls.maxDistance = Math.max(8, dist * 2.2);
      this.controls.minDistance = Math.max(0.6, dist * 0.15);
    }
    if (opts.animate === false || !this.controls) {
      this.camera.position.copy(pos);
      this.controls?.target.copy(center);
      this.camera.lookAt(center);
    } else {
      this.animateTo(pos, center);
    }
  }
  private homeDir = new THREE.Vector3(0, 0.75, 1);
  private key!: THREE.DirectionalLight;
  private floor: THREE.Mesh | null = null;
  private shadowTick = 0;

  /** Let solid meshes cast and receive shadows (runs again as scenes change). */
  private applyShadows() {
    if (!HIGH_QUALITY) return;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || o.userData.noShadow) return;
      const mat = m.material as THREE.Material;
      const solid = !Array.isArray(mat) && !(mat.transparent && mat.opacity < 0.95) && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      m.castShadow = solid;
      m.receiveShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    });
    // Blob shadows are redundant when real shadows are on.
    this.root.traverse((o) => {
      if (o.userData.blobShadow) o.visible = false;
    });
  }

  /** Aim the shadow camera at the content and put the floor under it. */
  private fitShadows(box: THREE.Box3) {
    if (!HIGH_QUALITY || box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(2, box.getSize(new THREE.Vector3()).length() / 2);
    this.key.target.position.copy(c);
    this.key.position.copy(c).add(new THREE.Vector3(0.45, 1, 0.6).normalize().multiplyScalar(r * 3));
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -r * 1.2;
    cam.right = cam.top = r * 1.2;
    cam.near = 0.1;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
    if (this.floor) this.floor.position.y = box.min.y - 0.005;
  }
  /** Objects the camera frames in the real view (default: everything). */
  focusObjects: THREE.Object3D[] | null = null;

  resetCamera() {
    this.frame({ animate: true });
  }

  private animateTo(pos: THREE.Vector3, target: THREE.Vector3, dur = 0.6) {
    if (!this.controls) return;
    this.camAnim = { t: 0, dur, from: this.camera.position.clone(), to: pos.clone(), ft: this.controls.target.clone(), tt: target.clone() };
  }

  /** Swing the camera in from a wider angle to the framed view (once, on lesson start). */
  intro() {
    if (!this.controls || CALM_MOTION) return;
    const to = this.camera.position.clone();
    const tt = this.controls.target.clone();
    const off = to.clone().sub(tt).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55).multiplyScalar(1.45);
    off.y *= 1.25;
    this.camera.position.copy(tt).add(off);
    this.animateTo(to, tt, 1.3);
  }

  /** Smoothly point the camera at an object (keeps the current viewing angle). */
  focus(obj: THREE.Object3D, distance = 4) {
    if (!this.controls) return;
    const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.animateTo(c.clone().add(dir.multiplyScalar(distance)), c);
  }

  // ------------------------------------------------------- water ⇄ real
  /** Enable the water twin. Content goes into `this.real` and `this.water`. Wide scenes can start in 'real'. */
  enableWater(gap = 1.5, start?: ViewMode) {
    this.hasWater = true;
    this.twinGap = gap;
    const seg = h('div', { class: 'viewseg', role: 'group', 'aria-label': 'Water view or real view' });
    const modes: [ViewMode, string][] = [
      ['real', 'Real'],
      ['both', 'Both'],
      ['water', 'Water'],
    ];
    for (const [m, label] of modes) {
      const b = h('button', { type: 'button', 'aria-pressed': String(m === this.viewMode) }, label);
      b.addEventListener('click', () => this.setView(m));
      seg.append(b);
    }
    this.viewSeg = seg;
    this.el.append(seg);
    // Wide screens start side by side; phones start with the real view.
    this.setView(start ?? (this.el.clientWidth >= 640 ? 'both' : 'real'), false);
  }

  setView(m: ViewMode, animate = true) {
    this.viewMode = m;
    this.viewSeg?.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(['real', 'both', 'water'][i] === m)));
    this.layoutTwins();
    this.frame({ animate });
    this.onViewChange?.(m);
  }

  get view(): ViewMode {
    return this.viewMode;
  }

  /** Re-layout after content size changes. */
  layoutTwins() {
    if (!this.hasWater) return;
    const m = this.viewMode;
    this.real.visible = m !== 'water';
    this.water.visible = m !== 'real';
    this.real.position.x = 0;
    this.water.position.x = 0;
    if (m === 'both') {
      this.root.updateMatrixWorld(true);
      const rb = new THREE.Box3();
      for (const o of this.focusObjects ?? [this.real]) rb.union(contentBox(o));
      const wb = contentBox(this.water);
      const rw = rb.isEmpty() ? 0 : rb.max.x - rb.min.x;
      const ww = wb.isEmpty() ? 0 : wb.max.x - wb.min.x;
      const rc = rb.isEmpty() ? 0 : (rb.max.x + rb.min.x) / 2;
      const wc = wb.isEmpty() ? 0 : (wb.max.x + wb.min.x) / 2;
      const total = rw + ww + this.twinGap;
      this.real.position.x = -total / 2 + rw / 2 - rc;
      this.water.position.x = total / 2 - ww / 2 - wc;
    }
  }

  // ---------------------------------------------------------------- labels
  label(text: string, parent: THREE.Object3D, offset = new THREE.Vector3(), cls = ''): Label {
    const el = h('div', { class: `lbl ${cls}` }, text);
    const obj = new CSS2DObject(el);
    obj.position.copy(offset);
    parent.add(obj);
    const l: Label = {
      obj,
      el,
      set: (t, c) => {
        if (el.textContent !== t) el.textContent = t;
        if (c !== undefined) {
          const want = `lbl ${c}`;
          if (el.className !== want) {
            el.className = want;
            // A quick pop draws the eye to a label that just changed state.
            if (c && !CALM_MOTION) el.animate?.([{ scale: '1' }, { scale: '1.22' }, { scale: '1' }], { duration: 380, easing: 'ease-out' });
          }
        }
      },
      show: (v) => {
        el.dataset.hidden = v ? '0' : '1';
      },
    };
    this.labels.push(l);
    return l;
  }

  // ---------------------------------------------------- parts & tooltips
  /** Make an object tappable; tapping shows name, job and symbol. */
  part(obj: THREE.Object3D, info: PartInfo) {
    obj.userData.part = info;
    this.pickables.push(obj);
    this.partsChanged?.();
    return obj;
  }
  partsChanged: (() => void) | null = null;

  /** All registered parts, for the keyboard-accessible parts list. */
  listParts(): { obj: THREE.Object3D; info: PartInfo }[] {
    const seen = new Set<string>();
    const out: { obj: THREE.Object3D; info: PartInfo }[] = [];
    for (const o of this.pickables) {
      const info = o.userData.part as PartInfo;
      if (!info || seen.has(info.name)) continue;
      let hidden = false;
      let p: THREE.Object3D | null = o;
      for (; p && p !== this.root; p = p.parent) {
        // Hidden parts are skipped, except whole twins hidden by the view toggle.
        if (!p.visible && p !== this.real && p !== this.water) hidden = true;
      }
      if (hidden || p !== this.root) continue; // hidden, or removed from the scene
      seen.add(info.name);
      out.push({ obj: o, info });
    }
    return out;
  }

  /** Tap handler that runs instead of the tooltip (for direct manipulation). */
  onTap(obj: THREE.Object3D, fn: () => void) {
    this.tapHandlers.set(obj, fn);
    if (!this.pickables.includes(obj)) this.pickables.push(obj);
  }

  showTooltip(info: PartInfo, at?: { x: number; y: number }, takeFocus = true) {
    this.hideTooltip();
    const actions = info.actions?.() ?? [];
    const close = h('button', { class: 'tt-close', type: 'button', 'aria-label': 'Close' }, '×');
    const tip = h(
      'div',
      { class: 'tooltip', role: 'dialog', 'aria-label': info.name },
      close,
      h('div', { class: 'tt-head' }, h('div', { class: 'tt-sym', html: symbolSvg(info.symbol), 'aria-hidden': 'true' }), h('strong', null, info.name)),
      h('p', null, info.job),
      actions.length
        ? h(
            'div',
            { class: 'btnrow', style: { marginTop: '8px' } },
            actions.map((a) =>
              h('button', { class: 'btn small', type: 'button', onclick: () => { this.markInteracted(); a.run(); this.hideTooltip(); } }, a.label),
            ),
          )
        : null,
    );
    close.addEventListener('click', () => {
      this.stopTour();
      this.hideTooltip();
    });
    tip.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideTooltip();
    });
    this.el.append(tip);
    const w = this.el.clientWidth;
    const hh = this.el.clientHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let x = at ? at.x + 12 : (w - tw) / 2;
    let y = at ? at.y - th / 2 : hh - th - 12;
    x = Math.max(8, Math.min(w - tw - 8, x));
    y = Math.max(8, Math.min(hh - th - 8, y));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    this.tooltipEl = tip;
    if (takeFocus) (actions.length ? tip.querySelector<HTMLElement>('.btnrow button') : close)?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ part tour
  private tourBtn: HTMLElement | null = null;
  private tour: { i: number; next: number; parts: { obj: THREE.Object3D; info: PartInfo }[] } | null = null;
  private static readonly TOUR_STEP = 3.2;

  /** Walk through every part: arrow, glow and its tooltip, a few seconds each. */
  toggleTour() {
    if (this.tour) return this.stopTour();
    const parts = this.listParts();
    if (!parts.length) return;
    this.tour = { i: -1, next: 0, parts };
    this.tourBtn?.setAttribute('aria-pressed', 'true');
    if (this.tourBtn) this.tourBtn.textContent = '■ Stop';
    this.markInteracted();
    this.tourStep();
  }

  stopTour() {
    if (!this.tour) return;
    this.tour = null;
    this.tourBtn?.setAttribute('aria-pressed', 'false');
    if (this.tourBtn) this.tourBtn.textContent = '▶ Tour';
    this.hideTooltip();
  }

  private tourStep() {
    const tr = this.tour;
    if (!tr) return;
    tr.i++;
    if (tr.i >= tr.parts.length) return this.stopTour();
    tr.next = this.elapsed + Stage.TOUR_STEP;
    const { obj, info } = tr.parts[tr.i];
    this.spotlight(obj, Stage.TOUR_STEP);
    // Card along the bottom edge, so the arrow and the part stay in view.
    this.showTooltip({ ...info, name: `${tr.i + 1}/${tr.parts.length} · ${info.name}`, actions: undefined }, undefined, false);
  }

  hideTooltip() {
    this.tooltipEl?.remove();
    this.tooltipEl = null;
  }

  // ------------------------------------------------------------- dragging
  /** Drag an object across a plane (default: horizontal plane through it). */
  draggable(obj: THREE.Object3D, o: { onMove: (p: THREE.Vector3) => void; onEnd: (p: THREE.Vector3) => void; onStart?: () => void; plane?: THREE.Plane }) {
    const wp = obj.getWorldPosition(new THREE.Vector3());
    const plane = o.plane ?? new THREE.Plane(new THREE.Vector3(0, 1, 0), -wp.y);
    this.draggables.push({ obj, plane, onMove: o.onMove, onEnd: o.onEnd, onStart: o.onStart });
  }

  private ray = new THREE.Raycaster();
  private ndc(e: PointerEvent, canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hitList(list: THREE.Object3D[], e: PointerEvent, canvas: HTMLCanvasElement) {
    this.ray.setFromCamera(this.ndc(e, canvas), this.camera);
    const vis = list.filter((o) => {
      let p: THREE.Object3D | null = o;
      while (p) {
        if (!p.visible) return false;
        if (p === this.scene) return true;
        p = p.parent;
      }
      return false; // not attached to the scene any more
    });
    return this.ray.intersectObjects(vis, true);
  }

  private owner(obj: THREE.Object3D, set: (o: THREE.Object3D) => boolean): THREE.Object3D | null {
    let p: THREE.Object3D | null = obj;
    while (p) {
      if (set(p)) return p;
      p = p.parent;
    }
    return null;
  }

  private bindPointer(canvas: HTMLCanvasElement) {
    let down: { x: number; y: number; id: number } | null = null;
    let drag: Draggable | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      this.stopTour();
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      const hits = this.hitList(this.draggables.map((d) => d.obj), e, canvas);
      if (hits.length) {
        const own = this.owner(hits[0].object, (o) => this.draggables.some((d) => d.obj === o));
        drag = this.draggables.find((d) => d.obj === own) ?? null;
        if (drag) {
          this.markInteracted();
          if (this.controls) this.controls.enabled = false;
          canvas.setPointerCapture(e.pointerId);
          drag.onStart?.();
          this.hideTooltip();
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) {
        if (e.pointerType === 'mouse') {
          const hits = this.hitList([...this.pickables, ...this.draggables.map((d) => d.obj)], e, canvas);
          canvas.style.cursor = hits.length ? 'pointer' : '';
          const own = hits.length
            ? this.owner(hits[0].object, (o) => this.tapHandlers.has(o) || this.draggables.some((d) => d.obj === o) || !!o.userData.part)
            : null;
          this.setHover(own);
        }
        return;
      }
      this.ray.setFromCamera(this.ndc(e, canvas), this.camera);
      const p = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(drag.plane, p)) drag.onMove(p);
    });
    const up = (e: PointerEvent) => {
      if (drag) {
        this.ray.setFromCamera(this.ndc(e, canvas), this.camera);
        const p = new THREE.Vector3();
        if (this.ray.ray.intersectPlane(drag.plane, p)) drag.onEnd(p);
        else drag.onEnd(drag.obj.getWorldPosition(new THREE.Vector3()));
        drag = null;
        if (this.controls) this.controls.enabled = true;
        down = null;
        return;
      }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 8) return;
      const hits = this.hitList(this.pickables, e, canvas);
      if (!hits.length) {
        this.hideTooltip();
        return;
      }
      const tapOwner = this.owner(hits[0].object, (o) => this.tapHandlers.has(o));
      if (tapOwner) {
        this.markInteracted();
        this.flashGlow(tapOwner, 0.6);
        this.tapHandlers.get(tapOwner)!();
        return;
      }
      const partOwner = this.owner(hits[0].object, (o) => !!o.userData.part);
      if (partOwner) {
        this.markInteracted();
        this.flashGlow(partOwner, 1.0);
        const r = canvas.getBoundingClientRect();
        this.showTooltip(partOwner.userData.part, { x: e.clientX - r.left, y: e.clientY - r.top });
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointerleave', () => this.setHover(null));
    canvas.addEventListener('pointercancel', () => {
      drag = null;
      down = null;
      if (this.controls) this.controls.enabled = true;
    });
  }

  // ------------------------------------------------------ guides & glow
  /**
   * Tint every mesh of `obj` with a soft pulsing glow. Overlays reuse the
   * part's geometry and never touch its materials, so scenes stay in charge
   * of colour and brightness.
   */
  private makeGlow(obj: THREE.Object3D, left: number, peak: number): Glow {
    const mat = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const hosts: THREE.Mesh[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || o.userData.glow || o.userData.blobShadow) return;
      const mm = m.material as THREE.Material;
      if (!Array.isArray(mm) && mm.visible === false) return; // invisible grab volumes
      hosts.push(m);
    });
    const overlays = hosts.map((m) => {
      const g = new THREE.Mesh(m.geometry, mat);
      g.userData.glow = g.userData.noFrame = g.userData.noShadow = true;
      g.raycast = () => {};
      g.renderOrder = 4;
      m.add(g);
      return g;
    });
    const glow: Glow = { obj, overlays, mat, left, peak };
    this.glows.push(glow);
    return glow;
  }

  private dropGlow(g: Glow) {
    for (const o of g.overlays) o.removeFromParent();
    g.mat.dispose();
    this.glows = this.glows.filter((x) => x !== g);
  }

  /** A short glow that confirms which part was tapped. */
  flashGlow(obj: THREE.Object3D, seconds = 1) {
    if (CALM_MOTION) return;
    for (const g of [...this.glows]) if (g.obj === obj && g.left !== Infinity) this.dropGlow(g);
    this.makeGlow(obj, seconds, 0.55);
  }

  private setHover(obj: THREE.Object3D | null) {
    if (this.hoverGlow?.obj === obj) return;
    if (this.hoverGlow) this.dropGlow(this.hoverGlow);
    this.hoverGlow = obj ? this.makeGlow(obj, Infinity, 0.28) : null;
  }

  /** A bobbing arrow (with optional text) above an object, plus a glow on it. */
  private addPointer(target: THREE.Object3D, text: string, left: number): Pointer {
    this.root.updateMatrixWorld(true);
    const box = contentBox(target);
    const wp = target.getWorldPosition(new THREE.Vector3());
    const top = box.isEmpty() ? wp.clone() : new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    const group = new THREE.Group();
    group.userData.noFrame = true;
    const mat = new THREE.MeshBasicMaterial({ color: GLOW_COLOR, depthTest: false, transparent: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 20), mat);
    cone.rotation.x = Math.PI; // points down
    cone.position.y = 0.18;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12), mat);
    stem.position.y = 0.52;
    for (const m of [cone, stem]) {
      m.renderOrder = 20;
      m.raycast = () => {};
      m.userData.noShadow = true;
    }
    group.add(cone, stem);
    this.scene.add(group);
    const p: Pointer = { group, target, offset: top.sub(wp).add(new THREE.Vector3(0, 0.12, 0)), left, label: null, glow: this.makeGlow(target, left, 0.45) };
    if (text) p.label = this.label(text, group, new THREE.Vector3(0, 0.95, 0), 'hint');
    this.pointers.push(p);
    this.placePointer(p, 0);
    return p;
  }

  private dropPointer(p: Pointer) {
    p.group.removeFromParent();
    p.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    ((p.group.children[0] as THREE.Mesh).material as THREE.Material).dispose();
    if (p.label) {
      p.label.obj.removeFromParent(); // fires 'removed', which takes the HTML element out
      this.labels = this.labels.filter((l) => l !== p.label);
    }
    this.dropGlow(p.glow);
    this.pointers = this.pointers.filter((x) => x !== p);
  }

  private placePointer(p: Pointer, t: number) {
    p.group.position.copy(p.target.getWorldPosition(new THREE.Vector3())).add(p.offset);
    p.group.position.y += CALM_MOTION ? 0.1 : 0.1 + Math.abs(Math.sin(t * 3.2)) * 0.22;
    // Constant on-screen size, whatever the zoom.
    p.group.scale.setScalar(Math.max(0.4, this.camera.position.distanceTo(p.group.position) * 0.095));
    let vis = true;
    for (let o: THREE.Object3D | null = p.target; o; o = o.parent) if (!o.visible) vis = false;
    p.group.visible = vis;
  }

  /**
   * "Start here": point at the object the learner should touch first. It stays
   * until they tap, drag or use a control. Returns a function that removes it.
   */
  hint(obj: THREE.Object3D, text: string): () => void {
    if (!this.renderer || this.interacted) return () => {};
    const p = this.addPointer(obj, text, Infinity);
    this.hasHint = true;
    return () => {
      if (this.pointers.includes(p)) this.dropPointer(p);
    };
  }
  hasHint = false;

  /** Show where a part is: glow plus arrow for a few seconds. */
  spotlight(obj: THREE.Object3D, seconds = 2.8) {
    if (!this.renderer) return;
    for (const p of [...this.pointers]) if (p.left !== Infinity) this.dropPointer(p);
    this.addPointer(obj, '', seconds);
  }

  /** The learner did something: retire every "start here" hint. */
  markInteracted() {
    if (this.interacted) return;
    this.interacted = true;
    for (const p of [...this.pointers]) if (p.left === Infinity) this.dropPointer(p);
    this.onFirstInteraction?.();
  }
  onFirstInteraction: (() => void) | null = null;

  private updateGuides(dt: number) {
    const t = this.elapsed;
    if (this.tour && t >= this.tour.next) this.tourStep();
    for (const p of [...this.pointers]) {
      p.left -= dt;
      if (p.left <= 0) this.dropPointer(p);
      else this.placePointer(p, t);
    }
    for (const g of [...this.glows]) {
      g.left -= dt;
      if (g.left <= 0) {
        this.dropGlow(g);
        continue;
      }
      const pulse = CALM_MOTION ? 1 : 0.6 + 0.4 * Math.sin(t * 6);
      const fade = g.left === Infinity ? 1 : Math.min(1, g.left / 0.4);
      g.mat.opacity = g.peak * pulse * fade;
    }
  }

  /** Top centre of what the camera frames, in world space (for celebrations). */
  focusTop(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (this.real.visible) for (const o of this.focusObjects ?? [this.real]) box.union(contentBox(o));
    if (box.isEmpty()) box.union(contentBox(this.root));
    if (box.isEmpty()) return new THREE.Vector3();
    return new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.3, (box.min.z + box.max.z) / 2);
  }

  /** Project a world point to stage pixel coordinates. */
  toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.el.clientWidth, y: ((1 - v.y) / 2) * this.el.clientHeight };
  }

  get time() {
    return this.elapsed;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.fallbackTimer);
    this.resizeObs?.disconnect();
    this.controls?.dispose();
    this.renderer?.setAnimationLoop(null);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => !isShared(x) && x.dispose());
      else if (mat && !isShared(mat)) mat.dispose();
    });
    this.renderer?.renderLists.dispose();
    this.el.remove();
  }
}

/** Bounding box of visible meshes, skipping helpers marked userData.noFrame. */
function contentBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noFrame) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && m.geometry) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      box.union(tmp);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return box;
}
