// ===ENGINE START===
// Units: centimetres, seconds. Plan x/y with y growing "down" the screen; z is height.
const DH = 8, DW = 4, DT = 1.2;      // domino height, width, thickness (jumbo toppling dominoes)
const WT = 10;                        // wall thickness
const WALL_H = 34;                    // cutaway wall height above the floor
const GRAV = 981;
const STAIR_DOWN_REACH = 1.55, STAIR_UP_REACH = 0.75;
const CHW = DW / 2 + 0.6;            // half-width of a falling domino's contact edge (allows for wobble)

// Gadget registry. Every gadget has a footprint (len along its facing, wid across), a base height,
// one adjustable setting (stored as g.power: pmin..pmax in pstep steps) and a kind that decides its behaviour:
//   launcher  hit it from any side and the arm flings its marble at the spot it's aimed at (g.aim = [x, y, z]);
//             it works out its own speed and arc, so the player only chooses where the marble lands
//   ramp      a slope marbles roll down or up; the high end is at the back (power = rise, cm)
//   lift      hit it and its platform raises a marble, then nudges it off the front (power = height, cm)
//   tramp     a springboard: a marble landing on it is thrown up and forward (power = spring speed, cm/s)
// New kinds (fuses, mousetraps, toy trucks…) plug in through fireGadget, stepGadgets, stepBall and predictArc.
const cmS = v => (v / 100).toFixed(1) + ' m/s', cm = v => Math.round(v) + ' cm';
const GADGETS = {
  catapult: { name: 'Catapult', kind: 'launcher', len: 28, wid: 12, base: 6, armZ: 9, range: 280, arcs: [55, 60, 50, 65, 45, 70, 40, 75, 35, 30], pdef: 0 },
  trebuchet: { name: 'Trebuchet', kind: 'launcher', len: 42, wid: 18, base: 8, armZ: 46, range: 520, arcs: [62, 68, 56, 74, 50, 78, 44, 38], pdef: 0 },
  ramp: { name: 'Ramp', kind: 'ramp', len: 60, wid: 11, base: 2, pmin: 10, pmax: 100, pdef: 46, pstep: 2, label: 'Height', fmt: cm },
  lift: { name: 'Pulley lift', kind: 'lift', len: 18, wid: 16, base: 3, speed: 55, push: 70, pmin: 16, pmax: 140, pdef: 60, pstep: 2, label: 'Height', fmt: cm },
  trampoline: { name: 'Trampoline', kind: 'tramp', len: 26, wid: 26, base: 8, angle: 66 * Math.PI / 180, pmin: 150, pmax: 480, pdef: 300, pstep: 10, label: 'Spring', fmt: cmS },
};
// Height of each target's body, for reach checks
const TARGET_H = { bell: 7, switch: 9, remote: 2, cereal: 22, chime: 11, duck: 12, doorbell: 12, trophy: 18 };

