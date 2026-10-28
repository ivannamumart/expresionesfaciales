// ─────────────────────────────────────────────────────────
// Researcher · private panel
// ─────────────────────────────────────────────────────────

import { FRAGMENTS } from './fragments.js';
import { researcherLogin, researcherLogout, loadAllSessions, store } from './store.js';

const dom = {
  login: document.getElementById('login'),
  dashboard: document.getElementById('dashboard'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  error: document.getElementById('login-error'),
  btnLogin: document.getElementById('btn-login'),
  btnLogout: document.getElementById('btn-logout'),
  btnExport: document.getElementById('btn-export'),
  stats: document.getElementById('stats'),
  chartCanvas: document.getElementById('chart-canvas'),
  tableBody: document.querySelector('#sessions-table tbody'),
};

// ─────────── Login ───────────

async function handleLogin() {
  dom.error.hidden = true;
  const email = dom.email.value.trim();
  const password = dom.password.value;
  if (!email || !password) {
    dom.error.textContent = 'Datos incompletos.';
    dom.error.hidden = false;
    return;
  }
  dom.btnLogin.textContent = 'Verificando...';
  dom.btnLogin.disabled = true;
  try {
    await researcherLogin(email, password);
    dom.login.hidden = true;
    dom.dashboard.hidden = false;
    await renderDashboard();
  } catch (e) {
    dom.error.textContent = e.code === 'invalid_credentials'
      ? 'Credenciales inválidas.'
      : 'No fue posible iniciar sesión.';
    dom.error.hidden = false;
  } finally {
    dom.btnLogin.textContent = 'Entrar';
    dom.btnLogin.disabled = false;
  }
}

async function handleLogout() {
  await researcherLogout();
  dom.dashboard.hidden = true;
  dom.login.hidden = false;
  dom.email.value = '';
  dom.password.value = '';
}

dom.btnLogin.addEventListener('click', handleLogin);
dom.password.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});
dom.btnLogout.addEventListener('click', handleLogout);

// ─────────── Dashboard ───────────

async function renderDashboard() {
  const sessions = await loadAllSessions();
  renderStats(sessions);
  renderChart(sessions);
  renderTable(sessions);
}

function formatMs(ms) {
  if (!ms) return '—';
  if (ms < 1000) return ms + ' ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function renderStats(sessions) {
  let totalReactions = 0;
  let totalDwell = 0;
  let peakSmile = 0;
  for (const s of sessions) {
    for (const r of (s.reactions || [])) {
      totalReactions++;
      totalDwell += r.dwell_ms || 0;
      const sm = (r.peaks && r.peaks.smile) || 0;
      if (sm > peakSmile) peakSmile = sm;
    }
  }
  dom.stats.innerHTML = `
    <div class="r-stat">
      <div class="label">sesiones</div>
      <div class="value">${sessions.length}</div>
    </div>
    <div class="r-stat">
      <div class="label">lecturas</div>
      <div class="value">${totalReactions}</div>
    </div>
    <div class="r-stat">
      <div class="label">tiempo total</div>
      <div class="value">${formatMs(totalDwell).replace(/(\d+)([a-z]+)/g, '$1<span class="unit">$2</span>')}</div>
    </div>
    <div class="r-stat">
      <div class="label">pico de risa</div>
      <div class="value">${peakSmile.toFixed(2)}</div>
    </div>
  `;
}

