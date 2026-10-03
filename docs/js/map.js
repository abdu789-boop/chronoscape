/* Canvas atlas renderer. Geometry arrives in d3's spherical winding convention. */
import { createTerrain } from './terrain.js';

const d3 = globalThis.d3;
const SPHERE = { type: 'Sphere' };
// Watercolour pigments of hand-coloured atlases: gamboge, rose madder, verdigris,
// blue, violet, sienna, sap green, carmine, slate and terre verte. The dark
// theme mixes each with 28% of its navy ground.
const PALETTES = {
  light: ['#dcb751', '#d6877b', '#74a985', '#7fa3c6', '#a48cc0', '#c98f58', '#9fb35f', '#d184a0', '#8699b4', '#97bcae'],
  dark: ['#a28943', '#9e6762', '#577f69', '#5f7b98', '#7a6a93', '#956d48', '#76864d', '#9a657c', '#64748b', '#718d86'],
};
const THEMES = {
  light: {
    background: '#efe7d6', sea: '#d4ddd4', seaLine: '79,108,112', land: '#efe5cf', coast: '#4b3e2e', grid: 'rgba(92,72,46,0.17)',
    frame: '#4b3e2e', ring: '#8a6a32', limb: 'rgba(75,55,30,0.28)', wash: 0.36, band: 0.8, veilWash: 0.13, veilBand: 0.22,
    boundary: 'rgba(58,44,30,0.55)', border: '#5a4a39', ink: '#2a2117', veilInk: 'rgba(42,33,23,0.45)', halo: 'rgba(244,237,222,0.92)',
    water: 'rgba(48,80,88,0.88)', cityFill: '#f3ead6', cityInk: '#2a2117', selected: '#a3341f', fresh: '#2f6e60', freshText: '#245a4e',
    ghost: 'rgba(42,33,23,0.9)', hover: '#2a2117',
    relief: ['hard-light', 0.5], river: 'rgba(58,98,118,0.82)', shore: 'rgba(75,62,46,0.7)',
  },
  dark: {
    background: '#0e1420', sea: '#132238', seaLine: '159,180,208', land: '#252b34', coast: 'rgba(224,204,156,0.6)', grid: 'rgba(212,190,140,0.12)',
    frame: '#c9a45a', ring: '#c9a45a', limb: 'rgba(0,0,0,0.42)', wash: 0.6, band: 0.9, veilWash: 0.22, veilBand: 0.3,
    boundary: 'rgba(6,9,15,0.8)', border: '#c0b7a2', ink: '#efe6cf', veilInk: 'rgba(239,230,207,0.45)', halo: 'rgba(10,14,24,0.86)',
    water: 'rgba(176,196,222,0.62)', cityFill: '#e7c36f', cityInk: '#0b0f18', selected: '#d4a24e', fresh: '#7fc3b0', freshText: '#bfe6da',
    ghost: 'rgba(239,230,207,0.85)', hover: '#efe6cf',
    relief: ['hard-light', 0.5], river: 'rgba(150,182,218,0.66)', shore: 'rgba(224,204,156,0.45)',
  },
};
const SERIF = 'Georgia, "Times New Roman", serif';
// Natural Earth scale ranks drawn at each zoom (rivers, lakes) and river widths by rank.
const GEOGRAPHY_RANKS = [[1.6, 3, 1], [3, 4, 3], [6, 5, 5], [Infinity, 6, 6]];
const RIVER_WIDTHS = [1.3, 1.3, 1.05, 0.9, 0.75, 0.62, 0.52];
const OCEANS = [['North Atlantic', [-38, 27]], ['Pacific Ocean', [-135, -12]], ['Indian Ocean', [76, -27]], ['South Atlantic', [-20, -35]]];
const SEAS = [['Mediterranean Sea', [18.5, 34.6]], ['Black Sea', [34.5, 43.2]], ['Red Sea', [38.4, 20.5], 0.95], ['Persian Gulf', [51.2, 27]],
  ['Aegean Sea', [25.2, 38.9]], ['Arabian Sea', [63, 15]], ['Caspian Sea', [50.5, 42]], ['Baltic Sea', [19.5, 57]], ['North Sea', [3.5, 56]],
  ['Bay of Bengal', [88, 15]], ['South China Sea', [114, 14]], ['Caribbean Sea', [-75, 15]], ['Gulf of Mexico', [-90, 25]]];

export function getPolityColor(key, theme = 'light') {
  let hash = 2166136261;
  for (const character of String(key)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const palette = PALETTES[theme] || PALETTES.light;
  return palette[hash % palette.length];
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));

