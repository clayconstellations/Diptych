// The redesign of 2026-11-10 (DESIGN.md section 17): side focus, undo and redo per gesture, the wave display's effect marks.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const dragKnob = async (page, i, dy) => {
  const box = await page.locator('#k' + i).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.1;   // the top of the ring, away from the curve in the center
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + dy, { steps: 5 }); await page.mouse.up();
};

test('side focus: a knob edits only the focused side, one undo step per drag, and redo brings it back', async ({ page }) => {
  await openSynth(page, { dev: false });
  const i = await page.evaluate(() => IX.mbright);
  await page.click('[data-focus="B"]');
  expect(await page.evaluate(i => [$('k' + i).classList.contains('kf-B'), $('hA' + i).style.display], i)).toEqual([true, 'none']);
  const before = await page.evaluate(i => [state.A[i], state.B[i], undoStack.length], i);
  await dragKnob(page, i, -60);
  const after = await page.evaluate(i => [state.A[i], state.B[i], undoStack.length], i);
  expect(after[0]).toBe(before[0]);              // A untouched
  expect(after[1]).toBeGreaterThan(before[1]);   // B moved up
  expect(after[2]).toBe(before[2] + 1);          // one step for the whole drag
  await page.click('#undo');
  expect(await page.evaluate(i => state.B[i], i)).toBe(before[1]);
  await page.click('#redo');
  expect(await page.evaluate(i => state.B[i], i)).toBe(after[1]);
  // Ctrl+Z / Ctrl+Shift+Z
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(i => state.B[i], i)).toBe(before[1]);
  await page.keyboard.press('Control+Shift+z');
  expect(await page.evaluate(i => state.B[i], i)).toBe(after[1]);
  // back in Morph, both handles again
  await page.click('[data-focus="B"]');
  expect(await page.evaluate(i => [$('k' + i).classList.contains('kf-B'), $('hA' + i).style.display, focus], i)).toEqual([false, '', 'M']);
});

test('the wave display marks the effects heard at this morph, and FX wet at 0% clears them', async ({ page }) => {
  await openSynth(page, { dev: false });
  const marks = over => page.evaluate(over => {
    for (const k of ['A', 'B']) {
      for (const id of ['dmix', 'fmix', 'mmix', 'dlmix', 'rvmix', 'lwow', 'lflut', 'lchar', 'lnmix', 'ldrop', 'lcodec', 'ottdepth']) state[k][IX[id]] = 0;
      for (const [id, v] of Object.entries(over)) state[k][IX[id]] = v;
    }
    const m = fxMarks(heardValues());
    return Object.fromEntries(['drive', 'mod', 'delay', 'reverb', 'crush', 'noise', 'ott'].map(k => [k, m[k] > 0]));
  }, over);
  const none = { drive: false, mod: false, delay: false, reverb: false, crush: false, noise: false, ott: false };
  expect(await marks({})).toEqual(none);
  expect(await marks({ dlmix: 0.4, rvmix: 0.3, mwet: 0.5 })).toEqual({ ...none, delay: true, reverb: true });
  expect(await marks({ dmix: 0.5, drive: 0.5, lchar: 0.5, lnmix: 0.2, ottdepth: 0.3, mwet: 0.5 })).toEqual({ ...none, drive: true, crush: true, noise: true, ott: true });
  expect(await marks({ dlmix: 0.4, rvmix: 0.3, dmix: 0.5, mwet: 0 })).toEqual(none);   // FX wet 0%: every effect rests
  // an effect switched off (On/Off) leaves no mark
  await page.evaluate(() => { state.fxOn[FX_KIND.indexOf('delay')] = false; });
  expect(await marks({ dlmix: 0.4, mwet: 0.5 })).toEqual(none);
  // it draws without errors, at phone width
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => { drawScope(performance.now()); });
  expect(errors).toEqual([]);
});

test('the header holds play, tempo, undo and redo; tempo drags up and down', async ({ page }) => {
  await openSynth(page, { dev: false });
  const b0 = await page.evaluate(() => state.bpm);
  const box = await page.locator('#bpmBox').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 30, { steps: 3 }); await page.mouse.up();
  expect(await page.evaluate(() => state.bpm)).toBe(Math.min(200, b0 + 10));
  // no Copy, Swap, Reset or Mute buttons any more
  expect(await page.locator('#copyAB, #copyBA, #swap, #resetAll').count()).toBe(0);
  expect(await page.locator('#audioBtn').textContent()).toBe('Tap to start audio');
});