function renderChart(sessions) {
  // Average smile peak per fragment across all sessions
  const buckets = {};
  for (const f of FRAGMENTS) buckets[f.id] = { smile: [], brow: [], squint: [], label: f.register };
  for (const s of sessions) {
    for (const r of (s.reactions || [])) {
      const b = buckets[r.fragment_id];
      if (!b) continue;
      b.smile.push((r.peaks && r.peaks.smile) || 0);
      b.brow.push((r.peaks && r.peaks.browUp) || 0);
      b.squint.push((r.peaks && r.peaks.squint) || 0);
    }
  }

  const canvas = dom.chartCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const pad = { top: 30, right: 20, bottom: 50, left: 50 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  // Horizontal grid
  ctx.strokeStyle = 'rgba(46, 33, 85, 0.8)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }

  // Y labels
  ctx.fillStyle = '#5A527A';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    const v = (1 - i / 4).toFixed(2);
    ctx.fillText(v, pad.left - 10, y + 4);
  }

  // Series
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const points = FRAGMENTS.map((f, i) => {
    const b = buckets[f.id];
    const x = pad.left + (i / (FRAGMENTS.length - 1)) * chartW;
    return {
      x,
      smile:  pad.top + chartH * (1 - avg(b.smile)),
      brow:   pad.top + chartH * (1 - avg(b.brow)),
      squint: pad.top + chartH * (1 - avg(b.squint)),
    };
  });

  function drawSeries(key, color, fill) {
    // Area fill underneath
    if (fill) {
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
      grad.addColorStop(0, color + '66');
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, pad.top + chartH);
      for (const p of points) ctx.lineTo(p.x, p[key]);
      ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.x, p[key]);
      else {
        const prev = points[i - 1];
        const cpx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cpx, prev[key], cpx, p[key], p.x, p[key]);
      }
    }
    ctx.stroke();
    // Nodes
    ctx.fillStyle = color;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p[key], 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSeries('smile', '#FF93AF', true);
  drawSeries('brow', '#A896F5', false);
  drawSeries('squint', '#7FE6C4', false);

  // X labels
  ctx.fillStyle = '#9F97B8';
  ctx.font = '11px "Archivo", sans-serif';
  ctx.textAlign = 'center';
  FRAGMENTS.forEach((f, i) => {
    const x = pad.left + (i / (FRAGMENTS.length - 1)) * chartW;
    ctx.fillText(f.id, x, h - pad.bottom + 18);
    ctx.fillStyle = '#5A527A';
    ctx.font = '10px "Archivo", sans-serif';
    ctx.fillText(f.register, x, h - pad.bottom + 32);
    ctx.fillStyle = '#9F97B8';
    ctx.font = '11px "Archivo", sans-serif';
  });

  // Legend (top-right)
  const legend = [
    { label: 'risa', color: '#FF93AF' },
    { label: 'asombro', color: '#A896F5' },
    { label: 'ironía', color: '#7FE6C4' },
  ];
  let lx = w - pad.right - 10;
  ctx.textAlign = 'right';
  for (let i = legend.length - 1; i >= 0; i--) {
    const l = legend[i];
    ctx.fillStyle = '#9F97B8';
    ctx.fillText(l.label, lx, pad.top - 12);
    const tw = ctx.measureText(l.label).width;
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.arc(lx - tw - 8, pad.top - 16, 3, 0, Math.PI * 2);
    ctx.fill();
    lx -= tw + 32;
  }
}