// ---------- Rooms ----------
// furniture: top = height of its top surface; build = dominoes can stand on it.
// targets: on = furniture id it sits on (else the floor); z0/z1 override its height band.
const LEVELS = [
  {
    id: 'bedroom', name: 'Bedroom', mission: 'Wake-up call',
    goal: 'Ring the bell on the nightstand.', w: 300, h: 380, floor: 'carpet', elev: 100,
    doors: [{ side: 'R', a: 40, b: 90, link: true }],
    decor: [{ k: 'rug', x: 70, y: 245, w: 150, h: 95 }],
    furniture: [
      { id: 'bed', k: 'bed', x: 150, y: 100, w: 140, h: 200, top: 46, build: true, label: 'Bed' },
      { id: 'ns', k: 'nightstand', x: 105, y: 100, w: 40, h: 42, top: 50, build: true, label: 'Nightstand' },
      { id: 'dresser', k: 'dresser', x: 10, y: 150, w: 45, h: 150, top: 82, build: true, label: 'Dresser' },
      { id: 'toybox', k: 'toybox', x: 228, y: 308, w: 62, h: 62, top: 47, build: true, label: 'Toy box' },
      { k: 'basket', cx: 62, cy: 60, r: 17, top: 35, label: 'Laundry' },
    ],
    noPlace: [], stairs: [],
    targets: [{ id: 'bell', k: 'bell', x: 125, y: 121, r: 6, hitR: 9, on: 'ns', label: 'Bedside bell' }],
    props: [{ k: 'marble', x: 28, y: 352, a: 0, start: true }],
    toolbox: { catapult: 1, trampoline: 1 },
    budget: 60, par: 45,
  },
  {
    id: 'living', name: 'Living room', mission: 'Lights out',
    goal: 'Flip the lamp switch, then knock the remote off the coffee table.', w: 300, h: 420, floor: 'wood',
    doors: [{ side: 'R', a: 20, b: 70, link: true }],
    decor: [{ k: 'rug', x: 95, y: 140, w: 110, h: 150 }],
    furniture: [
      { id: 'sofa', k: 'sofa', x: 10, y: 110, w: 60, h: 190, top: 30, label: 'Sofa' },
      { id: 'table', k: 'table', x: 112, y: 165, w: 76, h: 100, top: 42, build: true, label: 'Coffee table' },
      { id: 'chair', k: 'armchair', x: 112, y: 12, w: 70, h: 60, top: 30, label: 'Armchair' },
      { id: 'tv', k: 'tv', x: 255, y: 150, w: 35, h: 160, top: 45, label: 'TV stand' },
      { k: 'lamp', cx: 34, cy: 38, r: 16, top: 150, label: 'Floor lamp' },
      { k: 'plant', cx: 262, cy: 380, r: 18, top: 60, label: 'Plant' },
    ],
    noPlace: [], stairs: [],
    targets: [
      { id: 'lamp', k: 'switch', x: 66, y: 46, r: 6, label: 'Lamp switch' },
      { id: 'remote', k: 'remote', x: 165, y: 200, r: 6, on: 'table', label: 'TV remote' },
    ],
    props: [{ k: 'marble', x: 150, y: 400, a: -Math.PI / 2, start: true }],
    toolbox: { catapult: 1 },
    budget: 120, par: 90,
  },
  {
    id: 'kitchen', name: 'Kitchen', mission: 'Breakfast order',
    goal: 'Tip the cereal box on the island first, then ring the spoon chime.', w: 340, h: 360, floor: 'tile',
    ordered: true,
    doors: [{ side: 'L', a: 160, b: 210, link: true }, { side: 'L', a: 290, b: 340, link: true }],
    decor: [],
    furniture: [
      { id: 'counter', k: 'counter', x: 10, y: 10, w: 250, h: 55, top: 90, build: true, label: 'Counter' },
      { id: 'fridge', k: 'fridge', x: 262, y: 10, w: 68, h: 72, top: 175, label: 'Fridge' },
      { id: 'counter2', k: 'counter', x: 10, y: 65, w: 55, h: 85, top: 90, build: true, label: 'Counter' },
      { id: 'island', k: 'island', x: 120, y: 165, w: 120, h: 70, top: 90, build: true, label: 'Island' },
      { k: 'bin', cx: 305, cy: 200, r: 15, top: 44, label: 'Bin' },
    ],
    noPlace: [], stairs: [],
    targets: [
      { id: 'cereal', k: 'cereal', x: 205, y: 200, r: 7, on: 'island', label: 'Cereal box', order: 1 },
      { id: 'spoon', k: 'chime', x: 132, y: 320, r: 6, label: 'Spoon chime', order: 2 },
    ],
    props: [{ k: 'marble', x: 150, y: 50, a: Math.PI, start: true, on: 'counter' }],
    toolbox: { trebuchet: 1, catapult: 1, lift: 1 },
    budget: 150, par: 90,
  },
  {
    id: 'bathroom', name: 'Bathroom', mission: 'Rubber duck',
    goal: 'Knock the rubber duck off the rim of the tub.', w: 240, h: 240, floor: 'bath', elev: 100,
    doors: [{ side: 'L', a: 40, b: 90, link: true }],
    decor: [],
    furniture: [
      { id: 'tub', k: 'tub', x: 70, y: 10, w: 160, h: 70, top: 52, label: 'Bathtub' },
      { id: 'toilet', k: 'toilet', x: 172, y: 158, w: 58, h: 72, top: 42, label: 'Toilet' },
      { id: 'sink', k: 'sink', x: 10, y: 140, w: 50, h: 58, top: 82, build: true, label: 'Sink' },
    ],
    noPlace: [{ x: 70, y: 96, w: 140, h: 54, label: 'Bath mat' }],
    stairs: [],
    targets: [{ id: 'duck', k: 'duck', x: 150, y: 76, r: 7, hitR: 15, on: 'tub', z0: 0, label: 'Rubber duck' }],
    props: [
      { k: 'marble', x: 24, y: 222, a: 0, start: true },
      { k: 'roll', x: 150, y: 168, label: 'Toilet roll' },
    ],
    toolbox: { catapult: 1, trampoline: 1 },
    budget: 32, par: 26,
  },
  {
    id: 'hallway', name: 'Hallway & stairs', mission: 'Doorbell',
    goal: 'Press the doorbell button on the front door.', w: 200, h: 460, floor: 'wood',
    doors: [
      { side: 'L', a: 40, b: 90, link: true }, { side: 'L', a: 400, b: 450, link: true },
      { side: 'R', a: 40, b: 90, link: true }, { side: 'R', a: 400, b: 450, link: true },
      { side: 'B', a: 50, b: 150, ext: true },
    ],
    decor: [{ k: 'runner', x: 70, y: 310, w: 60, h: 120 }],
    furniture: [
      { k: 'rail', x: 10, y: 120, w: 8, h: 180, top: 90, label: '' },
      { k: 'rail', x: 182, y: 120, w: 8, h: 180, top: 90, label: '' },
      { k: 'plant', cx: 166, cy: 42, r: 17, top: 60, label: 'Plant' },
      { id: 'bench', k: 'bench', x: 10, y: 325, w: 38, h: 70, top: 44, build: true, label: 'Shoe bench' },
      { id: 'console', k: 'console', x: 152, y: 320, w: 38, h: 58, top: 78, build: true, label: 'Console' },
    ],
    noPlace: [],
    stairs: [{ x: 18, y: 120, w: 164, h: 180, dir: Math.PI / 2, top: 100, bottom: 0, steps: 8 }],
    targets: [{ id: 'chime', k: 'doorbell', x: 100, y: 446, r: 6, z0: 36, z1: 58, mounted: true, label: 'Doorbell' }],
    props: [{ k: 'marble', x: 26, y: 70, a: 0, start: true }],
    toolbox: { catapult: 1, ramp: 1 },
    budget: 76, par: 60,
  },
  {
    id: 'study', name: 'Study', mission: 'Top shelf',
    goal: 'Knock the trophy off the top step of the bookshelf.', w: 200, h: 340, floor: 'wood',
    doors: [{ side: 'R', a: 60, b: 110, link: true }],
    decor: [{ k: 'rug', x: 100, y: 120, w: 80, h: 110 }],
    furniture: [
      { id: 'shelf1', k: 'shelfstep', x: 10, y: 40, w: 25, h: 180, top: 30, build: true, label: 'Shelf' },
      { id: 'shelf2', k: 'shelfstep', x: 35, y: 40, w: 25, h: 180, top: 60, build: true, label: 'Shelf' },
      { id: 'shelf3', k: 'shelfstep', x: 60, y: 40, w: 25, h: 180, top: 90, build: true, label: 'Top shelf' },
      { id: 'desk', k: 'desk', x: 120, y: 250, w: 70, h: 80, top: 75, build: true, label: 'Desk' },
      { k: 'globe', cx: 165, cy: 40, r: 14, top: 70, label: 'Globe' },
    ],
    noPlace: [], stairs: [],
    targets: [{ id: 'trophy', k: 'trophy', x: 72, y: 130, r: 6, on: 'shelf3', label: 'Trophy' }],
    props: [{ k: 'marble', x: 180, y: 290, a: Math.PI, start: true, on: 'desk' }],
    toolbox: { lift: 1, trampoline: 1, ramp: 1 },
    budget: 50, par: 30,
  },
];
const SANDBOX_TOOLBOX = { catapult: 20, trebuchet: 20, ramp: 20, lift: 20, trampoline: 20 };

// Whole-house sandbox: rooms at offsets, interior doors open.
const HOUSE_OFFSETS = {
  bedroom: [0, 0], hallway: [300, 0], bathroom: [500, 0], living: [0, 380], kitchen: [500, 240], study: [300, 470],
};

