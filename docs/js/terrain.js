/* Shaded relief, reprojected on the graphics card.

   One plate carree image serves both projections: for every screen pixel the
   fragment shader inverts the current Equal Earth or orthographic projection
   and samples the relief there. The image is mid-grey on level ground; map.js
   blends the result over the land, so only slopes change the colour beneath.
   The projection formulas follow d3 exactly, so the relief stays registered
   with the vector layers at every zoom and rotation. */

const VERTEX = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D relief;
uniform bool globe;
uniform float height;       // drawing buffer height, device pixels
uniform float ratio;        // device pixels per CSS pixel
uniform vec3 view;          // translate x, translate y, scale (CSS pixels)
uniform vec3 turn;          // d3 rotation: lambda, cos phi, sin phi (radians)
out vec4 colour;
const float PI = 3.141592653589793;
const float A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = 0.8660254037844386;
void main() {
  vec2 css = vec2(gl_FragCoord.x, height - gl_FragCoord.y) / ratio;
  vec2 p = vec2(css.x - view.x, view.y - css.y) / view.z;
  float lambda, phi;
  bool inside;
  if (globe) {
    // Inverse orthographic, then d3's inverse rotation (gamma = 0).
    float r2 = dot(p, p);
    float depth = sqrt(max(0.0, 1.0 - r2));
    inside = r2 < 1.0;
    lambda = atan(p.x, depth * turn.y + p.y * turn.z) - turn.x;
    phi = asin(clamp(p.y * turn.y - depth * turn.z, -1.0, 1.0));
  } else {
    // Inverse Equal Earth by Newton's method, as in d3.geoEqualEarthRaw.
    float l = p.y;
    for (int i = 0; i < 8; i++) {
      float l2 = l * l, l6 = l2 * l2 * l2;
      l -= (l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2)) - p.y) / (A1 + 3.0 * A2 * l2 + l6 * (7.0 * A3 + 9.0 * A4 * l2));
    }
    float l2 = l * l, l6 = l2 * l2 * l2;
    float s = sin(l) / M;
    lambda = M * p.x * (A1 + 3.0 * A2 * l2 + l6 * (7.0 * A3 + 9.0 * A4 * l2)) / cos(l);
    phi = asin(clamp(s, -1.0, 1.0));
    inside = abs(s) <= 1.0 && abs(lambda) <= PI;
  }
  vec2 uv = vec2(lambda / (2.0 * PI) + 0.5, 0.5 - phi / PI);
  // Longitude wraps at the antimeridian; unwrap the screen-space gradient so
  // the seam samples the same level of detail as its neighbours.
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= round(dx.x); dy.x -= round(dy.x);
  float shade = textureGrad(relief, uv, dx, dy).r;
  colour = vec4(vec3(inside ? shade : 0.5), 1.0);
}`;

/**
 * Returns null when WebGL 2 is unavailable; the map then omits the relief.
 * `onChange` is called when the relief becomes drawable again after the
 * graphics context was lost and restored.
 */
export function createTerrain({ onChange = () => {} } = {}) {
  const canvas = globalThis.document?.createElement('canvas');
  let gl = null;
  try {
    gl = canvas?.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
  } catch { gl = null; }
  if (!gl || typeof gl.createShader !== 'function') return null;
  let program = null, uniforms = null, texture = null, source = null, generation = 0;

  function compile(type, text) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader did not compile');
    return shader;
  }

  function setup() {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program did not link');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(['relief', 'globe', 'height', 'ratio', 'view', 'turn'].map(name => [name, gl.getUniformLocation(program, name)]));
    texture = null;
  }

  // Decode the image, halving it on graphics hardware that cannot hold it whole.
  async function decode(blob) {
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    let width = bitmap.width, height = bitmap.height;
    if (width <= limit && height <= limit) return bitmap;
    while (width > limit || height > limit) { width /= 2; height /= 2; }
    const smaller = globalThis.document.createElement('canvas');
    smaller.width = width; smaller.height = height;
    smaller.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return smaller;
  }

  // One channel is kept: 8192 x 4096 occupies 32 MB, plus a third for mipmaps.
  function upload(image) {
    const next = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, next);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy) {
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR) { gl.deleteTexture(next); throw new Error(`The relief texture could not be created (WebGL error ${error}).`); }
    if (texture) gl.deleteTexture(texture);
    texture = next;
  }

  async function load() {
    const ticket = ++generation;
    const image = await decode(source);
    try {
      if (ticket !== generation || !program || gl.isContextLost()) return false;
      upload(image);
      return true;
    } finally { image.close?.(); }
  }

  try { setup(); } catch { return null; }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); program = texture = null; generation++; });
  canvas.addEventListener('webglcontextrestored', () => {
    try { setup(); } catch { program = null; return; }
    if (source) load().then(ready => { if (ready) onChange(); }).catch(() => {});
  });

  return {
    /** Decode and upload the relief image (a Blob); resolves when it can be drawn. */
    async setImage(blob) {
      source = blob;
      await load();
    },
    get ready() { return Boolean(program && texture && !gl.isContextLost()); },
    /**
     * Draw the relief for one camera and return the canvas, sized in device
     * pixels to match the map. `rotation` is d3's [lambda, phi] in degrees.
     */
    render({ globe, width, height, ratio, translate, scale, rotation = [0, 0] }) {
      if (!this.ready) return null;
      const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.relief, 0);
      gl.uniform1i(uniforms.globe, globe ? 1 : 0);
      gl.uniform1f(uniforms.height, pixelHeight);
      gl.uniform1f(uniforms.ratio, ratio);
      gl.uniform3f(uniforms.view, translate[0], translate[1], scale);
      const radians = Math.PI / 180;
      gl.uniform3f(uniforms.turn, rotation[0] * radians, Math.cos(rotation[1] * radians), Math.sin(rotation[1] * radians));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
  };
}
