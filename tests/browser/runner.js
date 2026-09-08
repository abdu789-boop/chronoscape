// CPU submitted on the main thread, excluding network, RAF waiting, and GPU paint.
const nativeRAF = window.requestAnimationFrame.bind(window);
let sample = null;
export function timedDraw(callback) {
  const start = performance.now();
  try { return callback(); } finally { if (sample) sample.draw += performance.now() - start; }
}
window.requestAnimationFrame = callback => nativeRAF(time => timedDraw(() => callback(time)));
const settle = () => new Promise(resolve => nativeRAF(() => nativeRAF(resolve)));
export async function register(adapter) {
  await settle();
  parent.postMessage({ qa: 'chronoscape', ready: adapter.id, years: adapter.years, width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio, 2) }, location.origin);
  window.addEventListener('message', async event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.qa !== 'chronoscape') return;
    const { request, action, value } = event.data;
    if (!['year', 'camera'].includes(action)) return;
    try {
      sample = { draw: 0 };
      const start = performance.now();
      const count = adapter[action](value);
      const sync = performance.now() - start;
      const prep = Math.max(0, sync - sample.draw);
      await settle();
      const result = { prep, draw: sample.draw, total: prep + sample.draw, count };
      sample = null;
      parent.postMessage({ qa: 'chronoscape', request, result }, location.origin);
    } catch (error) {
      sample = null;
      parent.postMessage({ qa: 'chronoscape', request, error: String(error) }, location.origin);
    }
  });
}
