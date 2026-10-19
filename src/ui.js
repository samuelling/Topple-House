(() => {
'use strict';
const PAL = ['#e5483f', '#f08a2c', '#f2c230', '#3fae6a', '#3a7bd5', '#8a56c9'];
const SUCCESS = { bedroom: 'Good morning!', living: 'Lights out.', kitchen: 'Breakfast is served.', bathroom: 'Duck overboard!', hallway: 'Ding-dong!', study: 'Trophy toppled!', nursery: 'Sweet dreams.', den: 'Showtime!', sunroom: 'Plants watered.' };
const SANDBOX_ID = 'house';
const ALL_ROOMS = ['bedroom', 'hallway', 'bathroom', 'living', 'kitchen', 'study'];
const $ = id => document.getElementById(id);

// ---------- save ----------
const KEY = 'topple-house-v1';
function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  s = s || {};
  s.stars = s.stars || {}; s.best = s.best || {}; s.layouts = s.layouts || {};
  s.settings = Object.assign({ spacing: 5.6, smart: true, shaky: false, slow: false, catAll: false }, s.settings || {});
  return s;
}
const SAVE = loadSave();
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ } }, 300);
}
const packLayout = l => l.map(d => [Math.round(d.x * 10) / 10, Math.round(d.y * 10) / 10, Math.round(d.a * 1000) / 1000, d.c, d.g, d.L && d.L !== 'g' ? d.L : 0]);
const unpackLayout = a => (a || []).map(([x, y, ang, c, g, L]) => ({ x, y, a: ang, c: c || 0, g: g || 0, L: L || 'g' }));
const packGad = l => l.map(g => [g.k, Math.round(g.x * 10) / 10, Math.round(g.y * 10) / 10, Math.round(g.a * 1000) / 1000, g.L || 'g', g.power]);
const unpackGad = a => (a || []).map(([k, x, y, ang, L, power]) => ({ k, x, y, a: ang, L: L || 'g', power: power || GADGETS[k].pdef }));

let G = null;
let DPR = 1;
function levelDef(id) { return LEVELS.find(l => l.id === id); }

/*__PLAN__*/

// =====================================================================
// 3D scene
// =====================================================================
const cv = $('cv');
const T3 = THREE;
const renderer = new T3.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
renderer.outputEncoding = T3.sRGBEncoding;
const scene = new T3.Scene();
scene.background = new T3.Color('#161a24');
const camera = new T3.PerspectiveCamera(36, 1, 4, 8000);
const hemi = new T3.HemisphereLight(0xfff6ea, 0x40465c, 0.72); scene.add(hemi);
const sun = new T3.DirectionalLight(0xfff0d8, 0.9);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
scene.add(sun); scene.add(sun.target);
const raycaster = new T3.Raycaster();
const lin = hex => new T3.Color(hex).convertSRGBToLinear();
const MAT = {};
function mat(hex, o = {}) {
  const k = hex + JSON.stringify(o);
  if (!MAT[k]) MAT[k] = new T3.MeshStandardMaterial(Object.assign({ color: lin(hex), roughness: 0.75, metalness: 0 }, o));
  return MAT[k];
}
let R = null; // per-room 3D state

// ---------- textures ----------
const TEXCACHE = {};
function canvasTex(key, w, h, draw) {
  if (!TEXCACHE[key]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T3.CanvasTexture(c); t.encoding = T3.sRGBEncoding; t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = 4;
    TEXCACHE[key] = t;
  }
  return TEXCACHE[key];
}
// floor textures: one tile of the pattern; `per` is its size in cm
const FLOORTEX = {
  lavender: { per: 40, draw: (c, w, h) => {
    c.fillStyle = '#b9aed3'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { c.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(60,40,90,.07)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  } },
  terracotta: { per: 50, draw: (c, w, h) => {
    const cols = ['#d39a74', '#c98d66', '#d9a37e', '#cc9269'];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = cols[i * 2 + j]; c.fillRect(i * w / 2, j * h / 2, w / 2, h / 2); }
    c.strokeStyle = 'rgba(240,225,200,.8)'; c.lineWidth = 5; for (let k = 0; k <= 2; k++) { c.beginPath(); c.moveTo(k * w / 2, 0); c.lineTo(k * w / 2, h); c.moveTo(0, k * h / 2); c.lineTo(w, k * h / 2); c.stroke(); }
  } },
  wood: { per: 120, draw: (c, w, h) => {
    c.fillStyle = '#c9a273'; c.fillRect(0, 0, w, h);
    const rows = 9, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      c.fillStyle = `rgba(${r % 2 ? '120,80,40' : '255,230,190'},${0.05 + (r * 37 % 7) * 0.012})`; c.fillRect(0, r * rh, w, rh);
      c.strokeStyle = 'rgba(92,58,24,.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, r * rh); c.lineTo(w, r * rh);
      const j = ((r * 53) % 100) / 100 * w; c.moveTo(j, r * rh); c.lineTo(j, r * rh + rh); c.stroke();
      c.strokeStyle = 'rgba(92,58,24,.08)'; c.lineWidth = 1;
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(0, r * rh + rh * (0.3 + k * 0.2)); c.bezierCurveTo(w * .3, r * rh + rh * (0.2 + k * .25), w * .6, r * rh + rh * (.45 + k * .1), w, r * rh + rh * (0.3 + k * 0.2)); c.stroke(); }
    }
  } },
  stair: { per: 60, draw: (c, w, h) => { c.fillStyle = '#b8895a'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(80,50,20,.25)'; c.lineWidth = 2; for (let x = 0; x < w; x += w / 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } } },
  carpet: { per: 40, draw: (c, w, h) => {
    c.fillStyle = '#93a48c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { c.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(30,50,30,.08)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  } },
  tile: { per: 60, draw: (c, w, h) => {
    c.fillStyle = '#e7e1d3'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(4, 4, w / 2 - 8, h / 2 - 8); c.fillRect(w / 2 + 4, h / 2 + 4, w / 2 - 8, h / 2 - 8);
    c.strokeStyle = 'rgba(70,60,40,.25)'; c.lineWidth = 3; c.strokeRect(0, 0, w / 2, h / 2); c.strokeRect(w / 2, 0, w / 2, h / 2); c.strokeRect(0, h / 2, w / 2, h / 2); c.strokeRect(w / 2, h / 2, w / 2, h / 2);
  } },
  bath: { per: 30, draw: (c, w, h) => {
    c.fillStyle = '#cfe2e7'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(30,70,90,.28)'; c.lineWidth = 3; c.strokeRect(0, 0, w / 2, h / 2); c.strokeRect(w / 2, 0, w / 2, h / 2); c.strokeRect(0, h / 2, w / 2, h / 2); c.strokeRect(w / 2, h / 2, w / 2, h / 2);
  } },
};
function floorMat(type, w, h) {
  const F = FLOORTEX[type];
  const base = canvasTex('floor-' + type, 256, 256, F.draw);
  const t = base.clone(); t.needsUpdate = true; t.repeat.set(w / F.per, h / F.per);
  return new T3.MeshStandardMaterial({ map: t, roughness: type === 'wood' || type === 'stair' ? 0.6 : 0.85 });
}
function rugTex(kind) {
  return canvasTex('rug-' + kind, 256, 256, (c, w, h) => {
    if (kind === 'rug') {
      c.fillStyle = '#b35a4a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e7c48f'; c.lineWidth = 10; c.strokeRect(22, 22, w - 44, h - 44);
      c.strokeStyle = 'rgba(231,196,143,.6)'; c.lineWidth = 3; c.strokeRect(38, 38, w - 76, h - 76);
      c.fillStyle = 'rgba(231,196,143,.55)'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 5, h / 5, 0, 0, 7); c.fill();
      c.fillStyle = '#8f3f33'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 10, h / 10, 0, 0, 7); c.fill();
    } else if (kind === 'runner') {
      c.fillStyle = '#3f5f8a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(240,220,170,.7)'; c.lineWidth = 8; c.strokeRect(18, 18, w - 36, h - 36);
      c.fillStyle = 'rgba(240,220,170,.35)'; for (let y = 50; y < h - 40; y += 40) { c.beginPath(); c.moveTo(w / 2, y); c.lineTo(w / 2 + 22, y + 18); c.lineTo(w / 2, y + 36); c.lineTo(w / 2 - 22, y + 18); c.fill(); }
    } else if (kind === 'playmat') {
      const cols = ['#e5483f', '#f2c230', '#3fae6a', '#3a7bd5'];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = cols[(i + j) % 4]; c.fillRect(i * w / 4, j * h / 4, w / 4, h / 4); }
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 3; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(k * w / 4, 0); c.lineTo(k * w / 4, h); c.moveTo(0, k * h / 4); c.lineTo(w, k * h / 4); c.stroke(); }
    } else { // bath mat
      c.fillStyle = '#7fb0a5'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 6;
      for (let k = -h; k < w; k += 26) { c.beginPath(); c.moveTo(k, h); c.lineTo(k + h, 0); c.stroke(); }
    }
  });
}