function renderTable(sessions) {
  if (!sessions.length) {
    dom.tableBody.innerHTML = `<tr><td colspan="6" class="r-empty">Todavía no hay sesiones registradas.</td></tr>`;
    return;
  }
  dom.tableBody.innerHTML = sessions.slice(0, 50).map(s => {
    const n = (s.reactions || []).length;
    const total = (s.reactions || []).reduce((a, r) => a + (r.dwell_ms || 0), 0);
    const peakS = (s.reactions || []).reduce((a, r) =>
      Math.max(a, (r.peaks && r.peaks.smile) || 0), 0);
    const date = new Date(s.started_at || Date.now());
    const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) +
                    ' · ' + date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td class="mono">${dateStr}</td>
      <td class="mono">${s.session_id}</td>
      <td class="mono">${n}</td>
      <td class="mono">${formatMs(total)}</td>
      <td class="mono">${peakS.toFixed(2)}</td>
      <td>${s.device_type || '—'}</td>
    </tr>`;
  }).join('');
}

// ─────────── Export ───────────

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"' : s;
}

dom.btnExport.addEventListener('click', async () => {
  const sessions = await loadAllSessions();
  const header = [
    'session_id','started_at','device','fragment_id','fragment_order','register',
    // Timing
    'dwell_ms','samples_count','first_reaction_ms','longest_peak_ms',
    // Attention
    'blink_count','blink_rate_per_min',
    // Dominant emotion
    'dominant_emotion','dominant_emotion_score',
    // Dynamics
    'emotion_peak_count','oscillation','expressive_entropy',
    // Emotion peaks (6 Ekman + 5 menippean)
    'emo_alegría','emo_sorpresa','emo_tristeza','emo_enojo','emo_asco','emo_ironía',
    'emo_sonrisa_asimétrica','emo_risa_contenida','emo_desdén','emo_perplejidad','emo_atención_aguda',
    // Blendshape peaks
    'peak_smile','peak_frown','peak_browUp','peak_browDown','peak_squint',
    'peak_jawOpen','peak_sneer','peak_dimple','peak_pucker',
    'peak_stretch','peak_press','peak_eyeWide','peak_jawForward','peak_mouthClose',
    'peak_cheekPuff','peak_cheekSquint',
    'peak_smileAsym','peak_dimpleAsym','peak_mouthSideways',
    'peak_gazeIn','peak_gazeOut','peak_gazeUp','peak_gazeDown',
    // Blendshape means (subset)
    'mean_smile','mean_browUp','mean_squint','mean_eyeWide','mean_gazeDown',
    // Head pose
    'head_yaw_range','head_pitch_range','head_roll_range','head_yaw_std','head_pitch_std','stability_score',
    // Mode
    'demo_mode',
    'recorded_at',
  ];
  const rows = [header];

  for (const s of sessions) {
    for (const r of (s.reactions || [])) {
      const ep = r.emotion_peaks || {};
      const p = r.peaks || {};
      const mn = r.means || {};
      const hp = r.head_pose || {};
      rows.push([
        s.session_id, s.started_at, s.device_type || '',
        r.fragment_id, r.fragment_order, r.register,
        // Timing
        r.dwell_ms ?? '', r.samples_count ?? '', r.first_reaction_ms ?? '', r.longest_peak_ms ?? '',
        // Attention
        r.blink_count ?? '', r.blink_rate_per_min ?? '',
        // Dominant
        r.dominant_emotion ?? '', r.dominant_emotion_score ?? '',
        // Dynamics
        r.emotion_peak_count ?? '', r.oscillation ?? '', r.expressive_entropy ?? '',
        // Emotion peaks
        ep['alegría'] ?? '', ep['sorpresa'] ?? '', ep['tristeza'] ?? '',
        ep['enojo'] ?? '', ep['asco'] ?? '', ep['ironía'] ?? '',
        ep['sonrisa asimétrica'] ?? '', ep['risa contenida'] ?? '',
        ep['desdén'] ?? '', ep['perplejidad'] ?? '', ep['atención aguda'] ?? '',
        // Blendshape peaks
        p.smile ?? '', p.frown ?? '', p.browUp ?? '', p.browDown ?? '', p.squint ?? '',
        p.jawOpen ?? '', p.sneer ?? '', p.dimple ?? '', p.pucker ?? '',
        p.stretch ?? '', p.press ?? '', p.eyeWide ?? '', p.jawForward ?? '', p.mouthClose ?? '',
        p.cheekPuff ?? '', p.cheekSquint ?? '',
        p.smileAsym ?? '', p.dimpleAsym ?? '', p.mouthSideways ?? '',
        p.gazeIn ?? '', p.gazeOut ?? '', p.gazeUp ?? '', p.gazeDown ?? '',
        // Means
        mn.smile ?? '', mn.browUp ?? '', mn.squint ?? '', mn.eyeWide ?? '', mn.gazeDown ?? '',
        // Head pose
        hp.yaw_range ?? '', hp.pitch_range ?? '', hp.roll_range ?? '',
        hp.yaw_std ?? '', hp.pitch_std ?? '', hp.stability_score ?? '',
        // Mode
        r.demo_mode ? 'true' : 'false',
        r.recorded_at ?? '',
      ]);
    }
  }
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sin-remedio-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Redraw chart on resize
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!dom.dashboard.hidden) renderDashboard();
  }, 200);
});