// ---------- Geometry helpers ----------
function rectPoly(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function circlePoly(cx, cy, r, n = 14) {
  const p = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; p.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return p;
}
function domPoly(d) {
  const c = Math.cos(d.a), s = Math.sin(d.a), ht = DT / 2, hw = DW / 2;
  return [
    [d.x + c * ht - s * hw, d.y + s * ht + c * hw], [d.x + c * ht + s * hw, d.y + s * ht - c * hw],
    [d.x - c * ht + s * hw, d.y - s * ht - c * hw], [d.x - c * ht - s * hw, d.y - s * ht + c * hw],
  ];
}
function polyBox(p) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function project(p, ax, ay) { let mn = 1e9, mx = -1e9; for (const [x, y] of p) { const v = x * ax + y * ay; if (v < mn) mn = v; if (v > mx) mx = v; } return [mn, mx]; }
function satOverlap(A, B, margin = 0) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
      let ax = -(y1 - y0), ay = x1 - x0; const L = Math.hypot(ax, ay) || 1; ax /= L; ay /= L;
      const [a0, a1] = project(A, ax, ay), [b0, b1] = project(B, ax, ay);
      if (a1 + margin <= b0 || b1 + margin <= a0) return false;
    }
  }
  return true;
}
function pointInPoly(x, y, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function closestOnPoly(x, y, p) {
  let best = 1e18, bx = 0, by = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    let t = ((x - x0) * dx + (y - y0) * dy) / L2; t = Math.max(0, Math.min(1, t));
    const qx = x0 + dx * t, qy = y0 + dy * t, d2 = (x - qx) ** 2 + (y - qy) ** 2;
    if (d2 < best) { best = d2; bx = qx; by = qy; }
  }
  return [bx, by, Math.sqrt(best)];
}
function clipHalf(pts, keep) { // keep(p) -> signed value, >=0 inside
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], fa = keep(a), fb = keep(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// Smallest forward distance u at which a segment (width 2*hw, perpendicular to direction (ux,uy), starting at pivot) meets the polygon.
function uminInStrip(poly, px, py, ux, uy, hw) {
  let pts = poly.map(([x, y]) => { const dx = x - px, dy = y - py; return [dx * ux + dy * uy, -dx * uy + dy * ux]; });
  pts = clipHalf(pts, p => hw - p[1]); if (!pts.length) return null;
  pts = clipHalf(pts, p => p[1] + hw); if (!pts.length) return null;
  let m = 1e9; for (const p of pts) if (p[0] < m) m = p[0];
  return m;
}

// ---------- World building ----------

// ---------- World building ----------
function wallsFor(L, closedDoors) {
  const { w, h } = L, out = [], doors = [], gaps = [];
  const sides = {
    T: { len: w, mk: (a, b) => [a, 0, b - a, WT] },
    B: { len: w, mk: (a, b) => [a, h - WT, b - a, WT] },
    L: { len: h, mk: (a, b) => [0, a, WT, b - a] },
    R: { len: h, mk: (a, b) => [w - WT, a, WT, b - a] },
  };
  for (const side of ['T', 'B', 'L', 'R']) {
    const ds = L.doors.filter(d => d.side === side).sort((p, q) => p.a - q.a);
    let cur = 0;
    for (const d of ds) {
      if (d.a > cur) out.push(sides[side].mk(cur, d.a));
      const r = sides[side].mk(d.a, d.b);
      if (closedDoors || d.ext) doors.push({ rect: r, side, ext: !!d.ext }); else gaps.push(r);
      cur = d.b;
    }
    if (cur < sides[side].len) out.push(sides[side].mk(cur, sides[side].len));
  }
  return { walls: out, doors, gaps };
}

function buildWorld(levelIds, sandbox) {
  const W = { statics: [], targets: [], props: [], stairs: [], noPlace: [], rooms: [], decor: [], furniture: [], walls: [], doors: [], gaps: [], tops: {}, sandbox, ordered: false, toolbox: {} };
  for (const id of levelIds) {
    const L = LEVELS.find(l => l.id === id);
    const [ox, oy] = sandbox ? HOUSE_OFFSETS[id] : [0, 0];
    W.rooms.push({ id, x: ox, y: oy, w: L.w, h: L.h, floor: L.floor, name: L.name, elev: L.elev || 0 });
    if (L.ordered && !sandbox) W.ordered = true;
    if (!sandbox) W.toolbox = { ...(L.toolbox || {}) };
    for (const s of L.stairs) W.stairs.push({ ...s, x: s.x + ox, y: s.y + oy, poly: rectPoly(s.x + ox, s.y + oy, s.w, s.h) });
  }
  if (sandbox) W.toolbox = { ...SANDBOX_TOOLBOX };
  // second pass needs floor heights, which need every room and stair in place
  for (const id of levelIds) {
    const L = LEVELS.find(l => l.id === id);
    const [ox, oy] = sandbox ? HOUSE_OFFSETS[id] : [0, 0];
    const fid = k => sandbox ? id + ':' + k : k;
    const { walls, doors, gaps } = wallsFor(L, !sandbox);
    for (const [x, y, w, h] of gaps) W.gaps.push([x + ox, y + oy, w, h]);
    for (const [x, y, w, h] of walls) {
      const r = [x + ox, y + oy, w, h]; W.walls.push(r);
      // chunk long walls so their height follows the floor (stairs)
      const n = Math.max(1, Math.ceil(Math.max(w, h) / 22.5));
      for (let k = 0; k < n; k++) {
        const c = w > h ? [r[0] + k * w / n, r[1], w / n, h] : [r[0], r[1] + k * h / n, w, h / n];
        const cx = c[0] + c[2] / 2, cy = c[1] + c[3] / 2, off = 15;
        const fl = Math.max(floorAt(W, cx - (w < h ? off : 0), cy - (w < h ? 0 : off)), floorAt(W, cx + (w < h ? off : 0), cy + (w < h ? 0 : off)));
        W.statics.push({ kind: 'wall', poly: rectPoly(...c), z0: -5, z1: fl + 250 });  // full height: only drawn cut away
      }
    }
    for (const d of doors) {
      const r = [d.rect[0] + ox, d.rect[1] + oy, d.rect[2], d.rect[3]];
      W.doors.push({ rect: r, side: d.side, ext: d.ext });
      const fl = floorAt(W, r[0] + r[2] / 2 + (d.side === 'L' ? WT : d.side === 'R' ? -WT : 0), r[1] + r[3] / 2 + (d.side === 'T' ? WT : d.side === 'B' ? -WT : 0));
      W.statics.push({ kind: 'wall', poly: rectPoly(...r), z0: -5, z1: fl + 210 });
    }
    L.furniture.forEach((f, i) => {
      const g = f.r ? { ...f, cx: f.cx + ox, cy: f.cy + oy } : { ...f, x: f.x + ox, y: f.y + oy };
      g.id = fid(f.id || ('f' + i));
      g.poly = f.r ? circlePoly(g.cx, g.cy, f.r) : rectPoly(g.x, g.y, f.w, f.h);
      const base = f.r ? floorAt(W, g.cx, g.cy) : floorAt(W, g.x + f.w / 2, g.y + f.h / 2);
      g.base = base; g.z = base + (f.top || 50);
      W.furniture.push(g);
      W.statics.push({ kind: 'obs', poly: g.poly, z0: base - 1, z1: g.z, ref: g });
      if (!f.r) W.tops[g.id] = { id: g.id, poly: g.poly, rect: [g.x, g.y, f.w, f.h], z: g.z, build: !!f.build, f: g };
    });
    for (const d of L.decor) W.decor.push({ ...d, x: d.x + ox, y: d.y + oy });
    for (const n of L.noPlace) W.noPlace.push({ ...n, x: n.x + ox, y: n.y + oy, poly: rectPoly(n.x + ox, n.y + oy, n.w, n.h) });
    for (const t of L.targets) {
      const g = { ...t, id: sandbox ? id + ':' + t.id : t.id, x: t.x + ox, y: t.y + oy };
      g.L = t.on ? fid(t.on) : 'g';
      const sz = t.on ? W.tops[g.L].z : floorAt(W, g.x, g.y);
      g.base = sz;
      const fz = floorAt(W, g.x, g.y);
      g.z0 = t.z0 != null ? fz + t.z0 : sz;
      g.z1 = t.z1 != null ? fz + t.z1 : sz + (TARGET_H[t.k] || 8);
      g.poly = circlePoly(g.x, g.y, t.hitR || t.r, 12);
      W.targets.push(g); W.statics.push({ kind: 'target', poly: g.poly, z0: g.z0, z1: g.z1, ref: g });
    }
    for (const p of L.props) {
      if (sandbox && p.start && id !== 'bedroom') continue;
      const q = { ...p, x: p.x + ox, y: p.y + oy, a: p.a || 0, r: p.k === 'roll' ? 5.5 : 2.2, L: p.on ? fid(p.on) : 'g' };
      W.props.push(q);
    }
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of W.rooms) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  W.bounds = [x0, y0, x1, y1];
  W.cell = 20; W.grid = new Map();
  W.statics.forEach((s, i) => {
    s.box = polyBox(s.poly);
    const [a, b, c, d] = s.box;
    for (let gx = Math.floor(a / W.cell); gx <= Math.floor(c / W.cell); gx++)
      for (let gy = Math.floor(b / W.cell); gy <= Math.floor(d / W.cell); gy++) {
        const k = gx + ',' + gy; if (!W.grid.has(k)) W.grid.set(k, []); W.grid.get(k).push(i);
      }
  });
  return W;
}

function staticsNear(W, x0, y0, x1, y1) {
  const out = new Set();
  for (let gx = Math.floor(x0 / W.cell); gx <= Math.floor(x1 / W.cell); gx++)
    for (let gy = Math.floor(y0 / W.cell); gy <= Math.floor(y1 / W.cell); gy++) {
      const l = W.grid.get(gx + ',' + gy); if (l) for (const i of l) out.add(i);
    }
  return [...out].map(i => W.statics[i]);
}

function inRoom(W, x, y) {
  for (const r of W.rooms) if (x > r.x + WT && x < r.x + r.w - WT && y > r.y + WT && y < r.y + r.h - WT) return true;
  return false;
}
function inRoomOrDoor(W, x, y) {
  if (inRoom(W, x, y)) return true;
  for (const [gx, gy, gw, gh] of W.gaps) if (x >= gx && x <= gx + gw && y >= gy && y <= gy + gh) return true;
  return false;
}
function stairAt(W, x, y) { for (const s of W.stairs) if (pointInPoly(x, y, s.poly)) return s; return null; }

// Height of the floor (cm) at a plan point: rooms can sit upstairs, stairs step down.
function floorAt(W, x, y) {
  let room = null;
  for (const r of W.rooms) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { room = r; break; }
  if (!room) return 0;
  for (const s of W.stairs) {
    if (s.x < room.x || s.x > room.x + room.w || s.y < room.y || s.y > room.y + room.h) continue;
    const c = Math.cos(s.dir), sn = Math.sin(s.dir);
    let along, L;
    if (Math.abs(c) > 0.5) { along = c > 0 ? x - s.x : s.x + s.w - x; L = s.w; }
    else { along = sn > 0 ? y - s.y : s.y + s.h - y; L = s.h; }
    if (along < 0) return s.top;
    if (along >= L) return s.bottom;
    const k = Math.floor(along / (L / s.steps));
    return s.top - (s.top - s.bottom) * (k + 1) / s.steps;
  }
  return room.elev || 0;
}
// Height of a build layer ('g' = the floor) at a point
function layerZ(W, L, x, y) { return L && L !== 'g' && W.tops[L] ? W.tops[L].z : floorAt(W, x, y); }
// Which layer a plan point sits on when you build there: the furniture top, if it's buildable
function layerAt(W, x, y) {
  for (const id in W.tops) { const t = W.tops[id]; if (t.build && pointInPoly(x, y, t.poly)) return id; }
  return 'g';
}
// Highest surface under a point that is no higher than maxZ (for balls and falling pieces)
function supportAt(W, x, y, maxZ, gadgets) {
  let best = inRoomOrDoor(W, x, y) ? floorAt(W, x, y) : (W.sandbox ? -1 : floorAt(W, x, y)), L = 'g';
  for (const s of staticsNear(W, x - 1, y - 1, x + 1, y + 1)) {
    if (s.kind === 'target') continue;
    if (s.z1 <= maxZ + 0.5 && s.z1 > best && pointInPoly(x, y, s.poly)) { best = s.z1; L = s.ref && W.tops[s.ref.id] ? s.ref.id : 'x'; }
  }
  let ref = null;
  if (gadgets) for (const g of gadgets) {
    if (!pointInPoly(x, y, gadgetPoly(g))) continue;
    const top = gadgetSurface(g, x, y);
    if (top <= maxZ + 0.5 && top > best) { best = top; L = 'x'; ref = g; }
  }
  return [best, L, ref];
}
// Height of a gadget's top surface at a plan point (ramps slope down toward their front)
function gadgetSurface(g, x, y) {
  const S = GADGETS[g.k];
  if (S.kind === 'ramp') {
    const u = (x - g.x) * Math.cos(g.a) + (y - g.y) * Math.sin(g.a);
    const t = Math.max(0, Math.min(1, (u + S.len / 2) / S.len));
    return g.z + 1.5 + g.power * (1 - t);
  }
  return g.z + S.base;
}
function gadgetTop(g) { const S = GADGETS[g.k]; return g.z + (S.kind === 'ramp' ? g.power + 2 : S.kind === 'lift' ? 30 : S.base + 4); }

class DomIndex {
  constructor(doms) { this.cell = 10; this.map = new Map(); doms.forEach((d, i) => this.add(d, i)); }
  key(x, y) { return Math.floor(x / this.cell) + ',' + Math.floor(y / this.cell); }
  add(d, i) { const k = this.key(d.x, d.y); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(i); }
  near(x, y, r) {
    const out = [];
    for (let gx = Math.floor((x - r) / this.cell); gx <= Math.floor((x + r) / this.cell); gx++)
      for (let gy = Math.floor((y - r) / this.cell); gy <= Math.floor((y + r) / this.cell); gy++) {
        const l = this.map.get(gx + ',' + gy); if (l) out.push(...l);
      }
    return out;
  }
}

function gadgetPoly(g) {
  const s = GADGETS[g.k], c = Math.cos(g.a), n = Math.sin(g.a), hl = s.len / 2, hw = s.wid / 2;
  return [[g.x + c * hl - n * hw, g.y + n * hl + c * hw], [g.x + c * hl + n * hw, g.y + n * hl - c * hw], [g.x - c * hl + n * hw, g.y - n * hl - c * hw], [g.x - c * hl - n * hw, g.y - n * hl + c * hw]];
}
const zOverlap = (a0, a1, b0, b1) => a1 > b0 + 0.3 && b1 > a0 + 0.3;

// Why a domino can't go here, or null when it can.
function placeProblem(W, doms, x, y, a, skip, props, L, gadgets) {
  L = L || 'g';
  const P = domPoly({ x, y, a });
  let z;
  if (L === 'g') {
    if (!inRoomOrDoor(W, x, y)) return 'wall';
    for (const n of W.noPlace) if (pointInPoly(x, y, n.poly)) return 'slippery';
    z = floorAt(W, x, y);
  } else {
    const T = W.tops[L]; if (!T || !T.build) return 'blocked';
    for (const [px, py] of P) if (!pointInPoly(px, py, T.poly)) return 'edge';
    z = T.z;
  }
  const [bx0, by0, bx1, by1] = polyBox(P);
  for (const s of staticsNear(W, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1)) {
    if (!zOverlap(z, z + DH, s.z0, s.z1)) continue;
    if (satOverlap(P, s.poly, 0.1)) return s.kind === 'target' ? 'target' : 'blocked';
  }
  for (const p of (props || W.props)) {
    if ((p.L || 'g') !== L) continue;
    if (closestOnPoly(p.x, p.y, P)[2] < p.r + 0.3 || pointInPoly(p.x, p.y, P)) return 'blocked';
  }
  if (gadgets) for (const g of gadgets) if ((g.L || 'g') === L && satOverlap(P, gadgetPoly(g), 0.2)) return 'blocked';
  for (let i = 0; i < doms.length; i++) {
    if (skip && skip.has(i)) continue;
    const d = doms[i]; if ((d.L || 'g') !== L) continue;
    if (Math.abs(d.x - x) > 6 || Math.abs(d.y - y) > 6) continue;
    if (satOverlap(P, domPoly(d), 0.15)) return 'crowded';
  }
  return null;
}
function placeGadgetProblem(W, doms, g, gadgets, skipG, props) {
  const L = g.L || 'g', P = gadgetPoly(g), S = GADGETS[g.k];
  let z;
  if (L === 'g') {
    for (const [px, py] of P) if (!inRoomOrDoor(W, px, py)) return 'wall';
    for (const n of W.noPlace) if (satOverlap(P, n.poly)) return 'slippery';
    z = floorAt(W, g.x, g.y);
  } else {
    const T = W.tops[L]; if (!T || !T.build) return 'blocked';
    for (const [px, py] of P) if (!pointInPoly(px, py, T.poly)) return 'edge';
    z = T.z;
  }
  const [bx0, by0, bx1, by1] = polyBox(P);
  for (const s of staticsNear(W, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1)) {
    if (!zOverlap(z, gadgetTop({ ...g, z }), s.z0, s.z1)) continue;
    if (satOverlap(P, s.poly, 0.1)) return 'blocked';
  }
  for (const p of (props || W.props)) if ((p.L || 'g') === L && (closestOnPoly(p.x, p.y, P)[2] < p.r + 0.3 || pointInPoly(p.x, p.y, P))) return 'blocked';
  for (const o of gadgets) if (o !== skipG && (o.L || 'g') === L && satOverlap(P, gadgetPoly(o), 0.2)) return 'blocked';
  for (const d of doms) if ((d.L || 'g') === L && Math.abs(d.x - g.x) < 30 && Math.abs(d.y - g.y) < 30 && satOverlap(P, domPoly(d), 0.1)) return 'crowded';
  return null;
}

// ---------- Simulation ----------
function makeBall(W, p) {
  const z = layerZ(W, p.L || 'g', p.x, p.y) + p.r;
  return { k: p.k, x: p.x, y: p.y, z, r: p.r, a: p.a || 0, start: !!p.start, vx: 0, vy: 0, vz: 0, moving: false, src: null, born: 0, label: p.label };
}
function makeSim(W, doms, props, gadgets) {
  const sim = {
    W, t: 0,
    d: doms.map(d => {
      const L = d.L || 'g';
      return { x: d.x, y: d.y, a: d.a, c: d.c, L, z: layerZ(W, L, d.x, d.y), st: 0, s: 1, ph: 0, om: 0, he: DH, R: 0, lean: null, fellAt: -1 };
    }),
    rollers: (props || W.props).map(p => makeBall(W, p)),
    gad: (gadgets || []).map(g => {
      const o = { ...g, L: g.L || 'g', z: layerZ(W, g.L || 'g', g.x, g.y), fired: -1, released: false, power: g.power || GADGETS[g.k].pdef };
      if (GADGETS[g.k].kind === 'launcher') { o.plan = launchPlan(W, o); o.a = o.plan.a; }
      return o;
    }),
    hits: [], hitSet: new Set(), quiet: 0, events: [],
  };
  sim.idx = new DomIndex(sim.d);
  return sim;
}
function startRun(sim) {
  for (const r of sim.rollers) if (r.start) { r.vx = Math.cos(r.a) * 95; r.vy = Math.sin(r.a) * 95; r.moving = true; }
}
function reachFactor(W, x, y, ux, uy) {
  const s = stairAt(W, x, y); if (!s) return 1;
  const dd = ux * Math.cos(s.dir) + uy * Math.sin(s.dir);
  return dd > 0.5 ? STAIR_DOWN_REACH : dd < -0.5 ? STAIR_UP_REACH : 1;
}
function topple(sim, i, s, om) {
  const d = sim.d[i]; if (d.st !== 0) return;
  d.st = 1; d.s = s; d.ph = 0.02; d.om = om; d.fellAt = sim.t;
  d.he = d.L === 'g' ? DH * reachFactor(sim.W, d.x, d.y, Math.cos(d.a) * s, Math.sin(d.a) * s) : DH;
  d.R = 0;
  sim.events.push({ t: sim.t, type: 'fall', i });
}
function hitTarget(sim, tg, dx, dy) {
  if (sim.hitSet.has(tg.id)) return;
  sim.hitSet.add(tg.id); sim.hits.push({ id: tg.id, t: sim.t, dx: dx || 0, dy: dy || 1 });
  sim.events.push({ t: sim.t, type: 'target', id: tg.id });
}
// ---------- aiming ----------
const BALL_R = 2.2;
function cupOf(g) { const S = GADGETS[g.k]; return [g.x + Math.cos(g.a) * (S.len / 2 - 3), g.y + Math.sin(g.a) * (S.len / 2 - 3), g.z + S.armZ]; }
// Does a marble flying along this parabola clip a wall or a piece of furniture before it lands?
function arcBlocked(W, x0, y0, z0, vx, vy, vz, T) {
  const N = 48;
  for (let k = 2; k < N * .9; k++) {
    const t = T * k / N, x = x0 + vx * t, y = y0 + vy * t, z = z0 + vz * t - GRAV * t * t / 2;
    if (z - BALL_R < floorAt(W, x, y) - .5) return true;
    for (const s of staticsNear(W, x - 3, y - 3, x + 3, y + 3)) {
      if (s.kind === 'target') continue;
      if (z - BALL_R < s.z1 && z + BALL_R > s.z0 && (pointInPoly(x, y, s.poly) || closestOnPoly(x, y, s.poly)[2] < BALL_R)) return true;
    }
  }
  return false;
}
// Work out the throw for a launcher: it faces its aim point and picks the speed and arc that land the
// marble there, preferring a clear arc. Too far away and it throws as far as it can in that direction.
function launchPlan(W, g) {
  const S = GADGETS[g.k];
  let aim = g.aim || [g.x + Math.cos(g.a) * 100, g.y + Math.sin(g.a) * 100, floorAt(W, g.x + Math.cos(g.a) * 100, g.y + Math.sin(g.a) * 100)];
  const a = Math.atan2(aim[1] - g.y, aim[0] - g.x);
  const gg = { ...g, a }, [x0, y0, z0] = cupOf(gg);
  let dx = aim[0] - x0, dy = aim[1] - y0, D = Math.hypot(dx, dy), clamped = false;
  if (D > S.range) { dx *= S.range / D; dy *= S.range / D; D = S.range; clamped = true; aim = [x0 + dx, y0 + dy, aim[2]]; }
  D = Math.max(D, 8);
  const ux = dx / (Math.hypot(dx, dy) || 1), uy = dy / (Math.hypot(dx, dy) || 1), h = aim[2] + BALL_R - z0;
  let best = null;
  for (const deg of S.arcs) {
    const th = deg * Math.PI / 180, den = 2 * Math.cos(th) ** 2 * (D * Math.tan(th) - h);
    if (den <= 0) continue;
    const v = Math.sqrt(GRAV * D * D / den), vh = v * Math.cos(th), vz = v * Math.sin(th), T = D / vh;
    const plan = { a, v: [ux * vh, uy * vh, vz], from: [x0, y0, z0], aim, clamped, blocked: arcBlocked(W, x0, y0, z0, ux * vh, uy * vh, vz, T) };
    if (!plan.blocked) return plan;
    if (!best) best = plan;
  }
  return best || { a, v: [ux * 150, uy * 150, 250], from: [x0, y0, z0], aim, clamped, blocked: true };
}
// Snap an aim point onto a target when it's dropped close to one
function snapAim(W, x, y, z) {
  let best = null, bd = 18;
  for (const t of W.targets) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d >= bd) continue;
    if (!t.mounted && Math.abs(t.base - z) > 20) continue;
    bd = d; best = t;
  }
  if (!best) return { aim: [x, y, z], target: null };
  const az = best.mounted ? (best.z0 + best.z1) / 2 - BALL_R : best.z0;
  return { aim: [best.x, best.y, az], target: best };
}
function fireGadget(sim, g) {
  const S = GADGETS[g.k];
  if (g.fired >= 0 || (S.kind !== 'launcher' && S.kind !== 'lift')) return;
  g.fired = sim.t;
  if (S.kind === 'lift') { sim.events.push({ t: sim.t, type: 'lift', g }); return; }
  const P = g.plan || (g.plan = launchPlan(sim.W, g));
  const b = { k: 'marble', x: P.from[0], y: P.from[1], z: P.from[2], r: BALL_R, a: P.a, vx: P.v[0], vy: P.v[1], vz: P.v[2], moving: true, src: g, born: sim.t, thrown: true };
  sim.rollers.push(b);
  sim.events.push({ t: sim.t, type: 'fire', g });
}
// The lift's platform has reached the top: nudge its marble off the front.
function liftRelease(sim, g) {
  const S = GADGETS[g.k], c = Math.cos(g.a), n = Math.sin(g.a);
  g.released = true;
  const b = { k: 'marble', x: g.x + c * (S.len / 2 - 3), y: g.y + n * (S.len / 2 - 3), z: g.z + S.base + g.power + 2.3, r: 2.2, a: g.a, vx: c * S.push, vy: n * S.push, vz: 0, moving: true, src: g, born: sim.t, thrown: true };
  sim.rollers.push(b);
  sim.events.push({ t: sim.t, type: 'release', g });
  return b;
}
// A springboard throws whatever lands on it up and forward along its facing.
function trampLaunch(sim, b, g) {
  const S = GADGETS[g.k];
  b.vx = Math.cos(g.a) * g.power * Math.cos(S.angle); b.vy = Math.sin(g.a) * g.power * Math.cos(S.angle); b.vz = g.power * Math.sin(S.angle);
  b.x = g.x; b.y = g.y; b.src = g; b.born = sim.t; b.moving = true;
  g.fired = sim.t;
  sim.events.push({ t: sim.t, type: 'bounce', g });
}
function stepGadgets(sim) {
  let active = false;
  for (const g of sim.gad) {
    const S = GADGETS[g.k];
    if (g.fired < 0) continue;
    if (S.kind === 'lift' && !g.released) {
      active = true;
      if ((sim.t - g.fired) * S.speed >= g.power) liftRelease(sim, g);
    } else if (sim.t - g.fired < 0.5) active = true;
  }
  return active;
}
// Everything the falling domino i touches at its current reach. Returns what it should lean on.
function contacts(sim, i, allowLean) {
  const W = sim.W, D = sim.d, d = D[i], R = d.R;
  const ux = Math.cos(d.a) * d.s, uy = Math.sin(d.a) * d.s;
  const px = d.x + ux * DT / 2, py = d.y + uy * DT / 2;
  const reach = d.he + 2, z0 = d.z, z1 = d.z + DH;
  let leanU = 1e9, lean = null;
  for (const j of sim.idx.near(px + ux * reach / 2, py + uy * reach / 2, reach / 2 + 4)) {
    if (j === i) continue; const o = D[j]; if (o.st !== 0 || o.L !== d.L) continue;
    const u = uminInStrip(domPoly(o), px, py, ux, uy, CHW);
    if (u === null || u < -0.3 || u > R) continue;
    const dot = ux * Math.cos(o.a) + uy * Math.sin(o.a);
    if (Math.abs(dot) >= 0.22) topple(sim, j, dot > 0 ? 1 : -1, Math.max(1.5, (d.om || 3) * 0.72 * Math.abs(dot)));
    if (u >= 0.8 && u < leanU) { leanU = u; lean = { kind: 'dom', j, k: Math.max(0.3, Math.abs(dot)), u0: u }; }
  }
  for (const r of sim.rollers) {
    if (Math.abs(r.x - px) > reach + r.r || Math.abs(r.y - py) > reach + r.r) continue;
    if (!zOverlap(z0, z1, r.z - r.r, r.z + r.r)) continue;
    const u = uminInStrip(circlePoly(r.x, r.y, r.r, 12), px, py, ux, uy, CHW);
    if (u === null || u < -0.3 || u > R) continue;
    if (!d.rh) d.rh = new Set(); if (d.rh.has(r)) continue; d.rh.add(r);
    const sp = Math.max(70, (d.om || 3) * d.he * 1.3);
    r.vx += ux * sp; r.vy += uy * sp; r.moving = true;
    sim.events.push({ t: sim.t, type: 'roll' });
  }
  for (const g of sim.gad) {
    if (g.L !== d.L || Math.abs(g.x - px) > reach + 25 || Math.abs(g.y - py) > reach + 25) continue;
    const u = uminInStrip(gadgetPoly(g), px, py, ux, uy, CHW);
    if (u === null || u < -0.3 || u > R) continue;
    fireGadget(sim, g);
    if (u < leanU) { leanU = u; lean = { kind: 'static', u0: Math.max(0, u) }; }
  }
  for (const s of staticsNear(W, px - reach, py - reach, px + reach, py + reach)) {
    if (!zOverlap(z0, z1, s.z0, s.z1)) continue;
    const u = uminInStrip(s.poly, px, py, ux, uy, CHW);
    if (u === null || u < -0.3 || u > R) continue;
    if (s.kind === 'target') hitTarget(sim, s.ref, ux, uy);
    if (u < leanU) { leanU = u; lean = { kind: 'static', u0: Math.max(0, u) }; }
  }
  return allowLean ? lean : null;
}
// A domino on a furniture top whose tip has gone over the edge tumbles off.
function checkEdge(sim, d) {
  if (d.L === 'g' || d.ph < 0.45) return false;
  const T = sim.W.tops[d.L];
  const ux = Math.cos(d.a) * d.s, uy = Math.sin(d.a) * d.s;
  const px = d.x + ux * DT / 2, py = d.y + uy * DT / 2;
  // centre of mass beyond the edge?
  const cx = px + ux * DH / 2 * Math.sin(d.ph), cy = py + uy * DH / 2 * Math.sin(d.ph);
  if (pointInPoly(cx, cy, T.poly)) return false;
  d.st = 4; d.fx = cx; d.fy = cy; d.fz = d.z + DH / 2 * Math.cos(d.ph);
  const sp = Math.max(30, d.om * DH * 0.5);
  d.vx = ux * sp; d.vy = uy * sp; d.vz = 10; d.spin = d.ph; d.spinRate = Math.max(6, d.om);
  return true;
}
function landDomino(sim, d, i) {
  const W = sim.W;
  const [sz, SL] = supportAt(W, d.fx, d.fy, d.fz, sim.gad);
  const ux = Math.cos(d.a) * d.s, uy = Math.sin(d.a) * d.s;
  d.st = 5; d.lz = sz; d.L2 = SL;
  sim.events.push({ t: sim.t, type: 'land', i });
  // knock what it lands on
  for (const j of sim.idx.near(d.fx, d.fy, 8)) {
    const o = sim.d[j]; if (o.st !== 0 || j === i) continue;
    if (Math.abs(o.z - sz) > 3) continue;
    if (Math.hypot(o.x - d.fx, o.y - d.fy) > 6) continue;
    const dot = ux * Math.cos(o.a) + uy * Math.sin(o.a);
    topple(sim, j, dot >= 0 ? 1 : -1, 4);
  }
  for (const s of staticsNear(W, d.fx - 10, d.fy - 10, d.fx + 10, d.fy + 10)) {
    if (s.kind !== 'target' || !zOverlap(sz, sz + 6, s.z0, s.z1)) continue;
    if (closestOnPoly(d.fx, d.fy, s.poly)[2] < 4 || pointInPoly(d.fx, d.fy, s.poly)) hitTarget(sim, s.ref, ux, uy);
  }
  for (const r of sim.rollers) if (Math.hypot(r.x - d.fx, r.y - d.fy) < r.r + 5 && Math.abs(r.z - r.r - sz) < 4) { r.vx += ux * 60; r.vy += uy * 60; r.moving = true; }
  for (const g of sim.gad) if (Math.abs(g.z - sz) < 4 && pointInPoly(d.fx, d.fy, gadgetPoly(g))) fireGadget(sim, g);
}
function stepBall(sim, r, dt) {
  const W = sim.W, D = sim.d;
  r.vz -= GRAV * dt;
  let nx = r.x + r.vx * dt, ny = r.y + r.vy * dt, nz = r.z + r.vz * dt;
  const bottom = nz - r.r;
  // walls, furniture sides and gadget bases
  const blockers = staticsNear(W, nx - r.r - 1, ny - r.r - 1, nx + r.r + 1, ny + r.r + 1);
  for (const s of blockers) {
    if (s.z1 <= bottom + 1.5 || s.z0 >= nz + r.r) continue;
    const [cx, cy, dist] = closestOnPoly(nx, ny, s.poly);
    const inside = pointInPoly(nx, ny, s.poly);
    if (dist >= r.r && !inside) continue;
    if (s.kind === 'target') { const sp0 = Math.hypot(r.vx, r.vy) || 1; hitTarget(sim, s.ref, r.vx / sp0, r.vy / sp0); }
    let mx = nx - cx, my = ny - cy; const Lm = Math.hypot(mx, my) || 1; mx /= Lm; my /= Lm;
    if (inside) { mx = -mx; my = -my; }
    const push = inside ? dist + r.r : r.r - dist;
    nx += mx * push; ny += my * push;
    const vn = r.vx * mx + r.vy * my;
    if (vn < 0) { r.vx -= 1.45 * vn * mx; r.vy -= 1.45 * vn * my; r.vx *= 0.8; r.vy *= 0.8; }
  }
  for (const g of sim.gad) {
    if (r.src === g && sim.t - r.born < 0.4) continue;
    const S = GADGETS[g.k];
    const P = gadgetPoly(g), [cx, cy, dist] = closestOnPoly(nx, ny, P);
    if (dist >= r.r && !pointInPoly(nx, ny, P)) continue;
    const top = S.kind === 'ramp' ? (pointInPoly(nx, ny, P) ? gadgetSurface(g, nx, ny) : gadgetSurface(g, cx, cy)) : g.z + S.base;
    if (S.kind === 'ramp' ? bottom >= top - 3 : (top <= bottom + 1 || g.z >= nz + r.r)) continue;
    fireGadget(sim, g);
    let mx = nx - cx, my = ny - cy; const Lm = Math.hypot(mx, my) || 1; mx /= Lm; my /= Lm;
    const vn = r.vx * mx + r.vy * my; if (vn < 0) { r.vx -= 1.4 * vn * mx; r.vy -= 1.4 * vn * my; }
    nx = r.x; ny = r.y;
  }
  // a step up taller than a few cm is a wall too (stairs from below)
  const fUp = inRoomOrDoor(W, nx, ny) ? floorAt(W, nx, ny) : -1;
  if (fUp > bottom + 2.5 && fUp > r.z - r.r + 2.5) { r.vx *= -0.4; r.vy *= -0.4; nx = r.x; ny = r.y; }
  // standing dominoes in the way
  const sp = Math.hypot(r.vx, r.vy);
  for (const j of sim.idx.near(nx, ny, r.r + 5)) {
    const o = D[j]; if (o.st !== 0) continue;
    if (!zOverlap(o.z, o.z + DH, nz - r.r, nz + r.r)) continue;
    const P = domPoly(o), [, , dist] = closestOnPoly(nx, ny, P);
    if (dist > r.r && !pointInPoly(nx, ny, P)) continue;
    const vn = (r.vx * Math.cos(o.a) + r.vy * Math.sin(o.a));
    if (sp < 1 || Math.abs(vn) / sp < 0.2) { r.vx = -r.vx * 0.3; r.vy = -r.vy * 0.3; continue; }
    topple(sim, j, vn > 0 ? 1 : -1, Math.min(9, Math.max(1.6, Math.abs(vn) / DH * 1.4)));
    r.vx *= 0.4; r.vy *= 0.4;
  }
  // ground contact
  const [sz, , gref] = supportAt(W, nx, ny, r.z - r.r + 2.5, sim.gad);
  const GS = gref && GADGETS[gref.k];
  let onGround = false;
  const glued = GS && GS.kind === 'ramp' && r.vz <= 0 && nz - r.r - sz < 4; // stay on the slope instead of skipping down it
  if (nz - r.r <= sz || glued) {
    nz = sz + r.r;
    if (GS && GS.kind === 'tramp' && r.vz < -30 && !(r.src === gref && sim.t - r.born < 0.15)) { r.x = nx; r.y = ny; r.z = nz; trampLaunch(sim, r, gref); return; }
    if (r.vz < -70) { r.vz = -r.vz * 0.3; r.vx *= 0.5; r.vy *= 0.5; } else { r.vz = 0; onGround = true; }
  }
  r.x = nx; r.y = ny; r.z = nz;
  if (onGround) {
    const onRamp = GS && GS.kind === 'ramp';
    if (onRamp) { // rolling down (or up) the slope: a = 5/7 g sinθ cosθ for a rolling ball
      const th = Math.atan(gref.power / GS.len), acc = 5 / 7 * GRAV * Math.sin(th) * Math.cos(th);
      r.vx += Math.cos(gref.a) * acc * dt; r.vy += Math.sin(gref.a) * acc * dt;
    }
    const s2 = Math.hypot(r.vx, r.vy), fr = r.k === 'roll' ? 0.18 : 0.55;
    const ns = Math.max(0, s2 - (fr * s2 + 6) * dt);
    if (s2 > 0) { r.vx *= ns / s2; r.vy *= ns / s2; }
    if (ns < 2 && !onRamp) { r.moving = false; r.vx = r.vy = 0; }
  }
  if (r.z < -200) r.moving = false;
}
function stepSim(sim, dt) {
  sim.t += dt;
  const D = sim.d;
  let active = false;
  const k = 3 * GRAV / (2 * DH);
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    if (d.st === 1) {
      active = true;
      d.om += k * Math.sin(d.ph) * dt; d.ph += d.om * dt;
      if (d.ph >= Math.PI / 2) { d.ph = Math.PI / 2; d.st = 2; d.om = 0; }
      d.R = d.he * Math.sin(d.ph);
      if (checkEdge(sim, d)) continue;
      const lean = contacts(sim, i, true);
      if (lean && d.st === 1) {
        d.st = 3; d.lean = lean; d.om = 0;
        d.ph = Math.asin(Math.min(1, lean.u0 / d.he)); d.R = d.he * Math.sin(d.ph);
        if (lean.kind === 'static') d.st = 2;
      }
    } else if (d.st === 3) {
      active = true;
      const o = D[d.lean.j];
      const want = Math.asin(Math.min(1, (d.lean.u0 + DH * Math.sin(o.ph) * d.lean.k) / d.he));
      if (want > d.ph) { d.ph = want; d.R = d.he * Math.sin(d.ph); contacts(sim, i, false); }
      if (o.st === 2 || o.st >= 4) d.st = 2;
    } else if (d.st === 4) { // tumbling through the air
      active = true;
      d.vz -= GRAV * dt; d.fx += d.vx * dt; d.fy += d.vy * dt; d.fz += d.vz * dt; d.spin += d.spinRate * dt;
      const [sz] = supportAt(sim.W, d.fx, d.fy, d.fz + 1, sim.gad);
      if (d.fz - 1 <= sz) { d.fz = sz; landDomino(sim, d, i); }
    }
  }
  if (stepGadgets(sim)) active = true;
  for (const r of sim.rollers) { if (!r.moving) continue; active = true; stepBall(sim, r, dt); }
  sim.quiet = active ? 0 : sim.quiet + dt;
}
function simDone(sim) { return sim.quiet > 0.35 || sim.t > 45; }
function runToEnd(sim, dt = 1 / 480) { while (!simDone(sim)) stepSim(sim, dt); return sim; }