test('Set A captures what you hear: same values, morph moved to A; Set B on the pattern keeps the heard sequence', async ({ page }) => {
  await openSynth(page, { dev: false });
  await page.evaluate(() => { state.morph = 0.4; updateMorphUI(); });
  const heard = await page.evaluate(() => DEFS.map((d, i) => (d.single || d.seq || d.pair || d.group === 'Sequencer' || isLinked(i) ? null : resolveNorm(i))));
  await page.click('[data-focus="A"]', { modifiers: ['Shift'] });   // Shift-click A (or hold MORPH and tap A): capture into A
  const after = await page.evaluate(() => ({ morph: state.morph, now: DEFS.map((d, i) => resolveNorm(i)) }));
  expect(after.morph).toBe(0);
  heard.forEach((v, i) => { if (v !== null) expect(Math.abs(after.now[i] - v)).toBeLessThan(1e-9); });
  // the same gesture captures the sequence heard at the Pattern knob's value, played at that end
  const notesNow = await page.evaluate(() => { state.A[IX.pattern] = 0; state.B[IX.pattern] = 1; state.morph = 0.5; updateMorphUI(); seqCache = null;
    const s = buildSeq(), mm = resolveNorm(IX.pattern); return s.events.map(e => MorphEngine.seqEval(e, mm, state.walk, s.scale)).filter(Boolean).map(r => r.note); });
  await page.click('[data-focus="B"]', { modifiers: ['Shift'] });
  const notesB = await page.evaluate(() => { seqCache = null; const s = buildSeq(); return s.events.map(e => MorphEngine.seqEval(e, 1, state.walk, s.scale)).filter(Boolean).map(r => r.note); });
  expect(notesB.slice(0, 8)).toEqual(notesNow.slice(0, 8));
  expect(await page.evaluate(() => [focus, state.morph])).toEqual(['M', 1]);
  await page.click('#undo');
});

test('Position: one knob whose A and B handles are the two tables\' positions', async ({ page }) => {
  await openSynth(page, { dev: false });
  const r = await page.evaluate(() => { setParam('A', IX.wpos, 0.2); setParam('B', IX.wpos, 0.9);
    return [state.A[oi(0, 'posA')], state.A[oi(0, 'posB')]]; });
  expect(r).toEqual([0.2, 0.9]);
  // after a roll, the knob follows the positions the randomizer chose
  await page.evaluate(() => bulk(() => randomizeAll()));
  expect(await page.evaluate(() => [state.A[IX.wpos] === state.A[oi(0, 'posA')], state.B[IX.wpos] === state.A[oi(0, 'posB')]])).toEqual([true, true]);
});

test('the MORPH cap brings back the morph view; Settings change the colours and hold Mono / Poly', async ({ page }) => {
  await openSynth(page, { dev: false });
  await page.evaluate(() => { state.morph = 0.3; updateMorphUI(); });
  await page.click('[data-focus="B"]');
  expect(await page.evaluate(() => [focus, state.morph])).toEqual(['B', 1]);
  await page.click('#mcap');
  expect(await page.evaluate(() => [focus, state.morph])).toEqual(['M', 0.3]);
  expect(await page.evaluate(() => parseFloat($('mcap').style.left))).toBeGreaterThan(5);   // and the cap is drawn there, not at A's end
  await page.click('#setBtn');
  await expect(page.locator('#settings')).toBeVisible();
  await page.click('[data-scheme="1"]');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--a').trim().toUpperCase())).toBe('#0A35C9');
  await page.click('#monoPill');
  expect(await page.evaluate(() => state.mono)).toBe(true);
  await page.click('#setDone');
  await expect(page.locator('#settings')).toBeHidden();
});

test('each panel\'s dice roll only their part: Envelope, FX and Sound leave the rest alone', async ({ page }) => {
  await openSynth(page, { dev: false });
  for (const part of ['amp', 'fx', 'synth']) {
    const r = await page.evaluate(part => {
      const A0 = state.A.slice(), B0 = state.B.slice(), seq0 = JSON.stringify(state.seq), t0 = tables[0].A;
      bulk(() => rollPart(part, 'M', 1));
      const changed = DEFS.filter((d, i) => state.A[i] !== A0[i] || state.B[i] !== B0[i]);
      return { outside: changed.filter(d => !PART[part](d) && !d.pair && !d.single).map(d => d.id), inside: changed.filter(d => PART[part](d)).length,
        seq: JSON.stringify(state.seq) === seq0, table: tables[0].A === t0 };
    }, part);
    expect(r.outside).toEqual([]);
    expect(r.inside).toBeGreaterThan(0);
    expect(r.seq).toBe(true);
    if (part !== 'synth') expect(r.table).toBe(true);
  }
});

