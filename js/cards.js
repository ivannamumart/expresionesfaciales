// ─────────────────────────────────────────────────────────
// Fragment cards · physical deck
//
// Each card is a physical object:
// • Drag freely across the entire screen in any direction
// • Release gently → spring back to rest position
// • Flick with momentum (speed above threshold OR distance crossed)
//   → the card flies in the direction of the gesture and the next
//     one from the deck becomes active
// ─────────────────────────────────────────────────────────

import { FRAGMENTS } from './fragments.js';

export const deck = {
  activeIdx: 0,
  stack: [],
  container: null,
  onChange: null,
};

const STACK_SIZE = 3;             // How many cards visible in the stack
const FLICK_VELOCITY = 0.6;       // px/ms — speed threshold to throw
const FLICK_DISTANCE = 160;       // px — distance threshold to throw

export function initDeck(container, onChange) {
  deck.container = container;
  deck.onChange = onChange;
  deck.activeIdx = 0;
  renderStack();
  if (deck.onChange) deck.onChange(0, FRAGMENTS[0]);
}

function renderStack() {
  deck.container.innerHTML = '';
  deck.stack = [];
  const count = Math.min(STACK_SIZE, FRAGMENTS.length - deck.activeIdx);
  // Build from back to front so DOM order matches z-stacking
  for (let i = count - 1; i >= 0; i--) {
    const globalIdx = deck.activeIdx + i;
    const el = buildCard(FRAGMENTS[globalIdx], i, globalIdx);
    deck.container.appendChild(el);
    if (i === 0) deck.stack.push({ el, idx: globalIdx }); // top card
  }
}

function buildCard(fragment, stackPos, globalIdx) {
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.idx = globalIdx;
  el.innerHTML = `<p class="card-text">${fragment.text}</p>`;

  // Position in stack (behind cards offset slightly)
  const yOffset = stackPos * 10;
  const xOffset = stackPos * -8;
  const rotation = stackPos * 1.5;
  const scale = 1 - stackPos * 0.03;
  el.style.setProperty('--rest-x', xOffset + 'px');
  el.style.setProperty('--rest-y', yOffset + 'px');
  el.style.setProperty('--rest-rot', rotation + 'deg');
  el.style.setProperty('--rest-scale', scale);
  el.style.transform = `translate(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px)) rotate(${rotation}deg) scale(${scale})`;
  el.style.zIndex = String(100 - stackPos);
  el.style.opacity = stackPos === 0 ? '1' : (0.5 - stackPos * 0.1);

  if (stackPos === 0) {
    bindDrag(el, globalIdx);
  }
  return el;
}

function bindDrag(el, globalIdx) {
  let dragging = false;
  let startX = 0, startY = 0;
  let currentX = 0, currentY = 0;
  let lastT = 0;
  let vx = 0, vy = 0;
  let animFrame = null;

  const start = (e) => {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    dragging = true;
    el.classList.add('dragging');
    const p = point(e);
    startX = p.x; startY = p.y;
    currentX = 0; currentY = 0;
    lastT = performance.now();
    vx = 0; vy = 0;
  };

  const move = (e) => {
    if (!dragging) return;
    const p = point(e);
    const nowT = performance.now();
    const prevX = currentX, prevY = currentY;
    currentX = p.x - startX;
    currentY = p.y - startY;
    const dt = Math.max(1, nowT - lastT);
    vx = (currentX - prevX) / dt;
    vy = (currentY - prevY) / dt;
    lastT = nowT;
    const rot = currentX * 0.04;
    el.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px)) rotate(${rot}deg)`;
  };

  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');

    const speed = Math.hypot(vx, vy);
    const distance = Math.hypot(currentX, currentY);
    const shouldFly = speed > FLICK_VELOCITY || distance > FLICK_DISTANCE;

    if (shouldFly) {
      flyAway(el, currentX, currentY, vx, vy);
    } else {
      springBack(el, currentX, currentY);
    }
  };

  function flyAway(el, x, y, vx, vy) {
    // If velocity is low but distance crossed, derive velocity from direction
    if (Math.hypot(vx, vy) < 0.3) {
      const d = Math.hypot(x, y) || 1;
      vx = (x / d) * 1.2;
      vy = (y / d) * 1.2;
    }
    const start = performance.now();
    const duration = 500;
    const startRot = x * 0.04;
    const endRot = startRot + vx * 20;

    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 2);
      const dx = x + vx * duration * ease;
      const dy = y + vy * duration * ease;
      const rot = startRot + (endRot - startRot) * ease;
      el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`;
      el.style.opacity = String(1 - ease);
      if (t < 1) {
        animFrame = requestAnimationFrame(step);
      } else {
        advance();
      }
    }
    animFrame = requestAnimationFrame(step);
  }

  function springBack(el, fromX, fromY) {
    const start = performance.now();
    const duration = 400;
    const startRot = fromX * 0.04;

    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      // easeOutElastic
      const ease = 1 - Math.pow(1 - t, 3);
      const dx = fromX * (1 - ease);
      const dy = fromY * (1 - ease);
      const rot = startRot * (1 - ease);
      el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`;
      if (t < 1) {
        animFrame = requestAnimationFrame(step);
      }
    }
    animFrame = requestAnimationFrame(step);
  }

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    start(e);
  });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function point(e) {
  return { x: e.clientX, y: e.clientY };
}

export function advance() {
  const next = deck.activeIdx + 1;
  if (next >= FRAGMENTS.length) {
    if (deck.onChange) deck.onChange(next, null);
    return;
  }
  deck.activeIdx = next;
  renderStack();
  if (deck.onChange) deck.onChange(next, FRAGMENTS[next]);
}

// Keyboard support — Enter / Space / ArrowRight advance the deck
document.addEventListener('keydown', (e) => {
  if (!deck.container) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const top = deck.stack[0];
    if (!top) return;
    // Simulate a flick to the right
    const el = top.el;
    el.style.transition = 'transform 450ms cubic-bezier(0.4,0,0.2,1), opacity 450ms linear';
    el.style.transform = `translate(calc(-50% + 120vw), -50%) rotate(25deg)`;
    el.style.opacity = '0';
    setTimeout(() => advance(), 400);
  }
});
