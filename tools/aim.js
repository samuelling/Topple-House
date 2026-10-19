const E = require('../src/engine.js');
// fire one gadget directly and see which powers hit a target
function windowFor(id, g, target) {
  const W = E.buildWorld([id], false), ok = [];
  for (let p = 150; p <= 620; p += 10) {
    const sim = E.makeSim(W, [], [], [{ ...g, power: p }]);
    sim.agents = []; sim.agentsUntil = 0; sim.cat = null; // just the throw
    const S = E.GADGETS[g.k];
    if (S.kind === 'tramp') sim.rollers.push({ k: 'marble', x: g.x, y: g.y, z: sim.gad[0].z + S.base + 30, r: 2.2, vx: 0, vy: 0, vz: -200, moving: true });
    else E.fireGadget(sim, sim.gad[0]);
    E.runToEnd(sim);
    if (sim.hits.find(h => h.id === target)) ok.push(p);
  }
  return ok;
}
module.exports = { windowFor };
if (require.main === module) {
  const [id, k, target] = process.argv.slice(2);
  const L = E.LEVELS.find(l => l.id === id), t = L.targets.find(t => t.id === target);
  const res = [];
  for (let x = 20; x < L.w; x += 15) for (let y = 20; y < L.h; y += 15) {
    const a = Math.atan2(t.y - y, t.x - x), g = { k, x, y, a, L: 'g' };
    const W = E.buildWorld([id], false);
    if (E.placeGadgetProblem(W, [], g, [g], g)) continue;
    const w = windowFor(id, g, target);
    if (w.length) res.push([w.length, x, y, Math.hypot(t.x - x, t.y - y).toFixed(0), w[0] + '-' + w[w.length - 1]]);
  }
  res.sort((a, b) => b[0] - a[0]);
  console.log(id, k, '->', target, 'best spots [steps, x, y, dist, powers]:');
  console.log(res.slice(0, 12).map(r => r.join(' ')).join('\n'));
  console.log('spots that work:', res.length);
}