test('the header\'s Everything die rolls every part and both sequences; hold MORPH and tap B captures into B', async ({ page }) => {
  await openSynth(page, { dev: false });
  const r = await page.evaluate(() => {
    state.panelLocks.seq = false;   // the Seq section is locked by default
    const A0 = state.A.slice(), seq0 = JSON.stringify(state.seq);
    bulk(() => rollAll(1));
    const parts = ['synth', 'amp', 'fx'].map(p => DEFS.some((d, i) => PART[p](d) && state.A[i] !== A0[i]));
    return { parts, seq: JSON.stringify(state.seq) !== seq0, faces: document.querySelector('.alldie .face').children.length };
  });
  expect(r).toEqual({ parts: [true, true, true], seq: true, faces: 5 });
  // hold the MORPH cap (one pointer) and tap B (another)
  await page.evaluate(() => { state.morph = 0.6; updateMorphUI(); });
  const heard = await page.evaluate(() => resolveNorm(IX.mbright));
  await page.evaluate(() => { holdingMorph = true; document.querySelector('[data-focus="B"]').click(); holdingMorph = false; });
  expect(await page.evaluate(() => [state.morph, focus, Math.abs(state.B[IX.mbright] - resolveNorm(IX.mbright))])).toEqual([1, 'M', 0]);
  expect(await page.evaluate(() => state.B[IX.mbright])).toBeCloseTo(heard, 9);
});

test('a die rolls as it is pulled, keeps where you let go (one undo step), and back at the start draws new paths', async ({ page }) => {
  await openSynth(page, { dev: false });
  const box = await page.locator('.dicetrack[data-what="synth"][data-side="M"]').boundingBox();
  const x = box.x + box.width / 2, y0 = box.y + box.height - 14, at = f => y0 - (box.height - 28) * f;
  const pos = () => page.evaluate(() => state.A[oi(0, 'posA')]);
  const p0 = await pos(), u0 = await page.evaluate(() => undoStack.length);
  await page.mouse.move(x, y0); await page.mouse.down();
  const hx = () => page.evaluate(() => dieHeld.x);
  await page.mouse.move(x, at(0.4), { steps: 3 }); await page.waitForTimeout(80); const p4 = await pos(), x4 = await hx();
  await page.mouse.move(x, at(0.8), { steps: 3 }); await page.waitForTimeout(80); const p8 = await pos(), x8 = await hx();
  expect((p8 - p0) / x8).toBeCloseTo((p4 - p0) / x4, 5);   // the same path, further along it
  await page.mouse.move(x, y0 + 6, { steps: 3 }); await page.waitForTimeout(80);
  expect(await pos()).toBe(p0);                                        // back at the start: nothing changed
  await page.mouse.move(x, at(0.8), { steps: 3 }); await page.waitForTimeout(80);
  expect(await pos()).not.toBe(p8);                                    // a new path
  await page.mouse.up();
  expect(await page.evaluate(() => undoStack.length)).toBe(u0 + 1);
  await page.click('#undo');
  expect(await pos()).toBe(p0);
});

test('hold a die and tap a knob: only that knob rolls', async ({ page }) => {
  await openSynth(page, { dev: false });
  const before = await page.evaluate(() => [state.A.slice(), state.B.slice()]);
  const box = await page.locator('.dicetrack[data-what="synth"][data-side="A"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 14); await page.mouse.down();
  await page.evaluate(() => $('k' + IX.reso).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 })));
  await page.mouse.up();
  const changed = await page.evaluate(b => DEFS.map((d, i) => (state.A[i] !== b[0][i] ? 'A:' + d.id : state.B[i] !== b[1][i] ? 'B:' + d.id : null)).filter(Boolean), before);
  expect(changed).toEqual(['A:reso']);
});