// Where a gadget's marble will go, ignoring dominoes: a list of [x, y, z] points.
function predictArc(W, g, gadgets) {
  const S = GADGETS[g.k];
  if (S.kind === 'ramp') return null;
  const others = gadgets.filter(o => o !== g);
  const sim = makeSim(W, [], [], [g, ...others]);
  const gg = sim.gad[0];
  let b;
  if (S.kind === 'launcher') { fireGadget(sim, gg); b = sim.rollers[0]; }
  else if (S.kind === 'lift') { gg.fired = 0; b = liftRelease(sim, gg); }
  else { b = { k: 'marble', x: g.x, y: g.y, z: gg.z + S.base + 2.2, r: 2.2, vx: 0, vy: 0, vz: 0, moving: true }; sim.rollers.push(b); trampLaunch(sim, b, gg); }
  const pts = [[b.x, b.y, b.z]], dt = 1 / 240;
  let n = 0, airborneDone = false, rollFor = 0;
  while (sim.t < 3 && b.moving) {
    stepBall(sim, b, dt); sim.t += dt; n++;
    if (n % 6 === 0) pts.push([b.x, b.y, b.z]);
    if (b.vz === 0) { airborneDone = true; rollFor += dt; if (rollFor > 0.6) break; }
  }
  pts.push([b.x, b.y, b.z]);
  return pts;
}

