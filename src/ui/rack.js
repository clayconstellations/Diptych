/* =====================================================================
   FX RACK (2026-11-23): more control over the effects without crowding the
   FX panel. The panel keeps its two macros; Edit opens a rack over it with a
   row for each of the seven effects: its name, an On / Off pill, and its mix
   and one or two most characterful knobs. Tapping an effect's name opens the
   rest of that effect's knobs under its row. The knobs are the real ones
   (moved here from the developer sections; the developer view keeps them
   there and has no rack). The FX dice still roll everything.
   ===================================================================== */
var rackOpen = false;
const RACK_KEYS = { drive: ['dmix', 'drive', 'dshape'], formant: ['fmix', 'fvowel', 'freso'], mod: ['mmix', 'mtype', 'mrate'], delay: ['dlmix', 'dltime', 'dlfb'],
  reverb: ['rvmix', 'rvsize', 'rvdecay'], lofi: ['lchar', 'lwow', 'lnmix'], ott: ['ottdepth', 'otttime'] };
function updateRack() { document.querySelectorAll('[data-rackfx]').forEach(p => setPill(p, state.fxOn[+p.dataset.rackfx] ? 0 : 1)); }
if (!devView) {
  const rack = $('fxRack'), rows = $('rackRows');
  FX_KIND.forEach((eng, s) => {
    const row = document.createElement('div'); row.className = 'rrow'; row.dataset.eng = eng;
    row.innerHTML = `<div class="rhead"><button type="button" class="key rname" aria-expanded="false">${FX_NAMES[s]}</button><button type="button" class="pill" id="rackFx${s}" data-rackfx="${s}" role="switch" aria-label="${FX_NAMES[s]} on or off"><span>On</span><span>Off</span></button></div><div class="knobs rknobs"></div><div class="knobs rmore" hidden></div>`;
    rows.appendChild(row);
    const main = row.querySelector('.rknobs'), more = row.querySelector('.rmore');
    DEFS.forEach((d, i) => { if (d.kind !== 'fx' || d.slot !== s || d.opts) return; const kn = $('k' + i).closest('.kn'); kn.classList.remove('adv'); (RACK_KEYS[eng].includes(d.key) ? main : more).appendChild(kn); });
    RACK_KEYS[eng].forEach(k => main.appendChild($('k' + IX[k]).closest('.kn')));   // in the listed order
    const name = row.querySelector('.rname');
    if (!more.children.length) name.disabled = true;
    name.addEventListener('click', () => { more.hidden = !more.hidden; name.setAttribute('aria-expanded', String(!more.hidden)); row.classList.toggle('open', !more.hidden); for (const k of Object.keys(liveCache)) delete liveCache[k]; updateKnobs(); });
    onPill(row.querySelector('.pill'), k => { state.fxOn[s] = k === 0; if (ready) send({ type:'bypass', i: s, on: state.fxOn[s] }); updateRack(); drawWaves(); save(); });
  });
  const setRack = on => { rackOpen = on; rack.hidden = !on; if (on) { updateRack(); updateKnobs(); $('rackDone').focus({ preventScroll: true }); } else $('fxEdit').focus({ preventScroll: true }); };
  $('fxEdit').addEventListener('click', () => setRack(true));
  $('rackDone').addEventListener('click', () => setRack(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && rackOpen) setRack(false); });
  updateRack();
} else { $('fxEdit').hidden = true; }
