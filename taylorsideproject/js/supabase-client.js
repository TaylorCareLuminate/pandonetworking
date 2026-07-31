import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ── Replace these two values with your own from Supabase → Settings → API ──
const SUPABASE_URL  = 'https://bhleksktrremftvzxaoo.supabase.co'
const SUPABASE_ANON = 'sb_publishable_AgJ8gOOyXur80FQ7UCAvoQ_VTOgJFSv'
const SUPABASE_CONNECTION_STRING = 'postgresql://postgres:[YOUR-PASSWORD]@db.bhleksktrremftvzxaoo.supabase.co:5432/postgres'
// ────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
