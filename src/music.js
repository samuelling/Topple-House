// ===MUSIC START===
// Topple House soundtrack: lo-fi chillhop through a 16-bit sound chip, voiced like late-90s French
// "space pop": warm analog-style bass, Rhodes, a gliding synth lead and a string-machine pad.
// Everything is synthesised once into low-rate, bit-crushed sample buffers (the way SNES music worked),
// then a swing sequencer plays an original 20-bar song from them.
const Music = (() => {
  const SR = 22050;                 // sample rate of the rendered instruments
  const BPM = 84, STEP = 60 / BPM / 4, SWING = 0.17;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- instruments ----------
  function crush(d, bits) { const q = Math.pow(2, bits - 1); for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.max(-1, Math.min(1, d[i])) * q) / q; }
  function buf(ctx, sec) { const b = ctx.createBuffer(1, Math.ceil(sec * SR), SR); return [b, b.getChannelData(0)]; }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function renderInstruments(ctx) {
    const S = {};
    { // Rhodes: two-operator FM bell with a tine ping
      const f = 262.5, [b, d] = buf(ctx, 3.2);
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, w = 2 * Math.PI * f * t, I = 1.5 * Math.exp(-t * 6) + .3;
        let y = Math.sin(w + I * Math.sin(w)) * (.65 * Math.exp(-t * 1.1) + .35 * Math.exp(-t * 4.5));
        y += .16 * Math.sin(w * 7.03) * Math.exp(-t * 18) + .1 * Math.sin(w * 2) * Math.exp(-t * 2.5);
        d[i] = y * Math.min(1, t / .003) * .55;
      }
      crush(d, 12); S.rhodes = { b, f0: f };
    }
    { // analog bass: saw + square through a two-pole lowpass that closes after the pluck, plus a sine sub
      const P = 336, f = SR / P, [b, d] = buf(ctx, 1.2);
      let l1 = 0, l2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, ph = (i % P) / P, x = .7 * (2 * ph - 1) + .3 * (ph < .5 ? 1 : -1);
        const g = 1 - Math.exp(-2 * Math.PI * (170 + 1100 * Math.exp(-t * 13)) / SR);
        l1 += g * (x - l1); l2 += g * (l1 - l2);
        d[i] = (l2 * .85 + .4 * Math.sin(2 * Math.PI * ph)) * Math.min(1, t / .004);
      }
      crush(d, 12); const ls = Math.ceil(.7 * SR / P) * P; S.bass = { b, f0: f, loop: [ls / SR, (ls + P * 8) / SR] };
    }
    { // lead: soft triangle + narrow pulse, gently filtered, for long gliding notes
      const P = 42, f = SR / P, [b, d] = buf(ctx, .6);
      let l = 0;
      for (let i = 0; i < d.length; i++) {
        const ph = (i % P) / P, tri = 4 * Math.abs(ph - .5) - 1, pul = ph < .3 ? 1 : -1;
        l += .45 * (.62 * tri + .28 * pul + .2 * Math.sin(4 * Math.PI * ph) - l);
        d[i] = l * .8;
      }
      crush(d, 11); const ls = Math.ceil(.2 * SR / P) * P; S.lead = { b, f0: f, loop: [ls / SR, (ls + P * 24) / SR] };
    }
    { // string-machine pad: saw plus octave saw, darkened
      const P = 84, f = SR / P, [b, d] = buf(ctx, .8);
      let l1 = 0, l2 = 0; const g = 1 - Math.exp(-2 * Math.PI * 1500 / SR);
      for (let i = 0; i < d.length; i++) {
        const ph = (i % P) / P, ph2 = ((2 * i) % P) / P;
        const x = .6 * (2 * ph - 1) + .3 * (2 * ph2 - 1) + .15 * (ph < .5 ? 1 : -1);
        l1 += g * (x - l1); l2 += g * (l1 - l2); d[i] = l2 * .8;
      }
      crush(d, 11); const ls = Math.ceil(.3 * SR / P) * P; S.pad = { b, f0: f, loop: [ls / SR, (ls + P * 16) / SR] };
    }
    { // chip: a thin 12.5% pulse for 16-bit sparkle arpeggios
      const P = 42, f = SR / P, [b, d] = buf(ctx, .3);
      for (let i = 0; i < d.length; i++) d[i] = ((i % P) / P < .125 ? .5 : -.07);
      crush(d, 8); S.chip = { b, f0: f, loop: [P * 2 / SR, P * 12 / SR] };
    }
    { // kick
      const [b, d] = buf(ctx, .5); let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR; ph += 2 * Math.PI * (46 + 95 * Math.exp(-t * 30)) / SR;
        d[i] = Math.tanh(1.7 * Math.sin(ph) * Math.exp(-t * 6.5)) + (t < .004 ? (rnd() - .5) * (1 - t / .004) : 0);
      }
      crush(d, 10); S.kick = { b };
    }
    { // snare: body tone plus filtered noise, a little dusty
      const [b, d] = buf(ctx, .35); let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, nz = rnd() * 2 - 1; lp += .45 * (nz - lp);
        d[i] = .45 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 22) + (nz - lp) * .8 * Math.exp(-t * 13) + lp * .3 * Math.exp(-t * 20);
      }
      crush(d, 9); S.snare = { b };
    }
    for (const [k, len, dec] of [['hat', .08, 55], ['ohat', .4, 9]]) { // hats: twice-differenced noise
      const [b, d] = buf(ctx, len); let p1 = 0, p2 = 0;
      for (let i = 0; i < d.length; i++) { const nz = rnd() * 2 - 1, h1 = nz - p1, h2 = h1 - p2; p1 = nz; p2 = h1; d[i] = h2 * .5 * Math.exp(-i / SR * dec); }
      crush(d, 8); S[k] = { b };
    }
    { // vinyl: faint hiss with the odd pop, looped
      const [b, d] = buf(ctx, 4); let lp = 0;
      for (let i = 0; i < d.length; i++) { lp += .2 * ((rnd() * 2 - 1) - lp); d[i] = lp * .05; }
      for (let k = 0; k < 46; k++) { const at = Math.floor(rnd() * (d.length - 200)), amp = (.15 + rnd() * .5) * (rnd() < .5 ? -1 : 1); for (let j = 0; j < 90; j++) d[at + j] += amp * Math.exp(-j / 9); }
      crush(d, 8); S.vinyl = { b };
    }
    return S;
  }

  // ---------- score ----------
  // Chords: bass note plus a four-note voicing (MIDI)
  const CH = {
    F: [41, [57, 60, 64, 67]], Em: [40, [55, 59, 62, 64]], Dm: [38, [53, 57, 60, 64]], C: [36, [52, 55, 59, 62]],
    Bb: [34, [57, 60, 62, 65]], Am: [33, [55, 57, 60, 64]], Gm: [31, [53, 57, 58, 62]], C7: [36, [58, 60, 64, 67]],
  };
  const SEC = { A: ['F', 'Em', 'Dm', 'C'], B: ['Bb', 'Am', 'Gm', 'C7'] };
  // Lead lines: [step within the 4-bar section, midi, length in steps]
  const LEAD = {
    B: [[0, 74, 6], [6, 72, 2], [8, 69, 8], [18, 76, 6], [24, 74, 4], [28, 72, 4], [32, 70, 8], [40, 69, 4], [44, 65, 4], [48, 67, 12], [62, 72, 2]],
    A2: [[0, 69, 6], [6, 72, 2], [8, 76, 8], [16, 74, 6], [24, 71, 8], [32, 72, 4], [36, 69, 4], [40, 65, 8], [48, 64, 16]],
  };
  // The song: twenty bars, then round again
  const SONG = [
    { sec: 'A', drums: 1 }, { sec: 'A', drums: 1, arp: 1 }, { sec: 'B', drums: 1, lead: 'B', pad: 1 },
    { sec: 'A', drums: 1, lead: 'A2', pad: 1 }, { sec: 'A', drums: 0, pad: 1, arp: 1 },
  ];
  const COMP = [[[0, 6, 1], [7, 2, .6], [10, 5, .75]], [[0, 3, .9], [3, 4, .55], [8, 6, .85], [14, 2, .5]]];
  const KICK = [[0, 7, 10], [0, 9, 11]];
  const HATV = [.5, .22, .38, .2, .48, .22, .36, .26];
  const SONG_STEPS = SONG.length * 64;

  // ---------- engine: a graph on any AudioContext plus a step scheduler ----------
  function makeEngine(ctx, dest) {
    const S = renderInstruments(ctx);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .2;
    const master = ctx.createGain(); master.gain.value = .6;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600; tone.Q.value = .8;
    const bus = ctx.createGain(); bus.connect(tone); tone.connect(comp); comp.connect(master); master.connect(dest);
    // SNES-style echo: a dark, repeating delay on its own send
    const send = ctx.createGain(), dl = ctx.createDelay(1), fb = ctx.createGain(), fbf = ctx.createBiquadFilter(), ret = ctx.createGain();
    dl.delayTime.value = STEP * 2; fb.gain.value = .34; fbf.type = 'lowpass'; fbf.frequency.value = 2200; ret.gain.value = .55;
    send.connect(dl); dl.connect(fbf); fbf.connect(fb); fb.connect(dl); dl.connect(ret); ret.connect(bus);
    const vinyl = ctx.createBufferSource(); vinyl.buffer = S.vinyl.b; vinyl.loop = true;
    const vg = ctx.createGain(); vg.gain.value = .5; vinyl.connect(vg); vg.connect(bus); vinyl.start(ctx.currentTime + .01);

    function voice(name, t, midi, vel, dur, o = {}) {
      const s = S[name], src = ctx.createBufferSource(); src.buffer = s.b;
      const rate = midi != null ? mtof(midi) / s.f0 : 1;
      if (o.from != null) { src.playbackRate.setValueAtTime(mtof(o.from) / s.f0, t); src.playbackRate.setTargetAtTime(rate, t, .045); }
      else src.playbackRate.setValueAtTime(rate * (o.detune || 1), t);
      if (s.loop) { src.loop = true; src.loopStart = s.loop[0]; src.loopEnd = s.loop[1]; }
      if (o.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.1; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(rate * .007, t + .35); lfo.connect(lg); lg.connect(src.playbackRate); lfo.start(t); lfo.stop(t + dur + 1); }
      const g = ctx.createGain(), att = o.att || .004, rel = o.rel || .08;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + att);
      if (o.decay) g.gain.setTargetAtTime(vel * o.decay[0], t + att, o.decay[1]);
      g.gain.setTargetAtTime(0, t + Math.max(att, dur), rel / 3);
      let node = g;
      if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); node = p; }
      src.connect(g); node.connect(bus); if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; node.connect(e); e.connect(send); }
      const end = t + Math.max(att, dur) + rel + .05;
      src.start(t); src.stop(s.loop ? end : Math.min(end, t + s.b.duration / Math.max(.05, rate)));
    }
    const hum = () => (Math.random() - .5) * .008;
    let lastLead = null;
    // play one sixteenth-note step of the song at time t
    function step(n, t) {
      const pos = n % SONG_STEPS, part = SONG[Math.floor(pos / 64)], s16 = pos % 64, bar = Math.floor(s16 / 16), b16 = s16 % 16;
      const cname = SEC[part.sec][bar], [root, notes] = CH[cname];
      const nextPart = SONG[Math.floor(((pos + 16) % SONG_STEPS) / 64)], nextRoot = CH[SEC[nextPart.sec][Math.floor((((pos + 16) % SONG_STEPS) % 64) / 16)]][0];
      // drums
      if (part.drums) {
        if (KICK[bar % 2].includes(b16)) voice('kick', t + hum(), null, b16 === 0 ? .5 : .4, .4);
        if (b16 === 4 || b16 === 12) voice('snare', t + hum() + .006, null, .5, .3, { echo: .08 });
        if (b16 === 15 && bar % 2) voice('snare', t + hum(), null, .16, .2);
        if (b16 % 2 === 0) voice(b16 === 14 && bar === 3 ? 'ohat' : 'hat', t + hum(), null, HATV[b16 / 2] * 1.1, .3, { pan: .25 });
        else if (Math.random() < .25) voice('hat', t + hum(), null, .1, .1, { pan: .25 });
      } else if (b16 % 4 === 2) voice('hat', t, null, .06, .1, { pan: .25 });
      // Rhodes comping, strummed a touch
      for (const [st, len, v] of COMP[bar % 2]) if (st === b16) notes.forEach((m, i) => voice('rhodes', t + i * .011 + hum(), m, .4 * v * (.85 + Math.random() * .25), len * STEP, { rel: .35, echo: .22, pan: (i - 1.5) * .12 }));
      // bass: root, a fifth, then a chromatic step into the next chord
      const BL = [[0, 6, root], [7, 1, root + 7], [8, 5, root], [14, 2, nextRoot - 1]];
      for (const [st, len, m] of BL) if (st === b16) voice('bass', t + hum(), m, st === 0 ? .26 : .2, len * STEP, { rel: .06, from: st === 14 ? m + 2 : null });
      // pad: the chord held through the bar, chorused left and right
      if (part.pad && b16 === 0) for (const m of notes.slice(0, 3)) {
        voice('pad', t, m, .09, 15.5 * STEP, { att: .6, rel: .5, pan: -.45, echo: .1 });
        voice('pad', t, m, .09, 15.5 * STEP, { att: .6, rel: .5, pan: .45, detune: 1.0045, echo: .1 });
      }
      // 16-bit arpeggio sparkle
      if (part.arp && b16 % 2 === 0) voice('chip', t, notes[(b16 / 2) % 4] + 12, .07, STEP * .9, { rel: .03, echo: .25, pan: b16 % 4 ? -.3 : .3 });
      // lead
      if (part.lead) for (const [st, m, len] of LEAD[part.lead]) if (st === s16) {
        voice('lead', t, m, .28, len * STEP, { att: .03, rel: .25, vib: true, echo: .3, from: lastLead && lastLead.end >= n - 1 ? lastLead.m : null });
        lastLead = { m, end: n + len };
      }
    }
    let mood = 'menu';
    function setMood(m, now) {
      mood = m;
      const f = m === 'run' ? 12000 : m === 'build' ? 1500 : 2600;
      tone.frequency.cancelScheduledValues(now); tone.frequency.setTargetAtTime(f, now, m === 'run' ? .2 : .5);
    }
    function jingle(ok, t) {
      if (ok) [65, 69, 72, 76, 79, 84].forEach((m, i) => { voice('lead', t + i * STEP, m, .16, STEP * (i === 5 ? 6 : 1.4), { att: .01, rel: .3, echo: .35 }); voice('chip', t + i * STEP, m, .05, STEP, { echo: .3 }); });
      else { voice('lead', t, 69, .14, STEP * 2, { att: .02, rel: .3, echo: .3 }); voice('lead', t + STEP * 2, 64, .14, STEP * 5, { att: .02, rel: .4, echo: .3, from: 69, vib: true }); }
    }
    return { step, setMood, jingle, master };
  }
  const swingAt = n => (n % 2 ? SWING * STEP : 0);

  // ---------- live player ----------
  let ctx = null, eng = null, timer = 0, n = 0, gridT = 0, on = false, vol = .6, mood = 'menu';
  function tick() {
    if (!on || !ctx) return;
    while (gridT < ctx.currentTime + .15) { eng.step(n, gridT + swingAt(n)); n++; gridT += STEP; }
  }
  function start(v) {
    if (v != null) vol = v;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        ctx = new AC(); eng = makeEngine(ctx, ctx.destination);
        gridT = ctx.currentTime + .12; eng.setMood(mood, ctx.currentTime);
      }
      ctx.resume();
      eng.master.gain.setTargetAtTime(vol, ctx.currentTime, .3);
      if (!on) { on = true; gridT = Math.max(gridT, ctx.currentTime + .08); clearInterval(timer); timer = setInterval(tick, 25); tick(); }
      return true;
    } catch (e) { return false; }
  }
  function stop() {
    on = false; clearInterval(timer);
    if (ctx) { eng.master.gain.setTargetAtTime(0, ctx.currentTime, .15); setTimeout(() => { if (!on && ctx) ctx.suspend(); }, 600); }
  }
  function setVolume(v) { vol = v; if (ctx && on) eng.master.gain.setTargetAtTime(v, ctx.currentTime, .1); }
  function setMood(m) { mood = m; if (ctx) eng.setMood(m, ctx.currentTime); }
  function jingle(ok) { if (ctx && on) { const q = STEP * 2, t = Math.ceil((ctx.currentTime + .05) / q) * q; eng.jingle(ok, t); } }
  document.addEventListener('visibilitychange', () => { if (!ctx || !on) return; if (document.hidden) ctx.suspend(); else { ctx.resume(); gridT = Math.max(gridT, ctx.currentTime + .05); } });

  // Render a stretch of the song offline (for checking the mix); resolves to an AudioBuffer
  function renderOffline(seconds, moodName) {
    const oc = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100), e = makeEngine(oc, oc.destination);
    e.master.gain.value = .6; e.setMood(moodName || 'run', 0);
    for (let k = 0, t = .05; t < seconds - .2; k++, t += STEP) e.step(k, t + swingAt(k));
    return oc.startRendering();
  }
  return { start, stop, setVolume, setMood, jingle, isOn: () => on, renderOffline, BPM };
})();
// ===MUSIC END===
