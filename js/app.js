// ─────────────────────────────────────────────────────────
// App · participant flow
// ─────────────────────────────────────────────────────────

import { createSession, saveReaction, store } from './store.js';
import { initScene } from './scene.js';
import { initMediaPipe, initCamera, startLive, markFragmentStart, closeFragment } from './face.js';
import { initDeck, deck } from './cards.js';

const dom = {
  entry:       document.getElementById('entry'),
  btnEnter:    document.getElementById('btn-enter'),
  canvas:      document.getElementById('scene-canvas'),
  video:       document.getElementById('camera'),
  cards:       document.getElementById('cards'),
  countdown:   document.getElementById('countdown'),
  cdNumber:    document.getElementById('cd-number'),
  events:      document.getElementById('events'),
  liveDot:     document.getElementById('live-dot'),
  liveLabel:   document.getElementById('live-label'),
  counter:     document.getElementById('counter'),
  about:       document.getElementById('about'),
  scrim:       document.getElementById('scrim'),
  btnAbout:    document.getElementById('btn-about'),
  btnAboutX:   document.getElementById('btn-about-close'),
  ending:      document.getElementById('ending'),
  btnRestart:  document.getElementById('btn-restart'),
  endingStat:  document.getElementById('ending-stat'),
};

const session = { id: null, reactions: [] };

const EXPRESSION_LABELS = {
  risa:     'alegría detectada',
  asombro:  'asombro detectado',
  ironía:   'ironía detectada',
  sorpresa: 'sorpresa detectada',
  desdén:   'desdén detectado',
};

function newSessionId() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  return 'ses_' + Array.from(r).map(b => b.toString(16).padStart(2, '0')).join('');
}

function deviceInfo(demoMode) {
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  return {
    deviceType: touch ? 'táctil' : 'escritorio',
    width: window.innerWidth,
    height: window.innerHeight,
    demoMode,
  };
}

// ─────────── Scene boots immediately with the default mannequin ───────────

initScene(dom.canvas);

// Start loading MediaPipe in the background while the user reads the entry
const mpPromise = initMediaPipe();

// ─────────── Entry flow ───────────

async function enter() {
  dom.entry.classList.add('leaving');
  setTimeout(() => dom.entry.hidden = true, 800);

  session.id = newSessionId();

  // Request camera (user prompt)
  const camOk = await initCamera(dom.video);
  const mpOk = await mpPromise;
  const demoMode = !(mpOk && camOk);

  await createSession(session.id, deviceInfo(demoMode));

  if (!demoMode) {
    await runCountdown();
    startLive(onExpressionEvent);
    dom.liveDot.classList.add('active');
    dom.liveLabel.textContent = 'procesamiento local';
  } else {
    dom.liveDot.classList.add('active');
    dom.liveLabel.textContent = 'modo demostración';
  }

  // Mount the fragment deck
  initDeck(dom.cards, onFragmentChange);
  markFragmentStart();
}

dom.btnEnter.addEventListener('click', enter);

// ─────────── Countdown ───────────

async function runCountdown() {
  dom.countdown.hidden = false;
  // 10 → 1, slower pace so the viewer settles with the mannequin
  for (let n = 10; n >= 1; n--) {
    dom.cdNumber.textContent = String(n);
    dom.cdNumber.classList.remove('countdown-pulse');
    void dom.cdNumber.offsetWidth;
    dom.cdNumber.classList.add('countdown-pulse');
    await wait(1000);
  }
  dom.countdown.hidden = true;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────── Fragment lifecycle ───────────

async function onFragmentChange(idx, fragment) {
  // Close out previous fragment
  const previous = closeFragment();
  if (previous) {
    const prevFrag = idx > 0 ? deck.activeIdx > 0 ? null : null : null;
    // We need to reference the fragment that just ended, not the current.
    // Simplest: save index-1
    const prevIdx = idx - 1;
    const { FRAGMENTS } = await import('./fragments.js');
    const f = FRAGMENTS[prevIdx];
    if (f) {
      const row = {
        session_id: session.id,
        fragment_id: f.id,
        fragment_order: prevIdx + 1,
        register: f.register,
        recorded_at: new Date().toISOString(),
        demo_mode: store.mode === 'local',
        ...previous,
      };
      session.reactions.push(row);
      await saveReaction(row);
    }
  }

  // If no more fragments → end
  if (!fragment) {
    showEnding();
    return;
  }

  dom.counter.innerHTML = `<strong>${String(idx + 1).padStart(2, '0')}</strong> / 05`;
  markFragmentStart();
}

// ─────────── Expression events ───────────

function onExpressionEvent(ev) {
  const el = document.createElement('div');
  el.className = 'event';
  const label = EXPRESSION_LABELS[ev.name] || ev.name;
  el.innerHTML = `
    <span class="label">${label}</span>
    <span class="delta">Δ +${ev.delta.toFixed(2)}</span>
  `;
  dom.events.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

// ─────────── Ending ───────────

function showEnding() {
  dom.ending.hidden = false;
  const n = session.reactions.length;
  dom.endingStat.innerHTML = `<span class="n">${n}</span> fragmento${n === 1 ? '' : 's'} registrado${n === 1 ? '' : 's'}`;
}

dom.btnRestart.addEventListener('click', () => {
  session.id = newSessionId();
  session.reactions = [];
  dom.ending.hidden = true;
  deck.activeIdx = 0;
  initDeck(dom.cards, onFragmentChange);
  markFragmentStart();
});

// ─────────── About panel ───────────

function openAbout() {
  dom.about.classList.add('open');
  dom.scrim.classList.add('open');
}
function closeAbout() {
  dom.about.classList.remove('open');
  dom.scrim.classList.remove('open');
}

dom.btnAbout.addEventListener('click', openAbout);
dom.btnAboutX.addEventListener('click', closeAbout);
dom.scrim.addEventListener('click', closeAbout);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAbout();
});
