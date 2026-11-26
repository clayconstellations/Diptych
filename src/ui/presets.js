/* =====================================================================
   PRESETS (2026-11-11; DESIGN.md section 15, items 1 and 2)
   Global presets, as in most plugins: a menu at the top showing the current
   preset's name. A global preset holds everything: both sides, curves, locks
   and links, the wavetables, the samples' references, both sequences, tempo
   and Walk / Swap. The menu also has a die (a random preset, never the one
   just loaded when there is a choice), Save, Save as and Delete.
   Side presets: a menu above each of A and B. One pool for both sides, so any
   sound can morph into any other: a side preset holds one side's sound (every
   morphing value of that side, its table position, its wavetable and sample),
   never sequences, curves, locks or links. Loading one into B changes only B.
   Both pools live in this browser (localStorage); loading is one undo step.
   ===================================================================== */
const PRE_KEY = 'diptych-presets', SIDE_KEY = 'diptych-sides';
const readList = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const writeList = (k, list) => { try { localStorage.setItem(k, JSON.stringify(list)); return true; } catch (e) { return false; } };
const esc = t => String(t).replace(/[<&]/g, '');
if (typeof state.presetName !== 'string') state.presetName = '';
if (!state.sideNames || typeof state.sideNames !== 'object') state.sideNames = { A: '', B: '' };
let lastPreset = -1;
/* ---------- a name, asked in the app's own sheet ---------- */
function askName(title, def, ok) {
  $('nameTitle').textContent = title; $('nameIn').value = def || ''; $('nameOk').textContent = 'Save';
  $('nameSheet').hidden = false; setTimeout(() => { $('nameIn').focus(); $('nameIn').select(); }, 30);
  const done = v => { $('nameSheet').hidden = true; $('nameOk').onclick = $('nameCancel').onclick = $('nameIn').onkeydown = null; if (v !== null) ok(v); };
  $('nameOk').onclick = () => done(($('nameIn').value || '').trim() || def || 'Untitled');
  $('nameCancel').onclick = () => done(null);
  $('nameIn').onkeydown = e => { if (e.key === 'Enter') $('nameOk').click(); else if (e.key === 'Escape') done(null); };
}
/* ---------- global ---------- */
function patchNow() {
  return { ver: STORE_VER, ids: DEFS.map(d => d.id), A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), morph: savedMorph(),
    locks: { ...state.locks }, secLocks: { ...state.secLocks }, panelLocks: { ...state.panelLocks }, links: { ...state.links }, linkMem: JSON.parse(JSON.stringify(state.linkMem)),
    oscOn: state.oscOn.slice(), fxOn: state.fxOn.slice(), smp: JSON.parse(JSON.stringify(state.smp)), seq: JSON.parse(JSON.stringify(state.seq)),
    bpm: state.bpm, walk: state.walk, sideNames: { ...state.sideNames },
    tables: tables.map(t => ({ A: { name: t.A.name, frames: t.A.frames.map(enc) }, B: { name: t.B.name, frames: t.B.frames.map(enc) } })) };
}
function loadPreset(k) {
  const p = readList(PRE_KEY)[k]; if (!p) return;
  bulk(() => {
    migrateVals(p);
    p.ids.forEach((id, j) => { const i = IX[id]; if (i === undefined) return; state.A[i] = clamp(+p.A[j]); state.B[i] = clamp(+p.B[j]); state.C[i] = clampC(+p.C[j] || 0); });
    for (const key of ['locks', 'secLocks', 'links', 'linkMem', 'panelLocks']) if (p[key]) state[key] = JSON.parse(JSON.stringify(p[key]));
    updatePanelLocks();
    if (Array.isArray(p.oscOn)) state.oscOn = OSC_KIND.map((_, s) => p.oscOn[s] !== false);
    if (Array.isArray(p.fxOn)) state.fxOn = p.fxOn.map(Boolean);
    if (p.smp) state.smp = JSON.parse(JSON.stringify(p.smp));
    if (p.seq) { state.seq = JSON.parse(JSON.stringify(p.seq)); fixSeq(state.seq.A); fixSeq(state.seq.B); }
    if (typeof p.walk === 'boolean') state.walk = p.walk;
    (p.tables || []).slice(0, WT_SLOTS.length).forEach((t, s) => ['A', 'B'].forEach(side => { const d = t && decTable(t[side]); if (d) tables[s][side] = d; }));
    if (focus === 'M') state.morph = clamp(+p.morph || 0); else focusMem = clamp(+p.morph || 0);
    bakeEnv('A'); bakeEnv('B');
    state.presetName = p.name; state.sideNames = p.sideNames ? { ...p.sideNames } : { A: '', B: '' };
  });
  if (p.bpm) setBpm(p.bpm);
  updateWalkUI(); if (ready) send({ type:'walk', v: state.walk });
  lastPreset = k; presetLabels();
}
function saveGlobal(name) {
  const list = readList(PRE_KEY), p = { name, ...patchNow() }, k = list.findIndex(x => x.name === name);
  if (k >= 0) list[k] = p; else list.push(p);
  if (writeList(PRE_KEY, list)) { state.presetName = name; lastPreset = k >= 0 ? k : list.length - 1; save(); presetLabels(); }
}
function randomPreset() {
  const n = readList(PRE_KEY).length; if (!n) return;
  let k = Math.floor(Math.random() * n); if (n > 1 && k === lastPreset) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n;
  loadPreset(k);
}
$('gPre').addEventListener('click', () => {
  const b = $('gPre'); if (menuOpen && menuOpen.anchor === b) { closeMenu(); return; }
  const list = readList(PRE_KEY), cur = state.presetName;
  const items = [{ label: '⚄  Random preset', act: 'rand', cls: 'act' + (list.length ? '' : ' off') }, { sep: true }];
  if (list.length) items.push(...list.map((p, k) => ({ label: p.name, k, on: p.name === cur }))); else items.push({ head: 'No presets yet' });
  items.push({ sep: true });
  if (cur) items.push({ label: `Save "${cur}"`, act: 'save', cls: 'act' });
  items.push({ label: 'Save as…', act: 'saveas', cls: 'act' });
  if (cur && list.some(p => p.name === cur)) items.push({ label: `Delete "${cur}"`, act: 'del', cls: 'act' });
  openMenu(b, items, it => {
    if (it.act === 'rand') randomPreset();
    else if (it.act === 'save') saveGlobal(cur);
    else if (it.act === 'saveas') askName('Save preset', cur || `Sound ${list.length + 1}`, saveGlobal);
    else if (it.act === 'del') { writeList(PRE_KEY, list.filter(p => p.name !== cur)); state.presetName = ''; lastPreset = -1; save(); presetLabels(); }
    else if (it.k !== undefined) loadPreset(it.k);
  }, { label: 'Presets' });
});
/* ---------- side presets (one pool for A and B) ---------- */
/* Not in a side preset: Wave, Sample and Patch. They say which side's table a side reads (A 0%, B 100%); carried in a
   preset they made B read table A, so changing A's preset changed the sound at full B (2026-11-23). */
