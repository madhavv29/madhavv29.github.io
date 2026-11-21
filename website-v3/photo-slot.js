/* Home-page photo slot
 *
 * - Shows a random photo from gallery/photos.js on every visit.
 * - Clicking the photo sends a ripple of ASCII glyphs out from the click point;
 *   the next photo is revealed behind the wavefront. Once the ripple leaves the
 *   frame the canvas is cleared, so the photo is never left covered.
 * - Photos come from a shuffled "bag": every photo is shown once before any
 *   repeats, then the bag is reshuffled.
 */
(function () {
  const slot = document.querySelector('[data-photo-slot]');
  const PHOTOS = (window.GALLERY || []).slice();
  if (!slot || !PHOTOS.length) return;
  const BASE = slot.dataset.base || 'gallery/';

  // ---------- Look & timing (edit these to tune the effect) ----------
  const RAMP = ' .-:+coe80';     // glyphs from dark to bright (as on cornellvc.com)
  const SPARK = '+*32#$@';       // glyphs that flicker right at the wavefront
  const CELL_W = 8, CELL_H = 12; // size of one glyph cell, in CSS pixels
  const FONT = '500 11px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const BAND = 44;               // px of glyphs trailing behind the wavefront
  const LEAD = 10;               // px of glyphs running ahead of it
  const REVEAL_LAG = 0.15;       // new photo appears this fraction of BAND behind the front
  const DURATION = 1300;         // ms for the wave to clear the whole photo
  const BACKING = 0.28;          // darkness behind the glyphs (0 = none, 1 = solid)
  const GLYPH_ALPHA = 0.8;       // glyph opacity at the strongest part of the ring
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Elements ----------
  let [cur, inc] = slot.querySelectorAll('img'); // cur = photo on show, inc = incoming photo
  const canvas = slot.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const sampler = document.createElement('canvas');
  const sctx = sampler.getContext('2d', { willReadFrequently: true });

  // ---------- Shuffle bag ----------
  let bag = [];
  let shown = null;
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function refill() {
    bag = shuffle(PHOTOS.slice());
    // don't start a new round with the photo that's already on screen
    if (bag.length > 1 && bag[bag.length - 1] === shown) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  function peek() { if (!bag.length) refill(); return bag[bag.length - 1]; }
  function take() { const n = peek(); bag.pop(); return n; }

  // ---------- Image loading ----------
  const loaded = new Map();
  function load(name) {
    if (!loaded.has(name)) {
      loaded.set(name, new Promise((resolve, reject) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => resolve(im);
        im.onerror = () => { loaded.delete(name); reject(new Error('Could not load ' + name)); };
        im.src = BASE + name;
      }));
    }
    return loaded.get(name);
  }
  const altText = name => name.replace(/\.[a-z]+$/i, '').replace(/-/g, ' ');

  // ---------- Geometry ----------
  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, jitter = new Float32Array(0);
  function layout() {
    const r = slot.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cols = Math.ceil(W / CELL_W);
    rows = Math.ceil(H / CELL_H);
    jitter = new Float32Array(cols * rows);
    for (let i = 0; i < jitter.length; i++) jitter[i] = Math.random() * 2 - 1; // ragged wavefront
  }

  // Average colour of every glyph cell for a photo (object-fit: cover, like the <img>)
  const grids = new Map();
  function colourGrid(name, im) {
    const key = name + '@' + cols + 'x' + rows;
    if (grids.has(key)) return grids.get(key);
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    sampler.width = cols; sampler.height = rows;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(im, (W - dw) / 2 / CELL_W, (H - dh) / 2 / CELL_H, dw / CELL_W, dh / CELL_H);
    let data = null;
    try { data = sctx.getImageData(0, 0, cols, rows).data; } catch (e) { /* file:// preview: colours unavailable */ }
    grids.set(key, data);
    return data;
  }

  // ---------- The ripple ----------
  function ripple(x, y, oldGrid, newGrid) {
    return new Promise(resolve => {
      const far = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
      const end = far + BAND + 24;            // the whole band has left the frame
      const t0 = performance.now();

      function frame(now) {
        const p = Math.min(1, (now - t0) / DURATION);
        const R = end * (1 - (1 - p) * (1 - p));          // ease-out: fast start, gentle finish
        const reveal = Math.max(0, R - BAND * REVEAL_LAG);
        inc.style.clipPath = `circle(${reveal.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (p < 1) drawBand(x, y, R, oldGrid, newGrid);

        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function drawBand(x, y, R, oldGrid, newGrid) {
    const rOut = R + LEAD + 10, rIn = Math.max(0, R - BAND - 10);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const r0 = Math.max(0, Math.floor((y - rOut) / CELL_H)), r1 = Math.min(rows - 1, Math.floor((y + rOut) / CELL_H));
    for (let r = r0; r <= r1; r++) {
      const cy = r * CELL_H + CELL_H / 2, dy = cy - y;
      const span = Math.sqrt(Math.max(0, rOut * rOut - dy * dy));
      const c0 = Math.max(0, Math.floor((x - span) / CELL_W)), c1 = Math.min(cols - 1, Math.floor((x + span) / CELL_W));
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        const cx = c * CELL_W + CELL_W / 2;
        const d = Math.hypot(cx - x, dy) + jitter[i] * 5;
        if (d < rIn) continue;
        const u = R - d;                      // > 0: behind the front, < 0: ahead of it
        if (u > BAND || u < -LEAD) continue;
        let w = u < 0 ? 1 + u / LEAD : 1 - u / BAND;   // strongest at the front
        w = w * w * (3 - 2 * w);

        // colour of the photo underneath this cell
        const grid = u > BAND * REVEAL_LAG ? newGrid : oldGrid;
        let cr = 200, cg = 200, cb = 200;
        if (grid) { cr = grid[i * 4]; cg = grid[i * 4 + 1]; cb = grid[i * 4 + 2]; }
        const lum = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;

        // dark backing so the glyphs read clearly over any photo
        ctx.fillStyle = `rgba(${cr * 0.22 | 0},${cg * 0.22 | 0},${cb * 0.22 | 0},${(BACKING * w).toFixed(3)})`;
        ctx.fillRect(c * CELL_W, r * CELL_H, CELL_W, CELL_H);

        // glyph: brightness picks the character, colour is a lightened version of the photo
        const atFront = Math.abs(u) < 10;
        let ch;
        if (atFront && Math.random() < 0.35) ch = SPARK[(Math.random() * SPARK.length) | 0];
        else ch = RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(Math.pow(lum, 0.8) * (RAMP.length - 1))))];
        const lift = atFront ? 0.6 : 0.35;
        ctx.fillStyle = `rgba(${(cr + (255 - cr) * lift) | 0},${(cg + (255 - cg) * lift) | 0},${(cb + (255 - cb) * lift) | 0},${(GLYPH_ALPHA * w).toFixed(3)})`;
        ctx.fillText(ch, cx, cy + 0.5);
      }
    }
  }

  // ---------- Showing photos ----------
  function setPhoto(el, name) {
    el.src = BASE + name;
    el.alt = altText(name);
  }

  let busy = false;
  async function advance(x, y) {
    if (busy) return;
    busy = true;
    slot.setAttribute('aria-busy', 'true');
    const oldName = shown;
    const newName = take();
    try {
      const [oldIm, newIm] = await Promise.all([load(oldName), load(newName)]);
      setPhoto(inc, newName);
      inc.style.clipPath = 'circle(0px at 0px 0px)';
      if (inc.decode) await inc.decode().catch(() => {});
      inc.style.zIndex = 2; cur.style.zIndex = 1;

      if (!reduceMotion) {
        if (document.fonts && document.fonts.load) await document.fonts.load(FONT).catch(() => {});
        await ripple(x, y, colourGrid(oldName, oldIm), colourGrid(newName, newIm));
      }
      inc.style.clipPath = 'none';
      [cur, inc] = [inc, cur];                 // the incoming photo is now the one on show
      inc.style.clipPath = 'circle(0px at 0px 0px)';
      shown = newName;
      load(peek()).catch(() => {});            // get the next one ready
    } catch (e) {
      console.warn(e);
    } finally {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      busy = false;
      slot.removeAttribute('aria-busy');
    }
  }

  slot.addEventListener('click', e => {
    const r = slot.getBoundingClientRect();
    advance(e.clientX - r.left, e.clientY - r.top);
  });
  slot.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(W / 2, H / 2); }
  });
  new ResizeObserver(layout).observe(slot);
  layout();

  // First photo
  shown = take();
  inc.style.clipPath = 'circle(0px at 0px 0px)';
  cur.addEventListener('load', () => slot.classList.add('is-ready'), { once: true });
  setPhoto(cur, shown);
  load(shown).then(() => load(peek())).catch(() => {});
})();