// ---------- mesh helpers ----------
function box(g, w, h, d, x, y, z, m, cast = true) {
  const mesh = new T3.Mesh(new T3.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
function cyl(g, rt, rb, h, x, y, z, m, seg = 20) {
  const mesh = new T3.Mesh(new T3.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
function rbox(g, w, h, d, x, y, z, m, r = 3) { // rounded-ish box: box with chamfer cylinders feel; keep simple
  return box(g, w, h, d, x, y, z, m);
}

// ---------- furniture ----------
function buildFurniture(g, f, W) {
  const wood = mat('#8b6142', { roughness: .6 }), woodLight = mat('#a3774f', { roughness: .6 });
  if (f.r) {
    const e = floorAt(W, f.cx, f.cy);
    if (f.k === 'plant') {
      cyl(g, f.r * .55, f.r * .45, 22, f.cx, e + 11, f.cy, mat('#b5653f'));
      const leaves = new T3.Mesh(new T3.IcosahedronGeometry(f.r * 1.05, 1), mat('#4f8a40', { flatShading: true, roughness: .9 }));
      leaves.position.set(f.cx, e + 22 + f.r * .8, f.cy); leaves.castShadow = true; g.add(leaves);
      const l2 = new T3.Mesh(new T3.IcosahedronGeometry(f.r * .7, 1), mat('#68a052', { flatShading: true, roughness: .9 }));
      l2.position.set(f.cx + f.r * .3, e + 22 + f.r * 1.5, f.cy - f.r * .2); l2.castShadow = true; g.add(l2);
    } else if (f.k === 'lamp') {
      cyl(g, f.r * .7, f.r * .8, 2.5, f.cx, e + 1.25, f.cy, mat('#3a3f49', { metalness: .4, roughness: .4 }));
      cyl(g, 1.1, 1.1, 120, f.cx, e + 62, f.cy, mat('#3a3f49', { metalness: .5, roughness: .35 }));
      const shadeM = new T3.MeshStandardMaterial({ color: lin('#f2dc9b'), emissive: lin('#ffcf73'), emissiveIntensity: 0.9, roughness: .8, side: T3.DoubleSide });
      const shade = cyl(g, f.r * .55, f.r, 22, f.cx, e + 128, f.cy, shadeM, 24); shade.castShadow = false;
      const light = new T3.PointLight(0xffc56a, 0.9, 260, 1.6); light.position.set(f.cx, e + 120, f.cy); g.add(light);
      R.lamps.push({ shadeM, light });
    } else if (f.k === 'basket') {
      cyl(g, f.r, f.r * .85, 34, f.cx, e + 17, f.cy, mat('#c4a06b', { roughness: .95 }));
      const cloth = new T3.Mesh(new T3.SphereGeometry(f.r * .75, 12, 8), mat('#e8e2f3'));
      cloth.scale.set(1, .45, 1); cloth.position.set(f.cx, e + 35, f.cy); g.add(cloth);
    } else if (f.k === 'globe') {
      cyl(g, f.r * .55, f.r * .7, 3, f.cx, e + 1.5, f.cy, mat('#5b4636'));
      cyl(g, 1, 1, f.top - f.r * 2 - 3, f.cx, e + 3 + (f.top - f.r * 2 - 3) / 2, f.cy, mat('#c8a24a', { metalness: .7, roughness: .3 }));
      const tex = canvasTex('globe', 256, 128, (c, w, h) => { c.fillStyle = '#4f8fc0'; c.fillRect(0, 0, w, h); c.fillStyle = '#8fbf6a';
        for (const [x, y, rx, ry] of [[40, 40, 26, 18], [70, 80, 14, 26], [130, 36, 34, 16], [150, 78, 18, 22], [210, 44, 28, 20], [215, 96, 14, 9]]) { c.beginPath(); c.ellipse(x, y, rx, ry, .3, 0, 7); c.fill(); } });
      const ball = new T3.Mesh(new T3.SphereGeometry(f.r, 28, 18), new T3.MeshStandardMaterial({ map: tex, roughness: .5 }));
      ball.position.set(f.cx, e + f.top - f.r, f.cy); ball.rotation.z = .4; ball.castShadow = true; g.add(ball);
    } else if (f.k === 'bin') {
      cyl(g, f.r, f.r * .9, 42, f.cx, e + 21, f.cy, mat('#5a6170', { metalness: .5, roughness: .4 }));
      cyl(g, f.r * 1.03, f.r * 1.03, 3, f.cx, e + 43, f.cy, mat('#737b8c', { metalness: .5, roughness: .4 }));
    }
    return;
  }
  const { x, y, w, h } = f, e = floorAt(W, x + w / 2, y + h / 2), cx = x + w / 2, cz = y + h / 2;
  switch (f.k) {
    case 'bed': {
      box(g, w, 28, h, cx, e + 14, cz, mat('#5b4636', { roughness: .6 }));
      box(g, w - 6, 14, h - 10, cx, e + 35, cz + 4, mat('#f4f1ea'));
      box(g, w - 4, 10, h * .62, cx, e + 41, cz + h * .19, mat('#7189bd', { roughness: .9 }));
      box(g, w - 4, 3, 16, cx, e + 45.5, y + h * .38 + 8, mat('#5d74a9', { roughness: .9 }));
      box(g, w / 2 - 14, 9, 26, x + w / 4 + 2, e + 46, y + 24, mat('#ffffff', { roughness: .9 }));
      box(g, w / 2 - 14, 9, 26, x + 3 * w / 4 - 2, e + 46, y + 24, mat('#ffffff', { roughness: .9 }));
      box(g, w, 70, 6, cx, e + 35, y + 3, mat('#5b4636', { roughness: .6 }));
      break;
    }
    case 'sofa': {
      const m = mat('#2f6f78', { roughness: .9 }), m2 = mat('#3d8791', { roughness: .9 });
      box(g, w, 22, h, cx, e + 11, cz, m);
      box(g, 16, 48, h, x + 8, e + 24, cz, m);
      box(g, w, 36, 14, cx, e + 18, y + 7, m); box(g, w, 36, 14, cx, e + 18, y + h - 7, m);
      for (let k = 0; k < 3; k++) box(g, w - 22, 10, (h - 28) / 3 - 2, x + 16 + (w - 22) / 2 + 2, e + 27, y + 14 + (k + .5) * (h - 28) / 3, m2);
      break;
    }
    case 'armchair': {
      const m = mat('#c98a3e', { roughness: .9 });
      box(g, w, 22, h, cx, e + 11, cz, m); box(g, w, 50, 12, cx, e + 25, y + 6, m);
      box(g, 10, 36, h, x + 5, e + 18, cz, m); box(g, 10, 36, h, x + w - 5, e + 18, cz, m);
      box(g, w - 20, 8, h - 14, cx, e + 26, cz + 6, mat('#dca457', { roughness: .9 }));
      break;
    }
    case 'table': {
      box(g, w, 4, h, cx, e + 40, cz, mat('#7a593b', { roughness: .45 }));
      for (const [a, b] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) box(g, 4, 38, 4, a, e + 19, b, mat('#5e432c'));
      break;
    }
    case 'island':
      box(g, w, 86, h, cx, e + 43, cz, mat('#c9b48f', { roughness: .6 }));
      box(g, w + 6, 4, h + 6, cx, e + 88, cz, mat('#e9e5dc', { roughness: .3 }));
      break;
    case 'tv': {
      box(g, w, 45, h, cx, e + 22.5, cz, mat('#4b4f5a', { roughness: .5 }));
      box(g, 4, 6, 24, cx, e + 48, cz, mat('#2b2e35'));
      const screenM = new T3.MeshStandardMaterial({ color: lin('#121419'), emissive: lin('#7fb4ff'), emissiveIntensity: 0, roughness: .2 });
      box(g, 3, 62, h * .95, x + w * .55, e + 82, cz, [mat('#16181d'), screenM, mat('#16181d'), mat('#16181d'), mat('#16181d'), mat('#16181d')]);
      R.tvs.push({ screenM });
      break;
    }
    case 'counter': {
      box(g, w, 86, h, cx, e + 43, cz, mat('#f0ece4', { roughness: .7 }));
      box(g, w + 2, 4, h + 2, cx, e + 88, cz, mat('#9aa0a8', { roughness: .25, metalness: .2 }));
      if (w > 200) {
        box(g, 46, 1, 32, x + 63, e + 90.6, y + 29, mat('#c8ced4', { metalness: .6, roughness: .25 }));
        for (const [a, b] of [[x + 150, y + 22], [x + 172, y + 22], [x + 150, y + 42], [x + 172, y + 42]]) cyl(g, 7, 7, 1.4, a, e + 90.7, b, mat('#2b2f38', { roughness: .4 }));
      }
      break;
    }
    case 'fridge':
      box(g, w, 175, h, cx, e + 87.5, cz, mat('#e6eaee', { roughness: .3, metalness: .2 }));
      box(g, 2, 50, 3, x + 8, e + 120, y + h + 1.5, mat('#9aa3ad', { metalness: .6, roughness: .3 }));
      box(g, w - 2, 1, 1, cx, e + 110, y + h + .5, mat('#b7bec6'));
      break;
    case 'tub': {
      const wht = mat('#f4f6f7', { roughness: .25 }), rim = 8;
      box(g, w, 8, h, cx, e + 4, cz, wht);
      box(g, w, 52, rim, cx, e + 26, y + rim / 2, wht); box(g, w, 52, rim, cx, e + 26, y + h - rim / 2, wht);
      box(g, rim, 52, h - rim * 2, x + rim / 2, e + 26, cz, wht); box(g, rim, 52, h - rim * 2, x + w - rim / 2, e + 26, cz, wht);
      const water = box(g, w - rim * 2, 30, h - rim * 2, cx, e + 23, cz, new T3.MeshStandardMaterial({ color: lin('#7fc4dc'), roughness: .05, metalness: .1, transparent: true, opacity: .8 }), false);
      water.receiveShadow = true;
      cyl(g, 2, 2, 12, x + w - 14, e + 58, cz, mat('#c8ced4', { metalness: .8, roughness: .2 }));
      break;
    }
    case 'toilet': {
      const wht = mat('#f6f7f8', { roughness: .25 });
      box(g, 18, 74, h - 18, x + w - 9, e + 37, cz, wht);
      const bx = x + (w - 18) / 2 + 1, rx = (w - 18) / 2 - 2, rz = h / 2 - 14;
      const bowl = cyl(g, 1, .8, 38, bx, e + 19, cz, wht, 28); bowl.scale.set(rx, 1, rz);
      const seat = cyl(g, 1, 1, 3, bx, e + 39.5, cz, mat('#e9edf0', { roughness: .3 }), 28); seat.scale.set(rx + 1, 1, rz + 1);
      const hole = cyl(g, 1, 1, .6, bx, e + 41.2, cz, mat('#9fc3cf', { roughness: .1 }), 28); hole.scale.set(rx * .7, 1, rz * .7); hole.castShadow = false;
      break;
    }
    case 'sink': {
      box(g, w, 80, h, cx, e + 40, cz, mat('#d7d1c3', { roughness: .6 }));
      const basin = cyl(g, 1, 1, 4, cx + 3, e + 82, cz, mat('#ffffff', { roughness: .2 }), 24); basin.scale.set(w / 2 - 9, 1, h / 2 - 10);
      cyl(g, 1.4, 1.4, 14, x + 6, e + 88, cz, mat('#c8ced4', { metalness: .8, roughness: .2 }));
      break;
    }
    case 'rail': {
      const m = mat('#5b4636', { roughness: .5 });
      const pts = [];
      for (let yy = y + 3; yy <= y + h; yy += 22.5) { const fe = floorAt(W, cx, Math.min(yy, y + h - 1)); pts.push([yy, fe]); box(g, 3, 88, 3, cx, fe + 44, yy, m); }
      for (let i = 1; i < pts.length; i++) {
        const [y0, e0] = pts[i - 1], [y1, e1] = pts[i], len = Math.hypot(y1 - y0, e1 - e0);
        const r = box(g, 5, 4, len, cx, (e0 + e1) / 2 + 90, (y0 + y1) / 2, m);
        r.rotation.x = Math.atan2(e0 - e1, y1 - y0);
      }
      return;
    }
    case 'toybox':
      box(g, w, 42, h, cx, e + 21, cz, mat('#d4573f', { roughness: .6 }));
      box(g, w + 2, 5, h + 2, cx, e + 44, cz, mat('#e8b33a', { roughness: .6 }));
      break;
    case 'nightstand':
      box(g, w, 50, h, cx, e + 25, cz, wood); box(g, w - 6, .4, h - 6, cx, e + 50.2, cz, woodLight, false);
      break;
    case 'dresser':
      box(g, w, 82, h, cx, e + 41, cz, wood);
      for (let k = 1; k <= 4; k++) box(g, 1, 14, h - 14, x + w + .3, e + k * 19 - 6, cz, woodLight, false);
      break;
    case 'bench':
      box(g, w, 44, h, cx, e + 22, cz, wood);
      for (let k = 0; k < 3; k++) box(g, w - 8, 4, 12, cx, e + 6, y + 14 + k * 20, mat('#2b2f38'));
      break;
    case 'crib': {
      const white = mat('#f3efe8', { roughness: .5 });
      box(g, w, 6, h, cx, e + 40, cz, white); // mattress base
      box(g, w - 6, 8, h - 6, cx, e + 47, cz, mat('#e7eef7', { roughness: .9 }));
      for (const [a, b] of [[x + 2, y + 2], [x + w - 2, y + 2], [x + 2, y + h - 2], [x + w - 2, y + h - 2]]) box(g, 4, f.top, 4, a, e + f.top / 2, b, white);
      for (const zz of [y + 1, y + h - 1]) { box(g, w, 3, 2, cx, e + f.top - 1.5, zz, white); for (let k = x + 10; k < x + w - 6; k += 9) box(g, 1.6, f.top - 46, 1.6, k, e + 44 + (f.top - 46) / 2, zz, white); }
      for (const xx of [x + 1, x + w - 1]) { box(g, 2, 3, h, xx, e + f.top - 1.5, cz, white); for (let k = y + 9; k < y + h - 6; k += 9) box(g, 1.6, f.top - 46, 1.6, xx, e + 44 + (f.top - 46) / 2, k, white); }
      // a mobile over the crib
      cyl(g, .5, .5, 40, x + w - 8, e + f.top + 20, cz, mat('#c8ced4', { metalness: .6 }), 6);
      const arm = new T3.Group(); arm.position.set(x + w / 2, e + f.top + 38, cz); g.add(arm);
      box(arm, w * .55, .8, .8, -w * .05, 0, 0, mat('#c8ced4', { metalness: .6 }));
      ['#f2c230', '#e5483f', '#3a7bd5', '#3fae6a'].forEach((col, i) => { const st = new T3.Mesh(new T3.OctahedronGeometry(3.2), mat(col, { roughness: .6 })); const a = i / 4 * Math.PI * 2; st.position.set(Math.cos(a) * 12, -10, Math.sin(a) * 12); arm.add(st); });
      R.mobile = arm;
      return;
    }
    case 'plantstand': {
      box(g, w, 3, h, cx, e + f.top - 1.5, cz, mat('#6b4a30', { roughness: .5 }));
      for (const [a, b] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) box(g, 3, f.top - 3, 3, a, e + (f.top - 3) / 2, b, mat('#6b4a30'));
      box(g, w - 6, 2, h - 6, cx, e + 18, cz, mat('#6b4a30'));
      cyl(g, 9, 7, 14, x + 14, e + f.top + 7, y + h - 14, mat('#b5653f'));
      const leaves = new T3.Mesh(new T3.IcosahedronGeometry(13, 1), mat('#4f8a40', { flatShading: true, roughness: .9 })); leaves.position.set(x + 14, e + f.top + 24, y + h - 14); leaves.castShadow = true; g.add(leaves);
      return;
    }
    case 'cattree': {
      const sis = mat('#c9b48f', { roughness: 1 }), plush = mat('#8f6b9e', { roughness: 1 });
      box(g, w, 4, h, cx, e + 2, cz, plush);
      cyl(g, 4, 4, f.top - 6, cx - 8, e + 4 + (f.top - 6) / 2, cz - 6, sis, 12);
      cyl(g, 4, 4, 60, cx + 10, e + 34, cz + 8, sis, 12);
      box(g, 30, 3, 30, cx + 8, e + 64, cz + 6, plush);
      cyl(g, 15, 15, 4, cx - 6, e + f.top - 2, cz - 4, plush, 20);
      return;
    }
    case 'shelfstep': {
      // one step of a stepped bookcase; book spines face the open (+x) side
      const tex = canvasTex('books', 512, 128, (c, w, h) => {
        c.fillStyle = '#6b4a30'; c.fillRect(0, 0, w, h);
        const cols = ['#b5473a', '#2f6f78', '#e0b34a', '#4a5d8c', '#7a8b52', '#c0703a', '#e8e2d0', '#5a3d6b'];
        let x = 4, k = 0;
        while (x < w - 6) { const bw = 10 + (k * 37 % 13), bh = h * (.62 + (k * 53 % 30) / 100); c.fillStyle = cols[k % cols.length]; c.fillRect(x, h - bh - 6, bw, bh); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x + 2, h - bh + 4, bw - 4, 2); x += bw + 2; k++; }
      });
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(h / 120, 1);
      const books = new T3.MeshStandardMaterial({ map: t, roughness: .8 });
      const woodM = mat('#8b6142', { roughness: .6 });
      box(g, w, f.top, h, cx, e + f.top / 2, cz, [books, woodM, mat('#a3774f', { roughness: .6 }), woodM, woodM, woodM]);
      return;
    }
    case 'desk': {
      box(g, w, 4, h, cx, e + f.top - 2, cz, mat('#7a593b', { roughness: .45 }));
      box(g, 26, f.top - 4, h - 6, x + w - 14, e + (f.top - 4) / 2, cz, wood);
      for (const [a, b] of [[x + 3, y + 3], [x + 3, y + h - 3]]) box(g, 3, f.top - 4, 3, a, e + (f.top - 4) / 2, b, wood);
      return;
    }
    case 'console':
      box(g, w, 4, h, cx, e + 76, cz, woodLight);
      for (const [a, b] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]]) box(g, 3, 74, 3, a, e + 37, b, wood);
      break;
    default:
      box(g, w, 50, h, cx, e + 25, cz, wood);
  }
}

// ---------- targets ----------
function buildTarget(g, t, W) {
  const e = t.mounted ? t.z0 : t.base;
  const root = new T3.Group(); root.position.set(t.x, e, t.y); g.add(root);
  const tip = new T3.Group(); root.add(tip); // yawed toward the hit, then tilted
  const piv = new T3.Group(); tip.add(piv);
  const body = new T3.Group(); piv.add(body);
  const r = t.r, o = { t, root, tip, piv, body, flashMats: [], kind: t.k };
  const flash = (hex, opts = {}) => { const m = new T3.MeshStandardMaterial(Object.assign({ color: lin(hex), emissive: lin(hex), emissiveIntensity: 0, roughness: .35 }, opts)); o.flashMats.push(m); return m; };
  switch (t.k) {
    case 'doorbell': {
      // a brass plate on the inside of the front door, with a push button
      box(body, 13, (t.z1 - t.z0), 1.6, 0, (t.z1 - t.z0) / 2, 3, flash('#c99a3a', { metalness: .7, roughness: .3 }));
      const btn = new T3.Mesh(new T3.CylinderGeometry(3, 3, 2.4, 20), mat('#f4efe3', { roughness: .3 }));
      btn.rotation.x = Math.PI / 2; btn.position.set(0, (t.z1 - t.z0) / 2, 1.4); body.add(btn);
      o.press = btn; break;
    }
    case 'bell': {
      cyl(body, r * 1.05, r * 1.15, 1.6, 0, .8, 0, mat('#5b4636'));
      const dome = new T3.Mesh(new T3.SphereGeometry(r * .9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), flash(t.k === 'bell' ? '#e2b13c' : '#c99a3a', { metalness: .8, roughness: .25 }));
      dome.position.y = 1.6; dome.castShadow = true; body.add(dome);
      cyl(body, .9, .9, 2.4, 0, 1.6 + r * .9 + .8, 0, mat('#7a5a12', { metalness: .6 }));
      o.wobble = dome; break;
    }
    case 'switch':
      box(body, 5, 9, 2.5, 0, 4.5, 0, flash('#f4f1ea'));
      o.toggle = box(body, 1.6, 3.6, 1.4, 0, 5.5, 1.4, mat('#c6c0b2'));
      break;
    case 'remote':
      box(body, 2.6, 1.4, 8, 0, .7, 0, flash('#23262e', { roughness: .4 }));
      box(body, 1, .4, 1, 0, 1.5, -2.5, mat('#ef6a5a'));
      break;
    case 'musicbox': {
      box(body, 10, 6, 8, 0, 3, 0, flash('#c96f8a', { roughness: .4 }));
      box(body, 10.4, 1.2, 8.4, 0, 6.6, 0, mat('#f3d58a', { metalness: .5, roughness: .3 }));
      const dancer = new T3.Mesh(new T3.ConeGeometry(1.6, 4, 10), mat('#f6f0ff', { roughness: .4 })); dancer.position.y = 9.2; body.add(dancer);
      o.spinner = dancer; break;
    }
    case 'popcorn': {
      const bowl = new T3.Mesh(new T3.CylinderGeometry(6.5, 4, 5, 20, 1, true), flash('#d6453d', { roughness: .5, side: T3.DoubleSide })); bowl.position.y = 2.5; bowl.castShadow = true; body.add(bowl);
      for (let i = 0; i < 16; i++) { const k = new T3.Mesh(new T3.IcosahedronGeometry(1.4, 0), mat('#fbf3d8', { roughness: .8 })); const a = i * 2.4, rr2 = (i % 4) * 1.4; k.position.set(Math.cos(a) * rr2, 4.6 + (i % 3) * .7, Math.sin(a) * rr2); body.add(k); }
      o.tips = true; o.tipBack = 5; break;
    }
    case 'button': {
      box(body, 14, 4, 9, 0, 2, 0, mat('#23262e', { roughness: .3 }));
      const led = new T3.MeshStandardMaterial({ color: lin('#1e3b2c'), emissive: lin('#4cc38a'), emissiveIntensity: 0, roughness: .3 });
      const btn = new T3.Mesh(new T3.CylinderGeometry(2.2, 2.2, 1.6, 16), led); btn.position.set(3, 4.6, 0); body.add(btn);
      o.flashMats.push(led); o.press = null; o.glow = led; break;
    }
    case 'watering': {
      const green = flash('#3fae6a', { roughness: .4, metalness: .2 });
      cyl(body, 5, 5.5, 11, 0, 5.5, 0, green, 18);
      const spout = new T3.Mesh(new T3.CylinderGeometry(.9, 1.6, 12, 8), green); spout.position.set(7, 9, 0); spout.rotation.z = -1; body.add(spout);
      const hdl = new T3.Mesh(new T3.TorusGeometry(4, .7, 6, 14, Math.PI), green); hdl.position.set(-1, 11, 0); body.add(hdl);
      o.tips = true; o.tipBack = 5; break;
    }
    case 'windchime': {
      box(body, 3, 2, 3, 0, 15, 0, mat('#6b4a30'));
      cyl(body, .3, .3, 4, 0, 13, 0, mat('#c8ced4'), 6);
      const ring = new T3.Group(); ring.position.y = 10.5; body.add(ring);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; cyl(ring, .5, .5, 6 + i, Math.cos(a) * 2.6, -(6 + i) / 2, Math.sin(a) * 2.6, flash('#c4cad3', { metalness: .9, roughness: .2 }), 8); }
      cyl(body, 3.5, 3.5, 1.2, 0, .6, 0, mat('#6b4a30'), 16);
      cyl(body, .5, .5, 14, 0, 7.5, 0, mat('#6b4a30'), 6);
      o.wobble = ring; break;
    }
    case 'trophy': {
      const gold = flash('#d9a93a', { metalness: .85, roughness: .25 });
      box(body, 7, 3, 7, 0, 1.5, 0, mat('#3a2a1c', { roughness: .5 }));
      cyl(body, .9, 1.2, 6, 0, 6, 0, gold);
      const cup = new T3.Mesh(new T3.CylinderGeometry(4, 1.6, 7, 20, 1, true), gold); cup.position.y = 12.5; cup.castShadow = true; body.add(cup);
      for (const zz of [-1, 1]) { const hdl = new T3.Mesh(new T3.TorusGeometry(1.8, .45, 6, 12, Math.PI), gold); hdl.position.set(0, 13, zz * 4.4); hdl.rotation.set(0, zz > 0 ? 0 : Math.PI, Math.PI / 2); body.add(hdl); }
      o.tips = true; o.tipBack = 3.5; break;
    }
    case 'cereal': {
      const tex = canvasTex('cereal', 128, 192, (c, w, h) => { c.fillStyle = '#d6453d'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2c230'; c.fillRect(0, h * .35, w, h * .2); c.fillStyle = '#fff'; c.font = 'bold 26px Figtree, sans-serif'; c.textAlign = 'center'; c.fillText('OATY', w / 2, h * .5); c.fillStyle = '#f7e2b5'; c.beginPath(); c.arc(w / 2, h * .75, 22, 0, 7); c.fill(); });
      const m = new T3.MeshStandardMaterial({ map: tex, roughness: .7 });
      o.flashMats.push(new T3.MeshStandardMaterial()); // placeholder so flash code is uniform
      box(body, 13, 22, 5, 0, 11, 0, [mat('#c03b34'), mat('#c03b34'), mat('#d6453d'), mat('#d6453d'), m, m]);
      o.tips = true; o.tipBack = 2.5; break;
    }
    case 'chime': {
      const glass = cyl(body, r * .7, r * .6, 11, 0, 5.5, 0, new T3.MeshStandardMaterial({ color: lin('#cfe6f2'), roughness: .05, transparent: true, opacity: .45 }));
      glass.castShadow = false;
      const spoon = new T3.Group(); spoon.position.set(0, 2, 0); body.add(spoon);
      box(spoon, .8, 15, .4, 0, 7.5, 0, flash('#c4cad3', { metalness: .9, roughness: .2 }));
      spoon.rotation.z = .25; o.wobble = spoon; break;
    }
    case 'duck': {
      const yel = flash('#f5d02f', { roughness: .4 });
      const bodyM = new T3.Mesh(new T3.SphereGeometry(r, 18, 12), yel); bodyM.scale.set(1.2, .8, 1); bodyM.position.y = r * .8; bodyM.castShadow = true; body.add(bodyM);
      const head = new T3.Mesh(new T3.SphereGeometry(r * .6, 16, 10), yel); head.position.set(r * .55, r * 1.75, 0); head.castShadow = true; body.add(head);
      const beak = new T3.Mesh(new T3.ConeGeometry(r * .25, r * .6, 10), mat('#f08a2c')); beak.rotation.z = -Math.PI / 2; beak.position.set(r * 1.25, r * 1.7, 0); body.add(beak);
      for (const zz of [-1, 1]) { const eye = new T3.Mesh(new T3.SphereGeometry(r * .09, 8, 6), mat('#111')); eye.position.set(r * .9, r * 1.95, zz * r * .3); body.add(eye); }
      body.rotation.y = Math.PI * .8;
      o.tips = true; o.tipBack = r; break;
    }
  }
  // pending ring on the floor
  const ringM = new T3.MeshBasicMaterial({ color: lin('#f6b33c'), transparent: true, opacity: .8, depthWrite: false });
  const ring = new T3.Mesh(new T3.RingGeometry(r + 1.5, r + 2.6, 40), ringM);
  if (t.mounted) { ring.position.set(t.x, (t.z0 + t.z1) / 2, t.y + 1); }
  else { ring.rotation.x = -Math.PI / 2; ring.position.set(t.x, e + .3, t.y); }
  g.add(ring);
  o.ring = ring; o.ringM = ringM;
  if (W.ordered && t.order) o.order = t.order;
  return o;
}

// ---------- room ----------
function buildRoom3D(W) {
  if (R && R.group) { scene.remove(R.group); R.group.traverse(n => { if (n.geometry) n.geometry.dispose(); }); }
  R = { group: new T3.Group(), pick: [], lamps: [], tvs: [], targets: [], props: [], labels: [] };
  const g = R.group; scene.add(g);
  const [bx0, by0, bx1, by1] = W.bounds;
  // table top the house sits on
  const table = new T3.Mesh(new T3.PlaneGeometry((bx1 - bx0) * 4, (by1 - by0) * 4), mat('#1d2230', { roughness: 1 }));
  table.rotation.x = -Math.PI / 2; table.position.set((bx0 + bx1) / 2, -1.2, (by0 + by1) / 2); table.receiveShadow = true; g.add(table);
  // floors (rooms, landing, steps, doorways)
  const pieces = [];
  for (const r of W.rooms) {
    const x0 = r.x + WT, y0 = r.y + WT, x1 = r.x + r.w - WT, y1 = r.y + r.h - WT;
    const st = W.stairs.find(s => s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h);
    if (!st) { pieces.push({ x0, y0, x1, y1, e: r.elev, type: r.floor }); continue; }
    pieces.push({ x0, y0, x1, y1: st.y, e: st.top, type: r.floor });
    pieces.push({ x0, y0: st.y + st.h, x1, y1, e: st.bottom, type: r.floor });
    const sh = st.h / st.steps;
    for (let k = 0; k < st.steps; k++) pieces.push({ x0, y0: st.y + k * sh, x1, y1: st.y + (k + 1) * sh, e: st.top - (st.top - st.bottom) * (k + 1) / st.steps, type: 'stair', step: true });
  }
  for (const [x, y, w, h] of W.gaps) pieces.push({ x0: x, y0: y, x1: x + w, y1: y + h, e: floorAt(W, x + w / 2 + (w < h ? 0 : 0), y + h / 2), type: 'wood', gap: true });
  const slab = mat('#3b3547', { roughness: .9 }), slabTop = mat('#4a4359', { roughness: .9 });
  for (const p of pieces) {
    const w = p.x1 - p.x0, h = p.y1 - p.y0, top = p.e, hh = Math.max(1.2, top + 1.2);
    const fm = floorMat(p.type, w, h);
    const side = p.step ? mat('#9c7449', { roughness: .7 }) : (top > 0 ? slab : slabTop);
    const m = box(g, w, hh, h, p.x0 + w / 2, top - hh / 2, p.y0 + h / 2, [side, side, fm, side, side, side], top > 0);
    m.userData.layer = 'g'; R.pick.push(m);
  }
  // decor & bath mat
  for (const d of W.decor) {
    const e = floorAt(W, d.x + d.w / 2, d.y + d.h / 2);
    if (d.k === 'dock') {
      box(g, d.w, 9, d.h, d.x + d.w / 2, e + 4.5, d.y + d.h / 2, mat('#2b2f38', { roughness: .4 }));
      const led = new T3.Mesh(new T3.SphereGeometry(1, 10, 8), new T3.MeshBasicMaterial({ color: lin('#4cc38a') })); led.position.set(d.x + d.w, e + 7, d.y + d.h / 2); g.add(led);
      continue;
    }
    const m = new T3.MeshStandardMaterial({ map: rugTex(d.k), roughness: 1 }); const mm = box(g, d.w, .8, d.h, d.x + d.w / 2, e + .4, d.y + d.h / 2, m, false); mm.userData.layer = 'g'; R.pick.push(mm);
  }
  for (const n of W.noPlace) {
    if (n.cat) {
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2, e = floorAt(W, cx, cy);
      const rim = new T3.Mesh(new T3.TorusGeometry(n.w / 2 - 3, 3.2, 10, 28), mat('#8f6b9e', { roughness: .95 })); rim.rotation.x = Math.PI / 2; rim.position.set(cx, e + 3, cy); rim.castShadow = true; g.add(rim);
      const cush = cyl(g, n.w / 2 - 3, n.w / 2 - 3, 2.4, cx, e + 1.2, cy, mat('#d9c6e3', { roughness: 1 }), 24); cush.userData.layer = 'g'; R.pick.push(cush);
      continue;
    } const e = floorAt(W, n.x + n.w / 2, n.y + n.h / 2); const m = new T3.MeshStandardMaterial({ map: rugTex('mat'), roughness: 1 }); const mm = box(g, n.w, 1.4, n.h, n.x + n.w / 2, e + .7, n.y + n.h / 2, m, false); mm.userData.layer = 'g'; R.pick.push(mm); }
  // walls: chunked so height follows the floor on each side
  const wallM = mat('#2b303d', { roughness: .9 }), capM = mat('#454c61', { roughness: .8 });
  const WALL_H = 34;
  const wallPiece = (x, y, w, h, extra, m) => {
    const cx = x + w / 2, cy = y + h / 2;
    const fl = Math.max(floorAt(W, cx - (w < h ? 15 : 0), cy - (w < h ? 0 : 15)), floorAt(W, cx + (w < h ? 15 : 0), cy + (w < h ? 0 : 15)));
    const H = fl + WALL_H + (extra || 0);
    box(g, w, H, h, cx, H / 2 - 1.2, cy, m || [wallM, wallM, capM, wallM, wallM, wallM]);
  };
  for (const [x, y, w, h] of W.walls) {
    const L = Math.max(w, h), n = Math.max(1, Math.ceil(L / 22.5));
    for (let k = 0; k < n; k++) w > h ? wallPiece(x + k * w / n, y, w / n, h) : wallPiece(x, y + k * h / n, w, h / n);
  }
  for (const d of W.doors) {
    const [x, y, w, h] = d.rect;
    wallPiece(x + (w > h ? 0 : w * .3), y + (w > h ? h * .3 : 0), w > h ? w : w * .4, w > h ? h * .4 : h, -6, mat(d.ext ? '#7a3f34' : '#9b7650', { roughness: .6 }));
  }
  R.furn = new T3.Group(); g.add(R.furn);
  for (const f of W.furniture) buildFurniture(R.furn, f, W);
  for (const t of W.targets) R.targets.push(buildTarget(g, t, W));
  // buildable furniture tops: invisible pick planes, plus dashed outlines shown while building
  R.topOutlines = new T3.Group(); g.add(R.topOutlines);
  const pickM = new T3.MeshBasicMaterial({ visible: false });
  for (const id in W.tops) {
    const T = W.tops[id]; if (!T.build) continue;
    const [x, y, w, h] = T.rect;
    const pl = new T3.Mesh(new T3.PlaneGeometry(w, h), pickM); pl.rotation.x = -Math.PI / 2; pl.position.set(x + w / 2, T.z + .05, y + h / 2);
    pl.userData.layer = id; g.add(pl); R.pick.push(pl);
    const pts = [[x + 1.5, y + 1.5], [x + w - 1.5, y + 1.5], [x + w - 1.5, y + h - 1.5], [x + 1.5, y + h - 1.5], [x + 1.5, y + 1.5]].map(([a, b]) => new T3.Vector3(a, T.z + .35, b));
    const ln = new T3.Line(new T3.BufferGeometry().setFromPoints(pts), new T3.LineDashedMaterial({ color: lin('#f6b33c'), dashSize: 3, gapSize: 2.5, transparent: true, opacity: .9 }));
    ln.computeLineDistances(); R.topOutlines.add(ln);
  }
  R.gadGroup = new T3.Group(); g.add(R.gadGroup); R.gadVer = -1; R.gadMeshes = [];
  R.arcGroup = new T3.Group(); g.add(R.arcGroup);
  R.balls = []; R.arrows = [];
  // dominoes
  R.domGeo = new T3.BoxGeometry(DT, DH, DW);
  R.domMat = new T3.MeshStandardMaterial({ roughness: .35, metalness: 0 });
  R.cap = 0; ensureCap(256);
  // selection handle + eraser ring
  R.handle = new T3.Mesh(new T3.SphereGeometry(1, 18, 12), new T3.MeshBasicMaterial({ color: lin('#f6b33c') }));
  R.handleLine = new T3.Line(new T3.BufferGeometry().setFromPoints([new T3.Vector3(), new T3.Vector3()]), new T3.LineBasicMaterial({ color: lin('#f6b33c') }));
  R.erase = new T3.Mesh(new T3.RingGeometry(.9, 1, 40), new T3.MeshBasicMaterial({ color: lin('#ef6a5a'), transparent: true, opacity: .9, depthTest: false }));
  R.erase.rotation.x = -Math.PI / 2;
  g.add(R.handle, R.handleLine, R.erase);
  // sun covers the whole house
  const cx = (bx0 + bx1) / 2, cz = (by0 + by1) / 2, rad = Math.hypot(bx1 - bx0, by1 - by0) / 2 + 40;
  sun.position.set(cx - rad * .55, 520 + rad * .4, cz - rad * .25); sun.target.position.set(cx, 0, cz);
  const sc = sun.shadow.camera; sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad; sc.near = 10; sc.far = 2400; sc.updateProjectionMatrix();
  // target labels
  const host = $('labels'); host.innerHTML = '';
  for (const o of R.targets) {
    const el = document.createElement('div'); el.className = 'tlabel';
    host.append(el); o.label = el;
  }
  buildHousehold3D(W);
}
function buildProps3D() {
  for (const a of R.arrows) R.group.remove(a.obj);
  R.arrows = [];
  G.props.forEach((p, i) => {
    if (!p.start) return;
    const arrow = new T3.Group(), m = new T3.MeshBasicMaterial({ color: lin('#f6b33c') });
    const shaft = new T3.Mesh(new T3.BoxGeometry(16, .6, 1.4), m); shaft.position.x = 12; arrow.add(shaft);
    const head = new T3.Mesh(new T3.ConeGeometry(2.6, 6, 14), m); head.rotation.z = -Math.PI / 2; head.position.x = 22; arrow.add(head);
    R.group.add(arrow); R.arrows.push({ obj: arrow, i });
  });
}
const MARBLE_MAT = () => new T3.MeshStandardMaterial({ color: lin('#4f9be0'), roughness: .05, metalness: .1, transparent: true, opacity: .92 });
function makeBallMesh(k, r) {
  const o = { k, grp: new T3.Group(), spin: new T3.Group() };
  o.grp.add(o.spin); R.group.add(o.grp);
  if (k === 'roll') {
    const roll = new T3.Mesh(new T3.CylinderGeometry(r, r, 10, 28, 1, true), new T3.MeshStandardMaterial({ color: lin('#fbfaf6'), roughness: .95, side: T3.DoubleSide }));
    roll.rotation.x = Math.PI / 2; roll.castShadow = true; o.spin.add(roll);
    const core = new T3.Mesh(new T3.CylinderGeometry(r * .38, r * .38, 10.2, 18, 1, true), new T3.MeshStandardMaterial({ color: lin('#b9a98c'), side: T3.DoubleSide }));
    core.rotation.x = Math.PI / 2; o.spin.add(core);
    for (const zz of [-5, 5]) { const cap = new T3.Mesh(new T3.RingGeometry(r * .38, r, 28), mat('#f1eee6', { side: T3.DoubleSide })); cap.position.z = zz; o.spin.add(cap); }
  } else {
    const m = new T3.Mesh(new T3.SphereGeometry(r, 24, 16), MARBLE_MAT()); m.castShadow = true; o.spin.add(m);
  }
  return o;
}
// balls: in edit mode the room's props, while playing every ball in the simulation (thrown ones too)
function syncBalls(list, playing) {
  while (R.balls.length < list.length) { const b = list[R.balls.length]; R.balls.push(makeBallMesh(b.k, b.r)); }
  R.balls.forEach((o, i) => {
    const b = list[i];
    o.grp.visible = !!b; if (!b) { o.last = null; return; }
    const z = playing && b.z != null ? b.z : layerZ(G.W, b.L || 'g', b.x, b.y) + b.r;
    const prev = o.last || [b.x, b.y];
    o.grp.position.set(b.x, z, b.y);
    const dx = b.x - prev[0], dy = b.y - prev[1], dist = Math.hypot(dx, dy);
    if (dist > 0.01) { o.grp.rotation.y = -Math.atan2(dy, dx); o.spin.rotation.z -= dist / b.r; }
    else if (!playing) { o.grp.rotation.y = -(b.a || 0); o.spin.rotation.z = 0; }
    o.last = [b.x, b.y];
  });
  for (const a of R.arrows) {
    const p = G.props[a.i]; a.obj.visible = !playing && !!p;
    if (p) { a.obj.position.set(p.x, layerZ(G.W, p.L || 'g', p.x, p.y) + .6, p.y); a.obj.rotation.y = -(p.a || 0); }
  }
}

// ---------- gadgets ----------
function buildGadgetMesh(gd) {
  const S = GADGETS[gd.k], grp = new T3.Group();
  const wood = mat('#8a5a36', { roughness: .6 }), dark = mat('#4b3322', { roughness: .7 }), metal = mat('#a3acb6', { metalness: .6, roughness: .35 });
  const o = { grp, k: gd.k, kind: S.kind };
  const ammoAt = (parent, x, y) => { const m = new T3.Mesh(new T3.SphereGeometry(2.2, 16, 12), MARBLE_MAT()); m.position.set(x, y, 0); parent.add(m); o.ammo = m; };
  if (S.kind === 'launcher') {
    box(grp, S.len, S.base, S.wid, 0, S.base / 2, 0, dark);
    box(grp, 4.5, 1.2, S.wid - 3, -S.len / 2 + 3, S.base + .6, 0, mat('#d4573f', { roughness: .5 })); // trigger pad
    const arm = new T3.Group(); grp.add(arm);
    const cupAt = (x, y) => {
      const cup = new T3.Mesh(new T3.SphereGeometry(3.2, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal); cup.position.set(x, y, 0); arm.add(cup);
      ammoAt(arm, x, y + .4);
    };
    if (gd.k === 'catapult') {
      for (const zz of [S.wid / 2 - 1.5, -S.wid / 2 + 1.5]) box(grp, 3, 7, 1.6, 0, S.base + 3.5, zz, wood);
      arm.position.set(0, S.armZ - 1, 0);
      box(arm, S.len + 2, 1.6, 3.4, 0, 0, 0, wood);
      cupAt(S.len / 2 - 1, 1.6);
      o.rest = -0.28; o.fire = 1.05;
    } else {
      for (const zz of [S.wid / 2 - 2, -S.wid / 2 + 2]) {
        const p1 = box(grp, 2.6, S.armZ + 2, 2.6, -6, S.base + S.armZ / 2 - 1, zz, wood); p1.rotation.z = -0.22;
        const p2 = box(grp, 2.6, S.armZ + 2, 2.6, 6, S.base + S.armZ / 2 - 1, zz, wood); p2.rotation.z = 0.22;
      }
      box(grp, 2, 2, S.wid, 0, S.base + S.armZ, 0, metal);
      arm.position.set(0, S.base + S.armZ, 0);
      box(arm, 54, 2.2, 2.8, 9, 0, 0, wood);
      box(arm, 9, 11, 10, -16, -6, 0, mat('#5a6170', { metalness: .4, roughness: .5 }));
      cupAt(35, 1.8);
      o.rest = -0.95; o.fire = 1.2;
    }
    o.arm = arm; arm.rotation.z = o.rest;
  } else if (S.kind === 'ramp') {
    // a plank sloping down toward the front, propped up at the back
    const rise = gd.power, th = Math.atan(rise / S.len), L = Math.hypot(S.len, rise);
    const plank = new T3.Group(); plank.position.set(0, rise / 2 + 1.5, 0); plank.rotation.z = -th; grp.add(plank);
    box(plank, L, 1.4, S.wid, 0, -.7, 0, mat('#c99a63', { roughness: .55 }));
    for (const zz of [S.wid / 2 + .4, -S.wid / 2 - .4]) box(plank, L, 3, .8, 0, .8, zz, mat('#8a5a36', { roughness: .6 }));
    for (const xx of [-S.len / 2 + 2, -S.len / 6]) {
      const h = rise * (1 - (xx + S.len / 2) / S.len) + 1;
      for (const zz of [S.wid / 2 - 1.5, -S.wid / 2 + 1.5]) box(grp, 2, h, 2, xx, h / 2, zz, dark);
    }
  } else if (S.kind === 'lift') {
    box(grp, S.len, S.base, S.wid, 0, S.base / 2, 0, dark);
    const H = gd.power + 16, bx = -S.len / 2 + 1.5;
    for (const zz of [S.wid / 2 - 1.5, -S.wid / 2 + 1.5]) box(grp, 2.4, H, 2.4, bx, H / 2, zz, wood);
    box(grp, 2.4, 2.4, S.wid, bx, H, 0, wood);
    const wheel = new T3.Mesh(new T3.TorusGeometry(3, .8, 8, 20), metal); wheel.position.set(bx + 3.5, H - 1, 0); grp.add(wheel);
    const plat = new T3.Group(); grp.add(plat);
    box(plat, S.len - 4, 1.6, S.wid - 4, 1, .8, 0, mat('#c99a63', { roughness: .55 }));
    box(plat, 1.2, 3, S.wid - 4, -S.len / 2 + 3.6, 2, 0, mat('#d4573f', { roughness: .5 })); // pusher
    ammoAt(plat, 2, 3.8);
    const rope = new T3.Mesh(new T3.CylinderGeometry(.35, .35, 1, 6), mat('#e8dcc0')); grp.add(rope);
    o.plat = plat; o.rope = rope; o.H = H; o.wheelX = bx + 3.5;
    plat.position.y = S.base;
  } else if (S.kind === 'tramp') {
    const r = S.len / 2 - 1.5;
    for (const [lx, lz] of [[r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) cyl(grp, .9, .9, S.base, lx, S.base / 2, lz, dark, 8);
    const ring = new T3.Mesh(new T3.TorusGeometry(r, 1.2, 10, 32), mat('#3a7bd5', { roughness: .4 })); ring.rotation.x = Math.PI / 2; ring.position.y = S.base - .8; grp.add(ring);
    const matM = new T3.Mesh(new T3.CircleGeometry(r - 1, 32), mat('#1d1f26', { roughness: .9, side: T3.DoubleSide })); matM.rotation.x = -Math.PI / 2; matM.position.y = S.base - .6; grp.add(matM);
    // the arrow shows which way it throws
    const sh = new T3.Shape(); sh.moveTo(7, 0); sh.lineTo(-2, 4.5); sh.lineTo(0, 0); sh.lineTo(-2, -4.5); sh.lineTo(7, 0);
    const arrow = new T3.Mesh(new T3.ShapeGeometry(sh), mat('#f6b33c', { side: T3.DoubleSide })); arrow.rotation.x = -Math.PI / 2; arrow.position.y = S.base - .5; grp.add(arrow);
    o.mat = matM; o.arrow = arrow;
  }
  grp.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  return o;
}
// per-kind animation while a run plays (t = seconds since the gadget went off, or -1)
function animateGadget(o, gd, sg, t) {
  const S = GADGETS[gd.k];
  if (o.kind === 'launcher') {
    o.arm.rotation.z = t < 0 ? o.rest : o.rest + (o.fire - o.rest) * Math.min(1, t / 0.12);
    o.ammo.visible = t < 0;
  } else if (o.kind === 'lift') {
    const h = t < 0 ? 0 : Math.min(gd.power, t * S.speed);
    o.plat.position.y = S.base + h;
    o.ammo.visible = !(sg && sg.released);
    const top = o.H - 1, bot = S.base + h + 2, len = Math.max(.1, top - bot);
    o.rope.scale.y = len; o.rope.position.set(o.wheelX + 3, bot + len / 2, 0);
  } else if (o.kind === 'tramp') {
    const dip = t >= 0 && t < .6 ? -3 * Math.exp(-t * 9) * Math.cos(t * 30) : 0;
    o.mat.position.y = S.base - .6 + dip; o.arrow.position.y = S.base - .5 + dip;
  }
}
function syncGadgets(playing) {
  if (R.gadVer !== G.gadVer) {
    R.gadVer = G.gadVer;
    for (const o of R.gadMeshes) R.gadGroup.remove(o.grp);
    R.gadMeshes = G.gadgets.map(buildGadgetMesh);
    R.gadMeshes.forEach(o => R.gadGroup.add(o.grp));
    // trajectory previews
    while (R.arcGroup.children.length) { const c = R.arcGroup.children.pop(); c.geometry && c.geometry.dispose(); }
    G.gadgets.forEach((gd, i) => {
      const arc = predictArc(G.W, gd, G.gadgets);
      if (!arc) return;
      const pts = arc.map(([x, y, z]) => new T3.Vector3(x, z, y));
      const sel = G.selGad === i;
      const ln = new T3.Line(new T3.BufferGeometry().setFromPoints(pts), new T3.LineDashedMaterial({ color: lin(sel ? '#ffd36b' : '#f6b33c'), dashSize: 2.5, gapSize: 2.5, transparent: true, opacity: sel ? 1 : .6, depthTest: false }));
      ln.computeLineDistances(); ln.renderOrder = 5; R.arcGroup.add(ln);
      const end = pts[pts.length - 1];
      const ring = new T3.Mesh(new T3.RingGeometry(2.6, 3.6, 24), new T3.MeshBasicMaterial({ color: lin(sel ? '#ffd36b' : '#f6b33c'), transparent: true, opacity: sel ? 1 : .6, depthTest: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(end.x, end.y - 1.8, end.z); ring.renderOrder = 5; R.arcGroup.add(ring);
    });
  }
  R.arcGroup.visible = !playing;
  G.gadgets.forEach((gd, i) => {
    const o = R.gadMeshes[i]; if (!o) return;
    o.grp.position.set(gd.x, layerZ(G.W, gd.L || 'g', gd.x, gd.y), gd.y); o.grp.rotation.y = -gd.a;
    const sg = playing && G.sim ? G.sim.gad[i] : null;
    const t = sg && sg.fired >= 0 ? G.sim.t - sg.fired : -1;
    animateGadget(o, gd, sg, t);
  });
}
// ---------- household: roomba, baby, cat ----------
function numTex(n) {
  return canvasTex('num-' + n, 64, 64, (c, w, h) => {
    c.fillStyle = 'rgba(22,26,36,.85)'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.fill();
    c.fillStyle = '#f3ede1'; c.font = '700 30px Figtree, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n + 's', w / 2, h / 2 + 1);
  });
}
function pawTex() {
  return canvasTex('paw', 64, 64, (c, w, h) => {
    c.fillStyle = 'rgba(120,60,20,.75)';
    c.beginPath(); c.ellipse(32, 40, 13, 11, 0, 0, 7); c.fill();
    for (const [x, y] of [[16, 22], [27, 14], [38, 14], [49, 22]]) { c.beginPath(); c.ellipse(x, y, 5, 6, 0, 0, 7); c.fill(); }
  });
}
function buildRoomba() {
  const grp = new T3.Group(), o = { grp, k: 'roomba' };
  cyl(grp, 17, 17, 7, 0, 4.5, 0, mat('#2b2f38', { roughness: .35, metalness: .2 }), 36);
  cyl(grp, 13, 13, .6, 0, 8.3, 0, mat('#3d434f', { roughness: .25, metalness: .4 }), 32);
  const bump = new T3.Mesh(new T3.TorusGeometry(17, 1.4, 8, 30, Math.PI), mat('#5a6170', { roughness: .4 })); bump.rotation.set(Math.PI / 2, 0, -Math.PI / 2); bump.position.y = 4; grp.add(bump);
  const led = new T3.Mesh(new T3.SphereGeometry(1.1, 10, 8), new T3.MeshBasicMaterial({ color: lin('#4cc38a') })); led.position.set(8, 8.6, 0); grp.add(led);
  const brush = new T3.Group(); brush.position.set(11, 1.2, 10); grp.add(brush);
  for (let i = 0; i < 3; i++) { const b = box(brush, 7, .4, .6, 3.5, 0, 0, mat('#e8dcc0'), false); b.parent.remove(b); const arm = new T3.Group(); arm.rotation.y = i * 2.1; arm.add(b); brush.add(arm); }
  o.brush = brush; o.led = led;
  return o;
}
function buildBaby() {
  const grp = new T3.Group(), o = { grp, k: 'baby' };
  const skin = mat('#f2c9a0', { roughness: .7 }), suit = mat('#9cc3e6', { roughness: .85 }), diaper = mat('#ffffff', { roughness: .9 });
  const torso = new T3.Mesh(new T3.SphereGeometry(8, 18, 12), suit); torso.scale.set(1.35, .85, 1); torso.position.set(0, 13, 0); torso.castShadow = true; grp.add(torso);
  const bum = new T3.Mesh(new T3.SphereGeometry(6.5, 16, 10), diaper); bum.position.set(-9, 13, 0); bum.castShadow = true; grp.add(bum);
  const head = new T3.Group(); head.position.set(13, 19, 0); grp.add(head);
  const hd = new T3.Mesh(new T3.SphereGeometry(7.2, 20, 14), skin); hd.castShadow = true; head.add(hd);
  for (const zz of [-2.6, 2.6]) { const eye = new T3.Mesh(new T3.SphereGeometry(.8, 8, 6), mat('#2b2f38')); eye.position.set(6.4, 1, zz); head.add(eye); }
  const tuft = new T3.Mesh(new T3.ConeGeometry(1.6, 4, 8), mat('#c98a3e')); tuft.position.set(0, 7.6, 0); tuft.rotation.z = -.3; head.add(tuft);
  const limb = (x, z, len, m) => { const p = new T3.Group(); p.position.set(x, 13, z); const l = cyl(p, 2.4, 2.1, len, 0, -len / 2, 0, m, 10); l.castShadow = true; grp.add(p); return p; };
  o.arms = [limb(7, 5.5, 12, suit), limb(7, -5.5, 12, suit)];
  o.legs = [limb(-7, 5, 11, suit), limb(-7, -5, 11, suit)];
  o.head = head;
  return o;
}
function buildCat() {
  const grp = new T3.Group(), o = { grp, k: 'cat' };
  const fur = mat('#e08a3c', { roughness: .9 }), pale = mat('#f6dcc0', { roughness: .9 });
  const body = new T3.Group(); grp.add(body);
  const torso = new T3.Mesh(new T3.SphereGeometry(7, 18, 12), fur); torso.castShadow = true; body.add(torso);
  const chest = new T3.Mesh(new T3.SphereGeometry(4.5, 12, 8), pale); chest.position.set(6, -1.5, 0); body.add(chest);
  const head = new T3.Group(); grp.add(head);
  const hd = new T3.Mesh(new T3.SphereGeometry(5, 16, 12), fur); hd.castShadow = true; head.add(hd);
  const muzzle = new T3.Mesh(new T3.SphereGeometry(2.4, 10, 8), pale); muzzle.position.set(4, -1.2, 0); head.add(muzzle);
  for (const zz of [-2.6, 2.6]) {
    const ear = new T3.Mesh(new T3.ConeGeometry(1.9, 4, 4), fur); ear.position.set(-.4, 4.6, zz); ear.rotation.x = zz * .08; head.add(ear);
    const eye = new T3.Mesh(new T3.SphereGeometry(.7, 8, 6), mat('#3f7a2f', { roughness: .2 })); eye.position.set(4.2, 1.2, zz * .75); head.add(eye);
    o.eyes = (o.eyes || []).concat(eye);
  }
  const legs = [];
  for (const [x, z] of [[6, 3], [6, -3], [-6, 3], [-6, -3]]) { const p = new T3.Group(); p.position.set(x, 0, z); cyl(p, 1.4, 1.2, 9, 0, -4.5, 0, fur, 8); grp.add(p); legs.push(p); }
  const tail = []; let prev = grp;
  for (let i = 0; i < 6; i++) { const seg = new T3.Group(); const m = new T3.Mesh(new T3.SphereGeometry(1.6 - i * .12, 8, 6), fur); seg.add(m); prev.add(seg); tail.push(seg); prev = seg; }
  Object.assign(o, { body, torso, head, legs, tail });
  return o;
}
// pose the cat: 'curl' (asleep), 'stand', 'walk', 'swat', 'sit'; ph = animation phase
function poseCat(o, pose, ph) {
  const curl = pose === 'curl', sit = pose === 'sit';
  o.legs.forEach((l, i) => { l.visible = !curl; l.rotation.z = pose === 'walk' ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * .55 : 0; l.position.y = sit && i > 1 ? 4 : 9; });
  if (pose === 'swat') { const l = o.legs[0]; l.rotation.z = -1.2 - Math.sin(ph) * .5; l.position.y = 12; }
  if (curl) {
    o.body.position.set(0, 5, 0); o.torso.scale.set(1.5, .75, 1.25);
    o.head.position.set(7, 6.5, 4.5); o.head.rotation.set(0, -.7, .25);
    o.eyes.forEach(e => e.scale.set(1, .15, 1));
    o.tail[0].position.set(-9, -1, 0); o.tail.forEach((s, i) => { if (i) s.position.set(.6, 0, 2.6); s.rotation.y = i ? .45 : 1.2; });
  } else {
    o.eyes.forEach(e => e.scale.set(1, 1, 1));
    o.body.position.set(0, sit ? 11 : 13, 0); o.torso.scale.set(sit ? 1.15 : 1.7, sit ? 1.15 : .9, 1);
    o.body.rotation.z = sit ? .6 : 0;
    o.head.position.set(sit ? 7 : 12, sit ? 24 : 19, 0); o.head.rotation.set(0, 0, 0);
    o.tail[0].position.set(sit ? -6 : -11, sit ? 8 : 15, 0);
    o.tail.forEach((s, i) => { if (i) s.position.set(-.4, 2.6, 0); s.rotation.set(0, 0, i ? (sit ? -.35 : .12) + Math.sin(ph * .5 + i) * .08 : (sit ? 1.9 : .5)); });
  }
}
function buildHousehold3D(W) {
  R.house = { agents: [], markers: new T3.Group(), cat: null, paws: new T3.Group() };
  R.group.add(R.house.markers, R.house.paws);
  const host = $('labels');
  for (const A of W.agents) {
    const o = A.k === 'roomba' ? buildRoomba() : buildBaby();
    if (A.k === 'baby') o.grp.scale.setScalar(1.2);
    o.grp.traverse(n => { if (n.isMesh) n.castShadow = true; });
    R.group.add(o.grp);
    // the route: a dashed line on the floor with a marker for every second
    const col = A.k === 'baby' ? '#e5483f' : '#3a7bd5';
    const pts = (A.loop ? [...A.path, A.path[0]] : A.path).map(([x, y]) => new T3.Vector3(x, floorAt(W, x, y) + .9, y));
    const ln = new T3.Line(new T3.BufferGeometry().setFromPoints(pts), new T3.LineDashedMaterial({ color: lin(col), dashSize: 4, gapSize: 3, transparent: true, opacity: .9 }));
    ln.computeLineDistances(); R.house.markers.add(ln);
    const until = agentUntil(A), t0 = A.start || 0;
    for (let t = Math.ceil(t0 + .01); t <= until + .01 && t - t0 < 24; t++) {
      const [x, y] = agentPose(A, t), e = floorAt(W, x, y);
      const showNum = t % 2 === 0 || until - t0 < 10;
      const m = new T3.Mesh(new T3.PlaneGeometry(showNum ? 9 : 3, showNum ? 9 : 3), showNum ? new T3.MeshBasicMaterial({ map: numTex(t), transparent: true, depthWrite: false }) : new T3.MeshBasicMaterial({ color: lin(col) }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, e + 1, y); m.renderOrder = 3; R.house.markers.add(m);
    }
    const el = document.createElement('div'); el.className = 'tlabel agent';
    el.textContent = A.k === 'baby' ? `Baby · crawls at ${t0} s` : `Robot vacuum · sets off at ${t0} s`;
    host.append(el);
    R.house.agents.push({ A, o, el, dist: 0, last: null });
  }
}
function ensureCatMesh() {
  if (R.house.cat || !G.catAI) return;
  const o = buildCat(); o.grp.scale.setScalar(1.5); R.group.add(o.grp); R.house.cat = o;
  const el = document.createElement('div'); el.className = 'tlabel agent cat'; el.textContent = 'Cat'; $('labels').append(el); o.el = el;
}
function placeLabel(el, x, y3, z, show) {
  if (!show) { el.hidden = true; return; }
  const [sx, sy, zz] = toScreen(x, y3, z);
  el.hidden = !(zz < 1 && sx > -40 && sx < CW + 40 && sy > -20 && sy < CH + 20);
  if (!el.hidden) el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
}
function syncHousehold(playing, dt) {
  if (!R.house) return;
  R.house.markers.visible = !playing;
  const sim = playing && G.sim && G.mode !== 'rewind' ? G.sim : null;
  R.house.agents.forEach((h, i) => {
    const sa = sim && sim.agents[i];
    const [x, y, a] = sa ? [sa.x, sa.y, sa.a] : agentPose(h.A, 0);
    const e = floorAt(G.W, x, y);
    h.o.grp.position.set(x, e, y); h.o.grp.rotation.y = -a;
    const moved = h.last ? Math.hypot(x - h.last[0], y - h.last[1]) : 0; h.last = [x, y]; h.dist += moved;
    if (h.o.k === 'roomba') { if (moved > 0) h.o.brush.rotation.y += dt * 25; h.o.led.material.color.copy(lin(sa && G.sim.t >= (h.A.start || 0) ? '#6fd3ff' : '#4cc38a')); }
    else {
      const ph = h.dist * .45, sitting = sa && sa.sitting;
      h.o.arms.forEach((l, k) => { l.rotation.z = sitting ? 0 : Math.sin(ph + k * Math.PI) * .5; });
      h.o.legs.forEach((l, k) => { l.rotation.z = sitting ? 1.2 : Math.sin(ph + k * Math.PI + Math.PI) * .4; });
      h.o.head.rotation.z = sitting ? .25 : Math.sin(ph * .5) * .05;
    }
    placeLabel(h.el, x, e + (h.o.k === 'baby' ? 34 : 18), y, !playing);
  });
  // the cat: asleep, pouncing or sitting during a run; up to mischief while you build
  const C = G.catAI; if (!C) return;
  ensureCatMesh(); const o = R.house.cat;
  let x, y, a, pose, lift = 0;
  if (sim && sim.cat) {
    const c = sim.cat; x = c.x; y = c.y; a = c.a || 0;
    if (c.st === 'sleep') pose = 'curl';
    else if (c.st === 'leap') { pose = 'stand'; lift = Math.sin(Math.min(1, (sim.t - c.t0) / CAT.leap) * Math.PI) * 14; }
    else pose = 'sit';
  } else if (playing) { x = C.bed[0]; y = C.bed[1]; a = C.a; pose = 'curl'; }
  else { x = C.x; y = C.y; a = C.a; pose = C.st === 'sleep' ? 'curl' : C.st === 'swat' ? 'swat' : C.st === 'groom' ? 'sit' : 'walk'; }
  C.ph = (C.ph || 0) + dt * (pose === 'walk' ? (C.st === 'flee' ? 22 : 11) : 4);
  poseCat(o, pose, C.ph);
  const onBed = pose === 'curl' || (Math.hypot(x - C.bed[0], y - C.bed[1]) < 8);
  o.grp.position.set(x, floorAt(G.W, x, y) + lift + (onBed && G.W.cat ? 2.4 : 0), y); o.grp.rotation.y = -a;
  placeLabel(o.el, x, floorAt(G.W, x, y) + 30, y, !playing && C.st !== 'sleep');
  if (!playing) o.el.textContent = C.st === 'flee' ? 'Cat · shoo!' : 'Cat · tap to shoo';
  // paw prints where the cat has been at work
  G.paws = (G.paws || []).filter(p => G.time - p.t < 14);
  if (R.house.pawCount !== G.paws.length || G.paws.some(p => !p.mesh)) {
    while (R.house.paws.children.length) R.house.paws.remove(R.house.paws.children[0]);
    for (const p of G.paws) {
      p.mesh = new T3.Mesh(new T3.PlaneGeometry(10, 10), new T3.MeshBasicMaterial({ map: pawTex(), transparent: true, depthWrite: false }));
      p.mesh.rotation.x = -Math.PI / 2; p.mesh.rotation.z = p.a || 0; p.mesh.position.set(p.x, floorAt(G.W, p.x, p.y) + 1.1, p.y); p.mesh.renderOrder = 3; R.house.paws.add(p.mesh);
    }
    R.house.pawCount = G.paws.length;
  }
  for (const p of G.paws) p.mesh.material.opacity = Math.min(1, (14 - (G.time - p.t)) / 3);
}

// ---------- the cat's mischief while you build ----------
function findCatSpot() {
  for (const r of G.W.rooms) for (const [fx, fy] of [[.15, .85], [.85, .85], [.15, .15], [.85, .15], [.5, .5]]) {
    const x = r.x + r.w * fx, y = r.y + r.h * fy;
    if (!inRoomOrDoor(G.W, x, y) || stairAt(G.W, x, y)) continue;
    if (staticsNear(G.W, x - 20, y - 20, x + 20, y + 20).some(s => closestOnPoly(x, y, s.poly)[2] < 18 || pointInPoly(x, y, s.poly))) continue;
    if (G.props.some(p => Math.hypot(p.x - x, p.y - y) < 40)) continue;
    return [x, y];
  }
  return null;
}
function initCat() {
  G.paws = [];
  const bed = G.W.cat ? G.W.cat.bed : (SAVE.settings.catAll ? findCatSpot() : null);
  if (R.house && R.house.cat) { R.group.remove(R.house.cat.grp); R.house.cat.el.remove(); R.house.cat = null; }
  G.catAI = bed ? { bed, x: bed[0], y: bed[1], a: -.6, st: 'sleep', timer: 12, path: null } : null;
}
function catGrid(z0) {
  const W = G.W, cell = 8, [bx0, by0, bx1, by1] = W.bounds;
  const nx = Math.ceil((bx1 - bx0) / cell), ny = Math.ceil((by1 - by0) / cell), ok = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = bx0 + (i + .5) * cell, y = by0 + (j + .5) * cell;
    if (!inRoomOrDoor(W, x, y) || Math.abs(floorAt(W, x, y) - z0) > 1) continue;
    let free = true;
    for (const s of staticsNear(W, x - 8, y - 8, x + 8, y + 8)) { if (s.z0 > z0 + 20) continue; if (pointInPoly(x, y, s.poly) || closestOnPoly(x, y, s.poly)[2] < 7) { free = false; break; } }
    if (free) for (const g of G.gadgets) if (pointInPoly(x, y, gadgetPoly(g))) { free = false; break; }
    if (free) ok[j * nx + i] = 1;
  }
  return { ok, nx, ny, cell, bx0, by0 };
}
function catPath(gr, from, to) {
  const { ok, nx, ny, cell, bx0, by0 } = gr;
  const idx = ([x, y]) => { let i = Math.floor((x - bx0) / cell), j = Math.floor((y - by0) / cell); i = Math.max(0, Math.min(nx - 1, i)); j = Math.max(0, Math.min(ny - 1, j)); return j * nx + i; };
  const nearestFree = k => { if (ok[k]) return k; let best = -1, bd = 1e9; const ki = k % nx, kj = (k / nx) | 0; for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const i = ki + di, j = kj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny || !ok[j * nx + i]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = j * nx + i; } } return best; };
  const s = nearestFree(idx(from)), t = nearestFree(idx(to)); if (s < 0 || t < 0) return null;
  const g = new Float32Array(nx * ny).fill(1e9), came = new Int32Array(nx * ny).fill(-1), open = [s]; g[s] = 0;
  const h = k => Math.hypot((k % nx) - (t % nx), ((k / nx) | 0) - ((t / nx) | 0));
  const closed = new Uint8Array(nx * ny);
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (g[open[i]] + h(open[i]) < g[open[bi]] + h(open[bi])) bi = i;
    const k = open[bi]; open.splice(bi, 1);
    if (k === t) break;
    if (closed[k]) continue; closed[k] = 1;
    const ki = k % nx, kj = (k / nx) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const i = ki + di, j = kj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const n = j * nx + i; if (!ok[n] || closed[n]) continue;
      if (di && dj && (!ok[kj * nx + i] || !ok[j * nx + ki])) continue;
      const ng = g[k] + (di && dj ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; came[n] = k; open.push(n); }
    }
  }
  if (came[t] < 0 && s !== t) return null;
  const cells = []; for (let k = t; k !== -1; k = came[k]) { cells.push(k); if (k === s) break; }
  cells.reverse();
  const pts = cells.filter((_, i) => i % 2 === 0 || i === cells.length - 1).map(k => [bx0 + ((k % nx) + .5) * cell, by0 + (((k / nx) | 0) + .5) * cell]);
  pts.push(to);
  return pts;
}
function catWalk(C, path, speed, next) { C.path = path; C.pi = 0; C.speed = speed; C.next = next; C.st = next === 'sleep' ? (speed > 100 ? 'flee' : 'home') : 'walk'; }
function updateCatAI(dt) {
  const C = G.catAI; if (!C) return;
  const z0 = floorAt(G.W, C.bed[0], C.bed[1]);
  if (C.st === 'sleep') {
    const floorDoms = G.layout.filter(d => d.L === 'g' && Math.abs(floorAt(G.W, d.x, d.y) - z0) < 1);
    if (floorDoms.length >= 6) C.timer -= dt;
    if (C.timer > 0) return;
    // pick a domino in the middle of a line, then walk over to it
    const mid = floorDoms.filter(d => G.layout.filter(o => o !== d && Math.hypot(o.x - d.x, o.y - d.y) < 8.5).length >= 2);
    const pool = mid.length ? mid : floorDoms;
    const gr = catGrid(z0);
    for (let tries = 0; tries < 5; tries++) {
      const d = pool[Math.floor(Math.random() * pool.length)];
      const nx = -Math.sin(d.a), ny = Math.cos(d.a), side = (C.bed[0] - d.x) * nx + (C.bed[1] - d.y) * ny >= 0 ? 1 : -1;
      const ap = [d.x + nx * side * 15, d.y + ny * side * 15];
      const path = catPath(gr, [C.x, C.y], ap);
      if (path) { C.target = d; C.side = side; catWalk(C, path, 55, 'swat'); return; }
    }
    C.timer = 8; return;
  }
  if (C.path) {
    let step = C.speed * dt;
    while (step > 0 && C.pi < C.path.length) {
      const [tx, ty] = C.path[C.pi], dx = tx - C.x, dy = ty - C.y, L = Math.hypot(dx, dy);
      if (L > .01) C.a = Math.atan2(dy, dx);
      if (L <= step) { C.x = tx; C.y = ty; step -= L; C.pi++; } else { C.x += dx / L * step; C.y += dy / L * step; step = 0; }
    }
    if (C.pi >= C.path.length) {
      C.path = null;
      if (C.next === 'swat') { C.st = 'swat'; C.t = 0; C.done = false; if (C.target) C.a = Math.atan2(C.target.y - C.y, C.target.x - C.x); }
      else { C.st = 'sleep'; C.timer = 25 + Math.random() * 20; C.x = C.bed[0]; C.y = C.bed[1]; }
    }
    return;
  }
  if (C.st === 'swat') {
    C.t += dt;
    if (!C.done && C.t > .35 && !pointers.size) { C.done = true; catSwat(C); }
    if (C.t > .9) { C.st = 'groom'; C.t = 0; }
    return;
  }
  if (C.st === 'groom') {
    C.t += dt;
    if (C.t > 1.6) { const path = catPath(catGrid(z0), [C.x, C.y], C.bed); if (path) catWalk(C, path, 45, 'sleep'); else { C.x = C.bed[0]; C.y = C.bed[1]; C.st = 'sleep'; C.timer = 30; } }
  }
}
function catSwat(C) {
  const i = G.layout.indexOf(C.target); C.target = null;
  if (i < 0) return;
  pushUndo();
  const d = G.layout[i], nx = -Math.sin(d.a), ny = Math.cos(d.a), push = -C.side;
  let moved = false;
  if (Math.random() < .7) {
    for (const k of [1, .6, .35]) {
      const x = d.x + nx * push * (4 + Math.random() * 3) * k, y = d.y + ny * push * (4 + Math.random() * 3) * k, a = d.a + push * (.4 + Math.random() * .5) * k;
      if (!placeProblem(G.W, G.layout, x, y, a, new Set([i]), G.props, d.L, G.gadgets)) { G.paws.push({ x: d.x, y: d.y, a: Math.random() * 6, t: G.time }); d.x = x; d.y = y; d.a = a; moved = true; break; }
    }
  }
  if (!moved) { G.paws.push({ x: d.x, y: d.y, a: Math.random() * 6, t: G.time }); G.layout.splice(i, 1); }
  changed();
  toast(moved ? 'The cat batted a domino out of line.' : 'The cat swiped a domino under the furniture.');
}
function shooCat() {
  const C = G.catAI; if (!C || C.st === 'sleep' || C.st === 'flee') return false;
  const path = catPath(catGrid(floorAt(G.W, C.bed[0], C.bed[1])), [C.x, C.y], C.bed);
  C.target = null;
  if (path) catWalk(C, path, 150, 'sleep'); else { C.x = C.bed[0]; C.y = C.bed[1]; C.st = 'sleep'; C.path = null; }
  C.timer = 35 + Math.random() * 15;
  toast('Shoo!');
  return true;
}
function catHit(sx, sy) {
  const C = G.catAI; if (!C || C.st === 'sleep') return false;
  const [px, py, z] = toScreen(C.x, floorAt(G.W, C.x, C.y) + 14, C.y);
  return z < 1 && Math.hypot(px - sx, py - sy) < 36;
}

function ensureCap(n) {
  if (n <= R.cap) return;
  let cap = Math.max(256, R.cap); while (cap < n) cap *= 2;
  if (R.dom) { R.group.remove(R.dom); R.dom.dispose && R.dom.dispose(); }
  R.dom = new T3.InstancedMesh(R.domGeo, R.domMat, cap);
  R.dom.castShadow = true; R.dom.receiveShadow = true;
  R.dom.instanceMatrix.setUsage(T3.DynamicDrawUsage);
  R.dom.setColorAt(0, new T3.Color(1, 1, 1)); // allocates instanceColor for the full capacity
  R.dom.instanceColor.setUsage(T3.DynamicDrawUsage);
  R.dom.count = 0;
  R.dom.frustumCulled = false;
  R.group.add(R.dom); R.cap = cap;
}

const _m = new T3.Matrix4(), _r = new T3.Matrix4(), _c = new T3.Color(), _v = new T3.Vector3();
const PAL_LIN = PAL.map(lin), SEL_LIN = lin('#ffd36b'), BAD_LIN = lin('#ff4a3a');
function domMatrix(d, out) {
  const s = d.s || 1;
  if (d.st === 4) {
    out.makeTranslation(d.fx, d.fz, d.fy); _r.makeRotationY(-d.a); out.multiply(_r); _r.makeRotationZ(-s * d.spin); out.multiply(_r); return out;
  }
  if (d.st === 5) {
    out.makeTranslation(d.fx, d.lz + DT / 2, d.fy); _r.makeRotationY(-d.a); out.multiply(_r); _r.makeRotationZ(-s * Math.PI / 2); out.multiply(_r); return out;
  }
  const ph = d.st ? d.ph || 0 : 0;
  const base = d.z != null ? d.z : layerZ(G.W, d.L || 'g', d.x, d.y);
  out.makeTranslation(d.x + Math.cos(d.a) * s * DT / 2, base, d.y + Math.sin(d.a) * s * DT / 2);
  _r.makeRotationY(-d.a); out.multiply(_r);
  if (ph) { _r.makeRotationZ(-s * ph); out.multiply(_r); }
  _r.makeTranslation(-s * DT / 2, DH / 2, 0); out.multiply(_r);
  return out;
}
function syncDominoes(doms, sel, bad) {
  ensureCap(doms.length);
  const M = R.dom;
  for (let i = 0; i < doms.length; i++) {
    M.setMatrixAt(i, domMatrix(doms[i], _m));
    const isSel = sel && sel.has(i);
    _c.copy(PAL_LIN[(doms[i].c || 0) % PAL.length]);
    if (isSel) _c.lerp(bad ? BAD_LIN : SEL_LIN, bad ? .8 : .55);
    M.setColorAt(i, _c);
  }
  M.count = doms.length;
  M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
}

// ---------- camera ----------
const CAMV = [{ name: 'Overhead', el: 1.32 }, { name: 'Angled', el: 0.92 }, { name: 'Low', el: 0.48 }];
const cam = { tx: 0, ty: 0, tz: 0, dist: 600, az: 0, el: 0.92, view: 1 };
function applyCamera() {
  const ce = Math.cos(cam.el);
  camera.position.set(cam.tx + cam.dist * Math.sin(cam.az) * ce, cam.ty + cam.dist * Math.sin(cam.el), cam.tz + cam.dist * Math.cos(cam.az) * ce);
  camera.lookAt(cam.tx, cam.ty, cam.tz);
  camera.updateMatrixWorld();
  if (G) G.dirty = true;
}
function fitCamera(keepAngles) {
  const [x0, y0, x1, y1] = G.W.bounds;
  cam.tx = (x0 + x1) / 2; cam.tz = (y0 + y1) / 2;
  const els = [...G.W.rooms.filter(r => !G.W.stairs.some(s => s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h)).map(r => r.elev || 0), ...G.W.stairs.flatMap(s => [s.top, s.bottom])];
  const maxE = Math.max(...els), minE = Math.min(...els);
  cam.ty = (maxE + minE) / 2;
  if (!keepAngles) { cam.az = 0; cam.view = 1; cam.el = CAMV[1].el; }
  const vf = camera.fov * Math.PI / 180, aspect = camera.aspect || 1;
  const halfW = (x1 - x0) / 2, halfH = (y1 - y0) / 2;
  // project the footprint against the viewing angle
  const needV = (halfH * Math.sin(cam.el) + (maxE - minE) * .5 * Math.cos(cam.el) + 20) / Math.tan(vf / 2);
  const needH = (halfW + 15) / (Math.tan(vf / 2) * aspect);
  cam.dist = Math.max(needV, needH) * 1.04 + halfH * Math.cos(cam.el) * 0.5;
  cam.minD = 60; cam.maxD = cam.dist * 2.2;
  applyCamera();
}

// ---------- picking ----------
const _ndc = new T3.Vector2();
function rayFrom(sx, sy) { _ndc.set(sx / CW * 2 - 1, -(sy / CH) * 2 + 1); raycaster.setFromCamera(_ndc, camera); return raycaster; }
function floorPoint(sx, sy) {
  const hits = rayFrom(sx, sy).intersectObjects([...R.pick, R.furn], true);
  for (const h of hits) {
    const L = h.object.userData.layer;
    if (!L) return null; // furniture side or a surface you can't build on
    if (L !== 'g' || (h.face && h.face.normal.y > 0.5)) return [h.point.x, h.point.z, h.point.y, L];
  }
  return null;
}
function planeAt(sx, sy, y) {
  const rc = rayFrom(sx, sy), o = rc.ray.origin, d = rc.ray.direction;
  if (Math.abs(d.y) < 1e-4) return null;
  const t = (y - o.y) / d.y; if (t < 0) return null;
  return [o.x + d.x * t, o.z + d.z * t];
}
function toScreen(x, y3, z) { _v.set(x, y3, z).project(camera); return [(_v.x + 1) / 2 * CW, (1 - _v.y) / 2 * CH, _v.z]; }

// ---------- state & HUD ----------
function openRoom(id) {
  const sandbox = id === SANDBOX_ID;
  const W = sandbox ? buildWorld(ALL_ROOMS, true) : buildWorld([id], false);
  const L = sandbox ? null : levelDef(id);
  const savedProps = sandbox && SAVE.layouts[id + ':props'];
  const props = W.props.map((p, i) => savedProps && savedProps[i] ? { ...p, x: savedProps[i][0], y: savedProps[i][1], a: savedProps[i][2] } : { ...p });
  const layout = unpackLayout(SAVE.layouts[id]);
  const gadgets = unpackGad(SAVE.layouts[id + ':gad']);
  G = {
    id, sandbox, W, L, props, layout, gadgets, gadVer: 1, selGad: -1, gadType: Object.keys(W.toolbox)[0] || 'catapult',
    budget: sandbox ? 3000 : L.budget,
    undo: [], tool: 'build', mode: 'edit', sim: null,
    sel: new Set(), selProp: -1,
    nextG: layout.reduce((m, d) => Math.max(m, d.g || 0), 0) + 1,
    lastHits: null, spills: 0, dirty: true, time: 0,
  };
  $('menu').hidden = true; $('game').hidden = false;
  $('t1').textContent = sandbox ? 'Whole house' : L.name;
  $('t2').textContent = sandbox ? 'Sandbox. No goal and no box limit. Every door is open.' : L.goal;
  buildRoom3D(W); buildProps3D(); initCat();
  setTool('build');
  resize(); fitCamera(false);
  updateHud(); hideAllBars();
}
function closeRoom() {
  if (G) saveLayout();
  G = null;
  $('game').hidden = true; $('menu').hidden = false;
  renderMenu();
}
function saveLayout() {
  if (!G) return;
  SAVE.layouts[G.id] = packLayout(G.layout);
  SAVE.layouts[G.id + ':gad'] = packGad(G.gadgets);
  if (G.sandbox) SAVE.layouts[G.id + ':props'] = G.props.map(p => [p.x, p.y, p.a]);
  persist();
}
function pushUndo() {
  G.undo.push({ layout: G.layout.map(d => ({ ...d })), props: G.props.map(p => ({ ...p })), gadgets: G.gadgets.map(g => ({ ...g })) });
  if (G.undo.length > 60) G.undo.shift();
}
function undo() {
  if (G.mode !== 'edit' || !G.undo.length) return;
  const u = G.undo.pop(); G.layout = u.layout; G.props = u.props; G.gadgets = u.gadgets;
  G.sel.clear(); G.selProp = -1; G.selGad = -1; changed();
}
function changed() { G.dirty = true; G.lastHits = null; G.gadVer++; updateHud(); updateSelBar(); updateTray(); saveLayout(); }
function gadLeft(k) { return (G.W.toolbox[k] || 0) - G.gadgets.filter(g => g.k === k).length; }
function updateTray() {
  const tray = $('gadTray');
  if (!G || G.mode !== 'edit' || G.tool !== 'gadget') { tray.hidden = true; return; }
  tray.hidden = false; tray.innerHTML = '';
  const kinds = Object.keys(G.W.toolbox);
  if (!kinds.length) { tray.textContent = 'No gadgets in this room'; return; }
  for (const k of kinds) {
    const b = document.createElement('button'); b.className = 'pill' + (G.gadType === k ? ' primary' : '');
    const left = gadLeft(k);
    b.textContent = `${GADGETS[k].name} · ${G.sandbox ? 'tap to place' : left + ' left'}`;
    b.disabled = left <= 0;
    b.addEventListener('click', () => { G.gadType = k; updateTray(); });
    tray.append(b);
  }
}

function updateHud() {
  if (!G) return;
  const n = G.layout.length;
  if (G.sandbox) { $('boxN').textContent = n; $('boxN').classList.remove('full'); $('boxL').textContent = n === 1 ? 'domino' : 'dominoes'; }
  else {
    const left = G.budget - n;
    $('boxN').textContent = `${left} left`; $('boxN').classList.toggle('full', left <= 0);
    $('boxL').textContent = `par ${G.L.par} · box ${G.budget}`;
  }
  const chips = $('chips'); chips.innerHTML = '';
  if (G.sandbox) { chips.hidden = true; } else {
    chips.hidden = false;
    const hits = currentHits();
    const tg = G.W.targets.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    tg.forEach(t => {
      const h = hits && hits.find(x => x.id === t.id);
      const c = document.createElement('span'); c.className = 'chip' + (h ? ' hit' : '');
      const dot = document.createElement('span'); dot.className = 'dot'; dot.textContent = h ? '✓' : (G.W.ordered ? String(t.order) : '');
      c.append(dot, document.createTextNode(t.label));
      if (h) { const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = h.t.toFixed(2) + ' s'; c.append(tm); }
      chips.append(c);
    });
  }
  const busy = G.mode !== 'edit';
  document.querySelectorAll('.tool').forEach(b => b.disabled = busy);
  $('undoBtn').disabled = busy; $('prevBtn').disabled = busy; $('runBtn').disabled = busy;
}
function currentHits() { if (G.sim && G.mode !== 'edit' && G.mode !== 'rewind') return G.sim.hits; return G.lastHits; }

let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.opacity = 0, 1800);
}
function setTool(t) {
  G.tool = t; G.sel.clear(); G.selProp = -1; G.selGad = -1; G.gadVer++;
  if (t === 'gadget') { const avail = Object.keys(G.W.toolbox).find(k => gadLeft(k) > 0); if (avail && gadLeft(G.gadType) <= 0) G.gadType = avail; }
  setTimeout(updateTray, 0);
  document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  updateSelBar(); G.dirty = true;
}
function updateSelBar() {
  const bar = $('selBar');
  if (!G || G.mode !== 'edit' || G.tool !== 'move' || (!G.sel.size && G.selProp < 0 && G.selGad < 0)) { bar.hidden = true; $('powBox').hidden = true; return; }
  bar.hidden = false;
  $('powBox').hidden = G.selGad < 0;
  if (G.selGad >= 0) {
    const g = G.gadgets[G.selGad];
    $('selTxt').textContent = `${GADGETS[g.k].name} · ${GADGETS[g.k].label.toLowerCase()}`;
    $('powVal').textContent = GADGETS[g.k].fmt(g.power);
    $('flipBtn').hidden = true; $('testBtn').hidden = false; $('delBtn').hidden = false;
  } else if (G.selProp >= 0) {
    $('selTxt').textContent = G.props[G.selProp].k === 'marble' ? 'Starting marble' : 'Toilet roll';
    $('flipBtn').hidden = true; $('testBtn').hidden = true; $('delBtn').hidden = true;
  } else {
    $('selTxt').textContent = G.sel.size === 1 ? '1 domino' : `${G.sel.size} dominoes`;
    $('flipBtn').hidden = false; $('testBtn').hidden = false; $('delBtn').hidden = false;
  }
}
function hideAllBars() { $('playBar').hidden = true; $('spillBar').hidden = true; updateSelBar(); }

let CW = 0, CH = 0;
function resize() {
  const r = $('stage').getBoundingClientRect();
  CW = r.width; CH = r.height;
  if (!CW || !CH) return;
  renderer.setSize(CW, CH, false);
  camera.aspect = CW / CH; camera.updateProjectionMatrix();
  if (G) G.dirty = true;
}

// ---------- per-frame scene update ----------
function updateTargets(hits, playing) {
  const now = G.time;
  let lampOff = false, tvOn = false;
  for (const o of R.targets) {
    const h = hits && hits.find(x => x.id === o.t.id);
    const age = h && G.sim ? Math.max(0, G.sim.t - h.t) : (h ? 9 : 0);
    if (h && o.kind === 'switch') lampOff = true;
    if (h && (o.kind === 'remote' || o.kind === 'button')) tvOn = true;
    // floor ring
    if (!h) { const p = (now * 1.2 + o.t.x * .01) % 1; o.ring.scale.setScalar(1 + p * .9); o.ringM.opacity = .85 * (1 - p); o.ringM.color.copy(lin('#f6b33c')); }
    else { o.ring.scale.setScalar(1); o.ringM.opacity = .9; o.ringM.color.copy(lin('#4cc38a')); }
    for (const m of o.flashMats) m.emissiveIntensity = h ? 0.9 * Math.exp(-age * 2.2) : 0;
    if (o.glow) o.glow.emissiveIntensity = h ? 1 : 0;
    if (o.spinner) o.spinner.rotation.y = h ? age * 6 : 0;
    if (o.wobble) o.wobble.rotation.z = (o.kind === 'chime' ? .25 : 0) + (h ? Math.sin(age * 38) * 0.35 * Math.exp(-age * 2.2) : 0);
    if (o.toggle) o.toggle.position.y = h ? 3.4 : 5.5;
    if (o.press) o.press.position.z = h && age < 0.6 ? 0.2 : 1.4;
    if (o.tips) {
      const ang = h ? Math.min(Math.PI / 2, age * age * 14 + age * 2) : 0;
      o.tip.rotation.y = h ? -Math.atan2(h.dy, h.dx) : 0;
      o.piv.position.x = h ? o.tipBack : 0; o.body.position.x = h ? -o.tipBack : 0;
      o.piv.rotation.z = -ang;
      const slide = o.kind === 'duck' && h ? Math.min(10, age * 25) : 0;
      o.tip.position.set(h ? h.dx * slide : 0, 0, h ? h.dy * slide : 0);
    }
    if (o.kind === 'remote') o.body.position.y = h ? Math.max(0, Math.sin(Math.min(Math.PI, age * 9)) * 3) : 0;
    // label
    const [sx, sy, z] = toScreen(o.t.x, o.t.z1 + 8, o.t.y);
    const show = z < 1 && sx > -40 && sx < CW + 40 && sy > -20 && sy < CH + 20;
    o.label.hidden = !show;
    if (show) {
      o.label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      const txt = (o.order ? o.order + '  ' : '') + o.t.label + (h ? `  ${h.t.toFixed(2)} s` : '');
      if (o.label.textContent !== txt) o.label.textContent = txt;
      o.label.classList.toggle('hit', !!h);
    }
  }
  for (const L of R.lamps) { L.shadeM.emissiveIntensity = lampOff ? 0.02 : 0.9; L.light.intensity = lampOff ? 0 : 0.9; }
  for (const T of R.tvs) T.screenM.emissiveIntensity = tvOn ? 0.9 : 0;
  if (R.mobile) R.mobile.rotation.y = now * .5; // the crib mobile turns gently
}
function updateHelpers(playing) {
  R.topOutlines.visible = !playing && (G.tool === 'build' || G.tool === 'gadget');
  const showH = !playing && G.tool === 'move' && (G.sel.size || G.selProp >= 0 || G.selGad >= 0);
  R.handle.visible = R.handleLine.visible = !!showH;
  if (showH) {
    const [hx, hy, cx, cy] = handlePos();
    const e = selZ() + 12;
    const k = handleRadiusWorld(hx, e, hy);
    R.handle.position.set(hx, e, hy); R.handle.scale.setScalar(k);
    R.handleLine.geometry.setFromPoints([new T3.Vector3(cx, e - 6, cy), new T3.Vector3(hx, e, hy)]);
  }
  R.erase.visible = !playing && G.tool === 'erase' && !!G.eraseAt;
  if (R.erase.visible) {
    const [x, y] = G.eraseAt, e = floorAt(G.W, x, y);
    R.erase.position.set(x, e + 1, y); R.erase.scale.setScalar(G.eraseR || 10);
  }
}
// world size that covers ~9px on screen at a point
function handleRadiusWorld(x, y, z) {
  const d = camera.position.distanceTo(_v.set(x, y, z));
  return d * Math.tan(camera.fov * Math.PI / 360) * 2 / CH * 9;
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (G && !$('game').hidden) {
    G.time += dt;
    if (G.mode === 'preview' || G.mode === 'run' || G.mode === 'spill') advanceSim(dt);
    else if (G.mode === 'rewind') advanceRewind(dt);
    const playing = G.mode !== 'edit';
    const doms = playing && G.sim ? G.sim.d : G.layout;
    syncDominoes(doms, playing ? null : G.sel, G.dragBad);
    const sim = playing && G.sim;
    syncBalls(sim ? (G.mode === 'rewind' ? G.sim.rollers.slice(0, G.props.length) : G.sim.rollers) : G.props, !!sim && G.mode !== 'rewind');
    syncGadgets(playing);
    if (G.mode === 'edit') updateCatAI(dt);
    syncHousehold(playing, dt);
    updateTargets(currentHits(), playing);
    updateHelpers(playing);
    $('stage').classList.toggle('ghost', G.mode === 'preview' || G.mode === 'rewind');
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// ---------- simulation playback ----------
const STEP = 1 / 480;
function advanceSim(dt) {
  const speed = SAVE.settings.slow ? 0.25 : 1;
  G.acc = (G.acc || 0) + dt * speed;
  let n = 0;
  while (G.acc >= STEP && n < 400) { stepSim(G.sim, STEP); G.acc -= STEP; n++; }
  $('playT').textContent = G.sim.t.toFixed(2) + ' s';
  if (G.sim.hits.length !== G.shownHits) { G.shownHits = G.sim.hits.length; updateHud(); }
  if (simDone(G.sim)) {
    G.doneFor = (G.doneFor || 0) + dt;
    if (G.doneFor > (G.mode === 'run' ? 0.7 : 1.1)) finishPlayback();
  }
}
function finishPlayback() {
  const m = G.mode;
  G.doneFor = 0;
  if (m === 'preview') {
    G.lastHits = G.sim.hits.slice();
    G.sim.d.forEach(d => { if (d.st >= 4) { d.st = 2; d.ph = Math.PI / 2; } });
    G.rewind = { t: 0, from: G.sim.d.map(d => d.ph), rollers: G.sim.rollers.map(r => [r.x, r.y, r.z]) };
    G.mode = 'rewind'; $('playTxt').textContent = 'Standing them back up';
  } else if (m === 'run') {
    G.lastHits = G.sim.hits.slice();
    G.mode = 'done'; $('playBar').hidden = true;
    showResult();
  } else if (m === 'spill') {
    const n = G.sim.d.filter(d => d.st !== 0).length;
    G.spills++;
    G.mode = 'spilled'; $('playBar').hidden = true;
    $('spillTxt').textContent = n === 1 ? 'Oops. One knocked over.' : `Oops. ${n} knocked over.`;
    $('spillBar').hidden = false;
  }
  updateHud();
}
function advanceRewind(dt) {
  const RW = G.rewind; RW.t += dt / 0.6;
  const k = Math.min(1, RW.t), e = 1 - Math.pow(1 - k, 3);
  G.sim.d.forEach((d, i) => { d.ph = RW.from[i] * (1 - e); if (k >= 1) d.st = 0; });
  G.sim.rollers.forEach((r, i) => { const p = G.props[i]; if (!p) return; r.x = RW.rollers[i][0] + (p.x - RW.rollers[i][0]) * e; r.y = RW.rollers[i][1] + (p.y - RW.rollers[i][1]) * e; });
  if (k >= 1) { G.mode = 'edit'; G.sim = null; $('playBar').hidden = true; updateHud(); updateSelBar(); G.dirty = true; }
}
function play(mode, fromIdx, fromGad) {
  if (G.mode !== 'edit') return;
  if (!G.layout.length && !G.gadgets.length && mode !== 'preview') { toast('Lay some dominoes first.'); return; }
  G.sim = makeSim(G.W, G.layout, G.props, G.gadgets);
  if (fromGad != null) fireGadget(G.sim, G.sim.gad[fromGad]);
  else if (fromIdx != null) topple(G.sim, fromIdx, 1, 3);
  else startRun(G.sim);
  G.mode = mode; G.acc = 0; G.doneFor = 0; G.shownHits = 0;
  G.sel.clear(); G.selProp = -1; updateSelBar();
  $('playTxt').textContent = mode === 'preview' ? 'Preview' : 'Run';
  $('slowBtn').textContent = SAVE.settings.slow ? 'Full speed' : 'Slow-mo';
  $('playBar').hidden = false; $('spillBar').hidden = true;
  updateHud();
}
function stopPlayback() {
  if (G.mode === 'preview') { G.doneFor = 99; finishPlayback(); }
  else if (G.mode === 'run') { G.mode = 'edit'; G.sim = null; $('playBar').hidden = true; updateHud(); G.dirty = true; }
  else if (G.mode === 'spill') { G.doneFor = 99; finishPlayback(); }
}
function restand() {
  G.mode = 'edit'; G.sim = null; $('spillBar').hidden = true; $('resultScrim').hidden = true; updateHud(); G.dirty = true;
}

// ---------- results ----------
function evaluate() {
  const W = G.W, hits = G.sim.hits, L = G.L;
  const missing = W.targets.filter(t => !hits.find(h => h.id === t.id));
  let ok = !missing.length, why = '';
  if (ok && W.ordered) {
    const ts = W.targets.slice().sort((a, b) => a.order - b.order);
    const seq = ts.map(t => hits.find(h => h.id === t.id).t);
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) ok = false;
    if (!ok) why = `The ${ts[1].label.toLowerCase()} went off before the ${ts[0].label.toLowerCase()}. Make its line longer so it arrives later.`;
  }
  if (missing.length) why = `Still waiting on: ${missing.map(t => t.label.toLowerCase()).join(' and ')}.`;
  if (!ok) {
    const ev = k => G.sim.events.some(e => e.type === k);
    if (ev('squash')) why += ' The baby flattened part of your line.';
    if (ev('caught')) why += ' The cat caught a marble.';
  }
  const used = G.layout.length, fell = G.sim.d.filter(d => d.st !== 0).length;
  const stars = ok ? 1 + (used <= L.par ? 1 : 0) + (fell === used ? 1 : 0) : 0;
  return { ok, why, used, fell, stars, t: hits.length ? Math.max(...hits.map(h => h.t)) : G.sim.t };
}
function showResult() {
  if (G.sandbox) {
    const fell = G.sim.d.filter(d => d.st !== 0).length;
    $('spillTxt').textContent = `${fell} of ${G.layout.length} fell in ${G.sim.t.toFixed(1)} s`;
    $('spillBar').hidden = false; return;
  }
  const r = evaluate(), L = G.L;
  $('resBig').textContent = r.ok ? SUCCESS[G.id] : 'Not quite';
  $('resWhy').textContent = r.ok ? `${L.mission}, done.` : r.why;
  const pips = $('resPips'); pips.innerHTML = '';
  for (let i = 0; i < 3; i++) { const b = document.createElement('b'); if (i < r.stars) b.className = 'on'; pips.append(b); }
  const key = $('resKey'); key.innerHTML = '';
  [[r.ok, 'Finish the job'], [r.ok && r.used <= L.par, `Use ${L.par} dominoes or fewer`], [r.ok && r.fell === r.used, 'Every domino falls']].forEach(([on, txt]) => {
    const sp = document.createElement('span'); sp.textContent = (on ? '● ' : '○ ') + txt; if (on) sp.className = 'ok'; key.append(sp);
  });
  const stats = $('resStats'); stats.innerHTML = '';
  [['Used', `${r.used}/${L.par}`], ['Fell', `${r.fell}`], ['Time', `${r.t.toFixed(2)}s`]].forEach(([k, v]) => {
    const d = document.createElement('div'); d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`; stats.append(d);
  });
  if (r.ok) {
    if ((SAVE.stars[G.id] || 0) < r.stars) SAVE.stars[G.id] = r.stars;
    if (!SAVE.best[G.id] || r.used < SAVE.best[G.id]) SAVE.best[G.id] = r.used;
    persist();
  }
  const idx = LEVELS.findIndex(l => l.id === G.id);
  $('resNext').hidden = !r.ok;
  $('resNext').textContent = idx < LEVELS.length - 1 ? 'Next room' : 'Open the whole house';
  // let the payoff play for a beat before the card covers it
  setTimeout(() => { if (G && G.mode === 'done') $('resultScrim').hidden = false; }, 700);
}

// =====================================================================
// input
// =====================================================================
const pointers = new Map();
let gesture = null;
let spaceDown = false;

function nearestByScreen(list, sx, sy, radius, heightOf) {
  let best = -1, bd = radius;
  list.forEach((d, i) => {
    const [px, py, z] = toScreen(d.x, heightOf(d), d.y);
    if (z > 1) return;
    const dd = Math.hypot(px - sx, py - sy); if (dd < bd) { bd = dd; best = i; }
  });
  return best;
}
function pickDomino(sx, sy) { return nearestByScreen(G.layout, sx, sy, 26, d => layerZ(G.W, d.L, d.x, d.y) + DH / 2); }
function pickProp(sx, sy) { if (!G.sandbox) return -1; return nearestByScreen(G.props, sx, sy, 26, p => layerZ(G.W, p.L || 'g', p.x, p.y) + p.r); }
function pickGadget(sx, sy) { return nearestByScreen(G.gadgets, sx, sy, 34, g => layerZ(G.W, g.L, g.x, g.y) + GADGETS[g.k].base + 3); }
function selZ() {
  if (G.selGad >= 0) { const g = G.gadgets[G.selGad]; return layerZ(G.W, g.L, g.x, g.y); }
  if (G.selProp >= 0) { const p = G.props[G.selProp]; return layerZ(G.W, p.L || 'g', p.x, p.y); }
  const [cx, cy] = selCentroid(); const d = G.layout[[...G.sel][0]];
  return layerZ(G.W, d ? d.L : 'g', cx, cy);
}
function selCentroid() {
  if (G.selGad >= 0) { const g = G.gadgets[G.selGad]; return [g.x, g.y]; }
  if (G.selProp >= 0) { const p = G.props[G.selProp]; return [p.x, p.y]; }
  let x = 0, y = 0; for (const i of G.sel) { x += G.layout[i].x; y += G.layout[i].y; }
  return [x / G.sel.size, y / G.sel.size];
}
function handlePos() {
  const [cx, cy] = selCentroid();
  const e = selZ() + 12;
  const px = handleRadiusWorld(cx, e, cy) / 9; // cm per pixel
  let rad = 34 * px;
  if (G.selGad >= 0) { const g = G.gadgets[G.selGad]; rad = Math.max(rad, GADGETS[g.k].len / 2 + 12 * px); return [cx + Math.cos(g.a) * rad, cy + Math.sin(g.a) * rad, cx, cy]; }
  if (G.sel.size > 1) for (const i of G.sel) rad = Math.max(rad, Math.hypot(G.layout[i].x - cx, G.layout[i].y - cy) + 16 * px);
  const ang = G.selProp >= 0 ? G.props[G.selProp].a : (G.sel.size === 1 ? G.layout[[...G.sel][0]].a : -Math.PI / 2);
  const hang = G.sel.size > 1 ? -Math.PI / 2 : ang;
  return [cx + Math.cos(hang) * rad, cy + Math.sin(hang) * rad, cx, cy];
}
function selectionValid(skip) {
  for (const i of G.sel) { const d = G.layout[i]; if (placeProblem(G.W, G.layout, d.x, d.y, d.a, skip, G.props, d.L, G.gadgets)) return false; }
  return true;
}
function propValid(p) {
  for (const s of G.W.statics) { if (closestOnPoly(p.x, p.y, s.poly)[2] < p.r || pointInPoly(p.x, p.y, s.poly)) return false; }
  return inRoomOrDoor(G.W, p.x, p.y);
}
function localXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

function onDown(e) {
  if (!G) return;
  if (G.mode !== 'edit') { if (G.mode === 'preview') stopPlayback(); return; }
  { const r = cv.getBoundingClientRect(); if (catHit(e.clientX - r.left, e.clientY - r.top) && shooCat()) return; }
  cv.setPointerCapture(e.pointerId);
  const [sx, sy] = localXY(e);
  pointers.set(e.pointerId, [sx, sy]);
  if (e.pointerType === 'mouse' && (e.button === 2)) { gesture = { type: 'orbit', last: [sx, sy] }; return; }
  if (e.pointerType === 'mouse' && (e.button === 1 || spaceDown || e.shiftKey)) { gesture = { type: 'pan', last: [sx, sy] }; return; }
  if (pointers.size === 2) { startTwoFinger(); return; }
  if (pointers.size > 2) return;
  if (G.tool === 'build') {
    const fp = floorPoint(sx, sy);
    if (!fp) { gesture = { type: 'orbit', last: [sx, sy] }; return; }
    pushUndo();
    const before = G.layout.length, gid = G.nextG++, color = gid % PAL.length;
    const g = { type: 'stroke', before, full: false, L: fp[3], z: fp[2] };
    g.stroke = makeStroke(G.W, G.layout, SAVE.settings.spacing, SAVE.settings.smart, i => onPlaced(i, g, color, gid), fp[3], G.gadgets, G.props);
    gesture = g;
    if (G.W.noPlace.some(n => pointInPoly(fp[0], fp[1], n.poly))) toast('Too slippery to build on the bath mat.');
    g.stroke.start(fp[0], fp[1]);
    updateHud();
  } else if (G.tool === 'gadget') {
    const fp = floorPoint(sx, sy);
    if (!fp) { gesture = { type: 'orbit', last: [sx, sy] }; return; }
    gesture = { type: 'place', sx, sy, fp };
  } else if (G.tool === 'erase') {
    pushUndo(); gesture = { type: 'erase', removed: 0 }; eraseAt(sx, sy);
  } else if (G.tool === 'move') {
    if (G.sel.size || G.selProp >= 0 || G.selGad >= 0) {
      const [hx, hy, cx, cy] = handlePos(), he = selZ() + 12;
      const [px, py] = toScreen(hx, he, hy);
      if (Math.hypot(px - sx, py - sy) < 26) {
        pushUndo();
        const w0 = planeAt(sx, sy, he) || [hx, hy];
        gesture = { type: 'rotate', cx, cy, he, a0: Math.atan2(w0[1] - cy, w0[0] - cx), orig: snapshotSel() };
        return;
      }
    }
    const gi = pickGadget(sx, sy);
    const pi = gi >= 0 ? -1 : pickProp(sx, sy);
    const di = gi >= 0 || pi >= 0 ? -1 : pickDomino(sx, sy);
    gesture = { type: 'tap', sx, sy, di, pi, gi, moved: false };
    if (di >= 0) {
      gesture.lp = setTimeout(() => {
        if (!gesture || gesture.type !== 'tap' || gesture.moved) return;
        const grp = G.layout[di].g; G.sel.clear(); G.selProp = -1;
        G.layout.forEach((d, i) => { if (d.g === grp) G.sel.add(i); });
        gesture.held = true; try { navigator.vibrate && navigator.vibrate(12); } catch (er) { /* no vibration */ }
        updateSelBar();
      }, 380);
    }
  }
}
function snapshotSel() {
  if (G.selGad >= 0) { const g = G.gadgets[G.selGad]; return { gad: [g.x, g.y, g.a], L: g.L }; }
  if (G.selProp >= 0) { const p = G.props[G.selProp]; return { prop: [p.x, p.y, p.a] }; }
  return { doms: [...G.sel].map(i => [i, G.layout[i].x, G.layout[i].y, G.layout[i].a]) };
}
function placeGadget(fp) {
  const k = G.gadType;
  if (gadLeft(k) <= 0) { toast(`No ${GADGETS[k].name.toLowerCase()}s left for this room.`); return; }
  const a = Math.atan2(cam.tz - camera.position.z, cam.tx - camera.position.x);
  const gd = { k, x: fp[0], y: fp[1], a, L: fp[3], power: GADGETS[k].pdef };
  const why = placeGadgetProblem(G.W, G.layout, gd, G.gadgets, null, G.props);
  if (why) { toast(why === 'edge' ? 'It needs to sit fully on the surface.' : why === 'slippery' ? 'Too slippery here.' : "There isn't room for it there."); return; }
  pushUndo();
  G.gadgets.push(gd);
  G.tool = 'move'; document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === 'move')));
  G.sel.clear(); G.selProp = -1; G.selGad = G.gadgets.length - 1;
  changed();
  toast('Aim it with the gold handle and set the power.');
}
function onPlaced(i, g, color, gid) {
  if (G.layout.length > G.budget) {
    G.layout.pop(); g.full = true;
    toast(`The box is empty. This room gives you ${G.budget}.`);
    return;
  }
  const d = G.layout[i]; d.c = color; d.g = gid;
  updateHud();
  if (SAVE.settings.shaky && Math.random() < 0.014) {
    const near = G.layout.some((o, j) => j !== i && Math.hypot(o.x - d.x, o.y - d.y) < DH + 1);
    if (near) { g.spill = i; g.full = true; }
  }
}
function eraseAt(sx, sy) {
  let n = 0;
  for (let i = G.layout.length - 1; i >= 0; i--) {
    const d = G.layout[i], [px, py, z] = toScreen(d.x, layerZ(G.W, d.L, d.x, d.y) + DH / 2, d.y);
    if (z < 1 && Math.hypot(px - sx, py - sy) < 22) { G.layout.splice(i, 1); n++; }
  }
  const fp = floorPoint(sx, sy);
  G.eraseAt = fp ? [fp[0], fp[1]] : null;
  if (fp) G.eraseR = handleRadiusWorld(fp[0], fp[2], fp[1]) / 9 * 22;
  if (n) { gesture.removed += n; updateHud(); }
}
function startTwoFinger() {
  if (gesture && gesture.type === 'stroke') {
    const placed = G.layout.length - gesture.before;
    if (placed <= 3) { const u = G.undo.pop(); if (u) { G.layout = u.layout; G.props = u.props; } updateHud(); }
    else changed();
  }
  if (gesture && gesture.lp) clearTimeout(gesture.lp);
  const [a, b] = [...pointers.values()];
  gesture = { type: 'two', d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
}
function panBy(fromS, toS) {
  const p0 = planeAt(fromS[0], fromS[1], cam.ty), p1 = planeAt(toS[0], toS[1], cam.ty);
  if (!p0 || !p1) return;
  cam.tx -= p1[0] - p0[0]; cam.tz -= p1[1] - p0[1];
  clampTarget(); applyCamera();
}
function clampTarget() {
  const [x0, y0, x1, y1] = G.W.bounds;
  cam.tx = Math.max(x0 - 80, Math.min(x1 + 80, cam.tx)); cam.tz = Math.max(y0 - 80, Math.min(y1 + 80, cam.tz));
}
function zoomBy(f, sx, sy) {
  const nd = Math.max(cam.minD, Math.min(cam.maxD, cam.dist * f)), k = nd / cam.dist;
  // scale the camera about the point under the fingers, so that point stays put on screen
  const p = sx != null ? planeAt(sx, sy, cam.ty) : null;
  if (p) { cam.tx = p[0] + (cam.tx - p[0]) * k; cam.tz = p[1] + (cam.tz - p[1]) * k; clampTarget(); }
  cam.dist = nd; applyCamera();
}
function orbitBy(dx, dy) {
  cam.az -= dx * 0.008; cam.el = Math.max(0.28, Math.min(1.45, cam.el + dy * 0.006));
  applyCamera();
}
function onMove(e) {
  if (!G) return;
  const [sx, sy] = localXY(e);
  if (!pointers.has(e.pointerId)) {
    if (G.tool === 'erase' && e.pointerType === 'mouse' && G.mode === 'edit') { const fp = floorPoint(sx, sy); G.eraseAt = fp ? [fp[0], fp[1]] : null; if (fp) G.eraseR = handleRadiusWorld(fp[0], fp[2], fp[1]) / 9 * 22; }
    return;
  }
  pointers.set(e.pointerId, [sx, sy]);
  if (!gesture) return;
  if (gesture.type === 'two') {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    panBy(gesture.mid, mid);
    if (gesture.d > 10) zoomBy(gesture.d / d, mid[0], mid[1]);
    let da = ang - gesture.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 0.5) { cam.az += da; applyCamera(); }
    gesture.d = d; gesture.ang = ang; gesture.mid = mid;
  } else if (gesture.type === 'pan') {
    panBy(gesture.last, [sx, sy]); gesture.last = [sx, sy];
  } else if (gesture.type === 'orbit') {
    orbitBy(sx - gesture.last[0], sy - gesture.last[1]); gesture.last = [sx, sy];
  } else if (gesture.type === 'stroke') {
    if (gesture.full) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      if (gesture.full) break;
      const [ex, ey] = localXY(ev);
      // follow the finger on the stroke's own surface (a tabletop, or the floor under it)
      let q = null;
      if (gesture.L !== 'g') q = planeAt(ex, ey, gesture.z);
      else { const fp = floorPoint(ex, ey); q = fp && fp[3] === 'g' ? fp : planeAt(ex, ey, gesture.z); }
      if (q) gesture.stroke.move(q[0], q[1]);
    }
    if (gesture.spill != null) triggerSpill(gesture.spill);
  } else if (gesture.type === 'erase') {
    eraseAt(sx, sy);
  } else if (gesture.type === 'place') {
    if (Math.hypot(sx - gesture.sx, sy - gesture.sy) > 8) gesture = { type: 'orbit', last: [sx, sy] };
  } else if (gesture.type === 'tap') {
    if (Math.hypot(sx - gesture.sx, sy - gesture.sy) > 6) {
      gesture.moved = true; clearTimeout(gesture.lp);
      if (gesture.gi >= 0) { G.sel.clear(); G.selProp = -1; G.selGad = gesture.gi; }
      else if (gesture.pi >= 0) { G.sel.clear(); G.selGad = -1; G.selProp = gesture.pi; }
      else if (gesture.di >= 0) { G.selGad = -1; if (!G.sel.has(gesture.di)) { G.sel.clear(); G.selProp = -1; G.sel.add(gesture.di); } }
      else { gesture = { type: 'orbit', last: [sx, sy] }; return; } // drag on empty floor turns the view
      pushUndo();
      const [cx, cy] = selCentroid(), he = selZ();
      const w0 = planeAt(gesture.sx, gesture.sy, he) || [cx, cy];
      gesture = { type: 'drag', he, w0, orig: snapshotSel() };
      updateSelBar();
    }
  } else if (gesture.type === 'drag' && gesture.orig.gad) {
    // gadgets can hop between the floor and furniture tops
    const fp = floorPoint(sx, sy); if (!fp) return;
    const g = G.gadgets[G.selGad];
    g.x = fp[0]; g.y = fp[1]; g.L = fp[3]; G.gadVer++;
    G.dragBad = !!placeGadgetProblem(G.W, G.layout, g, G.gadgets, g, G.props);
  } else if (gesture.type === 'drag') {
    const w = planeAt(sx, sy, gesture.he); if (!w) return;
    const dx = w[0] - gesture.w0[0], dy = w[1] - gesture.w0[1];
    applySel(gesture.orig, (x, y, a) => [x + dx, y + dy, a]);
  } else if (gesture.type === 'rotate') {
    const w = planeAt(sx, sy, gesture.he); if (!w) return;
    let da = Math.atan2(w[1] - gesture.cy, w[0] - gesture.cx) - gesture.a0;
    if (gesture.orig.gad) { const step = Math.PI / 72; da = Math.round((gesture.orig.gad[2] + da) / step) * step - gesture.orig.gad[2]; }
    const c = Math.cos(da), s = Math.sin(da);
    applySel(gesture.orig, (x, y, a) => [gesture.cx + (x - gesture.cx) * c - (y - gesture.cy) * s, gesture.cy + (x - gesture.cx) * s + (y - gesture.cy) * c, a + da]);
  }
}
function applySel(orig, f) {
  if (orig.gad) {
    const g = G.gadgets[G.selGad]; [g.x, g.y, g.a] = f(...orig.gad);
    G.dragBad = !!placeGadgetProblem(G.W, G.layout, g, G.gadgets, g, G.props); G.gadVer++;
    return;
  }
  if (orig.prop) { const p = G.props[G.selProp]; [p.x, p.y, p.a] = f(...orig.prop); G.dragBad = !propValid(p); }
  else {
    for (const [i, x, y, a] of orig.doms) { const d = G.layout[i]; [d.x, d.y, d.a] = f(x, y, a); }
    G.dragBad = !selectionValid(G.sel);
  }
}
function onUp(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.type === 'two') { if (pointers.size === 0) gesture = null; return; }
  if (pointers.size > 0) return;
  const g = gesture; gesture = null;
  if (g.type === 'stroke') {
    if (G.layout.length === g.before && !g.stroke.nudged) G.undo.pop();
    changed();
  } else if (g.type === 'erase') {
    G.eraseAt = null;
    if (!g.removed) G.undo.pop(); else changed();
  } else if (g.type === 'place') {
    placeGadget(g.fp);
  } else if (g.type === 'tap') {
    clearTimeout(g.lp);
    if (g.held) return;
    const now = performance.now();
    if (g.gi >= 0) { G.sel.clear(); G.selProp = -1; G.selGad = g.gi; G.gadVer++; }
    else if (g.pi >= 0) { G.sel.clear(); G.selGad = -1; G.selProp = g.pi; }
    else if (g.di >= 0) {
      if (G.sel.size === 1 && G.sel.has(g.di) && now - (G.lastTap || 0) < 320) { pushUndo(); flipSel(); }
      else { G.sel.clear(); G.selProp = -1; G.sel.add(g.di); }
      if (G.selGad >= 0) { G.selGad = -1; G.gadVer++; }
      G.lastTap = now;
    } else { G.sel.clear(); G.selProp = -1; if (G.selGad >= 0) { G.selGad = -1; G.gadVer++; } }
    updateSelBar();
  } else if (g.type === 'drag' || g.type === 'rotate') {
    if (G.dragBad) { applySel(g.orig, (x, y, a) => [x, y, a]); if (g.orig.gad) G.gadgets[G.selGad].L = g.orig.L; G.undo.pop(); toast("That spot is taken. It's back where it was."); }
    G.dragBad = false; buildPropsIfMoved(); changed();
  }
}
function buildPropsIfMoved() { /* props are drawn from G.props each frame */ }
function triggerSpill(i) {
  gesture = null; pointers.clear();
  changed();
  G.sim = makeSim(G.W, G.layout, G.props, G.gadgets);
  const d = G.layout[i]; let best = null, bd = 1e9;
  G.layout.forEach((o, j) => { if (j === i) return; const dd = Math.hypot(o.x - d.x, o.y - d.y); if (dd < bd) { bd = dd; best = o; } });
  const s = best && ((best.x - d.x) * Math.cos(d.a) + (best.y - d.y) * Math.sin(d.a)) < 0 ? -1 : 1;
  topple(G.sim, i, s, 2.2);
  G.mode = 'spill'; G.acc = 0; G.doneFor = 0;
  $('playTxt').textContent = 'Wobble…'; $('playBar').hidden = false;
  updateHud();
}
function flipSel() {
  if (!G.sel.size) return;
  const [cx, cy] = selCentroid();
  const orig = snapshotSel();
  if (G.sel.size === 1) applySel(orig, (x, y, a) => [x, y, a + Math.PI]);
  else applySel(orig, (x, y, a) => [2 * cx - x, 2 * cy - y, a + Math.PI]);
  if (G.dragBad) { applySel(orig, (x, y, a) => [x, y, a]); G.undo.pop(); toast('No room to turn it around here.'); }
  G.dragBad = false; changed();
}
function deleteSel() {
  pushUndo();
  if (G.selGad >= 0) { G.gadgets.splice(G.selGad, 1); G.selGad = -1; changed(); return; }
  const idx = [...G.sel].sort((a, b) => b - a); for (const i of idx) G.layout.splice(i, 1);
  G.sel.clear(); changed();
}

cv.addEventListener('pointerdown', onDown);
cv.addEventListener('pointermove', onMove);
cv.addEventListener('pointerup', onUp);
cv.addEventListener('pointercancel', onUp);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  if (!G) return; e.preventDefault();
  const [wx, wy] = localXY(e);
  if (e.ctrlKey) zoomBy(Math.exp(e.deltaY * 0.01), wx, wy);
  else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) orbitBy(-e.deltaX * .5, 0);
  else zoomBy(Math.exp(e.deltaY * 0.0012), wx, wy);
}, { passive: false });
window.addEventListener('keydown', e => {
  if (!G || $('game').hidden) return;
  if (e.code === 'Space' && e.target === document.body) { spaceDown = true; e.preventDefault(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && G.sel.size && G.mode === 'edit') deleteSel();
  if (e.key === 'Escape' && G.mode === 'preview') stopPlayback();
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });

// ---------- buttons ----------
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('backBtn').addEventListener('click', () => { if (G && (G.mode === 'preview' || G.mode === 'run' || G.mode === 'spill' || G.mode === 'rewind')) return; closeRoom(); });
$('undoBtn').addEventListener('click', undo);
$('prevBtn').addEventListener('click', () => play('preview'));
$('runBtn').addEventListener('click', () => play('run'));
$('stopBtn').addEventListener('click', stopPlayback);
$('slowBtn').addEventListener('click', () => { SAVE.settings.slow = !SAVE.settings.slow; persist(); $('slowBtn').textContent = SAVE.settings.slow ? 'Full speed' : 'Slow-mo'; $('slow').checked = SAVE.settings.slow; });
$('restandBtn').addEventListener('click', restand);
$('resBack').addEventListener('click', restand);
$('resNext').addEventListener('click', () => {
  const idx = LEVELS.findIndex(l => l.id === G.id);
  $('resultScrim').hidden = true;
  saveLayout();
  openRoom(idx < LEVELS.length - 1 ? LEVELS[idx + 1].id : SANDBOX_ID);
});
$('flipBtn').addEventListener('click', () => { pushUndo(); flipSel(); });
function nudgePower(d) {
  if (G.selGad < 0) return;
  const g = G.gadgets[G.selGad], S = GADGETS[g.k];
  const np = Math.max(S.pmin, Math.min(S.pmax, g.power + Math.sign(d) * S.pstep));
  if (np === g.power) return;
  pushUndo(); g.power = np; changed();
}
let powRepeat = 0;
for (const [id, d] of [['powDown', -10], ['powUp', 10]]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); nudgePower(d); clearInterval(powRepeat); let n = 0; powRepeat = setInterval(() => { n++; if (n > 3) nudgePower(d); }, 90); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearInterval(powRepeat));
}
$('delBtn').addEventListener('click', deleteSel);
$('testBtn').addEventListener('click', () => {
  if (G.selGad >= 0) { play('preview', null, G.selGad); return; }
  if (!G.sel.size) return;
  const order = [...G.sel].sort((a, b) => a - b);
  play('preview', order[0]);
});
$('viewBtn').addEventListener('click', () => {
  cam.view = (cam.view + 1) % CAMV.length; cam.el = CAMV[cam.view].el; applyCamera();
  toast(CAMV[cam.view].name + ' view');
});
$('fitBtn').addEventListener('click', () => { fitCamera(true); });
$('setBtn').addEventListener('click', () => {
  if (G.mode !== 'edit') return;
  $('spacing').value = SAVE.settings.spacing; spLabel();
  $('smart').checked = SAVE.settings.smart; $('shaky').checked = SAVE.settings.shaky; $('slow').checked = SAVE.settings.slow; $('catAll').checked = SAVE.settings.catAll;
  $('clearBtn').textContent = 'Clear this room'; $('clearBtn').dataset.arm = '';
  $('settings').hidden = false;
});
function spLabel() { const v = +$('spacing').value; $('spVal').textContent = `${v.toFixed(1)} cm · gap ${(v - DT).toFixed(1)} cm`; }
$('spacing').addEventListener('input', () => { SAVE.settings.spacing = +$('spacing').value; spLabel(); persist(); });
$('smart').addEventListener('change', e => { SAVE.settings.smart = e.target.checked; persist(); });
$('shaky').addEventListener('change', e => { SAVE.settings.shaky = e.target.checked; persist(); });
$('slow').addEventListener('change', e => { SAVE.settings.slow = e.target.checked; persist(); });
$('catAll').addEventListener('change', e => { SAVE.settings.catAll = e.target.checked; persist(); if (G && !G.W.cat) initCat(); });
$('closeSet').addEventListener('click', () => { $('settings').hidden = true; });
$('settings').addEventListener('click', e => { if (e.target === $('settings')) $('settings').hidden = true; });
let clearTimer = 0;
$('clearBtn').addEventListener('click', () => {
  const b = $('clearBtn');
  if (b.dataset.arm !== '1') { b.dataset.arm = '1'; b.textContent = 'Tap again to clear'; clearTimeout(clearTimer); clearTimer = setTimeout(() => { b.dataset.arm = ''; b.textContent = 'Clear this room'; }, 3000); return; }
  pushUndo(); G.layout = []; G.sel.clear(); changed();
  b.dataset.arm = ''; b.textContent = 'Clear this room'; $('settings').hidden = true; toast('Room cleared. Undo brings it back.');
});

// ---------- menu (plan thumbnails) ----------
function renderMenu() {
  const host = $('rooms'); host.innerHTML = '';
  const items = [...LEVELS.map(l => l.id), SANDBOX_ID];
  let headed = false;
  for (const id of items) {
    const sandbox = id === SANDBOX_ID, L = sandbox ? null : levelDef(id);
    if (L && L.tier === 2 && !headed) {
      headed = true;
      const hd = document.createElement('div'); hd.className = 'tierhead';
      hd.innerHTML = '<b>The household wakes up</b><span>A crawling baby, a robot vacuum and a cat with opinions. Their routes show on the floor with the time they get there.</span>';
      host.append(hd);
    }
    const b = document.createElement('button'); b.className = 'card' + (sandbox ? ' wide' : '');
    const c = document.createElement('canvas');
    const meta = document.createElement('div'); meta.className = 'meta';
    const name = document.createElement('div'); name.className = 'room'; name.textContent = sandbox ? 'Whole house' : L.name;
    const mis = document.createElement('div'); mis.className = 'mission'; mis.textContent = sandbox ? 'Sandbox · every door open' : L.mission;
    const foot = document.createElement('div'); foot.className = 'foot';
    if (!sandbox) {
      const p = document.createElement('span'); p.className = 'pips'; p.setAttribute('aria-label', `${SAVE.stars[id] || 0} of 3`);
      for (let i = 0; i < 3; i++) { const q = document.createElement('b'); if (i < (SAVE.stars[id] || 0)) q.className = 'on'; p.append(q); }
      const best = document.createElement('span'); best.className = 'best'; best.textContent = SAVE.best[id] ? `best ${SAVE.best[id]}` : `box ${L.budget}`;
      foot.append(p, best);
    } else {
      const n = (SAVE.layouts[id] || []).length;
      const best = document.createElement('span'); best.className = 'best'; best.textContent = n ? `${n} placed` : 'empty';
      foot.append(best);
    }
    meta.append(name, mis, foot);
    b.append(c, meta);
    b.addEventListener('click', () => openRoom(id));
    host.append(b);
    requestAnimationFrame(() => drawThumb(c, id));
  }
}
function drawThumb(c, id) {
  const r = c.getBoundingClientRect(); if (!r.width) return;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(r.width * DPR); c.height = Math.round(r.height * DPR);
  const sandbox = id === SANDBOX_ID;
  const W = sandbox ? buildWorld(ALL_ROOMS, true) : buildWorld([id], false);
  const [x0, y0, x1, y1] = W.bounds, pad = 8;
  const s = Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0));
  const view = { s, ox: (r.width - (x1 - x0) * s) / 2 - x0 * s, oy: (r.height - (y1 - y0) * s) / 2 - y0 * s, cw: r.width, ch: r.height };
  drawScene(c.getContext('2d'), W, view, { doms: unpackLayout(SAVE.layouts[id]), props: W.props, time: 0.4, hits: [], arrows: false });
}

// ---------- boot ----------
function buildMarkRow() {
  const row = $('markRow');
  PAL.concat(PAL).forEach((col, i) => {
    const d = document.createElement('i'); d.style.background = col; d.style.animationDelay = (0.6 + i * 0.09) + 's';
    row.append(d);
  });
}
new ResizeObserver(() => { if (G && !$('game').hidden) resize(); }).observe($('stage'));
window.addEventListener('resize', () => { if (!G) renderMenu(); });

function start(data) {
  buildMarkRow();
  renderMenu();
  if (data && data.room) openRoom(data.room);
  requestAnimationFrame(frame);
}
if (window.claude && window.claude.hot) window.claude.hot.snapshot(() => { if (G) saveLayout(); return { room: G ? G.id : null }; });
const HOT = window.claude && window.claude.hot;
if (HOT && HOT.ready) HOT.ready(start); else start((HOT && HOT.data) || {});
})();
