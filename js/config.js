// ─────────────────────────────────────────────────────────
// Configuration · Sin Remedio
//
// Paste your Supabase project credentials here. While both values
// are empty, the piece runs in local mode (localStorage) so you can
// test everything end-to-end without a backend.
//
// Supabase → Project Settings → API:
//   • Project URL           →  SUPABASE_URL
//   • Project API Keys · anon public  →  SUPABASE_ANON_KEY
//
// The anon key is designed to live in the browser. Security comes
// from the Row Level Security policies in supabase/setup.sql, not
// from hiding this key.
// ─────────────────────────────────────────────────────────

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Local-mode fallback credentials for the researcher panel.
// Overridden by Supabase Auth once SUPABASE_URL is set.
export const LOCAL_RESEARCHER_EMAIL = 'il.munoz@uniandes.edu.co';
export const LOCAL_RESEARCHER_PASSWORD = 'sinremedio2026';

export const PROJECT = {
  name: 'Sin Remedio',
  author: 'Ivanna Muñoz Martínez',
  institution: 'Universidad de los Andes',
  email: 'il.munoz@uniandes.edu.co',
  year: 2026,
  model: 'Claude Opus 4.7 (Anthropic)',
};
