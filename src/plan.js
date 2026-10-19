// ---------- drawing ----------
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const FLOOR = {
  wood: { base: '#c9a273', line: 'rgba(92,58,24,.20)' },
  carpet: { base: '#93a48c', line: 'rgba(40,60,40,.10)' },
  tile: { base: '#e7e1d3', line: 'rgba(60,50,30,.12)' },
  bath: { base: '#cfe2e7', line: 'rgba(30,70,90,.16)' },
  lavender: { base: '#b9aed3', line: 'rgba(60,40,90,.10)' },
  terracotta: { base: '#d39a74', line: 'rgba(110,50,20,.18)' },
};

function drawFloor(c, room, s) {
  const f = FLOOR[room.floor];
  const x0 = room.x + WT, y0 = room.y + WT, w = room.w - WT * 2, h = room.h - WT * 2;
  c.fillStyle = f.base; c.fillRect(x0, y0, w, h);
  c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
  c.strokeStyle = f.line; c.lineWidth = 1 / s;
  c.beginPath();
  if (room.floor === 'wood') {
    const bw = 13;
    if (bw * s > 3.5) {
      for (let y = y0, row = 0; y < y0 + h; y += bw, row++) {
        c.moveTo(x0, y); c.lineTo(x0 + w, y);
        for (let x = x0 + ((row * 53) % 120); x < x0 + w; x += 120) { c.moveTo(x, y); c.lineTo(x, y + bw); }
      }
    }
  } else if (room.floor === 'tile' || room.floor === 'bath' || room.floor === 'terracotta') {
    const g = room.floor === 'tile' ? 30 : 15;
    if (g * s > 4) {
      for (let x = x0; x < x0 + w; x += g) { c.moveTo(x, y0); c.lineTo(x, y0 + h); }
      for (let y = y0; y < y0 + h; y += g) { c.moveTo(x0, y); c.lineTo(x0 + w, y); }
    }
  } else if (room.floor === 'carpet' || room.floor === 'lavender') {
    if (s > 1.2) for (let k = -h; k < w; k += 9) { c.moveTo(x0 + k, y0); c.lineTo(x0 + k + h, y0 + h); }
  }
  c.stroke(); c.restore();
}

function label(c, text, x, y, s, maxW, color) {
  if (!text || s < 1.05) return;
  const px = Math.max(8, Math.min(12, 3.4 * s));
  c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = x * s + G_view().ox, sy = y * s + G_view().oy;
  c.font = `600 ${px}px Figtree, system-ui, sans-serif`;
  const tw = c.measureText(text.toUpperCase()).width;
  if (tw < maxW * s - 4) {
    c.fillStyle = color || 'rgba(28,24,20,.55)'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.letterSpacing = '0.06em';
    c.fillText(text.toUpperCase(), sx, sy);
  }
  c.restore();
}
let VIEW_FOR_LABELS = null;
const G_view = () => VIEW_FOR_LABELS;

