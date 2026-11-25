/* =====================================================================
   SCOPE: the wave display (2026-11-10)
   The wave you hear at the current morph (2026-11-10: only that one; A and B
   are what it shows with a side focused or the morph at an end). It is what the engine plays (Wavetable 1's blend, after the
   Harmonics control and the filter, with the four macros applied), and the
   effects each leave a fitting mark on it, scaled by how much of them is heard:
     Drive       the wave is shaped by the same kind of curve (soft clip, then folding)
     Formant     the harmonics near the vowel's resonances are lifted, and three beams of light stand at the resonances
     Modulation  strands wind around the wave in a helix that turns at the modulation rate
     Delay       echoes leave the wave and travel into the distance in the delay's time (ping-pong: left and right in turn)
     Reverb      the wave glows and stands on a floor in perspective that mirrors it (2026-11-25: these four redrawn in depth)
     Lo-fi       steps in level (Character), sample-and-hold (Codec), a wobble (Wow, Flutter), specks (Noise)
     OTT         the wave is squashed toward full height and the line thickens
   Time-based marks (Modulation, Wow, Flutter, Noise) animate while something can be heard.
   ===================================================================== */
const scopeEl = $('scope'), fxScopeEl = $('fxscope');
// the macros, run exactly as the engine runs them (MorphEngine.applyMacros) on the values at the current morph
const MAC = { I: IX, defs: DEFS };
MAC.macros = MorphEngine.prototype.buildMacros.call(MAC);
MAC.cur = new Float64Array(DEFS.length); MAC.val = new Float64Array(DEFS.length);
function heardValues() {
  for (let i = 0; i < DEFS.length; i++) { MAC.cur[i] = resolveNorm(i); MAC.val[i] = MorphEngine.denorm(DEFS[i], MAC.cur[i]); }
  MorphEngine.prototype.applyMacros.call(MAC);
  return key => MAC.val[IX[key]];
}
const SC = { re: new Float32Array(513), im: new Float32Array(513), n: 256 };
// the wave heard now: Wavetable 1's blend at this morph, Harmonics, then the filter's response at middle C
function scopeWave(v, side) {
  const s = 0;
  MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], true, W.fa[0], W.fa[1]);
  MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], true, W.fb[0], W.fb[1]);
  const t = side === 'A' ? 0 : side === 'B' ? 1 : resolveNorm(oi(s, 'wave'));
  MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], t, true, SC.re, SC.im);
  if (!side) {
    WtBank.simplify(SC.re, SC.im, v('harm'));
    const f0 = 261.6, fc = Math.min(21600, Math.max(20, v('cutoff') * Math.pow(2, v('envamt') * 5 * Math.max(0.3, v('fsus')))));
    const vow = v('fvowel'), fmix = fxHeard('formant') ? v('fmix') : 0, fq = [700 + 500 * vow, 1200 + 1000 * (1 - vow), 2600];
    for (let h = 1; h <= 64; h++) {
      let g = Math.sqrt(filterMag2(f0 * h, fc, v('reso'), v('mode')));
      if (fmix > 0) { const f = f0 * h; let p = 0; for (const c of fq) p = Math.max(p, Math.exp(-(((f - c) / (c * 0.18)) ** 2))); g *= 1 + fmix * (0.5 + v('freso') * 2.5) * p - fmix * 0.4; }
      SC.re[h] *= g; SC.im[h] *= g;
    }
  }
  const out = new Float32Array(SC.n);
  MorphEngine.synth(SC.re, SC.im, 64, SC.n, out, W.sR, W.sI);
  let pk = 1e-6; for (const x of out) pk = Math.max(pk, Math.abs(x));
  return { w: out, pk };
}
// is an effect switched on and not at rest at this morph? (its On/Off and its rest settings, as the engine judges it)
const fxHeard = t => { const s = FX_KIND.indexOf(t); return state.fxOn[s] && Object.entries(MorphEngine.FX_CLASSES[t].REST).some(([k, v0]) => MAC.val[IX[k]] !== v0); };
function fxMarks(v) {
  const on = t => fxHeard(t);
  return {
    drive: on('drive') ? v('dmix') * (0.2 + v('drive')) : 0, dshape: v('dshape'),
    mod: on('mod') ? v('mmix') * (0.3 + 0.7 * v('mdepth')) : 0, mrate: v('mrate'), mtype: v('mtype'),
    formant: on('formant') ? v('fmix') : 0, fvowel: v('fvowel'), freso: v('freso'),
    delay: on('delay') ? v('dlmix') : 0, dlfb: v('dlfb'), dlpp: v('dlpp'), dltime: v('dltime'),
    reverb: on('reverb') ? v('rvmix') : 0, rvsize: v('rvsize'), rvdecay: v('rvdecay'),
    crush: on('lofi') ? v('lchar') : 0, codec: on('lofi') ? v('lcodec') : 0, wow: on('lofi') ? Math.max(v('lwow'), v('lflut')) : 0, noise: on('lofi') ? v('lnmix') : 0,
    ott: on('ott') ? v('ottdepth') : 0,
  };
}
let scopeT = 0, scopeAnim = 0, scopeQueued = false;
// the Sound panel's wave is plain; the FX panel's carries the effects' marks (2026-11-11)
function drawScope(now) { drawWaveOn(scopeEl, false, now); return drawWaveOn(fxScopeEl, true, now); }
const NO_FX = { drive: 0, formant: 0, mod: 0, delay: 0, reverb: 0, crush: 0, codec: 0, wow: 0, noise: 0, ott: 0 };
function drawWaveOn(cv, withFx, now) {
  const c = prep(cv); if (!c) return false;
  const v = heardValues(), fx = withFx ? fxMarks(v) : NO_FX, g = c.g, H = c.h, Wd = c.w;
  const colM = mixColor(state.morph), ink = css('--ink');
  const gap = 6, mid0 = gap, midW = Wd - 2 * gap;   // only the wave heard now (2026-11-10): A and B show when a side is focused or the morph is at an end
  const t = (now || performance.now()) / 1000;
  // the wave heard now, with the effects' marks
  const { w, pk } = scopeWave(v);
  const n = SC.n, m = H / 2, amp = (H / 2 - 10) / pk * scopeGain();
  const shape = (x0) => {
    let y = x0;
    if (fx.ott > 0) y = Math.sign(y) * Math.pow(Math.abs(y), 1 - 0.6 * fx.ott);
    if (fx.drive > 0) {
      const k = 1 + 6 * fx.drive, sat = Math.tanh(k * y) / Math.tanh(k);
      const fold = Math.sin(y * (1 + 3 * fx.drive) * Math.PI / 2);
      y = y + (sat - y) * Math.min(1, fx.drive * 1.5); y = y + (fold - y) * fx.dshape * fx.drive;
    }
    if (fx.crush > 0.02) { const steps = Math.round(2 + 30 * (1 - fx.crush) ** 2); y = Math.round(y * steps) / steps; }
    return y;
  };
  const yAt = (i, ph) => {
    let j = i;
    if (fx.codec > 0.02) { const hold = 1 + Math.round(fx.codec * 10); j = Math.floor(i / hold) * hold; }
    const xs = (((j + ph) % n) + n) % n, k = Math.floor(xs), f = xs - k;
    const s = w[k] + (w[(k + 1) % n] - w[k]) * f;
    return shape(s / pk) * pk;
  };
  const wob = fx.wow > 0 ? fx.wow * 6 * Math.sin(t * 2.1) + fx.wow * 2 * Math.sin(t * 9.7) : 0;
  // one copy of the wave: phase, height, shift, and a width scale about the middle (for the echoes going into the distance)
  const vx = mid0 + midW / 2;
  const path = (ph, scale, dx, dy, sx = 1) => {
    g.beginPath();
    for (let i = 0; i <= n; i++) { const x = vx + (i / n - 0.5) * midW * sx + dx, y = m + dy - yAt(i, ph + wob) * amp * scale; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  };
  g.save();
  g.beginPath(); g.rect(mid0 - gap / 2, 0, midW + gap, H); g.clip();
  g.lineJoin = 'round'; g.lineCap = 'round';
  const rv = Math.min(1, fx.reverb * 1.6);
  /* reverb: the wave stands in a room. A floor in perspective runs from the middle line to the bottom (deeper, with more
     lines, as Size grows; its lines drift toward you), and the wave is mirrored on it (longer Decay, a stronger mirror) */
  if (fx.reverb > 0.01) {
    g.strokeStyle = colM; g.lineWidth = 1;
    const rows = 3 + Math.round(fx.rvsize * 7), scroll = (t * 0.22) % 1;
    for (let j = 0; j <= rows; j++) {
      const z = 1 + j - scroll; if (z < 1) continue;
      g.globalAlpha = 0.5 * rv * (1 - (z - 1) / (rows + 0.001)); const y = m + (H - m) / z;
      g.beginPath(); g.moveTo(mid0, y); g.lineTo(mid0 + midW, y); g.stroke();
    }
    for (let k = -9; k <= 9; k++) {
      g.globalAlpha = 0.28 * rv * (1 - Math.abs(k) / 11);
      g.beginPath(); g.moveTo(vx + k * midW * 0.012, m + (H - m) / (rows + 1)); g.lineTo(vx + k * midW * 0.16, H); g.stroke();
    }
    const dk = Math.min(1, Math.log(fx.rvdecay / 0.2) / Math.log(100));
    g.globalAlpha = rv * (0.2 + 0.35 * dk); g.lineWidth = 2; g.shadowColor = colM; g.shadowBlur = 4 + 8 * fx.rvsize;
    path(0, -(0.25 + 0.2 * dk), 0, (H - m) * 0.55); g.stroke(); g.shadowBlur = 0;
  } else { g.strokeStyle = css('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(mid0, m); g.lineTo(mid0 + midW, m); g.stroke(); }
  /* formant: three beams of light stand where the vowel's resonances are (low to high across the picture, as the Vowel
     moves them), narrower with more Resonance, each with a bright core and a marker top and bottom */
  if (fx.formant > 0.01) {
    const fa = Math.min(1, fx.formant * 1.5), lo = Math.log(380), hi = Math.log(3600);
    [700 + 500 * fx.fvowel, 1200 + 1000 * (1 - fx.fvowel), 2600].forEach((f, k) => {
      const x = mid0 + midW * (Math.log(f) - lo) / (hi - lo), bw = (7 + 26 * (1 - fx.freso)) * (1 - k * 0.12);
      g.fillStyle = colM;
      for (let q = 1; q <= 5; q++) {   // a soft cone, wider toward the floor
        const w0 = bw * 0.45 * q / 5, w1 = bw * 1.25 * q / 5; g.globalAlpha = 0.085 * fa;
        g.beginPath(); g.moveTo(x - w0, 0); g.lineTo(x + w0, 0); g.lineTo(x + w1, H); g.lineTo(x - w1, H); g.closePath(); g.fill();
      }
      g.globalAlpha = 0.75 * fa; g.fillRect(x - 0.6, 0, 1.2, H);
      g.globalAlpha = fa; for (const [y0, d] of [[0, 1], [H, -1]]) { g.beginPath(); g.moveTo(x - 5, y0); g.lineTo(x + 5, y0); g.lineTo(x, y0 + d * 6); g.closePath(); g.fill(); }
    });
  }
  /* delay: the echoes leave the wave and travel into the distance, one every repeat (at the delay's own time), smaller and
     fainter as they go (further with more Feedback); Ping-pong sends them left and right in turn */
  if (fx.delay > 0.01) {
    const beats = [0.125, 1 / 6, 0.25, 1 / 3, 0.375, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3][Math.round(fx.dltime)] || 0.5;
    const per = Math.max(0.35, Math.min(2.4, beats * 60 / state.bpm)), ph = (t / per) % 1, turn = Math.floor(t / per);
    const g0 = 0.35 + fx.dlfb * 0.55, vy = m - H * 0.24;
    g.strokeStyle = colM;
    for (let r = 9; r >= 0; r--) {
      const z = r + ph, a = fx.delay * 1.7 * Math.pow(g0, z) * Math.min(1, z * 3);
      if (a < 0.02) continue;
      const sc = 1 / (1 + 0.42 * z), side = ((r - turn) & 1) ? -1 : 1;
      g.globalAlpha = Math.min(0.85, a); g.lineWidth = 0.8 + 1.8 * sc;
      path(0, sc, side * fx.dlpp * midW * 0.2 * (1 - sc), (vy - m) * (1 - sc), sc); g.stroke();
    }
  }
  /* modulation: strands wind around the wave like a helix and turn at the modulation's rate (more Depth, a wider helix;
     Type winds it tighter). The half of each strand behind the wave is drawn first and fainter, the front half over it. */
  const helix = front => {
    if (fx.mod <= 0.01) return;
    const N = 3, turns = 1.5 + 2.5 * fx.mtype, w = t * 2 * Math.PI * Math.min(2.5, 0.2 + fx.mrate * 0.45), Rr = fx.mod * H * 0.17, ma = Math.min(1, fx.mod * 1.7);
    g.strokeStyle = colM;
    for (let k = 0; k < N; k++) for (let c0 = 0; c0 < n; c0 += 8) {
      const thm = w + k * 2 * Math.PI / N + (c0 + 4) / n * turns * 2 * Math.PI, z = Math.cos(thm);
      if ((z > 0) !== front) continue;
      g.globalAlpha = ma * (0.16 + 0.6 * (z + 1) / 2); g.lineWidth = 1 + 1.6 * (z + 1) / 2;
      g.beginPath();
      for (let i = c0; i <= c0 + 8; i++) {
        const th = w + k * 2 * Math.PI / N + i / n * turns * 2 * Math.PI, x = mid0 + i / n * midW, y = m - yAt(i, wob + Math.sin(th) * fx.mod * 5) * amp + Math.sin(th) * Rr;
        i === c0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  helix(false);
  // the wave itself; with reverb it glows (wider with Size)
  g.globalAlpha = 1;
  if (fx.reverb > 0.01) { g.shadowColor = colM; g.shadowBlur = 6 + 30 * fx.rvsize * rv; }
  g.strokeStyle = colM; g.lineWidth = 3 + 3 * fx.ott;
  path(0, 1, 0, 0); g.stroke();
  if (fx.reverb > 0.01) { g.globalAlpha = Math.min(0.6, fx.reverb) * 0.25; g.lineWidth = 8 + 16 * fx.rvsize; g.stroke(); }
  g.shadowBlur = 0; g.globalAlpha = 1;
  helix(true);
  g.globalAlpha = 1;
  // lo-fi noise: specks around the line
  if (fx.noise > 0.01) {
    g.fillStyle = ink; const cnt = Math.round(fx.noise * 260);
    for (let k = 0; k < cnt; k++) {
      const r1 = Math.abs(Math.sin(k * 12.9898 + Math.floor(t * 12) * 78.233)) % 1, r2 = Math.abs(Math.sin(k * 4.1414 + Math.floor(t * 12) * 3.7)) % 1;
      g.globalAlpha = 0.25 + 0.4 * r2; g.fillRect(mid0 + r1 * midW, m + (r2 - 0.5) * H * 0.9, 1.6, 1.6);
    }
    g.globalAlpha = 1;
  }
  g.restore();
  return fx.mod > 0.01 || fx.wow > 0.01 || fx.noise > 0.01 || fx.delay > 0.01 || fx.reverb > 0.01;
}
// draw now (next frame); while a moving mark is on screen, keep animating at about 30 frames a second
function drawScopeSoon() {
  if (scopeQueued) return; scopeQueued = true;
  requestAnimationFrame(now => { scopeQueued = false; const moving = drawScope(now); if (moving && !scopeAnim) scopeLoop(); });
}
function scopeLoop() {
  let last = 0;
  const step = now => {
    if (document.hidden) { scopeAnim = 0; return; }
    if (now - last > 33) { last = now; if (!drawScope(now)) { scopeAnim = 0; return; } }
    scopeAnim = requestAnimationFrame(step);
  };
  scopeAnim = requestAnimationFrame(step);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) drawScopeSoon(); });
