// Study: check that the lift route, the trampoline route and a ramp route all reach the trophy.
const { scan } = require('./solve.js');
const lift = h => [{ k: 'lift', x: 95, y: 130, a: Math.PI, L: 'g', power: h }];
// the marble rolls west off the desk and lands about 35 cm out; a floor line catches it and runs to the lift
const line = [[80, 292], [62, 292], [58, 270], [70, 240], [100, 232], [106, 180], [100, 150], [96, 142]];
scan('study', [{ pts: line }], lift, 'study via lift');
// trampoline under the desk edge, aimed at the trophy
for (const [tx, ty] of [[104, 290], [85, 300]]) {
  const a = Math.atan2(130 - ty, 72 - tx);
  scan('study', [], p => [{ k: 'trampoline', x: tx, y: ty, a, L: 'g', power: p }], `study via trampoline @${tx},${ty}`);
}
// ramp from the desk edge down to the floor, then the same floor line into the lift
scan('study', [{ pts: [[56, 292], [50, 270], [60, 240], [100, 232], [106, 180], [100, 150], [96, 142]] }],
  h => [...lift(h), { k: 'ramp', x: 89.4, y: 290, a: Math.PI, L: 'g', power: 74 }], 'study ramp + lift');
// lift heights (the scan helper's range is for launch speeds, so check heights directly)
const { run } = require('./solve.js');
const okH = [];
for (let h = 16; h <= 140; h += 2) { const { sim } = run('study', [{ pts: line }], lift(h)); if (sim.hits.length) okH.push(h); }
console.log('study via lift, working heights:', okH.join(',') || 'NONE');
const okR = [];
for (let h = 16; h <= 140; h += 2) { const { sim } = run('study', [{ pts: [[56, 292], [50, 270], [60, 240], [100, 232], [106, 180], [100, 150], [96, 142]] }], [...lift(h), { k: 'ramp', x: 89.4, y: 290, a: Math.PI, L: 'g', power: 74 }]); if (sim.hits.length) okR.push(h); }
console.log('study ramp + lift, working heights:', okR.join(',') || 'NONE');