/** Area-weighted centre of the mapped territories, for turning the globe toward them. */
export function polityCenter(polities) {
  let x = 0, y = 0, z = 0;
  for (const polity of polities) {
    const point = Array.isArray(polity.lp) ? polity.lp : d3.geoCentroid(polity.g);
    if (!point?.every(Number.isFinite)) continue;
    const [lambda, phi] = point.map(degrees => degrees * Math.PI / 180), weight = Math.max(1, polity.a || 1);
    x += weight * Math.cos(phi) * Math.cos(lambda); y += weight * Math.cos(phi) * Math.sin(lambda); z += weight * Math.sin(phi);
  }
  const length = Math.hypot(x, y, z);
  if (length < 1e-9) return null;
  return [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI];
}

/** A small plate of one territory, used by search previews. */
export function renderThumbnail(canvas, { geometries = [], land = null, theme = 'light', color = PALETTES.light[0] } = {}) {
  const context = canvas.getContext('2d'), palette = THEMES[theme] || THEMES.light;
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2), width = canvas.clientWidth || 280, height = canvas.clientHeight || 164;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const shape = { type: 'GeometryCollection', geometries };
  const projection = d3.geoEqualEarth().fitExtent([[14, 12], [width - 14, height - 12]], shape);
  const path = d3.geoPath(projection, context);
  context.fillStyle = palette.sea; context.fillRect(0, 0, width, height);
  if (land) {
    context.beginPath(); path(land);
    context.strokeStyle = `rgba(${palette.seaLine},0.28)`; context.lineWidth = 4; context.lineJoin = 'round'; context.stroke();
    context.fillStyle = palette.land; context.fill();
    context.strokeStyle = palette.coast; context.lineWidth = 0.6; context.stroke();
  }
  context.beginPath(); path(shape);
  context.globalAlpha = palette.wash + 0.1; context.fillStyle = color; context.fill(); context.globalAlpha = 1;
  context.strokeStyle = palette.halo; context.lineWidth = 3.2; context.stroke();
  context.strokeStyle = palette.selected; context.lineWidth = 1.4; context.stroke();
}

