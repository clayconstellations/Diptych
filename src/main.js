enhanceAll();   // the app's own dropdown menus (ui/menus.js)

buildKeys();
updateIcons();
applyLayout();
refreshAll();
updateBlendUI();
bakeEnv('A'); bakeEnv('B');   // an older session's Envelope macro becomes envelope times
// Every launch starts from a fresh random patch and fresh 16-step sequences. Undo brings back the last session.
bulk(() => { randomizeAll(); randSeqs(); state.locks.pattern = true; state.A[IX.pattern] = 0; state.B[IX.pattern] = 1; });   // Pattern starts locked at its full range: All A to All B (2026-11-26)
setBpm(85 + Math.random() * 50);
window.addEventListener('resize', () => { drawWaves(); if (ed.classList.contains('open')) { drawEditor(); renderStrip(); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawWaves(); if (ed.classList.contains('open')) { drawEditor(); renderStrip(); } });

window.__booted = true;
