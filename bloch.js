/* Interactive Bloch sphere
 *
 *   |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩
 *   Bloch vector  r = (sinθ cosφ, sinθ sinφ, cosθ)
 *
 * Measuring along axis n (x, y or z) gives the +n eigenstate with
 * probability (1 + r·n)/2 (Born rule), otherwise the −n eigenstate.
 * e.g. Z on θ = 2π/3:  P(|0⟩) = cos²(π/3) = 1/4,  P(|1⟩) = 3/4.
 */
(function () {
  const svg = document.getElementById('bloch');
  if (!svg) return;

  // ---------- Colors ----------
  const QUBIT = '#196e42';   // state vector
  const OUTLINE = '#cfcec8';
  const GRID = '#dddcd6';
  const AXIS = '#c4c3bd';
  const LABEL = '#55544f';

  const PI = Math.PI;
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- 3D → 2D projection (orthographic) ----------
  const C = 160, R = 112;                       // centre and radius in SVG units
  const ELEV = 18 * PI / 180;                   // camera height above the equator
  const AZIM = 28 * PI / 180;                   // camera angle around the z axis
  const TOWARD = [Math.cos(ELEV) * Math.cos(AZIM), Math.cos(ELEV) * Math.sin(AZIM), Math.sin(ELEV)];
  const RIGHT = [-Math.sin(AZIM), Math.cos(AZIM), 0];
  const UP = [-Math.sin(ELEV) * Math.cos(AZIM), -Math.sin(ELEV) * Math.sin(AZIM), Math.cos(ELEV)];

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = a => { const l = Math.hypot(a[0], a[1], a[2]); return a.map(c => c / l); };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const project = p => ({ x: C + R * dot(p, RIGHT), y: C - R * dot(p, UP), depth: dot(p, TOWARD) });
  const pt = q => q.x.toFixed(2) + ' ' + q.y.toFixed(2);
  const blochVector = (theta, phi) => [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(e);
    return e;
  }

  // A great circle, split into the half facing the viewer and the half behind
  function circlePaths(fn) {
    let front = '', back = '', prev = null, prevSide = null;
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const q = project(fn(2 * PI * i / N));
      const side = q.depth >= 0 ? 'front' : 'back';
      let seg;
      if (side === prevSide) seg = ' L' + pt(q);
      else seg = ' M' + (prev ? pt(prev) : pt(q)) + ' L' + pt(q);
      if (side === 'front') front += seg; else back += seg;
      prev = q; prevSide = side;
    }
    return { front, back };
  }

  // ---------- Static sphere ----------
  const defs = el('defs', {});
  const grad = el('radialGradient', { id: 'bloch-shade', cx: '38%', cy: '32%', r: '75%' }, defs);
  el('stop', { offset: '0%', 'stop-color': '#ffffff' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#eeede8' }, grad);

  el('circle', { cx: C, cy: C, r: R, fill: 'url(#bloch-shade)', stroke: OUTLINE, 'stroke-width': 1 });

  const equator = circlePaths(t => [Math.cos(t), Math.sin(t), 0]);
  const meridian = circlePaths(t => [Math.cos(t), 0, Math.sin(t)]);
  for (const c of [equator, meridian]) {
    el('path', { d: c.back, fill: 'none', stroke: GRID, 'stroke-width': 1, 'stroke-dasharray': '3 4' });
    el('path', { d: c.front, fill: 'none', stroke: GRID, 'stroke-width': 1 });
  }

  const axes = [
    { v: [1, 0, 0], from: -1, to: 1.18 },
    { v: [0, 1, 0], from: -1, to: 1.18 },
    { v: [0, 0, 1], from: -1.18, to: 1.18 },
  ];
  for (const a of axes) {
    const p1 = project(a.v.map(c => c * a.from)), p2 = project(a.v.map(c => c * a.to));
    el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: AXIS, 'stroke-width': 0.9 });
  }
  const labels = [
    { p: [1.34, 0, 0], text: 'x', italic: true },
    { p: [0, 1.3, 0], text: 'y', italic: true },
    { p: [0, 0, 1.33], text: '|0⟩' },
    { p: [0, 0, -1.33], text: '|1⟩' },
  ];
  for (const l of labels) {
    const q = project(l.p);
    const t = el('text', {
      x: q.x, y: q.y, fill: LABEL, 'font-size': 14, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-style': l.italic ? 'italic' : 'normal',
    });
    t.textContent = l.text;
  }
  el('circle', { cx: C, cy: C, r: 2, fill: AXIS });

  // ---------- State vector (redrawn every frame) ----------
  const vecGroup = el('g', {});
  const guide = el('path', { fill: 'none', stroke: QUBIT, 'stroke-opacity': 0.4, 'stroke-width': 1, 'stroke-dasharray': '2 3' }, vecGroup);
  const shaft = el('line', { stroke: QUBIT, 'stroke-width': 2.6, 'stroke-linecap': 'round' }, vecGroup);
  const head = el('polygon', { fill: QUBIT }, vecGroup);
  const tipDot = el('circle', { r: 4, fill: QUBIT }, vecGroup);

  function drawVector(v) {
    const o = project([0, 0, 0]), p = project(v), foot = project([v[0], v[1], 0]);
    guide.setAttribute('d', 'M' + pt(o) + ' L' + pt(foot) + ' L' + pt(p));
    const dx = p.x - o.x, dy = p.y - o.y, len = Math.hypot(dx, dy);
    if (len < 4) {                                                   // pointing almost straight at you
      shaft.setAttribute('visibility', 'hidden');
      head.setAttribute('points', '');
      tipDot.setAttribute('visibility', 'visible');
      tipDot.setAttribute('cx', p.x); tipDot.setAttribute('cy', p.y);
      return;
    }
    tipDot.setAttribute('visibility', 'hidden');
    shaft.setAttribute('visibility', 'visible');
    const ux = dx / len, uy = dy / len;
    const hl = Math.min(13, len * 0.6), hw = hl * 0.42;
    const bx = p.x - ux * hl, by = p.y - uy * hl;
    shaft.setAttribute('x1', o.x); shaft.setAttribute('y1', o.y);
    shaft.setAttribute('x2', bx + ux); shaft.setAttribute('y2', by + uy);
    head.setAttribute('points', [
      [p.x, p.y], [bx - uy * hw, by + ux * hw], [bx + uy * hw, by - ux * hw],
    ].map(q => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(' '));
  }

  // ---------- Readout ----------
  const $ = id => document.getElementById(id);
  const out = { theta: $('theta-val'), thetaSub: $('theta-sub'), phi: $('phi-val'), phiSub: $('phi-sub'), last: $('last-result') };

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
  function piFraction(rad) {                 // 1.5707… → "π/2"; null if not a simple multiple of π
    const k = rad / PI;
    for (const den of [1, 2, 3, 4, 6]) {
      const num = Math.round(k * den);
      if (Math.abs(k * den - num) < 1e-9) {
        if (num === 0) return '0';
        const g = gcd(num, den), n = num / g, d = den / g;
        const top = (n === 1 ? '' : n) + 'π';
        return d === 1 ? top : top + '/' + d;
      }
    }
    return null;
  }
  const fmtAngle = rad => piFraction(rad) || rad.toFixed(3) + ' rad';
  function fmtDeg(rad) {
    const deg = rad * 180 / PI;
    return (Math.abs(deg - Math.round(deg)) < 1e-6 ? Math.round(deg) : deg.toFixed(1)) + '°';
  }

  // ---------- State & actions ----------
  const state = { theta: 0, phi: 0 };
  let shown = null;          // vector currently drawn (lags behind state while animating)
  let animId = 0;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animateTo(target) {
    const id = ++animId;
    if (!shown || reduceMotion) { shown = target; drawVector(shown); return; }
    const from = shown;
    const ang = Math.acos(clamp(dot(from, target), -1, 1));
    if (ang < 1e-4) { shown = target; drawVector(shown); return; }
    // rotate along the great circle from → target (any perpendicular axis if antipodal)
    let k = cross(from, target);
    if (Math.hypot(k[0], k[1], k[2]) < 1e-6) k = cross(from, Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    k = normalize(k);
    const kxf = cross(k, from);
    const dur = 450 + 450 * ang / PI;
    const t0 = performance.now();
    function frame(now) {
      if (id !== animId) return;            // a newer animation took over
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const a = ang * e;
      shown = from.map((c, i) => c * Math.cos(a) + kxf[i] * Math.sin(a));
      drawVector(shown);
      if (t < 1) requestAnimationFrame(frame);
      else { shown = target; drawVector(shown); }
    }
    requestAnimationFrame(frame);
  }

  function setState(theta, phi, message) {
    state.theta = theta;
    state.phi = phi;
    const atPole = theta === 0 || theta === PI;
    out.theta.textContent = fmtAngle(theta);
    out.thetaSub.textContent = fmtDeg(theta);
    out.phi.textContent = fmtAngle(phi);
    out.phiSub.textContent = atPole ? 'arbitrary at a pole' : fmtDeg(phi);
    if (message !== undefined) out.last.innerHTML = message;
    animateTo(blochVector(theta, phi));
  }

  function randomize() {
    // uniform over the sphere's surface (not uniform in θ)
    const theta = Math.acos(1 - 2 * Math.random());
    const phi = 2 * PI * Math.random();
    setState(theta, phi, 'Random state');
  }

  const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const OUTCOMES = {
    x: [{ ket: '|+⟩', theta: PI / 2, phi: 0 }, { ket: '|−⟩', theta: PI / 2, phi: PI }],
    y: [{ ket: '|+i⟩', theta: PI / 2, phi: PI / 2 }, { ket: '|−i⟩', theta: PI / 2, phi: 3 * PI / 2 }],
    z: [{ ket: '|0⟩', theta: 0, phi: 0 }, { ket: '|1⟩', theta: PI, phi: 0 }],
  };

  function measure(axis) {
    const r = blochVector(state.theta, state.phi);
    const pPlus = clamp((1 + dot(r, AXES[axis])) / 2, 0, 1);
    const plus = Math.random() < pPlus;
    const res = OUTCOMES[axis][plus ? 0 : 1];
    const p = plus ? pPlus : 1 - pPlus;
    setState(res.theta, res.phi,
      'Measured ' + axis.toUpperCase() + ' → ' + res.ket + '<br>probability ' + p.toFixed(2));
    return res.ket;
  }

  document.querySelectorAll('.bloch [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'random') randomize(); else measure(a);
    });
  });

  // Handy from the browser console, e.g. Bloch.set(2*Math.PI/3, 0); Bloch.measure('z')
  window.Bloch = {
    set: (theta, phi) => setState(theta, phi, 'State set from console'),
    measure,
    randomize,
    get state() { return { theta: state.theta, phi: state.phi }; },
  };

  randomize();
})();
