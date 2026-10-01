/**
 * A faint paper grain for the light theme: fine specks and a few fibres in a
 * small repeating tile, generated once and applied by CSS. Deterministic, so the
 * page looks the same on every visit.
 */
export function paperGrain() {
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context?.createImageData) return null;
  let seed = 1206;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = 120; image.data[i + 1] = 96; image.data[i + 2] = 64;
    image.data[i + 3] = Math.round(random() ** 2 * 34);
  }
  context.putImageData(image, 0, 0);
  context.lineWidth = 0.6;
  for (let i = 0; i < 60; i++) {
    const x = random() * size, y = random() * size, length = 6 + random() * 20, angle = random() * Math.PI;
    context.strokeStyle = `rgba(120,96,64,${0.06 + random() * 0.06})`;
    context.beginPath(); context.moveTo(x, y);
    context.quadraticCurveTo(x + Math.cos(angle) * length / 2 + random() * 3, y + Math.sin(angle) * length / 2 + random() * 3, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
  return canvas.toDataURL('image/png');
}
