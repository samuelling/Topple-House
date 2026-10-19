// Later levels: check that obvious builds fail for the right reason and creative ones work.
const { build, E } = require('./solve.js');
function play(id, strokes, gadgets = [], label) {
  const W = E.buildWorld([id], false), L = E.LEVELS.find(l => l.id === id);
  for (const g of gadgets) { const p = E.placeGadgetProblem(W, [], g, gadgets, g); if (p) console.log('   gadget problem', g.k, p); }
  const doms = build(W, strokes, gadgets);
  const sim = E.makeSim(W, doms, null, gadgets); E.startRun(sim); E.runToEnd(sim);
  const ev = t => sim.events.filter(e => e.type === t).length;
  let ok = sim.hits.length === L.targets.length;
  if (ok && L.ordered) { const t = L.targets.slice().sort((a, b) => a.order - b.order).map(t => sim.hits.find(h => h.id === t.id).t); for (let i = 1; i < t.length; i++) if (t[i] < t[i - 1]) ok = false; }
  console.log(`${(ok ? 'WIN ' : 'fail')} ${id} ${label}: ${doms.length} dominoes, hits ${sim.hits.map(h => h.id + '@' + h.t.toFixed(1)).join(' ') || '-'}, squashed ${ev('squash')}, caught ${ev('caught')}, bumps ${ev('bump')}, standing ${sim.d.filter(d => d.st === 0).length}, t=${sim.t.toFixed(1)}`);
  return { ok, sim, doms };
}
module.exports = { play };
if (require.main === module) {
  const P = Math.PI;
  // ---- Nursery: the baby crawls north through the gap (x 115-145) from t=0.5, then on to the top wall ----
  const toBox = [[130, 140], [110, 110], [75, 72], [58, 57]];
  play('nursery', [{ pts: [[266, 302], [140, 300], [130, 285], [130, 220], [130, 165], ...toBox] }], [], 'straight through the gap');
  play('nursery', [{ pts: [[266, 302], [215, 290], [160, 235], [130, 215], [130, 165], ...toBox] }], [], 'diagonal shortcut');
  // wait for the baby: go the long way round, then leave the gap heading west, out of the baby's lane
  const exitWest = [[130, 205], [130, 160], [122, 146], [100, 132], [70, 90], [56, 60]];
  play('nursery', [{ pts: [[266, 302], [40, 302], [30, 280], [40, 235], [100, 228], [122, 222], ...exitWest] }], [], 'long way round, exit west');
  for (const p of [400, 440, 480]) play('nursery', [{ pts: [[266, 302], [240, 290], [222, 268], [221, 255]] }],
    [{ k: 'catapult', x: 220, y: 240, a: Math.atan2(50 - 240, 50 - 220), L: 'g', power: p }], `catapult over the divider @${p}`);
  for (const p of [200, 260]) play('nursery', [], [{ k: 'catapult', x: 130, y: 110, a: Math.atan2(50 - 110, 50 - 130), L: 'g', power: p }], `catapult in the baby's lane @${p}`);
  // ---- Den: no marble; the roomba (40 cm/s) loops from (95,265) east, north, west, south ----
  const consoleLine = [[150, 265], [200, 265], [240, 265], [270, 265], [286, 263]];
  play('den', [{ pts: consoleLine }], [], 'trigger on the path toward the console');
  play('den', [{ pts: [[286, 263], [270, 265], [240, 265], [200, 265], [150, 265]] }], [], 'trigger drawn backwards');
  for (const p of [400, 440]) play('den', [{ pts: consoleLine }], [{ k: 'catapult', x: 220, y: 150, a: Math.atan2(40 - 150, 105 - 220), L: 'g', power: p }], `trigger + catapult the roomba bumps @${p}`);
  // ---- Sunroom: the marble rolls east from the door toward the cat bed (165,150) ----
  play('sunroom', [], [], 'nothing built');
  const toCat = [[62, 100], [110, 82], [150, 92], [165, 112], [171, 124]];
  const chime = [[110, 82], [200, 75], [235, 95], [240, 180], [255, 220], [282, 250]];
  play('sunroom', [{ pts: toCat.slice(0, 3) }, { pts: chime }], [], 'catch the marble, line to the chime');
  const cA = Math.atan2(40 - 118, 277 - 183);
  for (const p of [440, 480, 520]) {
    // find the domino nearest the branch point so the second stroke starts on it
    const { E: EE } = require('./solve.js'); const W = EE.buildWorld(['sunroom'], false);
    const g = [{ k: 'catapult', x: 183, y: 118, a: cA, L: 'g', power: p }];
    const first = build(W, [{ pts: toCat }], g);
    const j = first.reduce((bi, d, i) => Math.hypot(d.x - 110, d.y - 82) < Math.hypot(first[bi].x - 110, first[bi].y - 82) ? i : bi, 0);
    play('sunroom', [{ pts: toCat }, { pts: [[first[j].x, first[j].y], ...chime.slice(1)] }], g, `line into a catapult + branch to the chime @${p}`);
  }
}