function drawFurniture(c, f, s) {
  const sh = 'rgba(10,12,18,.22)';
  if (f.r) {
    c.fillStyle = sh; c.beginPath(); c.arc(f.cx + 1.6, f.cy + 2, f.r, 0, 7); c.fill();
    if (f.k === 'plant') {
      c.fillStyle = '#4a7a3e'; c.beginPath(); c.arc(f.cx, f.cy, f.r, 0, 7); c.fill();
      c.fillStyle = '#68a052';
      for (let i = 0; i < 7; i++) { const t = i / 7 * 6.283; c.beginPath(); c.ellipse(f.cx + Math.cos(t) * f.r * .45, f.cy + Math.sin(t) * f.r * .45, f.r * .42, f.r * .2, t, 0, 7); c.fill(); }
      c.fillStyle = '#8a5a3a'; c.beginPath(); c.arc(f.cx, f.cy, f.r * .22, 0, 7); c.fill();
    } else if (f.k === 'lamp') {
      c.fillStyle = '#f2dc9b'; c.beginPath(); c.arc(f.cx, f.cy, f.r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(120,90,30,.35)'; c.lineWidth = 1.2; c.beginPath(); c.arc(f.cx, f.cy, f.r * .62, 0, 7); c.stroke();
      c.fillStyle = '#6b5a3a'; c.beginPath(); c.arc(f.cx, f.cy, 2.2, 0, 7); c.fill();
    } else if (f.k === 'basket') {
      c.fillStyle = '#c4a06b'; c.beginPath(); c.arc(f.cx, f.cy, f.r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(90,60,20,.35)'; c.lineWidth = 1;
      for (let k = 0.35; k < 1; k += 0.22) { c.beginPath(); c.arc(f.cx, f.cy, f.r * k, 0, 7); c.stroke(); }
      c.fillStyle = '#e8e2f3'; c.beginPath(); c.ellipse(f.cx - 3, f.cy - 2, 7, 4.5, .5, 0, 7); c.fill();
    } else if (f.k === 'globe') {
      c.fillStyle = '#4f8fc0'; c.beginPath(); c.arc(f.cx, f.cy, f.r, 0, 7); c.fill();
      c.fillStyle = '#8fbf6a'; c.beginPath(); c.ellipse(f.cx - 3, f.cy - 2, f.r * .5, f.r * .3, .4, 0, 7); c.fill();
    } else if (f.k === 'bin') {
      c.fillStyle = '#5a6170'; c.beginPath(); c.arc(f.cx, f.cy, f.r, 0, 7); c.fill();
      c.fillStyle = '#737b8c'; c.beginPath(); c.arc(f.cx, f.cy, f.r * .7, 0, 7); c.fill();
    }
    label(c, f.label, f.cx, f.cy + f.r + 3.5, s, f.r * 4, 'rgba(28,24,20,.6)');
    return;
  }
  const { x, y, w, h } = f;
  c.fillStyle = sh; rr(c, x + 1.6, y + 2, w, h, 4); c.fill();
  switch (f.k) {
    case 'bed':
      c.fillStyle = '#5b4636'; rr(c, x, y, w, h, 4); c.fill();
      c.fillStyle = '#7189bd'; rr(c, x + 3, y + 8, w - 6, h - 11, 5); c.fill();
      c.fillStyle = '#f4f1ea'; rr(c, x + 10, y + 12, w / 2 - 15, 26, 6); c.fill(); rr(c, x + w / 2 + 5, y + 12, w / 2 - 15, 26, 6); c.fill();
      c.fillStyle = '#5d74a9'; c.fillRect(x + 3, y + 48, w - 6, 18);
      break;
    case 'sofa':
      c.fillStyle = '#2f6f78'; rr(c, x, y, w, h, 7); c.fill();
      c.fillStyle = '#3d8791'; for (let k = 0; k < 3; k++) { rr(c, x + 16, y + 12 + k * (h - 24) / 3 + 1.5, w - 22, (h - 24) / 3 - 3, 5); c.fill(); }
      break;
    case 'armchair':
      c.fillStyle = '#c98a3e'; rr(c, x, y, w, h, 8); c.fill();
      c.fillStyle = '#dca457'; rr(c, x + 10, y + 14, w - 20, h - 20, 6); c.fill();
      break;
    case 'table': case 'island':
      c.fillStyle = f.k === 'table' ? '#7a593b' : '#c9b48f'; rr(c, x, y, w, h, 4); c.fill();
      c.strokeStyle = 'rgba(60,40,20,.25)'; c.lineWidth = 1;
      c.beginPath(); for (let k = y + 7; k < y + h - 3; k += 7) { c.moveTo(x + 3, k); c.lineTo(x + w - 3, k); } c.stroke();
      break;
    case 'tv':
      c.fillStyle = '#4b4f5a'; rr(c, x, y, w, h, 3); c.fill();
      c.fillStyle = '#16181d'; c.fillRect(x + w - 9, y + 12, 5, h - 24);
      break;
    case 'counter':
      c.fillStyle = '#d7d1c3'; rr(c, x, y, w, h, 3); c.fill();
      c.fillStyle = '#c3bcab'; if (w > h) c.fillRect(x, y, w, 5); else c.fillRect(x, y, 5, h);
      if (w > 200) { c.fillStyle = '#aab3bb'; rr(c, x + 40, y + 13, 46, 32, 6); c.fill(); c.fillStyle = '#8d979f'; c.beginPath(); c.arc(x + 63, y + 29, 3, 0, 7); c.fill();
        c.fillStyle = '#3a3f49'; for (const [a, b] of [[x + 150, y + 22], [x + 172, y + 22], [x + 150, y + 42], [x + 172, y + 42]]) { c.beginPath(); c.arc(a, b, 7, 0, 7); c.fill(); } }
      break;
    case 'fridge':
      c.fillStyle = '#e6eaee'; rr(c, x, y, w, h, 4); c.fill();
      c.fillStyle = '#b7bec6'; c.fillRect(x + 4, y + h - 9, w - 8, 3);
      break;
    case 'tub':
      c.fillStyle = '#f4f6f7'; rr(c, x, y, w, h, 12); c.fill();
      c.fillStyle = '#a9d6e3'; rr(c, x + 8, y + 8, w - 16, h - 16, 18); c.fill();
      c.fillStyle = '#8e9aa4'; c.beginPath(); c.arc(x + w - 20, y + h / 2, 2.5, 0, 7); c.fill();
      break;
    case 'toilet':
      c.fillStyle = '#f4f6f7'; rr(c, x + w - 18, y + 4, 18, h - 8, 4); c.fill();
      c.beginPath(); c.ellipse(x + (w - 18) / 2 + 2, y + h / 2, (w - 18) / 2 + 2, h / 2 - 8, 0, 0, 7); c.fill();
      c.fillStyle = '#d5e4ea'; c.beginPath(); c.ellipse(x + (w - 18) / 2 + 3, y + h / 2, (w - 18) / 2 - 6, h / 2 - 17, 0, 0, 7); c.fill();
      break;
    case 'sink':
      c.fillStyle = '#d7d1c3'; rr(c, x, y, w, h, 3); c.fill();
      c.fillStyle = '#f4f6f7'; c.beginPath(); c.ellipse(x + w / 2 + 3, y + h / 2, w / 2 - 9, h / 2 - 10, 0, 0, 7); c.fill();
      break;
    case 'rail':
      c.fillStyle = '#5b4636'; rr(c, x, y, w, h, 2); c.fill();
      c.fillStyle = '#7a5f48'; for (let k = y + 6; k < y + h; k += 18) { c.fillRect(x + 1.5, k, w - 3, 4); }
      return;
    case 'toybox':
      c.fillStyle = '#d4573f'; rr(c, x, y, w, h, 4); c.fill();
      c.fillStyle = '#e8b33a'; c.fillRect(x, y + h * .42, w, 6);
      break;
    default: // wooden pieces: nightstand, dresser, bench, console
      c.fillStyle = '#8b6142'; rr(c, x, y, w, h, 3); c.fill();
      c.fillStyle = '#a3774f'; rr(c, x + 3, y + 3, w - 6, h - 6, 2); c.fill();
      if (f.k === 'shelfstep') { c.fillStyle = `rgba(255,240,210,${(f.top || 30) / 300})`; c.fillRect(x, y, w, h); }
      if (f.k === 'dresser' || f.k === 'bench') { c.strokeStyle = 'rgba(60,35,15,.35)'; c.lineWidth = 1; c.beginPath(); for (let k = y + h / 4; k < y + h - 2; k += h / 4) { c.moveTo(x + 3, k); c.lineTo(x + w - 3, k); } c.stroke(); }
  }
  label(c, f.label, x + w / 2, y + h / 2, s, w, f.k === 'tv' || f.k === 'sofa' || f.k === 'bed' ? 'rgba(255,255,255,.7)' : 'rgba(28,24,20,.6)');
}

function drawWallsDoors(c, W, s) {
  c.fillStyle = '#2b303d';
  for (const [x, y, w, h] of W.walls) c.fillRect(x, y, w, h);
  for (const d of W.doors) {
    const [x, y, w, h] = d.rect;
    c.fillStyle = d.ext ? '#7a3f34' : '#9b7650'; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,.18)';
    if (w > h) c.fillRect(x, y + h / 2 - 0.6, w, 1.2); else c.fillRect(x + w / 2 - 0.6, y, 1.2, h);
  }
  // swing arcs for closed doors (architectural detail)
  c.strokeStyle = 'rgba(30,30,40,.22)'; c.lineWidth = 1 / s; c.setLineDash([3 / s, 3 / s]);
  for (const d of W.doors) {
    const [x, y, w, h] = d.rect; c.beginPath();
    if (d.side === 'L') c.arc(x + w, y, h, 0, Math.PI / 2);
    else if (d.side === 'R') c.arc(x, y, h, Math.PI / 2, Math.PI);
    else if (d.side === 'T') c.arc(x, y + h, w, 0, Math.PI / 2);
    else c.arc(x, y, w, -Math.PI / 2, 0);
    c.stroke();
  }
  c.setLineDash([]);
  for (const d of W.doors) if (d.ext) { const [x, y, w, h] = d.rect; label(c, 'Front door', x + w / 2, y + h + 6, s, w * 2, 'rgba(243,237,225,.7)'); }
}

function drawStairs(c, st, s) {
  const { x, y, w, h } = st;
  c.fillStyle = '#b58d5f'; c.fillRect(x, y, w, h);
  const step = 22, n = Math.ceil(h / step);
  for (let i = 0; i < n; i++) {
    c.fillStyle = `rgba(40,25,10,${0.04 + i * 0.035})`; c.fillRect(x, y + i * step, w, Math.min(step, h - i * step));
    c.fillStyle = 'rgba(255,240,210,.35)'; c.fillRect(x, y + i * step, w, 1.6);
  }
  // down arrow
  c.strokeStyle = 'rgba(255,248,235,.75)'; c.lineWidth = 2.2; c.lineCap = 'round';
  const ax = x + w - 18; c.beginPath(); c.moveTo(ax, y + 18); c.lineTo(ax, y + h - 18); c.moveTo(ax - 6, y + h - 26); c.lineTo(ax, y + h - 18); c.lineTo(ax + 6, y + h - 26); c.stroke();
  label(c, 'Stairs down', x + w / 2 - 6, y + 12, s, w, 'rgba(255,248,235,.8)');
}

function drawNoPlace(c, n, s) {
  if (n.cat) { // a round cat bed
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    c.fillStyle = '#8f6b9e'; c.beginPath(); c.arc(cx, cy, n.w / 2, 0, 7); c.fill();
    c.fillStyle = '#d9c6e3'; c.beginPath(); c.arc(cx, cy, n.w / 2 - 4, 0, 7); c.fill();
    return;
  }
  c.fillStyle = '#7fb0a5'; rr(c, n.x, n.y, n.w, n.h, 6); c.fill();
  c.save(); rr(c, n.x, n.y, n.w, n.h, 6); c.clip();
  c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 1.6; c.beginPath();
  for (let k = -n.h; k < n.w; k += 7) { c.moveTo(n.x + k, n.y + n.h); c.lineTo(n.x + k + n.h, n.y); }
  c.stroke(); c.restore();
  c.strokeStyle = '#6a9a90'; c.lineWidth = 1; c.beginPath();
  for (let k = n.y + 3; k < n.y + n.h - 2; k += 3.5) { c.moveTo(n.x - 3, k); c.lineTo(n.x, k); c.moveTo(n.x + n.w, k); c.lineTo(n.x + n.w + 3, k); }
  c.stroke();
  label(c, n.label + ' · slippery', n.x + n.w / 2, n.y + n.h / 2, s, n.w, 'rgba(20,50,45,.75)');
}

function drawDecor(c, d) {
  if (d.k === 'rug') {
    c.fillStyle = '#b35a4a'; rr(c, d.x, d.y, d.w, d.h, 4); c.fill();
    c.strokeStyle = '#e7c48f'; c.lineWidth = 2.5; rr(c, d.x + 7, d.y + 7, d.w - 14, d.h - 14, 3); c.stroke();
    c.fillStyle = 'rgba(231,196,143,.5)'; c.beginPath(); c.ellipse(d.x + d.w / 2, d.y + d.h / 2, d.w / 5, d.h / 5, 0, 0, 7); c.fill();
  } else if (d.k === 'playmat') {
    const cols = ['#e5483f', '#f2c230', '#3fae6a', '#3a7bd5'], n = 3, cw = d.w / n, ch = d.h / 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { c.fillStyle = cols[(i + j * 2) % 4]; c.fillRect(d.x + i * cw, d.y + j * ch, cw, ch); }
  } else if (d.k === 'dock') {
    c.fillStyle = '#2b2f38'; rr(c, d.x, d.y, d.w, d.h, 2); c.fill();
    c.fillStyle = '#4cc38a'; c.beginPath(); c.arc(d.x + d.w / 2, d.y + d.h / 2, 1.6, 0, 7); c.fill();
  } else if (d.k === 'runner') {
    c.fillStyle = '#3f5f8a'; rr(c, d.x, d.y, d.w, d.h, 3); c.fill();
    c.strokeStyle = 'rgba(240,220,170,.6)'; c.lineWidth = 1.5; rr(c, d.x + 5, d.y + 5, d.w - 10, d.h - 10, 2); c.stroke();
  }
}

function drawTarget(c, t, hit, s, time, idx, ordered, hitTime) {
  const { x, y, r } = t;
  if (!hit) {
    const p = (time * 1.4 + idx * .3) % 1;
    c.strokeStyle = `rgba(246,179,60,${0.75 * (1 - p)})`; c.lineWidth = 1.6 / s * 1.5;
    c.beginPath(); c.arc(x, y, r + 2 + p * 9, 0, 7); c.stroke();
  }
  c.fillStyle = 'rgba(10,12,18,.25)'; c.beginPath(); c.arc(x + 1, y + 1.4, r, 0, 7); c.fill();
  switch (t.k) {
    case 'bell': case 'doorbell':
      c.fillStyle = t.k === 'bell' ? '#e2b13c' : '#c99a3a'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = '#f7da84'; c.beginPath(); c.arc(x - r * .25, y - r * .25, r * .45, 0, 7); c.fill();
      c.fillStyle = '#7a5a12'; c.beginPath(); c.arc(x, y, r * .2, 0, 7); c.fill(); break;
    case 'switch':
      c.fillStyle = '#f4f1ea'; rr(c, x - r, y - r, r * 2, r * 2, 2); c.fill();
      c.fillStyle = '#c6c0b2'; c.fillRect(x - r * .3, y - r * .6, r * .6, r * 1.2); break;
    case 'remote':
      c.fillStyle = '#23262e'; rr(c, x - r * .5, y - r * 1.1, r, r * 2.2, 2); c.fill();
      c.fillStyle = '#ef6a5a'; c.beginPath(); c.arc(x, y - r * .6, r * .2, 0, 7); c.fill();
      c.fillStyle = '#8b93a3'; c.fillRect(x - r * .25, y - r * .1, r * .5, r * .6); break;
    case 'cereal':
      c.fillStyle = '#d6453d'; rr(c, x - r * 1.1, y - r * .6, r * 2.2, r * 1.2, 1); c.fill();
      c.fillStyle = '#f2c230'; c.fillRect(x - r * 1.1, y - r * .12, r * 2.2, r * .3); break;
    case 'chime':
      c.fillStyle = '#c4cad3'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = '#7b8494'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - r * .6, y + r * .4); c.lineTo(x + r * .6, y - r * .4); c.stroke(); break;
    case 'trophy':
      c.fillStyle = '#d9a93a'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = '#f3d58a'; c.beginPath(); c.arc(x - r * .3, y - r * .3, r * .35, 0, 7); c.fill(); break;
    case 'musicbox':
      c.fillStyle = '#c96f8a'; rr(c, x - r, y - r * .8, r * 2, r * 1.6, 1.5); c.fill();
      c.fillStyle = '#f3d58a'; c.beginPath(); c.arc(x, y, r * .35, 0, 7); c.fill(); break;
    case 'popcorn':
      c.fillStyle = '#d6453d'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = '#fbf3d8'; c.beginPath(); c.arc(x, y, r * .7, 0, 7); c.fill(); break;
    case 'button':
      c.fillStyle = '#23262e'; rr(c, x - r, y - r * .7, r * 2, r * 1.4, 2); c.fill();
      c.fillStyle = '#4cc38a'; c.beginPath(); c.arc(x, y, r * .35, 0, 7); c.fill(); break;
    case 'watering':
      c.fillStyle = '#3fae6a'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = '#2b7a49'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x + r * .6, y - r * .3); c.lineTo(x + r * 1.6, y - r * 1.1); c.stroke(); break;
    case 'windchime':
      c.fillStyle = '#c4cad3'; for (const [dx, dy] of [[-.5, -.4], [.5, -.3], [0, .5]]) { c.beginPath(); c.arc(x + dx * r, y + dy * r, r * .35, 0, 7); c.fill(); } break;
    case 'duck':
      c.fillStyle = '#f5d02f'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.beginPath(); c.arc(x + r * .5, y - r * .45, r * .55, 0, 7); c.fill();
      c.fillStyle = '#f08a2c'; c.beginPath(); c.moveTo(x + r * .95, y - r * .55); c.lineTo(x + r * 1.5, y - r * .4); c.lineTo(x + r * .95, y - r * .25); c.fill();
      c.fillStyle = '#222'; c.beginPath(); c.arc(x + r * .6, y - r * .6, r * .1, 0, 7); c.fill(); break;
  }
  if (hit) {
    c.strokeStyle = '#4cc38a'; c.lineWidth = 2.2 / s * 1.4; c.beginPath(); c.arc(x, y, r + 2.5, 0, 7); c.stroke();
  }
  if (ordered && t.order) {
    const bx = x + r + 1, by = y - r - 1, br = Math.max(3.2, 7 / s);
    c.fillStyle = hit ? '#4cc38a' : '#f6b33c'; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill();
    c.fillStyle = '#1b1e27'; c.font = `700 ${br * 1.3}px Figtree, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(t.order), bx, by + br * .05);
  }
  label(c, hitTime != null ? `${t.label} ${hitTime.toFixed(2)} s` : t.label, x, y + r + 6, s, 70, hit ? 'rgba(20,90,55,.95)' : 'rgba(28,24,20,.75)');
}

function drawProp(c, p, s, showArrow, selected) {
  if (showArrow && p.start) {
    const L = 22;
    c.strokeStyle = 'rgba(246,179,60,.95)'; c.lineWidth = 1.8 / s * 1.3; c.setLineDash([3, 2.5]);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(p.a) * L, p.y + Math.sin(p.a) * L); c.stroke(); c.setLineDash([]);
    const hx = p.x + Math.cos(p.a) * L, hy = p.y + Math.sin(p.a) * L;
    c.fillStyle = 'rgba(246,179,60,.95)'; c.beginPath();
    c.moveTo(hx + Math.cos(p.a) * 4, hy + Math.sin(p.a) * 4);
    c.lineTo(hx + Math.cos(p.a + 2.3) * 3.5, hy + Math.sin(p.a + 2.3) * 3.5);
    c.lineTo(hx + Math.cos(p.a - 2.3) * 3.5, hy + Math.sin(p.a - 2.3) * 3.5); c.fill();
  }
  c.fillStyle = 'rgba(10,12,18,.28)'; c.beginPath(); c.arc(p.x + .8, p.y + 1.1, p.r, 0, 7); c.fill();
  if (p.k === 'marble') {
    c.fillStyle = '#4f9be0'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(p.x - p.r * .35, p.y - p.r * .35, p.r * .32, 0, 7); c.fill();
  } else {
    c.fillStyle = '#fbfaf6'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = .6; c.beginPath(); c.arc(p.x, p.y, p.r * .7, 0, 7); c.stroke();
    c.fillStyle = '#b9a98c'; c.beginPath(); c.arc(p.x, p.y, p.r * .38, 0, 7); c.fill();
  }
  if (selected) { c.strokeStyle = '#f6b33c'; c.lineWidth = 2 / s; c.beginPath(); c.arc(p.x, p.y, p.r + 2.5, 0, 7); c.stroke(); }
  if (p.label && s > 1.5) label(c, p.label, p.x, p.y + p.r + 5, s, 60, 'rgba(20,50,60,.7)');
}

function drawDomino(c, d, s, opts) {
  const col = PAL[d.c % PAL.length];
  c.save(); c.translate(d.x, d.y); c.rotate(d.a);
  const st = d.st || 0;
  if (!st || (d.ph || 0) < 0.002) {
    c.fillStyle = 'rgba(10,12,18,.3)'; c.fillRect(-DT / 2 + .5, -DW / 2 + .7, DT + .8, DW);
    c.fillStyle = opts && opts.bad ? '#ef6a5a' : col; c.fillRect(-DT / 2, -DW / 2, DT, DW);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-DT / 2, -DW / 2, DT * .45, DW);
    if (opts && opts.sel) { c.strokeStyle = '#f6b33c'; c.lineWidth = Math.max(.5, 2 / s); c.strokeRect(-DT / 2 - 1, -DW / 2 - 1, DT + 2, DW + 2); }
  } else {
    const sg = d.s || 1, ph = d.ph, len = (d.he || DH) * Math.sin(ph);
    const back = -DT * Math.cos(ph);
    const x0 = sg > 0 ? DT / 2 + back : -DT / 2 - len, x1 = sg > 0 ? DT / 2 + len : -DT / 2 - back;
    const flat = Math.sin(ph);
    c.fillStyle = 'rgba(10,12,18,.28)'; c.fillRect(x0 + .6, -DW / 2 + .8, x1 - x0, DW);
    c.fillStyle = shade(col, -0.18 + flat * 0.12); c.fillRect(x0, -DW / 2, x1 - x0, DW);
    if (flat > .85 && s > 1.6) { // the face shows: centre line and pips
      c.fillStyle = 'rgba(255,255,255,.7)';
      const mid = (x0 + x1) / 2;
      c.fillRect(mid - .15, -DW / 2 + .5, .3, DW - 1);
      c.beginPath(); c.arc(mid - (x1 - x0) / 4, 0, .45, 0, 7); c.arc(mid + (x1 - x0) / 4, -.9, .45, 0, 7); c.fill();
      c.beginPath(); c.arc(mid + (x1 - x0) / 4, .9, .45, 0, 7); c.fill();
    }
  }
  c.restore();
}

// Household agents on the plan: route as a dashed line, plus a marker where each starts
function drawHousehold(c, W, s) {
  for (const A of W.agents || []) {
    const pts = A.loop ? [...A.path, A.path[0]] : A.path;
    c.strokeStyle = A.k === 'baby' ? 'rgba(229,72,63,.75)' : 'rgba(58,123,213,.8)'; c.lineWidth = 2.2; c.setLineDash([4, 3]);
    c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.setLineDash([]);
    const [x, y] = A.path[0];
    if (A.k === 'roomba') { c.fillStyle = '#2b2f38'; c.beginPath(); c.arc(x, y, 17, 0, 7); c.fill(); c.fillStyle = '#4cc38a'; c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill(); }
    else { c.fillStyle = '#9cc3e6'; c.beginPath(); c.ellipse(x, y, 9, 12, 0, 0, 7); c.fill(); c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(x, y - 13, 7, 0, 7); c.fill(); }
  }
  if (W.cat) { const [x, y] = W.cat.bed; c.fillStyle = '#e08a3c'; c.beginPath(); c.ellipse(x, y, 9, 7, .4, 0, 7); c.fill(); c.beginPath(); c.arc(x + 6, y - 5, 4.5, 0, 7); c.fill(); }
}
function drawScene(c, W, view, o) {
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#161a24'; c.fillRect(0, 0, view.cw, view.ch);
  c.setTransform(DPR * view.s, 0, 0, DPR * view.s, DPR * view.ox, DPR * view.oy);
  VIEW_FOR_LABELS = view;
  const s = view.s;
  // house shadow
  c.fillStyle = 'rgba(0,0,0,.35)';
  for (const r of W.rooms) c.fillRect(r.x + 4, r.y + 6, r.w, r.h);
  for (const r of W.rooms) drawFloor(c, r, s);
  for (const d of W.decor) drawDecor(c, d);
  for (const st of W.stairs) drawStairs(c, st, s);
  for (const n of W.noPlace) drawNoPlace(c, n, s);
  drawWallsDoors(c, W, s);
  for (const f of W.furniture) drawFurniture(c, f, s);
  const hits = o.hits || [];
  W.targets.forEach((t, i) => { const h = hits.find(x => x.id === t.id); drawTarget(c, t, !!h, s, o.time || 0, i, W.ordered, o.showTimes && h ? h.t : null); });
  for (const p of o.props) drawProp(c, p, s, o.arrows, o.selProp === p);
  drawHousehold(c, W, s);
  const D = o.doms;
  for (let i = 0; i < D.length; i++) if (!(D[i].st > 0)) drawDomino(c, D[i], s, { sel: o.sel && o.sel.has(i), bad: o.bad && o.sel && o.sel.has(i) });
  for (let i = 0; i < D.length; i++) if (D[i].st > 0) drawDomino(c, D[i], s);
  if (o.overlay) o.overlay(c, s);
}

