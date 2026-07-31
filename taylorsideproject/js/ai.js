// All AI calls go through the Railway backend → OpenRouter
export const RAILWAY_URL = 'https://railwayclemail-production.up.railway.app'

async function railwayPost(path, body) {
  const res = await fetch(`${RAILWAY_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

// ── Book element suggestion (Qwen) ─────────────────────────────────────────
export async function suggestElement(element, currentValue = '', bookContext = '') {
  const data = await railwayPost('/api/book/suggest', { element, currentValue, bookContext })
  return data.suggestion
}

// ── Chapter workflow ───────────────────────────────────────────────────────

export async function getCharacterReactions(book, characters, storySoFar, arcs = [], recentChapters = []) {
  const data = await railwayPost('/api/book/chapter/reactions', { book, characters, storySoFar, arcs, recentChapters })
  return data.reactions
}

export async function getNarratorRecommendation(book, characters, storySoFar, characterReactions, chapterNumber, arcs = [], recentChapters = []) {
  const data = await railwayPost('/api/book/chapter/recommend', {
    book, characters, storySoFar, characterReactions, chapterNumber, arcs, recentChapters
  })
  return data.recommendation
}

export async function draftChapter(book, characters, storySoFar, premise, chapterNumber, chapterTitle, arcs = [], recentChapters = []) {
  const data = await railwayPost('/api/book/chapter/draft', {
    book, characters, storySoFar, premise, chapterNumber, chapterTitle, arcs, recentChapters
  })
  return data.draft
}

export async function getCharacterContributions(book, characters, storySoFar, chapterDraft, premise, arcs = [], recentChapters = [], chapterNumber = null) {
  const data = await railwayPost('/api/book/chapter/contributions', {
    book, characters, storySoFar, chapterDraft, premise, arcs, recentChapters, chapterNumber
  })
  return data.contributions
}

export async function getUniverseCheck(book, characters, chapterDraft, contributions, storySoFar, arcs = [], recentChapters = []) {
  const data = await railwayPost('/api/book/chapter/universe-check', {
    book, characters, chapterDraft, contributions, storySoFar, arcs, recentChapters
  })
  return data.feedback
}

export async function finalizeChapter(book, characters, chapterDraft, contributions, universeFeedback, premise, chapterNumber, chapterTitle, arcs = [], recentChapters = []) {
  const data = await railwayPost('/api/book/chapter/finalize', {
    book, characters, chapterDraft, contributions, universeFeedback, premise, chapterNumber, chapterTitle, arcs, recentChapters
  })
  return data.content
}

// ── Story management ───────────────────────────────────────────────────────

export async function summarizeChapter(chapterContent, chapterNumber, chapterTitle, book) {
  const data = await railwayPost('/api/book/chapter/summarize', {
    chapterContent, chapterNumber, chapterTitle, book
  })
  return data.summary
}

export async function compileStorySoFar(book, chapterSummaries) {
  const data = await railwayPost('/api/book/story-so-far', { book, chapterSummaries })
  return data.storySoFar
}

// ── Brainstorm ─────────────────────────────────────────────────────────────
export async function brainstorm(book, characters, question, storySoFar, includeNarrator = true) {
  const data = await railwayPost('/api/book/brainstorm', {
    book, characters, question, storySoFar, includeNarrator
  })
  return data  // { characterResponses, narratorSynthesis }
}

// ── Character development ──────────────────────────────────────────────────
export async function expandCharacter(book, character, aspect = 'default') {
  const data = await railwayPost('/api/book/character/expand', { book, character, aspect })
  return data.expansion
}

// Edit / continue a chapter with a natural-language instruction
// mode: 'revise' (rewrites whole chapter) | 'continue' (appends new text)
export async function editChapter(book, chapterContent, instruction, characters, storySoFar, mode = 'revise') {
  const data = await railwayPost('/api/book/chapter/edit', {
    book, chapter_content: chapterContent, instruction, characters, story_so_far: storySoFar, mode
  })
  return { result: data.result, mode: data.mode }
}

// Complete ALL character fields at once using Claude Opus
export async function completeCharacter(book, character) {
  const data = await railwayPost('/api/book/character/complete', { book, character })
  return data.character  // { role, description, traits, backstory, character_arc, avatar_emoji }
}

// ── Character behavior tracking ─────────────────────────────────────────────
// AI suggests specific, concrete behavior patterns for a character (traits in action).
export async function suggestBehaviors(book, character, existingBehaviors = []) {
  const data = await railwayPost('/api/book/character/suggest-behaviors', { book, character, existingBehaviors })
  return data.behaviors  // array of strings
}

// Scans saved chapter text and figures out which listed behaviors appeared where,
// updating each character's usage history/counts. chapters: [{chapter_number, title, content}]
export async function scanChapterBehaviors(characters, chapters) {
  const data = await railwayPost('/api/book/character/scan-behaviors', { characters, chapters })
  return data.results  // [{ characterId, name, behaviors }] or { error } per character
}

// ── Conflict arc suggestions ───────────────────────────────────────────────
export async function suggestArcs(book, existingArcs, chapterSummaries) {
  const data = await railwayPost('/api/book/arcs/suggest', { book, existingArcs, chapterSummaries })
  return data.arcs  // array of { title, description, arc_type }
}

// ── Story Bible ────────────────────────────────────────────────────────────
export async function generateStoryBible(book, characters) {
  const data = await railwayPost('/api/book/story-bible', { book, characters })
  return data.bible
}

// ── Cover concept ──────────────────────────────────────────────────────────
export async function generateCoverConcept(book, characters) {
  const data = await railwayPost('/api/book/cover-concept', { book, characters })
  return data.concept
}

// ── Utility: count words ───────────────────────────────────────────────────
export function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}