// Spacing along a stroke at a given point & direction (wider down stairs when smart spacing is on)
function spacingAt(W, x, y, ux, uy, base, smart, L) {
  if (!smart || (L && L !== 'g')) return base;
  return base * (reachFactor(W, x, y, ux, uy) > 1 ? 1.5 : 1);
}

// Stroke builder shared by the UI and the tests. All dominoes in a stroke stand on one layer.
// Starting a stroke on an existing domino branches from it: the new line is attached so the fall carries over.
function makeStroke(W, doms, base, smart, onPlace, layer, gadgets, props) {
  const L = layer || 'g';
  const pp = (x, y, a, skip) => placeProblem(W, doms, x, y, a, skip, props, L, gadgets);
  const add = (x, y, a) => { doms.push({ x, y, a, L }); return doms.length - 1; };
  return {
    last: null, firstIdx: -1, placed: [], anchor: -1, nudged: null, L,
    start(x, y) {
      let best = -1, bd = 4.5;
      doms.forEach((d, i) => { if ((d.L || 'g') !== L) return; const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0) { this.anchor = best; this.last = [doms[best].x, doms[best].y]; return; }
      this.last = [x, y];
      if (!pp(x, y, 0)) { this.firstIdx = add(x, y, 0); this.placed.push(this.firstIdx); onPlace && onPlace(this.firstIdx); }
    },
    attach(x, y) {
      const A = doms[this.anchor];
      let dx = x - A.x, dy = y - A.y; const Ln = Math.hypot(dx, dy); dx /= Ln; dy /= Ln;
      let nx = Math.cos(A.a), ny = Math.sin(A.a);
      if (dx * nx + dy * ny < -0.2) { nx = -nx; ny = -ny; }
      let j = -1, ju = 1e9;
      const px = A.x + nx * DT / 2, py = A.y + ny * DT / 2;
      doms.forEach((o, i) => {
        if (i === this.anchor || (o.L || 'g') !== L || Math.abs(o.x - A.x) > 12 || Math.abs(o.y - A.y) > 12) return;
        const u = uminInStrip(domPoly(o), px, py, nx, ny, CHW);
        if (u !== null && u > -0.3 && u < DH && u < ju) { ju = u; j = i; }
      });
      const side = (nx * dy - ny * dx) >= 0 ? 1 : -1, tx = -ny * side, ty = nx * side;
      let q = null;
      if (j >= 0) {
        const o = doms[j], ox = o.x, oy = o.y;
        const sk = new Set([j]);
        if (!pp(ox - tx * 1.1, oy - ty * 1.1, o.a, sk)) { o.x = ox - tx * 1.1; o.y = oy - ty * 1.1; this.nudged = j; }
        const bx = o.x + tx * (DW + 0.35), by = o.y + ty * (DW + 0.35);
        if (!pp(bx, by, o.a)) q = [bx, by, o.a];
        else if (this.nudged === j) { o.x = ox; o.y = oy; this.nudged = null; }
      }
      if (!q) {
        const ang = Math.atan2(ny, nx), want = Math.atan2(dy, dx);
        let dlt = Math.atan2(Math.sin(want - ang), Math.cos(want - ang));
        dlt = Math.max(-0.7, Math.min(0.7, dlt));
        const sp = spacingAt(W, A.x, A.y, nx, ny, base, smart, L);
        for (const f of [1, 0.85, 1.15]) {
          const qa = ang + dlt, qx = A.x + Math.cos(qa) * sp * f, qy = A.y + Math.sin(qa) * sp * f;
          if (!pp(qx, qy, qa)) { q = [qx, qy, qa]; break; }
        }
      }
      this.anchor = -2;
      if (!q) return;
      const i = add(q[0], q[1], q[2]);
      this.placed.push(i); this.firstIdx = i; this.last = [q[0], q[1]]; onPlace && onPlace(i);
    },
    move(x, y) {
      if (this.anchor >= 0) {
        const A = doms[this.anchor];
        if (Math.hypot(x - A.x, y - A.y) < 3.5) return;
        this.attach(x, y);
      }
      for (let guard = 0; guard < 400; guard++) {
        const [lx, ly] = this.last, dx = x - lx, dy = y - ly, Ln = Math.hypot(dx, dy);
        if (Ln < 0.01) return;
        const ux = dx / Ln, uy = dy / Ln, sp = spacingAt(W, lx, ly, ux, uy, base, smart, L);
        if (Ln < sp) return;
        const qx = lx + ux * sp, qy = ly + uy * sp, a = Math.atan2(uy, ux);
        if (this.firstIdx >= 0 && this.placed.length === 1 && this.anchor === -1) {
          const f = doms[this.firstIdx];
          if (!pp(f.x, f.y, a, new Set([this.firstIdx]))) f.a = a;
        }
        if (!pp(qx, qy, a)) {
          const n = this.placed.length;
          if (n >= 2) {
            const p0 = doms[this.placed[n - 2]], p1 = doms[this.placed[n - 1]];
            if (Math.hypot(p0.x - p1.x, p0.y - p1.y) < sp * 1.6) {
              const ca = Math.atan2(qy - p0.y, qx - p0.x);
              if (!pp(p1.x, p1.y, ca, new Set([this.placed[n - 1]]))) p1.a = ca;
            }
          } else if (n === 1 && this.anchor === -2) {
            const p1 = doms[this.placed[0]];
            const ca = Math.atan2(qy - p1.y, qx - p1.x), mid = Math.atan2(Math.sin(ca) + Math.sin(p1.a), Math.cos(ca) + Math.cos(p1.a));
            if (!pp(p1.x, p1.y, mid, new Set([this.placed[0]]))) p1.a = mid;
          }
          const i = add(qx, qy, a); this.placed.push(i); if (this.firstIdx < 0) this.firstIdx = i; onPlace && onPlace(i);
        }
        this.last = [qx, qy];
      }
    },
  };
}
// ===ENGINE END===
if (typeof module !== 'undefined') module.exports = { launchPlan, snapAim, LEVELS, GADGETS, gadgetSurface, buildWorld, makeSim, startRun, stepSim, runToEnd, makeStroke, placeProblem, placeGadgetProblem, predictArc, floorAt, layerZ, layerAt, supportAt, gadgetPoly, fireGadget, DH, DW, DT };