export function createMap(canvas, { onSelect = () => {}, onHover = () => {}, onViewChange = () => {} } = {}) {
  if (!d3) throw new Error('Chronoscape needs the bundled d3 library.');
  const ctx = canvas.getContext('2d');
  const baseCanvas = document.createElement('canvas');
  const baseCtx = baseCanvas.getContext('2d');
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d');
  const graticule = d3.geoGraticule().step([15, 15])();
  const fineGraticule = d3.geoGraticule().step([5, 5])();
  const state = { projection: 'flat', zoom: 1, panX: 0, panY: 0, rotation: [-10, -15, 0] };
  let width = 1, height = 1, pixelRatio = 1, projection, baseScale = 1, projectionFit = '';
  let land = null, borders = null, polities = [], cityEntries = [], selectedKey = null, focus = null;
  // terrain: undefined until relief is supplied, then a renderer or null (no WebGL 2).
  let riverRanks = [], lakeRanks = [], terrain, geographyCache = null;
  let themeName = 'light', layers = { borders: 'off', cities: true, labels: true, terrain: true, rivers: true };
  let baseDirty = true, sceneDirty = true, geometryDirty = true, needsDraw = true;
  let projected = [], ghosts = [], cityDots = [], sphere = null, hoverKey = null, hoverPoint = null, hoverPending = false;
  let frameId = 0, destroyed = false, gestureMoved = false;
  // While the camera moves, frames skip the engraved coastlines and border
  // washes; a full-quality frame follows once it has been still briefly.
  let detailed = true, settleTimer = 0;
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
    detailed = false;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = 0;
      if (destroyed) return;
      detailed = true; baseDirty = sceneDirty = needsDraw = true; requestDraw();
    }, 160);
    requestDraw();
    if (notify) onViewChange(getView());
  }

  function setupProjection() {
    const padding = width < 600 ? 12 : 26;
    const factory = state.projection === 'globe' ? d3.geoOrthographic : d3.geoEqualEarth;
    const fit = `${state.projection}:${width}:${height}`;
    if (fit !== projectionFit) {
      // The globe leaves room for its graduated ring.
      const inset = state.projection === 'globe' ? padding + Math.min(34, Math.min(width, height) * 0.06) : padding;
      projection = factory().fitExtent([[inset, inset], [Math.max(inset + 1, width - inset), Math.max(inset + 1, height - inset)]], SPHERE);
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
    if (!colors.has(key)) colors.set(key, getPolityColor(polity.k || polity.n, themeName));
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

  const onScreen = bounds => bounds.every(Number.isFinite) && bounds[2] >= 0 && bounds[0] <= width && bounds[3] >= 0 && bounds[1] <= height;

  function prepareGeometry() {
    projected = [];
    for (const polity of polities) {
      const entry = projectGeometry(polity.g);
      if (onScreen(entry.bounds)) projected.push({ polity, ...entry });
    }
    sphere = projectGeometry(SPHERE).shape;
    ghosts = [];
    for (const ghost of focus?.ghosts || []) {
      const entry = projectGeometry(ghost.geometry);
      if (onScreen(entry.bounds)) ghosts.push({ ...ghost, ...entry });
    }
    geometryDirty = false;
  }

  // In a focus mode, territories outside it are veiled so the subject stands out.
  function lit(polity) {
    if (focus) return focus.fresh.has(polity.k) || focus.lit.has(polity.k);
    return !selectedKey || polity.k === selectedKey;
  }

  function drawBorders(context, alpha) {
    if (!borders) return;
    context.save();
    context.beginPath(); d3.geoPath(projection, context)(borders);
    context.strokeStyle = THEMES[themeName].border;
    context.globalAlpha = alpha;
    context.lineWidth = 0.8;
    context.setLineDash([4, 3]);
    context.stroke();
    context.restore();
  }

  function sphereRadius() {
    return state.projection === 'globe' ? projection.scale() : 0;
  }

  // The globe sits in a graduated ring, like the meridian ring of a library globe.
  function drawRing(context) {
    const theme = THEMES[themeName], [cx, cy] = projection.translate(), radius = sphereRadius();
    if (radius > Math.max(width, height) * 1.5) return;
    const inner = radius + 9, outer = radius + 25;
    context.save();
    context.beginPath(); context.arc(cx, cy, outer, 0, Math.PI * 2); context.arc(cx, cy, inner, 0, Math.PI * 2, true);
    context.fillStyle = themeName === 'dark' ? 'rgba(201,164,90,0.07)' : 'rgba(138,106,50,0.08)'; context.fill();
    context.strokeStyle = theme.ring; context.lineWidth = 1.1;
    for (const r of [inner, outer]) { context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.stroke(); }
    context.lineWidth = 0.6; context.beginPath();
    for (let degree = 0; degree < 360; degree += 5) {
      const angle = degree * Math.PI / 180, length = degree % 30 === 0 ? 12 : degree % 10 === 0 ? 8 : 4;
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * (inner + length), cy + Math.sin(angle) * (inner + length));
    }
    context.stroke();
    context.restore();
  }

  // Group features by scale rank so each rank is one path and one stroke. Each
  // keeps a bounding cap (centre and angular radius) for culling on the globe.
  function byRank(collection) {
    const groups = [];
    for (const feature of collection?.features || []) {
      const rank = clamp(Math.round(feature.properties?.r ?? 6), 0, 6), geometry = feature.geometry;
      if (!geometry) continue;
      const center = d3.geoCentroid(geometry);
      let radius = 0;
      (function visit(coordinates) {
        if (typeof coordinates[0] === 'number') radius = Math.max(radius, d3.geoDistance(center, coordinates));
        else coordinates.forEach(visit);
      })(geometry.coordinates);
      (groups[rank] ||= []).push({ geometry, center, radius });
    }
    return groups;
  }

  function reliefImage() {
    if (!terrain?.ready) return null;
    return terrain.render({ globe: state.projection === 'globe', width, height, ratio: pixelRatio,
      translate: projection.translate(), scale: projection.scale(), rotation: projection.rotate() });
  }

  // Rivers and lakes as screen paths. Equal Earth is linear in scale and
  // translation, so on the flat map one projection is reused through an affine
  // transform while panning and zooming, and redone when a still frame's scale
  // has changed. The globe re-projects them for every rotation.
  function geographyPaths(riverRank, lakeRank) {
    const globe = state.projection === 'globe', scale = projection.scale(), [tx, ty] = projection.translate();
    const cached = geographyCache;
    const reusable = cached && !globe && !cached.globe && cached.riverRank === riverRank && cached.lakeRank === lakeRank
      && cached.width === width && cached.height === height && (!detailed || Math.abs(scale / cached.scale - 1) < 0.005);
    if (!reusable) {
      // The lines are already dense, so d3's adaptive resampling is skipped. The
      // flat paths are not clipped to the view, which lets panning reuse them.
      // On the globe, features wholly outside the visible cap are skipped: the
      // cap is centred on the globe's centre and reaches the farthest corner.
      const target = (globe ? d3.geoOrthographic().rotate(projection.rotate()).clipExtent(projection.clipExtent()) : d3.geoEqualEarth())
        .scale(scale).translate([tx, ty]).precision(0);
      const reach = Math.hypot(Math.max(tx, width - tx), Math.max(ty, height - ty));
      const center = [-projection.rotate()[0], -projection.rotate()[1]], view = reach >= scale ? Math.PI / 2 : Math.asin(reach / scale);
      const shown = items => ({ type: 'GeometryCollection', geometries: (items || [])
        .filter(item => !globe || d3.geoDistance(center, item.center) < view + item.radius + 0.01).map(item => item.geometry) });
      const rivers = [];
      for (let rank = 0; rank <= riverRank; rank++) {
        if (!riverRanks[rank]) continue;
        const path = new Path2D();
        d3.geoPath(target, path)(shown(riverRanks[rank]));
        rivers.push([rank, path]);
      }
      const lakes = new Path2D(), lakePath = d3.geoPath(target, lakes);
      for (let rank = 0; rank <= lakeRank; rank++) if (lakeRanks[rank]) lakePath(shown(lakeRanks[rank]));
      geographyCache = { globe, scale, origin: [tx, ty], riverRank, lakeRank, width, height, rivers, lakes };
    }
    const k = scale / geographyCache.scale, [ox, oy] = geographyCache.origin;
    return { ...geographyCache, k, dx: tx - k * ox, dy: ty - k * oy };
  }

  // Present-day relief, rivers and lakes are part of the engraved plate: the
  // historical washes are laid over them.
  function drawGeography(context, coast) {
    const theme = THEMES[themeName];
    const shade = layers.terrain ? reliefImage() : null;
    const [, riverRank, lakeRank] = GEOGRAPHY_RANKS.find(([zoom]) => state.zoom < zoom);
    const paths = layers.rivers && (riverRanks.length || lakeRanks.length) ? geographyPaths(riverRank, lakeRank) : null;
    if (shade || paths) {
      context.save(); context.clip(coast);
      if (shade) {
        context.globalCompositeOperation = theme.relief[0]; context.globalAlpha = theme.relief[1];
        context.drawImage(shade, 0, 0, width, height);
        context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1;
      }
      if (paths) {
        const widen = clamp(0.9 + Math.log2(state.zoom) * 0.14, 0.85, 1.45) / paths.k;
        context.transform(paths.k, 0, 0, paths.k, paths.dx, paths.dy);
        context.strokeStyle = theme.river; context.lineCap = 'round'; context.lineJoin = 'round';
        for (const [rank, path] of paths.rivers) { context.lineWidth = RIVER_WIDTHS[rank] * widen; context.stroke(path); }
      }
      context.restore();
    }
    if (!paths) return;
    const { lakes, k } = paths;
    context.save(); context.transform(k, 0, 0, k, paths.dx, paths.dy);
    context.fillStyle = theme.sea; context.fill(lakes);
    if (detailed) {
      // The coast's engraved water lines, repeated inside each lake.
      context.save(); context.clip(lakes);
      for (let ring = 2; ring >= 1; ring--) {
        context.strokeStyle = `rgba(${theme.seaLine},${0.5 - ring * 0.12})`; context.lineWidth = 2 * ring * 2.2 / k; context.stroke(lakes);
        context.strokeStyle = theme.sea; context.lineWidth = (2 * ring * 2.2 - 0.8) / k; context.stroke(lakes);
      }
      context.restore();
    }
    context.strokeStyle = theme.shore; context.lineWidth = 0.6 / k; context.stroke(lakes);
    context.restore();
  }

  function drawBase() {
    const theme = THEMES[themeName];
    baseCtx.clearRect(0, 0, width, height);
    baseCtx.fillStyle = theme.background; baseCtx.fillRect(0, 0, width, height);
    const path = d3.geoPath(projection, baseCtx);
    if (state.projection === 'globe') drawRing(baseCtx);
    baseCtx.beginPath(); path(SPHERE);
    baseCtx.fillStyle = theme.sea; baseCtx.fill();
    baseCtx.save();
    baseCtx.beginPath(); path(SPHERE); baseCtx.clip();
    const coast = land ? projectGeometry(land).shape : null;
    if (coast) {
      baseCtx.lineJoin = 'round';
      if (detailed) {
        // Engraved water lines: concentric rings around every coast.
        const rings = state.zoom < 2 ? 3 : 5, gap = state.zoom < 2 ? 2.3 : 3;
        for (let k = rings; k >= 1; k--) {
          baseCtx.strokeStyle = `rgba(${theme.seaLine},${Math.max(0.08, 0.5 - k * 0.075)})`; baseCtx.lineWidth = 2 * k * gap; baseCtx.stroke(coast);
          baseCtx.strokeStyle = theme.sea; baseCtx.lineWidth = 2 * k * gap - 0.85; baseCtx.stroke(coast);
        }
      }
      baseCtx.fillStyle = theme.land; baseCtx.fill(coast);
      drawGeography(baseCtx, coast);
    }
    baseCtx.beginPath(); path(state.zoom >= 3 ? fineGraticule : graticule);
    baseCtx.strokeStyle = theme.grid; baseCtx.lineWidth = 0.55; baseCtx.stroke();
    if (coast) { baseCtx.strokeStyle = theme.coast; baseCtx.lineWidth = 0.75; baseCtx.stroke(coast); }
    baseCtx.restore();
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
      const radius = clamp(1.2 + Math.log10(Math.max(1, entry.pop) / 5000) * 0.75, 1.6, 3.1);
      cityDots.push({ city, point, radius });
      if (cityDots.length >= budget) break;
    }
  }

  function drawScene() {
    if (baseDirty) drawBase();
    const theme = THEMES[themeName];
    sceneCtx.clearRect(0, 0, width, height);
    sceneCtx.drawImage(baseCanvas, 0, 0, width, height);
    sceneCtx.lineJoin = 'round';
    for (const entry of projected) {
      sceneCtx.globalAlpha = lit(entry.polity) ? theme.wash : theme.veilWash;
      sceneCtx.fillStyle = colorFor(entry.polity); sceneCtx.fill(entry.shape);
    }
    if (detailed) {
      // Pigment pooled along each border, as on hand-coloured plates.
      const band = clamp(4.5 + state.zoom * 0.8, 5, 9);
      for (const entry of projected) {
        const strength = lit(entry.polity) ? theme.band : theme.veilBand;
        sceneCtx.save(); sceneCtx.clip(entry.shape);
        sceneCtx.strokeStyle = colorFor(entry.polity);
        sceneCtx.globalAlpha = strength * 0.35; sceneCtx.lineWidth = band; sceneCtx.stroke(entry.shape);
        sceneCtx.globalAlpha = strength * 0.45; sceneCtx.lineWidth = band * 0.55; sceneCtx.stroke(entry.shape);
        sceneCtx.globalAlpha = strength * 0.5; sceneCtx.lineWidth = band * 0.25; sceneCtx.stroke(entry.shape);
        sceneCtx.restore();
      }
    }
    sceneCtx.strokeStyle = theme.boundary; sceneCtx.lineWidth = 0.6;
    for (const entry of projected) {
      sceneCtx.globalAlpha = lit(entry.polity) ? 1 : 0.45; sceneCtx.stroke(entry.shape);
    }
    sceneCtx.globalAlpha = 1;
    for (const ghost of ghosts) {
      sceneCtx.save(); sceneCtx.setLineDash([0.1, 3.4]); sceneCtx.lineCap = 'round';
      sceneCtx.strokeStyle = theme.ghost; sceneCtx.lineWidth = 1.9; sceneCtx.stroke(ghost.shape); sceneCtx.restore();
    }
    if (focus) {
      for (const entry of projected) {
        if (!focus.fresh.has(entry.polity.k)) continue;
        sceneCtx.strokeStyle = theme.halo; sceneCtx.lineWidth = 3.6; sceneCtx.stroke(entry.shape);
        sceneCtx.strokeStyle = theme.fresh; sceneCtx.lineWidth = 1.5; sceneCtx.stroke(entry.shape);
      }
    }
    if (layers.borders === 'over') drawBorders(sceneCtx, 0.7);
    prepareCities();
    for (const { point, radius } of cityDots) {
      // Engraved maps mark a town with a circle and centre point.
      sceneCtx.beginPath(); sceneCtx.arc(point[0], point[1], themeName === 'dark' ? radius * 0.85 : radius, 0, Math.PI * 2);
      sceneCtx.fillStyle = theme.cityFill; sceneCtx.fill();
      sceneCtx.strokeStyle = theme.cityInk; sceneCtx.lineWidth = themeName === 'dark' ? 0.8 : 0.85; sceneCtx.stroke();
      if (themeName !== 'dark') {
        sceneCtx.beginPath(); sceneCtx.arc(point[0], point[1], Math.max(0.7, radius * 0.34), 0, Math.PI * 2);
        sceneCtx.fillStyle = theme.cityInk; sceneCtx.fill();
      }
    }
    if (!sphere) { sceneDirty = false; return; }
    if (state.projection === 'globe') {
      const [cx, cy] = projection.translate(), radius = sphereRadius();
      const shade = sceneCtx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.15, cx, cy, radius);
      shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(0.7, 'rgba(0,0,0,0)'); shade.addColorStop(1, theme.limb);
      sceneCtx.fillStyle = shade; sceneCtx.fill(sphere);
      sceneCtx.strokeStyle = theme.ring; sceneCtx.lineWidth = 1.2; sceneCtx.stroke(sphere);
    } else {
      // A double neatline frames the plate.
      sceneCtx.strokeStyle = theme.frame; sceneCtx.lineWidth = 4.6; sceneCtx.stroke(sphere);
      sceneCtx.strokeStyle = theme.background; sceneCtx.lineWidth = 2.4; sceneCtx.stroke(sphere);
    }
    sceneDirty = false;
  }

  function metrics(text, font, spacing, wrap = false) {
    const key = `${font}:${spacing}:${wrap ? 2 : 1}:${text}`;
    if (labelMetrics.has(key)) return labelMetrics.get(key);
    ctx.font = font; ctx.letterSpacing = `${spacing}px`;
    const measure = line => ctx.measureText(line).width - (spacing ? spacing : 0);
    let lines = text.split('\n');
    const words = text.split(/\s+/);
    if (wrap && lines.length === 1 && words.length > 1) {
      let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const trial = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
        const length = Math.max(...trial.map(measure));
        if (length < best) { best = length; lines = trial; }
      }
    }
    const result = { lines, width: Math.max(...lines.map(measure)) };
    ctx.letterSpacing = '0px';
    labelMetrics.set(key, result);
    return result;
  }

  function writeLines(lines, x, y, { font, spacing = 0, color, halo, haloWidth = 3, lineHeight }) {
    ctx.font = font; ctx.letterSpacing = `${spacing}px`;
    lines.forEach((line, i) => {
      const lineY = y + (i - (lines.length - 1) / 2) * lineHeight, lineX = x + spacing / 2;
      if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = haloWidth; ctx.strokeText(line, lineX, lineY); }
      ctx.fillStyle = color; ctx.fillText(line, lineX, lineY);
    });
    ctx.letterSpacing = '0px';
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
    function fits(box) {
      if (box[0] < 8 || box[1] < 8 || box[2] > width - 8 || box[3] > height - 8) return false;
      return !placed.some(other => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1]);
    }
    function claim(box) {
      if (!fits(box)) return false;
      placed.push(box); return true;
    }
    const emphasis = polity => polity.k === selectedKey ? 2 : focus?.fresh.has(polity.k) ? 1 : 0;
    const candidates = projected.map(entry => ({ ...entry, priority: Math.max(0, entry.bounds[2] - entry.bounds[0]) * Math.max(0, entry.bounds[3] - entry.bounds[1]) }))
      .sort((a, b) => emphasis(b.polity) - emphasis(a.polity) || b.priority - a.priority);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const ghost of ghosts) {
      if (!ghost.label) continue;
      const point = screenPoint(ghost.anchor);
      if (!point) continue;
      const font = `italic 400 12px ${SERIF}`, label = metrics(ghost.label, font, 0, true);
      const labelHeight = label.lines.length * 14.5;
      if (!claim([point[0] - label.width / 2 - 4, point[1] - labelHeight / 2 - 3, point[0] + label.width / 2 + 4, point[1] + labelHeight / 2 + 3])) continue;
      writeLines(label.lines, point[0], point[1], { font, color: theme.ink, halo: theme.halo, lineHeight: 14.5 });
    }
    // Territory names: spaced capitals for large territories, upper and lower
    // case for smaller ones; the selected territory is bold.
    for (const { polity, bounds } of candidates) {
      const point = screenPoint(labelPoint(polity));
      if (!point) continue;
      const selected = polity.k === selectedKey, fresh = focus?.fresh.has(polity.k);
      const screenWidth = bounds[2] - bounds[0], screenHeight = bounds[3] - bounds[1];
      const extent = Math.sqrt(Math.max(0, screenWidth * screenHeight));
      let tier = extent >= 120 ? 1 : extent >= 52 ? 2 : extent >= 26 ? 3 : fresh ? 3 : 0;
      if (selected) tier = 0;
      else if (!tier) continue;
      const size = selected ? 15.5 : tier === 1 ? 12.8 : tier === 2 ? 10.4 : 11.4;
      const caps = tier <= 2;
      const spacing = caps ? size * (selected ? 0.09 : tier === 1 ? 0.12 : 0.08) : 0;
      const font = `${selected ? 700 : 400} ${size}px ${SERIF}`;
      const text = caps ? polity.n.toUpperCase() : polity.n;
      const single = metrics(text, font, spacing);
      const label = single.width > Math.max(screenWidth * 1.15, 70) && text.includes(' ') ? metrics(text, font, spacing, true) : single;
      const lineHeight = size * 1.2, labelHeight = label.lines.length * lineHeight;
      if (!selected && !fresh && screenWidth < label.width * 0.6 && screenHeight < labelHeight * 1.6) continue;
      const padding = selected ? 7 : 3;
      const positions = selected || fresh ? [point, [point[0], point[1] + labelHeight + 22], [point[0], point[1] - labelHeight - 22], [point[0] + label.width / 2 + 24, point[1]], [point[0] - label.width / 2 - 24, point[1]]] : [point];
      const at = positions.find(candidate => claim([candidate[0] - label.width / 2 - padding, candidate[1] - labelHeight / 2 - padding, candidate[0] + label.width / 2 + padding, candidate[1] + labelHeight / 2 + padding]));
      if (!at) continue;
      const color = selected ? theme.selected : fresh ? theme.freshText : lit(polity) ? theme.ink : theme.veilInk;
      writeLines(label.lines, at[0], at[1], { font, spacing, color, halo: theme.halo, haloWidth: selected ? 4 : 3, lineHeight });
    }
    ctx.textAlign = 'left';
    const cityFont = `400 11.5px ${SERIF}`;
    for (const { city, point, radius } of cityDots) {
      const label = metrics(city.n, cityFont, 0);
      const positions = [point[0] + radius + 3.5, point[0] - radius - 3.5 - label.width];
      for (const x of positions) {
        if (!claim([x - 2, point[1] - 7.5, x + label.width + 2, point[1] + 7.5])) continue;
        writeLines([city.n], x, point[1] + 0.5, { font: cityFont, color: theme.ink, halo: theme.halo, lineHeight: 12 });
        break;
      }
    }
    // Water: italic, widely spaced capitals.
    ctx.textAlign = 'center';
    const waters = state.zoom < 2.2 ? OCEANS : SEAS;
    for (const [name, coord, angle] of waters) {
      const point = screenPoint(coord);
      if (!point) continue;
      const size = state.zoom < 2.2 ? 11 : 10.5, spacing = size * 0.18, font = `italic 400 ${size}px ${SERIF}`;
      const text = name.toUpperCase(), label = metrics(text, font, spacing);
      if (angle) {
        const reach = label.width / 2 + 4;
        const box = [point[0] - reach * Math.abs(Math.cos(angle)) - 6, point[1] - reach * Math.abs(Math.sin(angle)) - 6, point[0] + reach * Math.abs(Math.cos(angle)) + 6, point[1] + reach * Math.abs(Math.sin(angle)) + 6];
        if (!claim(box)) continue;
        ctx.save(); ctx.translate(point[0], point[1]); ctx.rotate(angle);
        writeLines([text], 0, 0, { font, spacing, color: theme.water, lineHeight: size });
        ctx.restore();
      } else if (claim([point[0] - label.width / 2 - 4, point[1] - 8, point[0] + label.width / 2 + 4, point[1] + 8])) {
        writeLines([text], point[0], point[1], { font, spacing, color: theme.water, lineHeight: size });
      }
    }
  }

  function drawHighlight(entry, selected) {
    if (!entry) return;
    const theme = THEMES[themeName];
    ctx.lineJoin = 'round';
    if (selected) {
      ctx.strokeStyle = theme.halo; ctx.lineWidth = 4.8; ctx.stroke(entry.shape);
      ctx.strokeStyle = theme.selected; ctx.lineWidth = 2.1; ctx.stroke(entry.shape);
    } else {
      ctx.strokeStyle = theme.hover; ctx.lineWidth = 1.4; ctx.stroke(entry.shape);
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

  // The globe opens toward the territories mapped in the current year.
  function globeRotation(fallback) {
    const center = polityCenter(polities) || fallback;
    return [-center[0], clamp(-center[1], -60, 60), 0];
  }

  function reset() {
    state.zoom = 1; state.panX = 0; state.panY = 0;
    state.rotation = state.projection === 'globe' ? globeRotation([10, 15]) : [-10, -15, 0];
    invalidateView();
  }

  // `bottom` reserves screen space covered by an overlay, such as a phone sheet.
  function focusOn(polity, { bottom = 0 } = {}) {
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
      const available = Math.max(height * 0.3, height - bottom);
      state.zoom = clamp(Math.min(width * 0.76 / extentWidth, available * 0.74 / extentHeight), 1.1, state.projection === 'globe' ? 6 : 18);
      if (state.projection === 'flat') {
        state.panX = (width / 2 - (bounds[0][0] + bounds[1][0]) / 2) * state.zoom;
        state.panY = (height / 2 - (bounds[0][1] + bounds[1][1]) / 2) * state.zoom - (height - available) / 2;
      } else state.panY = -(height - available) / 2;
    }
    invalidateView();
  }

  function focusPoint(coord, zoom = 6) {
    state.zoom = clamp(zoom, 0.85, 40); state.panX = 0; state.panY = 0;
    if (state.projection === 'globe') state.rotation = [-coord[0], clamp(-coord[1], -89.9, 89.9), 0];
    setupProjection();
    if (state.projection === 'flat') {
      const point = projection(coord);
      state.panX = width / 2 - point[0]; state.panY = height / 2 - point[1];
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
      if ('rivers' in data) {
        riverRanks = byRank(data.rivers?.rivers);
        lakeRanks = byRank(data.rivers?.lakes);
        geographyCache = null;
      }
      baseDirty = sceneDirty = needsDraw = true; requestDraw();
    },
    /** Supply the shaded-relief image (a Blob). Resolves to 'ready', or 'unsupported' without WebGL 2. */
    async setRelief(blob) {
      const redraw = () => { baseDirty = sceneDirty = needsDraw = true; requestDraw(); };
      if (terrain === undefined) terrain = createTerrain({ onChange: redraw });
      if (!terrain) return 'unsupported';
      await terrain.setImage(blob);
      redraw();
      return 'ready';
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
    setSelected(key) {
      if ((key || null) === selectedKey) return;
      selectedKey = key || null; sceneDirty = needsDraw = true; requestDraw();
    },
    /** Emphasise one map change: fresh and lit keys, plus dotted earlier extents. */
    setFocus(next) {
      focus = next ? { fresh: new Set(next.fresh || []), lit: new Set(next.lit || []), ghosts: next.ghosts || [] } : null;
      geometryDirty = sceneDirty = needsDraw = true; requestDraw();
    },
    setTheme(name) {
      if (!THEMES[name] || name === themeName) return;
      themeName = name; baseDirty = sceneDirty = needsDraw = true; requestDraw();
    },
    setLayers(next) {
      if (['off', 'under', 'over'].includes(next.borders)) layers.borders = next.borders;
      if (typeof next.cities === 'boolean') layers.cities = next.cities;
      if (typeof next.labels === 'boolean') layers.labels = next.labels;
      if (typeof next.terrain === 'boolean') layers.terrain = next.terrain;
      if (typeof next.rivers === 'boolean') layers.rivers = next.rivers;
      baseDirty = sceneDirty = needsDraw = true; requestDraw();
    },
    setProjection(mode) {
      if (!['flat', 'globe'].includes(mode) || mode === state.projection) return;
      const center = getView().center || [-state.rotation[0], -state.rotation[1]];
      // From the whole-world map, turn toward the year's territories; from a
      // zoomed map, keep looking at the same place.
      const overview = state.zoom <= 1.05 && Math.abs(state.panX) < 1 && Math.abs(state.panY) < 1;
      state.projection = mode; state.panX = state.panY = 0;
      if (mode === 'globe') state.rotation = overview && polities.length ? globeRotation(center) : [-center[0], clamp(-center[1], -89.9, 89.9), 0];
      setupProjection();
      if (mode === 'flat') {
        const point = projection(center);
        state.panX = width / 2 - point[0]; state.panY = height / 2 - point[1];
      }
      invalidateView();
    },
    /** True when a coordinate is drawn inside the current view. */
    inView(coord) { return Boolean(projection && screenPoint(coord)); },
    setView, getView, zoomBy: factor => zoomAt(factor), reset, focus: focusOn, focusPoint, resize,
    destroy() {
      destroyed = true; clearPointers(); observer.disconnect();
      clearTimeout(settleTimer);
      listeners.forEach(remove => remove());
      if (frameId) cancelAnimationFrame(frameId);
    },
  };
}