test('global presets from the menu at the top; side presets share one pool and leave the sequences alone; hexagons', async ({ page }) => {
  await openSynth(page, { dev: false, storage: {} });
  const pick = async (anchor, text) => { await page.click(anchor); await page.locator('.menu .mitem', { hasText: text }).first().click(); };
  const nameIt = async n => { await page.fill('#nameIn', n); await page.click('#nameOk'); };
  await pick('#gPre', 'Save as'); await nameIt('First');
  const first = await page.evaluate(() => state.A[IX.cutoff]);
  expect(await page.locator('#gPre').textContent()).toContain('First');
  await page.evaluate(() => bulk(() => randomizeAll()));
  await pick('#gPre', 'Save as'); await nameIt('Second');
  await pick('#gPre', 'First');
  expect(await page.evaluate(() => [state.A[IX.cutoff], state.presetName])).toEqual([first, 'First']);
  await pick('#gPre', 'Random preset');
  expect(await page.evaluate(() => state.presetName)).toBe('Second');   // never the one just loaded, when there is a choice
  // side presets: save A, load it into B; B takes A's sound, A and the sequences stay
  await pick('[data-spre="A"]', 'Save side A'); await nameIt('Bright');
  const r = await page.evaluate(() => ({ a: state.A.slice(), seq: JSON.stringify(state.seq), cut: state.A[IX.cutoff], tabA: tables[0].A.name }));
  await pick('[data-spre="B"]', 'Bright');
  const after = await page.evaluate(r => ({ a: state.A.every((x, i) => DEFS[i].single || x === r.a[i]), seq: JSON.stringify(state.seq) === r.seq, cutB: state.B[IX.cutoff] === r.cut, tab: tables[0].B.name === r.tabA, name: state.sideNames.B }), r);
  expect(after).toEqual({ a: true, seq: true, cutB: true, tab: true, name: 'Bright' });
  // hexagons, in key or chromatic (every note present in chromatic)
  await page.click('#kbPill > span:nth-child(3)');
  const inKey = await page.evaluate(() => [...document.querySelectorAll('.hexcell')].every(c => !c.classList.contains('out')));
  await page.evaluate(() => { kbChrom = true; buildKeys(); });
  const chrom = await page.evaluate(() => { const pcs = new Set(SCALES[state.seq.A.scale].map(x => (x + state.seq.A.root) % 12)), cells = [...document.querySelectorAll('.hexcell')];
    const seen = new Set(cells.map(c => ((base() + +c.dataset.off) % 12 + 12) % 12));
    return { marks: cells.every(c => c.classList.contains('out') === !pcs.has(((base() + +c.dataset.off) % 12 + 12) % 12)), all12: seen.size === 12 }; });
  expect([inKey, chrom]).toEqual([true, { marks: true, all12: true }]);
});

test('the lanes keep their size on a 3x screen', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await openSynth(page, { dev: false });
  await page.locator('[data-tab="seq"]').tap();
  const h = () => page.evaluate(() => ['lnA', 'lnL', 'lnB'].map(id => Math.round($(id).getBoundingClientRect().height)));
  const a = await h(); await page.evaluate(() => { for (let k = 0; k < 5; k++) drawLanes(); }); await page.waitForTimeout(100); const b = await h();
  expect(b).toEqual(a); expect(Math.max(...a) - Math.min(...a)).toBeLessThanOrEqual(1);
  await page.close();
});

test('FX dice move the FX macros; a locked knob and a locked section stay; Position\'s padlock holds the table positions', async ({ page }) => {
  await openSynth(page, { dev: false });
  const r = await page.evaluate(() => {
    const out = {};
    bulk(() => rollPart('fx', 'M', 1)); out.macros = [state.A[IX.mfx], state.B[IX.mwet]].every(x => x !== 0.5);
    state.locks.mfx = true; const m0 = state.A[IX.mfx]; bulk(() => rollPart('fx', 'M', 1)); out.locked = state.A[IX.mfx] === m0;
    state.locks.wpos = true; const p0 = state.A[oi(0, 'posA')]; bulk(() => rollPart('synth', 'M', 1)); out.pos = state.A[oi(0, 'posA')] === p0;
    state.panelLocks.amp = true; state.panelLocks.seq = true; const a0 = state.A[IX.adec], q0 = JSON.stringify(state.seq);
    bulk(() => rollAll(1)); out.section = state.A[IX.adec] === a0 && JSON.stringify(state.seq) === q0;
    return out;
  });
  expect(r).toEqual({ macros: true, locked: true, pos: true, section: true });
  // the padlock and chain under a knob, and the section padlock in a panel's title
  await page.click(`[data-plink="mbright"]`);
  expect(await page.evaluate(() => [!!state.links.mbright, state.A[IX.mbright] === state.B[IX.mbright]])).toEqual([true, true]);
  await page.click('[data-panellock="synth"]');
  expect(await page.evaluate(() => [state.panelLocks.synth, document.querySelector('.panel[data-panel="synth"]').classList.contains('plocked')])).toEqual([true, true]);
});

