import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real d3 projection and geometry algorithms. Only the browser's
// drawing surface and event delivery are replaced; no rendering math is mocked.
vm.runInThisContext(readFileSync(new URL('../docs/lib/d3.v7.min.js', import.meta.url), 'utf8'));
let nextFrame = 0, pathCount = 0;
const frames = new Map();
globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.Path2D = class {
  constructor() { pathCount++; }
  moveTo() {} lineTo() {} closePath() {} arc() {}
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.devicePixelRatio = 2;
globalThis.window = new EventTarget();

class Canvas extends EventTarget {
  constructor() {
    super();
    this.style = {};
    this.captured = new Set();
    this.classList = { add() {}, remove() {} };
    this.box = { left: 20, top: 50, width: 800, height: 500 };
    this.parentElement = { getBoundingClientRect: () => this.box };
    this.context = new Proxy({ measureText: text => ({ width: text.length * 7 }) }, {
      get(target, key) { return key in target ? target[key] : () => {}; },
      set(target, key, value) { target[key] = value; return true; },
    });
  }
  getContext() { return this.context; }
  getBoundingClientRect() { return this.box; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  focus() { document.activeElement = this; }
}
globalThis.document = { createElement: () => new Canvas(), activeElement: null };
const { createMap } = await import('../docs/js/map.js');

function flush() {
  for (let attempts = 0; frames.size && attempts < 10; attempts++) {
    const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback());
  }
  assert.equal(frames.size, 0, 'rendering settles without an animation loop');
}
function event(target, type, props = {}) {
  const item = new Event(type, { cancelable: true });
  Object.assign(item, { button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', ...props });
  target.dispatchEvent(item);
  return item;
}
function click(canvas, x, y) {
  const props = { clientX: x + canvas.box.left, clientY: y + canvas.box.top };
  event(canvas, 'pointerdown', props);
  event(canvas, 'pointerup', { ...props, buttons: 0 });
  flush();
}
function near(actual, expected, tolerance = 1e-6) { assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`); }
function camera(view, canvas) {
  const { width, height } = canvas.box;
  const padding = width < 600 ? 12 : 26;
  const projection = (view.projection === 'globe' ? d3.geoOrthographic() : d3.geoEqualEarth())
    .fitExtent([[padding, padding], [width - padding, height - padding]], { type: 'Sphere' });
  projection.scale(projection.scale() * view.zoom).translate([width / 2 + view.panX, height / 2 + view.panY]);
  if (view.projection === 'globe') projection.rotate(view.rotation);
  return projection;
}
function polity(k, extent, area) {
  return { k, n: k, a: area, lp: [0, 0], g: { type: 'Polygon', coordinates: [[[-extent, -extent], [-extent, extent], [extent, extent], [extent, -extent], [-extent, -extent]]] } };
}

test('smallest overlapping polity wins; selection and hover reuse projected geometry', () => {
  const canvas = new Canvas();
  let selection, hover;
  const map = createMap(canvas, { onSelect: value => { selection = value; }, onHover: value => { hover = value; } });
  const outer = polity('Empire', 30, 10000), inner = polity('Enclave', 5, 100);
  map.setSnapshot([inner, outer]); flush();
  const count = pathCount;
  click(canvas, 400, 250);
  assert.equal(selection.k, 'Enclave');
  map.setSelected('Enclave'); flush();
  assert.equal(pathCount, count, 'selection does not reproject geometry');
  click(canvas, 400, 250);
  assert.equal(selection, null, 'clicking the selected polity deselects it');
  event(canvas, 'pointermove', { clientX: 420, clientY: 300, buttons: 0 }); flush();
  assert.equal(hover.polity.k, 'Enclave');
  assert.deepEqual([hover.x, hover.y], [400, 250], 'tooltip coordinates account for the canvas offset');
  assert.equal(pathCount, count, 'hover does not reproject geometry');
  map.setSnapshot([outer, inner], []); flush();
  assert.equal(pathCount, count, 'a quiet year with unchanged geometry reuses projected paths');
  click(canvas, 2, 2);
  assert.equal(selection, null, 'outside-world clicks do not select a polygon');
  map.destroy();
});

test('camera center survives viewport changes and projection switching', () => {
  const canvas = new Canvas(), map = createMap(canvas);
  map.setView({ zoom: 3, center: [65, 25] }); flush();
  near(map.getView().center[0], 65); near(map.getView().center[1], 25);
  canvas.box.width = 480; canvas.box.height = 660; map.resize(); flush();
  near(map.getView().center[0], 65); near(map.getView().center[1], 25);
  map.setProjection('globe'); flush();
  near(map.getView().center[0], 65); near(map.getView().center[1], 25);
  map.setProjection('flat'); flush();
  near(map.getView().center[0], 65); near(map.getView().center[1], 25);
  map.destroy();
});

test('wheel zoom remains anchored under the pointer in either projection', () => {
  for (const mode of ['flat', 'globe']) {
    const canvas = new Canvas(), map = createMap(canvas);
    map.setProjection(mode); flush();
    const point = [460, 280];
    const coordinate = camera(map.getView(), canvas).invert(point);
    const wheel = event(canvas, 'wheel', { clientX: point[0] + 20, clientY: point[1] + 50, deltaY: -130, deltaMode: 0 }); flush();
    assert.equal(wheel.defaultPrevented, true);
    const result = camera(map.getView(), canvas)(coordinate);
    near(result[0], point[0]); near(result[1], point[1]);
    map.destroy();
  }
});

test('shared globe camera restores cursor-anchored translation using its geographic center', () => {
  const canvas = new Canvas(), map = createMap(canvas);
  map.setProjection('globe'); flush();
  event(canvas, 'wheel', { clientX: 600, clientY: 270, deltaY: -240, deltaMode: 0 }); flush();
  const original = map.getView();
  assert.notEqual(original.panX, 0, 'zoom moved the globe away from the viewport center');
  const restoredCanvas = new Canvas(), restoredMap = createMap(restoredCanvas);
  restoredMap.setView({ projection: 'globe', zoom: original.zoom, rotation: original.rotation, center: original.center }); flush();
  near(restoredMap.getView().panX, original.panX); near(restoredMap.getView().panY, original.panY);
  const point = [35, 25];
  const before = camera(original, canvas)(point), after = camera(restoredMap.getView(), restoredCanvas)(point);
  near(before[0], after[0]); near(before[1], after[1]);
  canvas.box.width = 520; map.resize(); flush();
  near(map.getView().center[0], original.center[0]); near(map.getView().center[1], original.center[1]);
  map.destroy(); restoredMap.destroy();
});

test('globe rejects both hidden hemisphere geometry and clicks outside the sphere', () => {
  const canvas = new Canvas(); let selection;
  const map = createMap(canvas, { onSelect: value => { selection = value; } });
  map.setProjection('globe');
  map.setView({ rotation: [0, 0] });
  const rear = { k: 'Rear', n: 'Rear', a: 1000, lp: [180, 0], g: { type: 'Polygon', coordinates: [[[170, -10], [170, 10], [-170, 10], [-170, -10], [170, -10]]] } };
  map.setSnapshot([rear]); flush();
  click(canvas, 400, 250);
  assert.equal(selection, null, 'a hidden polity cannot be selected through the globe');
  // This large polygon reaches the visible limb. Inversion beyond the disc
  // produces a finite coordinate in d3, but must still be rejected by the map.
  const front = { k: 'Limb', n: 'Limb', a: 10000, lp: [70, 0], g: { type: 'Polygon', coordinates: [[[40, -80], [40, 80], [140, 80], [140, -80], [40, -80]]] } };
  map.setSnapshot([front]); flush();
  const projection = camera(map.getView(), canvas);
  const outside = [projection.translate()[0] + projection.scale() + 3, 250];
  assert.ok(projection.invert(outside).every(Number.isFinite), 'test exercises d3 outside-disc inversion');
  click(canvas, ...outside);
  assert.equal(selection, null, 'screen bounds and round-trip validation reject the outside-disc point');
  map.destroy();
});

test('pointer cancel and missed mouseup cannot leave the camera dragging', () => {
  const canvas = new Canvas(), map = createMap(canvas);
  const down = { clientX: 420, clientY: 300 };
  event(canvas, 'pointerdown', { ...down, button: 2 });
  event(canvas, 'pointermove', { clientX: 480, clientY: 300, buttons: 2 }); flush();
  near(map.getView().panX, 0, 1e-5);
  event(canvas, 'pointerdown', down);
  event(canvas, 'pointermove', { clientX: 440, clientY: 300 }); flush();
  const panned = map.getView().panX;
  assert.ok(panned > 0);
  event(canvas, 'pointercancel');
  event(canvas, 'pointermove', { clientX: 700, clientY: 300, buttons: 0 }); flush();
  near(map.getView().panX, panned);
  event(canvas, 'pointerdown', down);
  event(canvas, 'pointermove', { clientX: 700, clientY: 300, buttons: 0 }); flush();
  near(map.getView().panX, panned);
  assert.equal(canvas.captured.size, 0);
  map.destroy();
});

test('keyboard controls affect the focused canvas without hijacking page keys', () => {
  const canvas = new Canvas(), map = createMap(canvas);
  event(window, 'keydown', { key: 'ArrowRight' }); flush();
  near(map.getView().panX, 0, 1e-5);
  canvas.focus();
  const key = event(canvas, 'keydown', { key: 'ArrowRight' }); flush();
  assert.equal(key.defaultPrevented, true); near(map.getView().panX, -40);
  event(canvas, 'keydown', { key: 'Home' }); flush();
  near(map.getView().panX, 0); near(map.getView().zoom, 1);
  map.destroy();
});

test('late font loading remeasures labels without rebuilding geometry', async () => {
  let finishFont, measurements = 0;
  document.fonts = { load: () => new Promise(resolve => { finishFont = resolve; }) };
  const canvas = new Canvas(), map = createMap(canvas);
  canvas.context.measureText = text => { measurements++; return { width: text.length * 7 }; };
  map.setSnapshot([polity('Empire', 30, 10000)]); flush();
  const before = measurements, paths = pathCount;
  assert.ok(before > 0, 'fallback text was measured');
  finishFont([]); await Promise.resolve(); flush();
  assert.ok(measurements > before, 'loaded font invalidates cached collision boxes');
  assert.equal(pathCount, paths, 'font loading retains projected territory paths');
  map.destroy();
  delete document.fonts;
});

test('font completion after disposal does not schedule a new frame', async () => {
  let finishFont;
  document.fonts = { load: () => new Promise(resolve => { finishFont = resolve; }) };
  const map = createMap(new Canvas()); flush(); map.destroy();
  finishFont([]); await Promise.resolve();
  assert.equal(frames.size, 0);
  delete document.fonts;
});
