/* Historical geometry is parsed and wound away from the main rendering thread. */
importScripts('../lib/d3.v7.min.js');

function progress(phase, loaded, total, message) {
  self.postMessage({ type: 'progress', progress: { phase, loaded, total, message } });
}

function rewind(geometry) {
  const fix = rings => {
    for (const ring of rings) {
      if (d3.geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI) ring.reverse();
    }
  };
  if (geometry.type === 'Polygon') fix(geometry.coordinates);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(fix);
}

self.onmessage = async ({ data: { url } }) => {
  try {
    let response;
    try { response = await fetch(url); }
    catch { throw new Error('Could not download historical boundaries. Check your connection and retry.'); }
    if (!response.ok) throw new Error(`Could not load historical boundaries (HTTP ${response.status}). Please retry.`);
    // Browsers decompress streams. A compressed Content-Length cannot serve as
    // the denominator for decoded-byte progress, so leave its total unknown.
    const length = Number(response.headers.get('content-length'));
    const total = !response.headers.get('content-encoding') && length > 0 ? length : null;
    let text;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const chunks = [];
      let loaded = 0, lastUpdate = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        chunks.push(decoder.decode(value, { stream: true }));
        const now = performance.now();
        if (now - lastUpdate > 90) {
          progress('loading', loaded, total, 'Loading historical boundaries…');
          lastUpdate = now;
        }
      }
      chunks.push(decoder.decode());
      progress('processing', loaded, total, 'Preparing historical boundaries…');
      text = chunks.join('');
    } else {
      text = await response.text();
      progress('processing', null, null, 'Preparing historical boundaries…');
    }
    const polities = JSON.parse(text);
    for (const record of polities) rewind(record.g);
    self.postMessage({ type: 'done', polities });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof SyntaxError
      ? 'The historical boundary data could not be read. Please retry.'
      : error.message || 'Could not download historical boundaries. Check your connection and retry.' });
  }
};
