/* Canvas atlas renderer. Geometry arrives in d3's spherical winding convention. */
const d3 = globalThis.d3;
const SPHERE = { type: 'Sphere' };
const PALETTES = {
  light: ['#aac4b1', '#d2b78e', '#b1bdce', '#c8a7a3', '#b0bba0', '#c9b5ce', '#a6c6c8', '#d3c8a0', '#c1beb4', '#d6ad88', '#a4b7a0', '#b2aec9', '#bdc7a5', '#a3bfbd', '#d1bec2', '#bac4d0', '#c1c69d', '#d0b6a4'],
  dark: ['#506c60', '#796744', '#4a6179', '#805b60', '#687347', '#725f77', '#476e73', '#7a7152', '#676e70', '#886446', '#5b7250', '#656084', '#64704e', '#527574', '#795f68', '#5b6b7e', '#737245', '#806857'],
};
const THEMES = {
  light: { background: '#edf0ec', ocean: '#e4ecec', land: '#e5e0d2', coast: '#b8beb4', grid: '#c6d5d3', border: '#687b87', boundary: '#5b645b', ink: '#243933', halo: '#f8f5e8', oceanInk: '#748d91', city: '#344e46', cityHalo: '#faf8ed', selected: '#2f493e', selectedHalo: '#fffdf2', hover: '#445f52' },
  dark: { background: '#172124', ocean: '#1c2b31', land: '#353d3b', coast: '#566362', grid: '#334950', border: '#a5bcc5', boundary: '#263330', ink: '#f4eedc', halo: '#27312c', oceanInk: '#91a8ad', city: '#e7d2a0', cityHalo: '#26332e', selected: '#f0d59b', selectedHalo: '#182925', hover: '#e0e5cf' },
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));