test('the FX rack: every effect\'s On / Off and knobs; a built-in side preset loads into one side', async ({ page }) => {
  await openSynth(page, { dev: false });
  await page.click('#fxEdit');
  expect(await page.evaluate(() => [...document.querySelectorAll('.rrow')].map(r => r.querySelectorAll('.rknobs .kn').length))).toEqual([2, 3, 3, 3, 3, 3, 2]);
  await page.click('#rackFx3 > span:nth-child(2)');   // Delay off
  expect(await page.evaluate(() => state.fxOn[3])).toBe(false);
  await page.click('.rrow[data-eng="delay"] .rname');
  expect(await page.evaluate(() => [...document.querySelectorAll('.rrow[data-eng="delay"] .rmore .kn')].filter(k => k.offsetParent).length)).toBe(1);   // Tone
  await page.click('#rackDone');
  const b0 = await page.evaluate(() => state.B.filter((_, i) => !DEFS[i].single).join());
  await page.click('[data-spre="A"]'); await page.locator('.menu .mitem', { hasText: 'Acid Line' }).click();
  const r = await page.evaluate(() => ({ name: state.sideNames.A, reso: +MorphEngine.denorm(DEFS[IX.reso], state.A[IX.reso]).toFixed(2), table: tables[0].A.name, on: state.A[oi(0, 'olevel')] > 0 }));
  expect(r).toEqual({ name: 'Acid Line', reso: 0.8, table: 'Basic shapes', on: true });
  expect(await page.evaluate(() => state.B.filter((_, i) => !DEFS[i].single).join())).toBe(b0);
  // the harmonic table: any note, its right neighbour (a major third) and its upper-right one (a fifth)
  expect(await page.evaluate(() => { kbHarm = true; const a = gridNote(0, 0, true), b = gridNote(1, 0, true), c = gridNote(0, 1, true); return [b.off - a.off, c.off - a.off]; })).toEqual([4, 7]);
});

test('a side preset never changes which table a side reads, so the other end of the morph is untouched; Swing and Gate reach the engine', async ({ page }) => {
  await openSynth(page, { dev: false });
  const render = () => page.evaluate(() => { const c = T.current(); return Array.from(T.render({ patch: c.patch, tables: c.tables, morph: 1, seconds: 0.3, events: [{ t: 0, type: 'on', note: 60 }] }).L.slice(0, 6000)).map(x => +x.toFixed(6)).join(); });
  await page.click('[data-spre="B"]'); await page.locator('.menu .mitem', { hasText: 'Warm Pad' }).click();
  expect(await page.evaluate(() => [state.A[oi(0, 'wave')], state.B[oi(0, 'wave')]])).toEqual([0, 1]);
  const atB = await render();
  await page.click('[data-spre="A"]'); await page.locator('.menu .mitem', { hasText: 'Acid Line' }).click();
  expect(await render()).toBe(atB);   // full B sounds the same whatever A holds
  // Swing delays every second sixteenth; Gate shortens the notes
  const r = await page.evaluate(() => {
    const defs = DEFS.map(({ id, key, min, max, curve, snap, kind, slot, eng }) => ({ id, key, min, max, curve, snap: !!snap, kind, slot, eng }));
    const run = (swing, gate) => { const e = new MorphEngine(48000, defs); const A = state.A.slice(); A[IX.sqswing] = norm(DEFS[IX.sqswing], swing); A[IX.sqgate] = norm(DEFS[IX.sqgate], gate);
      e.handle({ type: 'state', A, B: A, C: state.C, morph: 0 }); e.handle({ type: 'bpm', v: 120 });
      e.handle({ type: 'seq', seq: { events: [0, 12, 24, 36].map(t => ({ tick: t, thr: 0.5, a: { p: 60, v: 1, l: 12 }, b: { p: 60, v: 1, l: 12 } })), loop: 48, scale: { shared: Array(12).fill(true), change: Array(12).fill(null) } } });
      e.handle({ type: 'seqPlay', on: true });
      const on = [], off = []; const o1 = e.noteOn.bind(e), o2 = e.noteOff.bind(e); let n = 0;
      e.noteOn = (a, b) => { on.push(n); o1(a, b); }; e.noteOff = a => { off.push(n); o2(a); };
      const L = new Float32Array(128), R = new Float32Array(128);
      for (; n < 24000; n += 128) { L.fill(0); R.fill(0); e.render(L, R, 128); }
      return { on, off }; };
    const straight = run(0.5, 0.9), swung = run(0.75, 0.9), short = run(0.5, 0.3);
    return { second: swung.on[1] - straight.on[1], first: swung.on[0] - straight.on[0], shorter: short.off[0] < straight.off[0] };
  });
  expect(r.first).toBe(0); expect(r.second).toBeGreaterThan(2000); expect(r.shorter).toBe(true);   // half a sixteenth at 120 bpm is 3000 samples
});
