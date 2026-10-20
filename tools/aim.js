// Launchers aim themselves: put one anywhere on the floor, aim it at a target, and check the marble hits.
// Reports, for each room and launcher, how many floor spots within range hit their target.
const E = require('../src/engine.js');
function tryShot(id, k, x, y, t) {
  const W = E.buildWorld([id], false);
  const g = { k, x, y, a: 0, L: 'g' };
  if (E.placeGadgetProblem(W, [], { ...g, a: Math.atan2(t.y - y, t.x - x) }, [], null)) return null;
  g.aim = E.snapAim(W, t.x, t.y, t.mounted ? t.z0 : t.base).aim;
  const sim = E.makeSim(W, [], [], [g]);
  const P = sim.gad[0].plan;
  E.fireGadget(sim, sim.gad[0]); E.runToEnd(sim);
  return { hit: !!sim.hits.find(h => h.id === t.id), blocked: P.blocked, clamped: P.clamped };
}
module.exports = { tryShot };
if (require.main === module) {
  for (const L of E.LEVELS) for (const k of Object.keys(L.toolbox || {})) {
    if (E.GADGETS[k].kind !== 'launcher') continue;
    for (const t of E.buildWorld([L.id], false).targets) {
      let n = 0, hit = 0, blocked = 0, far = 0;
      for (let x = 15; x < L.w; x += 12) for (let y = 15; y < L.h; y += 12) {
        const r = tryShot(L.id, k, x, y, t); if (!r) continue;
        if (r.clamped) { far++; continue; }
        n++; if (r.blocked) blocked++; else if (r.hit) hit++;
      }
      const clear = n - blocked;
      console.log(`${L.id.padEnd(9)} ${k.padEnd(9)} -> ${t.id.padEnd(9)} clear shots ${String(clear).padStart(3)}, hit ${String(hit).padStart(3)} (${clear ? Math.round(100 * hit / clear) : 0}%) | blocked ${blocked}, out of range ${far}`);
    }
  }
}