const CROSS = new Set(['wave', 'sample', 'fmx']);
const sideKeys = () => DEFS.map((d, i) => i).filter(i => { const d = DEFS[i]; return !d.single && !d.seq && !d.pair && d.group !== 'Sequencer' && !isLinked(i) && !CROSS.has(d.key); });
function sideNow(k) {
  const vals = {}; sideKeys().forEach(i => { vals[DEFS[i].id] = state[k][i]; });
  return { vals, pos: state[k][IX.wpos], table: { name: tables[0][k].name, frames: tables[0][k].frames.map(enc) }, smp: state.smp[k] ? { ...state.smp[k] } : null };
}
/* Ten built-in side presets (2026-11-23), written in real units over a plain base (one wavetable, every effect off,
   the macros at 50%); the wavetable is one of the built-in tables. They can't be deleted. Loading one level-matches
   it like a random roll. */
const SIDE_BASE = { 'o1.olevel': 0.8, 'o1.wave': 0, 'o1.unison': 0, 'o1.opan': 0, 'o1.byp': 0, 'o2.olevel': 0, 'o3.olevel': 0, 'o4.olevel': 0, 'o5.olevel': 0,
  harm: 1, glide: 0, vdepth: 0, cutoff: 3000, reso: 0.2, mode: 0, envamt: 0.3, keytrack: 0.5, fatk: 0.003, fdec: 0.5, fsus: 0.3, frel: 0.4,
  aatk: 0.005, adec: 0.7, asus: 0.6, arel: 0.35, menv: 0.5, mbright: 0.5, mfx: 0.5, mwet: 0.5,
  dmix: 0, fmix: 0, mmix: 0, dlmix: 0, rvmix: 0, lwow: 0, lflut: 0, lchar: 0, lnmix: 0, ldrop: 0, lcodec: 0, ottdepth: 0, ottgl: 0, ottgm: 0, ottgh: 0, ottout: 0 };
