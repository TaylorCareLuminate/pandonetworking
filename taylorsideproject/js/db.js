import { supabase } from './supabase-client.js'

// ── Books ──────────────────────────────────────────────────────────────────

export async function createBook(data) {
  const { data: book, error } = await supabase
    .from('books').insert(data).select().single()
  if (error) throw error
  return book
}

export async function getBook(id) {
  const { data, error } = await supabase
    .from('books').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function getAllBooks() {
  const { data, error } = await supabase
    .from('books').select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function updateBook(id, updates) {
  const { data, error } = await supabase
    .from('books').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteBook(id) {
  const { error } = await supabase.from('books').delete().eq('id', id)
  if (error) throw error
}

// ── Characters ─────────────────────────────────────────────────────────────

export async function addCharacter(data) {
  const { data: character, error } = await supabase
    .from('characters').insert(data).select().single()
  if (error) throw error
  return character
}

export async function getCharacters(bookId) {
  const { data, error } = await supabase
    .from('characters').select('*').eq('book_id', bookId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function updateCharacter(id, updates) {
  const { data, error } = await supabase
    .from('characters').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteCharacter(id) {
  const { error } = await supabase.from('characters').delete().eq('id', id)
  if (error) throw error
}

// ── Chapters ───────────────────────────────────────────────────────────────

export async function createChapter(data) {
  const { data: chapter, error } = await supabase
    .from('chapters').insert(data).select().single()
  if (error) throw error
  return chapter
}

export async function getChapter(id) {
  const { data, error } = await supabase
    .from('chapters').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function getChapters(bookId) {
  const { data, error } = await supabase
    .from('chapters').select('*').eq('book_id', bookId)
    .order('chapter_number', { ascending: true })
  if (error) throw error
  return data
}

// Returns only saved chapters with their summaries (for "story so far" compilation)
// and full text (for behavior-scanning) — used by book.html for both purposes.
export async function getSavedChapters(bookId) {
  const { data, error } = await supabase
    .from('chapters')
    .select('id, chapter_number, title, chapter_summary, word_count, status, user_edited_content, final_content')
    .eq('book_id', bookId)
    .eq('status', 'saved')
    .order('chapter_number', { ascending: true })
  if (error) throw error
  return data
}

export async function updateChapter(id, updates) {
  const { data, error } = await supabase
    .from('chapters').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteChapter(id) {
  const { error } = await supabase.from('chapters').delete().eq('id', id)
  if (error) throw error
}

// ── Conflict Arcs ──────────────────────────────────────────────────────────

export async function getArcs(bookId) {
  const { data, error } = await supabase
    .from('arcs').select('*').eq('book_id', bookId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addArc(data) {
  const { data: arc, error } = await supabase
    .from('arcs').insert(data).select().single()
  if (error) throw error
  return arc
}

export async function updateArc(id, updates) {
  const { data, error } = await supabase
    .from('arcs').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteArc(id) {
  const { error } = await supabase.from('arcs').delete().eq('id', id)
  if (error) throw error
}

// ── Book stats (word count rollup) ─────────────────────────────────────────
export async function recalcBookWordCount(bookId) {
  const { data, error } = await supabase
    .from('chapters')
    .select('word_count')
    .eq('book_id', bookId)
    .eq('status', 'saved')
  if (error) return
  const total = (data || []).reduce((sum, c) => sum + (c.word_count || 0), 0)
  await supabase.from('books').update({ total_words: total }).eq('id', bookId)
  return total
}
