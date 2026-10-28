// ─────────────────────────────────────────────────────────
// Store · persistence layer
//
// Runs over Supabase when credentials are set in config.js,
// otherwise over localStorage. Both expose the same API so the
// app and the researcher panel do not need to know which mode
// is active.
// ─────────────────────────────────────────────────────────

import { SUPABASE_URL, SUPABASE_ANON_KEY, LOCAL_RESEARCHER_EMAIL, LOCAL_RESEARCHER_PASSWORD } from './config.js';

export const store = {
  mode: 'local',
  client: null,
  session: null,
};

if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
  try {
    store.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    store.mode = 'supabase';
  } catch (e) {
    console.warn('[store] Supabase failed to initialize, falling back to local.', e);
  }
}

// ─────────── Session + reactions ───────────

export async function createSession(sessionId, deviceInfo) {
  if (store.mode === 'supabase') {
    try {
      await store.client.from('sessions').insert([{
        session_id: sessionId,
        started_at: new Date().toISOString(),
        device_type: deviceInfo.deviceType,
        viewport_width: deviceInfo.width,
        viewport_height: deviceInfo.height,
        demo_mode: deviceInfo.demoMode,
      }]);
    } catch (e) { console.warn('[store] insert session failed', e); }
  }
  // Also keep local copy
  try {
    const all = _loadLocalSessions();
    all[sessionId] = {
      session_id: sessionId,
      started_at: new Date().toISOString(),
      device_type: deviceInfo.deviceType,
      viewport_width: deviceInfo.width,
      viewport_height: deviceInfo.height,
      demo_mode: deviceInfo.demoMode,
      reactions: [],
    };
    _saveLocalSessions(all);
  } catch(e) {}
}

export async function saveReaction(reaction) {
  if (store.mode === 'supabase') {
    try {
      await store.client.from('reactions').insert([reaction]);
    } catch (e) { console.warn('[store] insert reaction failed', e); }
  }
  try {
    const all = _loadLocalSessions();
    if (all[reaction.session_id]) {
      all[reaction.session_id].reactions.push(reaction);
      _saveLocalSessions(all);
    }
  } catch(e) {}
}

export async function loadAllSessions() {
  if (store.mode === 'supabase' && store.session) {
    try {
      const { data: sessions } = await store.client
        .from('sessions').select('*').order('started_at', { ascending: false });
      const { data: reactions } = await store.client
        .from('reactions').select('*');
      const bySession = {};
      for (const s of sessions || []) bySession[s.session_id] = { ...s, reactions: [] };
      for (const r of reactions || []) {
        if (bySession[r.session_id]) bySession[r.session_id].reactions.push(r);
      }
      return Object.values(bySession);
    } catch (e) {
      console.warn('[store] load failed, falling back to local', e);
    }
  }
  const all = _loadLocalSessions();
  return Object.values(all).sort((a, b) =>
    (b.started_at || '').localeCompare(a.started_at || '')
  );
}

// ─────────── Authentication ───────────

export async function researcherLogin(email, password) {
  if (store.mode === 'supabase') {
    const { data, error } = await store.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    store.session = data;
    return data;
  }
  // Local fallback: compare against config
  if (email === LOCAL_RESEARCHER_EMAIL && password === LOCAL_RESEARCHER_PASSWORD) {
    store.session = { local: true, email };
    return store.session;
  }
  const err = new Error('Credenciales inválidas');
  err.code = 'invalid_credentials';
  throw err;
}

export async function researcherLogout() {
  if (store.mode === 'supabase' && store.session) {
    try { await store.client.auth.signOut(); } catch (e) {}
  }
  store.session = null;
}

// ─────────── Local storage helpers ───────────

const LOCAL_KEY = 'sin_remedio_sessions_v2';

function _loadLocalSessions() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
  catch { return {}; }
}

function _saveLocalSessions(obj) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(obj)); } catch {}
}

export function readOwnSession(sessionId) {
  const all = _loadLocalSessions();
  return all[sessionId] || null;
}