const SIDE_FACTORY = [
  ['Glass Pluck', 'Harmonic stack', 0.35, { cutoff: 2200, reso: 0.3, envamt: 0.6, fdec: 0.25, fsus: 0.1, menv: 0.12, dltime: 7, dlfb: 0.45, dlmix: 0.25, rvmix: 0.2, rvsize: 0.6, rvdecay: 2.5 }],
  ['Warm Pad', 'Vowel formants', 0.3, { cutoff: 900, envamt: 0.2, fatk: 0.8, menv: 0.9, 'o1.unison': 0.6, mtype: 0, mrate: 0.3, mdepth: 0.5, mmix: 0.5, rvmix: 0.4, rvsize: 0.8, rvdecay: 5 }],
  ['Round Bass', 'Basic shapes', 0.75, { cutoff: 300, reso: 0.35, envamt: 0.45, fdec: 0.3, fsus: 0.2, keytrack: 0.3, menv: 0.3, drive: 0.4, dshape: 0.1, dmix: 0.5 }],
  ['Acid Line', 'Basic shapes', 0.66, { cutoff: 400, reso: 0.8, envamt: 0.7, fdec: 0.18, fsus: 0.05, menv: 0.2, glide: 0.06, drive: 0.5, dshape: 0.3, dmix: 0.4 }],
  ['Hollow Organ', 'Pulse width', 0, { cutoff: 3000, reso: 0.1, envamt: 0, aatk: 0.005, adec: 0.4, asus: 0.9, arel: 0.15, menv: 0.55, mtype: 1, mrate: 0.3, mdepth: 0.6, mfb: 0.4, mmix: 0.45 }],
  ['Shimmer Bell', 'Sync sweep', 0.6, { cutoff: 6000, envamt: 0.2, fdec: 1.2, menv: 0.35, rvmix: 0.5, rvsize: 0.9, rvdecay: 8, rvdamp: 0.3, dltime: 8, dlfb: 0.4, dlmix: 0.2 }],
  ['Tape Keys', 'Basic shapes', 0.33, { cutoff: 1800, envamt: 0.35, menv: 0.3, lwow: 0.35, lflut: 0.3, lchar: 0.5, lnoise: 0.2, lnmix: 0.12, rvmix: 0.15 }],
  ['Vowel Lead', 'Vowel formants', 0.7, { cutoff: 4000, envamt: 0.25, menv: 0.5, vdepth: 0.25, vfade: 0.4, vrate: 5.5, fvowel: 0.3, freso: 0.6, fmix: 0.6, dltime: 5, dlfb: 0.35, dlmix: 0.2 }],
  ['Crushed Square', 'Pulse width', 0.5, { cutoff: 5000, envamt: 0.1, menv: 0.4, drive: 0.8, dshape: 0.7, dmix: 0.9, lcodec: 0.4, ottdepth: 0.5, otttime: 0.6 }],
  ['Night Drone', 'Harmonic stack', 0.9, { cutoff: 500, reso: 0.5, mode: 0.5, envamt: 0.3, fatk: 2, fdec: 4, fsus: 0.7, menv: 1, 'o1.unison': 0.9, mtype: 0.5, mrate: 0.08, mdepth: 0.7, mfb: 0.5, mmix: 0.5, rvmix: 0.6, rvsize: 0.9, rvdecay: 12 }],
].map(([name, preset, pos, over]) => {
  const vals = {};
  for (const [id, v] of Object.entries({ ...SIDE_BASE, ...over })) { const i = IX[id]; if (i !== undefined) vals[id] = quant(DEFS[i], clamp(norm(DEFS[i], v))); }
  return { name, factory: true, preset, pos, vals };
});
const sidePool = () => [...SIDE_FACTORY, ...readList(SIDE_KEY)];
function loadSide(k, j) {
  const p = sidePool()[j]; if (!p) return;
  bulk(() => {
    for (const [id, v] of Object.entries(p.vals || {})) { const i = IX[id]; if (i === undefined || DEFS[i].single || isLinked(i) || CROSS.has(DEFS[i].key) || state.locks[id]) continue; state[k][i] = clamp(+v); }
    DEFS.forEach((d, i) => { if (CROSS.has(d.key)) state[k][i] = k === 'A' ? 0 : 1; });   // each side reads its own table
    if (typeof p.pos === 'number') { const x = clamp(p.pos), q = oi(0, k === 'A' ? 'posA' : 'posB'); state.A[q] = state.B[q] = x; }
    const t = p.preset ? makeTable(p.preset) : decTable(p.table); if (t) tables[0][k] = t;
    if (p.smp && okRef(p.smp)) state.smp[k] = { ...p.smp };
    bakeEnv(k);
    if (p.factory) { analyzeTable(0, k); levelMatch(k); }
    state.sideNames[k] = p.name;
  });
  presetLabels();
}
function saveSide(k, name) {
  const list = readList(SIDE_KEY), p = { name, ...sideNow(k) }, j = list.findIndex(x => x.name === name);
  if (j >= 0) list[j] = p; else list.push(p);
  if (writeList(SIDE_KEY, list)) { state.sideNames[k] = name; save(); presetLabels(); }
}
document.querySelectorAll('[data-spre]').forEach(b => b.addEventListener('click', () => {
  if (menuOpen && menuOpen.anchor === b) { closeMenu(); return; }
  const k = b.dataset.spre, list = readList(SIDE_KEY), cur = state.sideNames[k], nf = SIDE_FACTORY.length;
  const items = [{ head: 'Built in' }, ...SIDE_FACTORY.map((p, j) => ({ label: p.name, j, on: p.name === cur }))];
  if (list.length) items.push({ sep: true }, { head: 'Yours' }, ...list.map((p, j) => ({ label: p.name, j: nf + j, on: p.name === cur })));
  items.push({ sep: true }, { label: `Save side ${k} as…`, act: 'saveas', cls: 'act' });
  if (cur && list.some(p => p.name === cur)) items.push({ label: `Delete "${cur}"`, act: 'del', cls: 'act' });
  openMenu(b, items, it => {
    if (it.act === 'saveas') askName(`Save side ${k}`, cur || `Side ${list.length + 1}`, n => saveSide(k, n));
    else if (it.act === 'del') { writeList(SIDE_KEY, list.filter(p => p.name !== cur)); ['A', 'B'].forEach(s => { if (state.sideNames[s] === cur) state.sideNames[s] = ''; }); save(); presetLabels(); }
    else if (it.j !== undefined) loadSide(k, it.j);
  }, { label: `Side ${k} presets`, up: true });
}));
function presetLabels() {
  $('gPre').innerHTML = `<span class="ddv">${esc(state.presetName || 'Untitled')}</span>${CHEV}`;
  document.querySelectorAll('[data-spre]').forEach(b => { const k = b.dataset.spre; b.innerHTML = `<b>${k}</b><span class="ddv">${esc(state.sideNames[k] || 'Untitled')}</span>${CHEV}`; });
}
presetLabels();