export function createMap(canvas, { onSelect = () => {}, onHover = () => {}, onViewChange = () => {} } = {}) {
  if (!d3) throw new Error('Chronoscape needs the bundled d3 library.');
  const ctx = canvas.getContext('2d');
  const baseCanvas = document.createElement('canvas');
  const baseCtx = baseCanvas.getContext('2d');
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d');
  const graticule = d3.geoGraticule().step([30, 30])();
  const state = { projection: 'flat', zoom: 1, panX: 0, panY: 0, rotation: [-10, -15, 0] };
  let width = 1, height = 1, pixelRatio = 1, projection, baseScale = 1, projectionFit = '';
  let land = null, borders = null, polities = [], cityEntries = [], selectedKey = null;
  let themeName = 'light', layers = { borders: 'off', cities: true, labels: true };
  let baseDirty = true, sceneDirty = true, geometryDirty = true, needsDraw = true;
  let projected = [], cityDots = [], hoverKey = null, hoverPoint = null, hoverPending = false;
  let frameId = 0, destroyed = false, gestureMoved = false;
  const pointers = new Map();
  const colors = new Map(), labelMetrics = new Map(), anchors = new WeakMap();
  const listeners = [];

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }

  function requestDraw() {
    if (!destroyed && !frameId) frameId = requestAnimationFrame(frame);
  }

  function invalidateView(notify = true) {
    setupProjection();
    baseDirty = sceneDirty = geometryDirty = needsDraw = true;
    hoverPending = false;
    if (hoverKey !== null) { hoverKey = null; onHover(null); }
    requestDraw();
    if (notify) onViewChange(getView());
  }

  function setupProjection() {
    const padding = width < 600 ? 12 : 26;
    const factory = state.projection === 'globe' ? d3.geoOrthographic : d3.geoEqualEarth;
    const fit = `${state.projection}:${width}:${height}`;
    if (fit !== projectionFit) {
      projection = factory().fitExtent([[padding, padding], [Math.max(padding + 1, width - padding), Math.max(padding + 1, height - padding)]], SPHERE);
      baseScale = projection.scale(); projectionFit = fit;
    }
    projection.scale(baseScale * state.zoom)
      .translate([width / 2 + state.panX, height / 2 + state.panY]);
    if (state.projection === 'globe') projection.rotate(state.rotation);
    projection.clipExtent([[-4, -4], [width + 4, height + 4]]);
  }

  function getView() {
    const result = { projection: state.projection, zoom: state.zoom, panX: state.panX, panY: state.panY, rotation: [...state.rotation] };
    const center = projection?.invert([width / 2, height / 2]);
    if (center && center.every(Number.isFinite) && Math.abs(center[0]) <= 180 && Math.abs(center[1]) <= 90) result.center = center;
    return result;
  }

  function setView(view = {}) {
    if (view.projection === 'flat' || view.projection === 'globe') state.projection = view.projection;
    if (finite(view.zoom)) state.zoom = clamp(Number(view.zoom), 0.85, 40);
    if (finite(view.panX)) state.panX = Number(view.panX);
    if (finite(view.panY)) state.panY = Number(view.panY);
    if (Array.isArray(view.rotation) && view.rotation.length >= 2 && view.rotation.slice(0, 2).every(finite)) {
      state.rotation = [Number(view.rotation[0]), clamp(Number(view.rotation[1]), -90, 90), 0];
    }
    if (Array.isArray(view.center) && view.center.length >= 2 && view.center.slice(0, 2).every(finite)) {
      setupProjection();
      const point = projection([clamp(Number(view.center[0]), -180, 180), clamp(Number(view.center[1]), -89.9, 89.9)]);
      state.panX += width / 2 - point[0];
      state.panY += height / 2 - point[1];
    }
    invalidateView();
  }

  function visible(coord) {
    return state.projection !== 'globe' || d3.geoDistance(coord, [-state.rotation[0], -state.rotation[1]]) < Math.PI / 2 - 0.005;
  }

  function screenPoint(coord) {
    if (!visible(coord)) return null;
    const point = projection(coord);
    return point && point.every(Number.isFinite) && point[0] >= -8 && point[0] <= width + 8 && point[1] >= -8 && point[1] <= height + 8 ? point : null;
  }

  function labelPoint(polity) {
    if (Array.isArray(polity.lp)) return polity.lp;
    if (!anchors.has(polity)) anchors.set(polity, d3.geoCentroid(polity.g));
    return anchors.get(polity);
  }

  function colorFor(polity) {
    const key = `${themeName}:${polity.k || polity.n}`;
    if (!colors.has(key)) {
      let hash = 2166136261;
      for (const character of String(polity.k || polity.n)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
      const palette = PALETTES[themeName];
      colors.set(key, palette[hash % palette.length]);
    }
    return colors.get(key);
  }

  // Project once per camera change. The path and screen bounds are collected in
  // the same stream, then reused by drawing, labels, and pointer hit testing.
  function projectGeometry(geometry) {
    const shape = new Path2D();
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    function point(x, y) {
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
    }
    const recorder = {
      moveTo(x, y) { point(x, y); shape.moveTo(x, y); },
      lineTo(x, y) { point(x, y); shape.lineTo(x, y); },
      closePath() { shape.closePath(); },
      arc(x, y, radius, start, end) { point(x - radius, y - radius); point(x + radius, y + radius); shape.arc(x, y, radius, start, end); },
    };
    d3.geoPath(projection, recorder)(geometry);
    return { shape, bounds };
  }

  function prepareGeometry() {
    projected = [];
    for (const polity of polities) {
      const entry = projectGeometry(polity.g);
      if (entry.bounds.every(Number.isFinite) && entry.bounds[2] >= 0 && entry.bounds[0] <= width && entry.bounds[3] >= 0 && entry.bounds[1] <= height) projected.push({ polity, ...entry });
    }
    geometryDirty = false;
  }

  function drawBorders(context, alpha) {
    if (!borders) return;
    context.save();
    context.beginPath(); d3.geoPath(projection, context)(borders);
    context.strokeStyle = THEMES[themeName].border;
    context.globalAlpha = alpha;
    context.lineWidth = 0.8;
    context.stroke();
    context.restore();
  }

  function drawBase() {
    const theme = THEMES[themeName];
    baseCtx.clearRect(0, 0, width, height);
    baseCtx.fillStyle = theme.background; baseCtx.fillRect(0, 0, width, height);
    const path = d3.geoPath(projection, baseCtx);
    baseCtx.beginPath(); path(SPHERE);
    baseCtx.fillStyle = theme.ocean; baseCtx.fill();
    baseCtx.strokeStyle = theme.coast; baseCtx.lineWidth = 0.8; baseCtx.stroke();
    baseCtx.save();
    baseCtx.beginPath(); path(SPHERE); baseCtx.clip();
    baseCtx.beginPath(); path(graticule);
    baseCtx.strokeStyle = theme.grid; baseCtx.globalAlpha = 0.65;
    baseCtx.lineWidth = 0.6; baseCtx.stroke();
    baseCtx.restore();
    if (land) {
      baseCtx.beginPath(); path(land);
      baseCtx.fillStyle = theme.land; baseCtx.fill();
      baseCtx.strokeStyle = theme.coast; baseCtx.lineWidth = 0.7; baseCtx.stroke();
    }
    if (layers.borders === 'under') drawBorders(baseCtx, themeName === 'dark' ? 0.8 : 0.62);
    baseDirty = false;
  }

  function prepareCities() {
    cityDots = [];
    if (!layers.cities) return;
    const occupied = new Set();
    const budget = Math.max(50, Math.min(320, Math.floor(width * height / 2100)));
    // The budget is applied AFTER viewport culling. Zooming into a region can
    // therefore reveal local cities even if they are not among the global top 90.
    for (const entry of cityEntries) {
      const city = entry.city;
      const point = screenPoint([city.lo, city.la]);
      if (!point) continue;
      const cell = `${Math.floor(point[0] / 13)}:${Math.floor(point[1] / 13)}`;
      if (occupied.has(cell)) continue;
      occupied.add(cell);
      const radius = clamp(Math.log10(Math.max(1, entry.pop)) - 2.5, 1.8, 4.5);
      cityDots.push({ city, point, radius });
      if (cityDots.length >= budget) break;
    }
  }

  function drawScene() {
    if (baseDirty) drawBase();
    sceneCtx.clearRect(0, 0, width, height);
    sceneCtx.drawImage(baseCanvas, 0, 0, width, height);
    sceneCtx.lineJoin = 'round';
    for (const entry of projected) {
      sceneCtx.fillStyle = colorFor(entry.polity); sceneCtx.fill(entry.shape);
      sceneCtx.strokeStyle = THEMES[themeName].boundary; sceneCtx.globalAlpha = 0.63;
      sceneCtx.lineWidth = 0.7; sceneCtx.stroke(entry.shape); sceneCtx.globalAlpha = 1;
    }
    if (layers.borders === 'over') drawBorders(sceneCtx, 0.7);
    prepareCities();
    for (const { point, radius } of cityDots) {
      sceneCtx.beginPath(); sceneCtx.arc(point[0], point[1], radius, 0, Math.PI * 2);
      sceneCtx.fillStyle = THEMES[themeName].city; sceneCtx.fill();
      sceneCtx.strokeStyle = THEMES[themeName].cityHalo; sceneCtx.lineWidth = 1; sceneCtx.stroke();
    }
    sceneDirty = false;
  }

  function metrics(text, size, serif = true) {
    const key = `${serif ? 's' : 'u'}:${size}:${text}`;
    if (labelMetrics.has(key)) return labelMetrics.get(key);
    const font = serif ? `600 ${size}px Georgia, serif` : `500 ${size}px system-ui, sans-serif`;
    ctx.font = font;
    let lines = [text];
    const words = text.split(/\s+/);
    if (serif && text.length > 20 && words.length > 1) {
      let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const trial = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
        const length = Math.max(...trial.map(line => ctx.measureText(line).width));
        if (length < best) { best = length; lines = trial; }
      }
    }
    const result = { font, lines, width: Math.max(...lines.map(line => ctx.measureText(line).width)), height: lines.length * (size + 3), size };
    labelMetrics.set(key, result);
    return result;
  }

  function drawLabels() {
    if (!layers.labels) return;
    const theme = THEMES[themeName];
    const placed = [];
    // Map controls are HTML overlays. Reserve their actual responsive bounds so
    // a geographically correct label cannot become unreadable underneath one.
    const canvasBox = canvas.getBoundingClientRect();
    const overlays = canvas.parentElement?.querySelectorAll?.('.map-context, .map-toolbar, .map-navigation, .map-legend') || [];
    for (const overlay of overlays) {
      const box = overlay.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      placed.push([box.left - canvasBox.left - 6, box.top - canvasBox.top - 6, box.right - canvasBox.left + 6, box.bottom - canvasBox.top + 6]);
    }
    function claim(box) {
      if (box[0] < 8 || box[1] < 8 || box[2] > width - 8 || box[3] > height - 8) return false;
      if (placed.some(other => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) return false;
      placed.push(box); return true;
    }
    const candidates = projected.map(entry => ({ ...entry, priority: entry.polity.k === selectedKey ? Infinity : Math.max(0, entry.bounds[2] - entry.bounds[0]) * Math.max(0, entry.bounds[3] - entry.bounds[1]) }))
      .sort((a, b) => b.priority - a.priority);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const { polity, bounds } of candidates) {
      let point = screenPoint(labelPoint(polity));
      if (!point) continue;
      const selected = polity.k === selectedKey;
      const size = selected ? 17 : Math.round(clamp(10 + Math.log10(Math.max(1, polity.a)), 12, 16));
      const label = metrics(polity.n, size);
      const screenWidth = bounds[2] - bounds[0], screenHeight = bounds[3] - bounds[1];
      if (!selected && screenWidth < label.width * 0.6 && screenHeight < label.height * 1.6) continue;
      const padding = selected ? 7 : 3;
      const positions = selected ? [point, [point[0], point[1] + label.height + 28], [point[0], point[1] - label.height - 28], [point[0] + label.width / 2 + 24, point[1]], [point[0] - label.width / 2 - 24, point[1]]] : [point];
      point = positions.find(candidate => claim([candidate[0] - label.width / 2 - padding, candidate[1] - label.height / 2 - padding, candidate[0] + label.width / 2 + padding, candidate[1] + label.height / 2 + padding]));
      if (!point) continue;
      ctx.font = label.font;
      ctx.strokeStyle = theme.halo; ctx.lineWidth = selected ? 5 : 3.5;
      ctx.fillStyle = theme.ink;
      label.lines.forEach((line, i) => {
        const y = point[1] + (i - (label.lines.length - 1) / 2) * (size + 3);
        ctx.strokeText(line, point[0], y); ctx.fillText(line, point[0], y);
      });
    }
    ctx.textAlign = 'left';
    for (const { city, point, radius } of cityDots) {
      const label = metrics(city.n, 12, false);
      const positions = [point[0] + radius + 4, point[0] - radius - 4 - label.width];
      for (const x of positions) {
        if (!claim([x - 2, point[1] - 8, x + label.width + 2, point[1] + 8])) continue;
        ctx.font = label.font; ctx.lineWidth = 3.5;
        ctx.strokeStyle = theme.halo; ctx.fillStyle = theme.ink;
        ctx.strokeText(city.n, x, point[1]); ctx.fillText(city.n, x, point[1]);
        break;
      }
    }
    if (state.zoom < 2.2) {
      ctx.font = '500 10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = theme.oceanInk;
      for (const [name, coord] of [['NORTH ATLANTIC', [-38, 27]], ['PACIFIC OCEAN', [-135, -12]], ['INDIAN OCEAN', [76, -27]], ['SOUTH ATLANTIC', [-20, -35]]]) {
        const point = screenPoint(coord);
        if (!point) continue;
        const textWidth = ctx.measureText(name).width;
        if (claim([point[0] - textWidth / 2 - 4, point[1] - 9, point[0] + textWidth / 2 + 4, point[1] + 9])) ctx.fillText(name, point[0], point[1]);
      }
    }
  }

  function drawHighlight(entry, selected) {
    if (!entry) return;
    const theme = THEMES[themeName];
    ctx.lineJoin = 'round';
    if (selected) {
      ctx.strokeStyle = theme.selectedHalo; ctx.lineWidth = 4.6; ctx.stroke(entry.shape);
      ctx.strokeStyle = theme.selected; ctx.lineWidth = 2.2; ctx.stroke(entry.shape);
    } else {
      ctx.strokeStyle = theme.hover; ctx.lineWidth = 1.6; ctx.stroke(entry.shape);
    }
  }

  function polityAt(x, y) {
    const coord = projection.invert([x, y]);
    if (!coord || !coord.every(Number.isFinite) || Math.abs(coord[0]) > 180 || Math.abs(coord[1]) > 90 || !visible(coord)) return null;
    // Orthographic inversion outside the disc can otherwise return a plausible
    // longitude. The round trip rejects ocean beyond the visible sphere.
    const back = projection(coord);
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 1.5) return null;
    // Largest first for drawing, smallest first for selecting enclaves.
    for (let i = projected.length - 1; i >= 0; i--) {
      const { polity, bounds } = projected[i];
      if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) continue;
      if (d3.geoContains(polity.g, coord)) return polity;
    }
    return null;
  }

  function frame() {
    frameId = 0;
    if (destroyed) return;
    if (geometryDirty) prepareGeometry();
    if (hoverPending) {
      hoverPending = false;
      const polity = hoverPoint ? polityAt(hoverPoint[0], hoverPoint[1]) : null;
      const key = polity?.k ?? null;
      if (key !== hoverKey) { hoverKey = key; needsDraw = true; }
      // x and y are CSS pixels relative to the canvas, not client coordinates.
      onHover(polity ? { polity, x: hoverPoint[0], y: hoverPoint[1] } : null);
      canvas.style.cursor = polity ? 'pointer' : 'grab';
    }
    if (!needsDraw && !sceneDirty) return;
    if (sceneDirty) drawScene();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(sceneCanvas, 0, 0, width, height);
    if (hoverKey && hoverKey !== selectedKey) drawHighlight(projected.find(entry => entry.polity.k === hoverKey), false);
    if (selectedKey) for (const entry of projected) if (entry.polity.k === selectedKey) drawHighlight(entry, true);
    drawLabels();
    needsDraw = false;
  }

  function resize() {
    if (destroyed) return;
    const box = (canvas.parentElement || canvas).getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(box.width));
    const nextHeight = Math.max(1, Math.round(box.height));
    const nextRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (nextWidth === width && nextHeight === height && nextRatio === pixelRatio && projection) return;
    const center = projection ? getView().center : null;
    width = nextWidth; height = nextHeight; pixelRatio = nextRatio;
    for (const [surface, context] of [[canvas, ctx], [baseCanvas, baseCtx], [sceneCanvas, sceneCtx]]) {
      surface.width = Math.round(width * pixelRatio); surface.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    setupProjection();
    if (center) {
      const point = projection(center);
      state.panX += width / 2 - point[0]; state.panY += height / 2 - point[1];
    }
    invalidateView(false);
  }

  function zoomAt(factor, x = width / 2, y = height / 2) {
    const zoom = clamp(state.zoom * factor, 0.85, 40);
    const ratio = zoom / state.zoom;
    if (ratio === 1) return;
    state.panX = (state.panX + width / 2 - x) * ratio + x - width / 2;
    state.panY = (state.panY + height / 2 - y) * ratio + y - height / 2;
    state.zoom = zoom;
    invalidateView();
  }

  function panBy(dx, dy) {
    if (state.projection === 'globe') {
      const degreesPerPixel = 180 / (Math.PI * baseScale * state.zoom);
      state.rotation[0] = ((state.rotation[0] + dx * degreesPerPixel + 540) % 360) - 180;
      state.rotation[1] = clamp(state.rotation[1] - dy * degreesPerPixel, -89.9, 89.9);
    } else { state.panX += dx; state.panY += dy; }
    invalidateView();
  }

  function localPoint(event) {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  function clearPointers() {
    const ids = [...pointers.keys()];
    pointers.clear();
    for (const id of ids) if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    canvas.classList.remove('dragging'); canvas.style.cursor = 'grab';
    gestureMoved = false;
  }

  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0) return;
    const point = localPoint(event);
    if (!pointers.size) gestureMoved = false;
    pointers.set(event.pointerId, { point, start: point, type: event.pointerType });
    if (pointers.size > 1) gestureMoved = true;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    canvas.classList.add('dragging'); canvas.style.cursor = 'grabbing';
    hoverPending = false; hoverKey = null; onHover(null);
    event.preventDefault();
  });

  listen(canvas, 'pointermove', event => {
    const point = localPoint(event);
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType === 'touch' || pointers.size) return;
      hoverPoint = point; hoverPending = true; requestDraw(); return;
    }
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) { clearPointers(); return; }
    const before = [...pointers.values()].map(pointer => pointer.point);
    const pointer = pointers.get(event.pointerId);
    if (Math.hypot(point[0] - pointer.start[0], point[1] - pointer.start[1]) > 4) gestureMoved = true;
    const previous = pointer.point;
    pointer.point = point;
    if (pointers.size >= 2) {
      const after = [...pointers.values()].map(item => item.point);
      const midpoint = pair => [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2];
      const oldMid = midpoint(before), newMid = midpoint(after);
      const oldDistance = Math.hypot(before[0][0] - before[1][0], before[0][1] - before[1][1]);
      const newDistance = Math.hypot(after[0][0] - after[1][0], after[0][1] - after[1][1]);
      if (oldDistance > 5) zoomAt(newDistance / oldDistance, oldMid[0], oldMid[1]);
      panBy(newMid[0] - oldMid[0], newMid[1] - oldMid[1]);
    } else if (gestureMoved) panBy(point[0] - previous[0], point[1] - previous[1]);
    event.preventDefault();
  });

  listen(canvas, 'pointerup', event => {
    if (!pointers.has(event.pointerId)) return;
    const wasClick = pointers.size === 1 && !gestureMoved;
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!pointers.size) { canvas.classList.remove('dragging'); canvas.style.cursor = 'grab'; }
    if (wasClick) {
      if (geometryDirty) prepareGeometry();
      const point = localPoint(event);
      const polity = polityAt(point[0], point[1]);
      onSelect(polity?.k === selectedKey ? null : polity);
    }
  });
  listen(canvas, 'pointercancel', clearPointers);
  listen(canvas, 'lostpointercapture', event => {
    if (pointers.has(event.pointerId)) clearPointers();
  });
  listen(window, 'blur', () => { clearPointers(); hoverPoint = null; hoverPending = true; requestDraw(); });
  listen(canvas, 'pointerleave', () => {
    if (pointers.size) return;
    hoverPoint = null; hoverPending = true; requestDraw();
  });
  listen(canvas, 'wheel', event => {
    event.preventDefault();
    const point = localPoint(event);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    zoomAt(Math.exp(-clamp(delta, -450, 450) * 0.0018), point[0], point[1]);
  }, { passive: false });
  listen(canvas, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const delta = event.shiftKey ? 100 : 40;
    const actions = {
      ArrowLeft: () => panBy(delta, 0), ArrowRight: () => panBy(-delta, 0),
      ArrowUp: () => panBy(0, delta), ArrowDown: () => panBy(0, -delta),
      '+': () => zoomAt(1.3), '=': () => zoomAt(1.3), '-': () => zoomAt(1 / 1.3), Home: reset,
      Escape: () => onSelect(null),
    };
    if (actions[event.key]) { event.preventDefault(); event.stopPropagation(); actions[event.key](); }
  });

  function reset() {
    state.zoom = 1; state.panX = 0; state.panY = 0; state.rotation = [-10, -15, 0];
    invalidateView();
  }

  function focus(polity) {
    if (!polity?.g) return;
    state.zoom = 1; state.panX = 0; state.panY = 0;
    if (state.projection === 'globe') {
      const anchor = labelPoint(polity);
      state.rotation = [-anchor[0], clamp(-anchor[1], -89.9, 89.9), 0];
    }
    setupProjection();
    const bounds = d3.geoPath(projection.clipExtent(null)).bounds(polity.g);
    const extentWidth = bounds[1][0] - bounds[0][0], extentHeight = bounds[1][1] - bounds[0][1];
    if (Number.isFinite(extentWidth) && extentWidth > 0 && extentHeight > 0) {
      state.zoom = clamp(Math.min(width * 0.76 / extentWidth, height * 0.74 / extentHeight), 1.1, state.projection === 'globe' ? 6 : 18);
      if (state.projection === 'flat') {
        state.panX = (width / 2 - (bounds[0][0] + bounds[1][0]) / 2) * state.zoom;
        state.panY = (height / 2 - (bounds[0][1] + bounds[1][1]) / 2) * state.zoom;
      }
    }
    invalidateView();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement || canvas);
  listen(window, 'resize', resize);
  resize();

  return {
    setData(data = {}) {
      if ('land' in data) land = data.land;
      if ('borders' in data) borders = data.borders;
      baseDirty = sceneDirty = needsDraw = true; requestDraw();
    },
    setSnapshot(nextPolities = [], nextCityEntries = []) {
      const ordered = [...nextPolities].sort((a, b) => (b.a || 0) - (a.a || 0));
      // A directly entered year can sit inside the same historical interval.
      // Preserve projected paths while city populations and date text change.
      if (ordered.length !== polities.length || ordered.some((polity, i) => polity !== polities[i])) geometryDirty = true;
      polities = ordered;
      cityEntries = [...nextCityEntries].sort((a, b) => b.pop - a.pop);
      sceneDirty = needsDraw = true;
      hoverKey = null; onHover(null); requestDraw();
    },
    setSelected(key) { selectedKey = key || null; needsDraw = true; requestDraw(); },
    setTheme(name) {
      if (!THEMES[name] || name === themeName) return;
      themeName = name; baseDirty = sceneDirty = needsDraw = true; requestDraw();
    },
    setLayers(next) {
      if (['off', 'under', 'over'].includes(next.borders)) layers.borders = next.borders;
      if (typeof next.cities === 'boolean') layers.cities = next.cities;
      if (typeof next.labels === 'boolean') layers.labels = next.labels;
      baseDirty = sceneDirty = needsDraw = true; requestDraw();
    },
    setProjection(mode) {
      if (!['flat', 'globe'].includes(mode) || mode === state.projection) return;
      const center = getView().center || [-state.rotation[0], -state.rotation[1]];
      state.projection = mode; state.panX = state.panY = 0;
      if (mode === 'globe') state.rotation = [-center[0], clamp(-center[1], -89.9, 89.9), 0];
      setupProjection();
      if (mode === 'flat') {
        const point = projection(center);
        state.panX = width / 2 - point[0]; state.panY = height / 2 - point[1];
      }
      invalidateView();
    },
    setView, getView, zoomBy: factor => zoomAt(factor), reset, focus, resize,
    destroy() {
      destroyed = true; clearPointers(); observer.disconnect();
      listeners.forEach(remove => remove());
      if (frameId) cancelAnimationFrame(frameId);
    },
  };
}
