// Solver checks: build scripted layouts with gadgets, scan gadget power, report what works.
const E = require('../src/engine.js');
function build(W, strokes, gadgets) {
  const doms = [];
  for (const s of strokes) {
    const L = s.L || 'g', pts = s.pts;
    const st = E.makeStroke(W, doms, 5.6, true, null, L, gadgets);
    st.start(...pts[0]);
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5);
      for (let i = 1; i <= n; i++) st.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n);
    }
  }
  return doms;
}
function run(id, strokes, gadgets, opts = {}) {
  const W = E.buildWorld([id], false);
  for (const g of gadgets) { const p = E.placeGadgetProblem(W, [], g, gadgets, g); if (p) console.log('  gadget problem', g.k, p); }
  const doms = build(W, strokes, gadgets);
  const sim = E.makeSim(W, doms, null, gadgets); E.startRun(sim); E.runToEnd(sim);
  return { sim, doms, W };
}
function scan(id, strokes, gadgetsFn, label) {
  const ok = [];
  let last = null;
  for (let p = 150; p <= 620; p += 10) {
    const gadgets = gadgetsFn(p);
    const { sim, doms } = run(id, strokes, gadgets);
    last = { sim, doms };
    const L = E.LEVELS.find(l => l.id === id);
    const all = sim.hits.length === L.targets.length;
    let ordered = true;
    if (L.ordered && all) { const t = L.targets.slice().sort((a, b) => a.order - b.order).map(t => sim.hits.find(h => h.id === t.id).t); for (let i = 1; i < t.length; i++) if (t[i] < t[i - 1]) ordered = false; }
    if (all && ordered) ok.push(p);
  }
  console.log(`${label || id}: dominoes ${last.doms.length}, works at power ${ok.length ? ok.join(',') : 'NONE'} | last run fired ${last.sim.gad.map(g => g.fired.toFixed(2))} hits ${last.sim.hits.map(h => h.id)} balls ${last.sim.rollers.map(b => [b.x, b.y, b.z].map(v => v.toFixed(0)).join('/'))}`);
  return last;
}
module.exports = { build, run, scan, E };
if (require.main === module) {
  // Bedroom: line from the marble to a catapult aimed at the nightstand
  const r = scan('bedroom', [{ pts: [[34, 352], [80, 330], [110, 300], [125, 250], [125, 229]] }],
    p => [{ k: 'catapult', x: 125, y: 215, a: -Math.PI / 2, L: 'g', power: p }]);
  console.log('  fired:', r.sim.gad.map(g => g.fired.toFixed(2)), 'balls', r.sim.rollers.map(b => [b.x.toFixed(0), b.y.toFixed(0), b.z.toFixed(0)].join('/')));
  scan('living', [
    { pts: [[150, 392], [150, 340], [120, 320], [95, 290], [92, 140], [80, 80], [64, 50]] },
    { pts: [[150, 345], [175, 330], [205, 322], [236, 314]] }],
    p => [{ k: 'catapult', x: 232, y: 300, a: Math.atan2(200 - 300, 165 - 232), L: 'g', power: p }]);
  scan('bathroom', [{ pts: [[30, 222], [90, 205], [135, 200], [148, 190], [150, 175]] }], p => [], 'bathroom (roll)');
  scan('hallway', [{ pts: [[33, 70], [70, 72], [96, 100], [100, 130], [100, 300], [100, 345]] }],
    p => [{ k: 'catapult', x: 100, y: 365, a: Math.PI / 2, L: 'g', power: p }]);
}
