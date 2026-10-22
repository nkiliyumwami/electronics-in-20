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
  private camAnim: { t: number; from: THREE.Vector3; to: THREE.Vector3; ft: THREE.Vector3; tt: THREE.Vector3 } | null = null;
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
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Reset camera', title: 'Reset camera', onclick: () => this.resetCamera() }, '⟲ View'),
    );
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
      a.t = Math.min(1, a.t + dt / 0.6);
      const e = 1 - Math.pow(1 - a.t, 3);
      this.camera.position.lerpVectors(a.from, a.to, e);
      this.controls.target.lerpVectors(a.ft, a.tt, e);
      if (a.t >= 1) this.camAnim = null;
    }
    this.controls?.update();
    for (const l of this.labels) {
      let vis = l.el.dataset.hidden !== '1';
      let o: THREE.Object3D | null = l.obj;
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

  private animateTo(pos: THREE.Vector3, target: THREE.Vector3) {
    if (!this.controls) return;
    this.camAnim = { t: 0, from: this.camera.position.clone(), to: pos.clone(), ft: this.controls.target.clone(), tt: target.clone() };
  }

  /** Smoothly point the camera at an object (keeps the current viewing angle). */
  focus(obj: THREE.Object3D, distance = 4) {
    if (!this.controls) return;
    const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.animateTo(c.clone().add(dir.multiplyScalar(distance)), c);
  }

  // ------------------------------------------------------- water ⇄ real
  /** Enable the water twin. Content goes into `this.real` and `this.water`. */
  enableWater(gap = 1.5) {
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
    this.setView(this.el.clientWidth >= 640 ? 'both' : 'real', false);
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
          if (el.className !== want) el.className = want;
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

  showTooltip(info: PartInfo, at?: { x: number; y: number }) {
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
              h('button', { class: 'btn small', type: 'button', onclick: () => { a.run(); this.hideTooltip(); } }, a.label),
            ),
          )
        : null,
    );
    close.addEventListener('click', () => this.hideTooltip());
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
    (actions.length ? tip.querySelector<HTMLElement>('.btnrow button') : close)?.focus({ preventScroll: true });
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
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      const hits = this.hitList(this.draggables.map((d) => d.obj), e, canvas);
      if (hits.length) {
        const own = this.owner(hits[0].object, (o) => this.draggables.some((d) => d.obj === o));
        drag = this.draggables.find((d) => d.obj === own) ?? null;
        if (drag) {
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
        this.tapHandlers.get(tapOwner)!();
        return;
      }
      const partOwner = this.owner(hits[0].object, (o) => !!o.userData.part);
      if (partOwner) {
        const r = canvas.getBoundingClientRect();
        this.showTooltip(partOwner.userData.part, { x: e.clientX - r.left, y: e.clientY - r.top });
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => {
      drag = null;
      down = null;
      if (this.controls) this.controls.enabled = true;
    });
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
