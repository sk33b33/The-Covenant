#!/usr/bin/env node
/**
 * Generates public/bible/books.json and public/bible/kjv.json from the
 * `es-kjv` npm package — the King James Version (1769 revision), public
 * domain worldwide, so bundling the full text carries no licensing concern.
 *
 * Run once to (re)produce the committed output; not part of `npm run build`.
 * Downloads the package tarball directly from the npm registry rather than
 * adding it as a dependency, since nothing at runtime needs the package
 * itself — only the two JSON files it ships, reshaped into a more compact
 * form (nested arrays instead of a flat "Book Chapter:Verse" key per verse).
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PACKAGE = 'es-kjv'
const VERSION = '1.0.2'

const tmp = mkdtempSync(path.join(tmpdir(), 'kjv-'))
const tarballUrl = `https://registry.npmjs.org/${PACKAGE}/-/${PACKAGE}-${VERSION}.tgz`
const tarballPath = path.join(tmp, 'package.tgz')

console.log(`Fetching ${tarballUrl}`)
execSync(`curl -sS -o "${tarballPath}" "${tarballUrl}"`, { stdio: 'inherit' })
execSync(`tar -xzf "${tarballPath}" -C "${tmp}"`)

const versesSrc = readFileSync(path.join(tmp, 'package/json/verses-1769.js'), 'utf8')
const verses = JSON.parse(versesSrc.replace(/^export default /, ''))

// Canonical 66-book order falls out of the source data's own key order —
// Genesis first, Revelation last — rather than a hand-maintained list here.
const BOOKS_IN_ORDER = []
const seen = new Set()
for (const key of Object.keys(verses)) {
  const book = key.slice(0, key.lastIndexOf(' '))
  if (!seen.has(book)) {
    seen.add(book)
    BOOKS_IN_ORDER.push(book)
  }
}
if (BOOKS_IN_ORDER.length !== 66) {
  throw new Error(`Expected 66 books, found ${BOOKS_IN_ORDER.length}`)
}

const OLD_TESTAMENT_COUNT = 39 // Genesis..Malachi; the rest is New Testament.

// verses[bookIndex][chapterIndex][verseIndex] = text — book/chapter/verse
// numbers are the array indices, so nothing repeats the reference itself.
// A leading "# " in the source marks a new paragraph (a pilcrow in printed
// KJV editions); kept here as a literal leading "¶ " so the reading view can
// render it with no separate per-verse flag to carry around.
const bookData = BOOKS_IN_ORDER.map(() => [])
for (const [key, rawText] of Object.entries(verses)) {
  const match = key.match(/^(.*) (\d+):(\d+)$/)
  if (!match) throw new Error(`Unrecognised verse key: ${key}`)
  const [, book, chapterStr, verseStr] = match
  const bookIndex = BOOKS_IN_ORDER.indexOf(book)
  const chapter = Number(chapterStr)
  const verse = Number(verseStr)
  const chapters = bookData[bookIndex]
  chapters[chapter - 1] ??= []
  const text = rawText.startsWith('# ') ? `¶ ${rawText.slice(2)}` : rawText
  chapters[chapter - 1][verse - 1] = text
}

const books = BOOKS_IN_ORDER.map((name, i) => ({
  name,
  testament: i < OLD_TESTAMENT_COUNT ? 'old' : 'new',
  chapters: bookData[i].length,
}))

mkdirSync(path.join(import.meta.dirname, '..', 'public', 'bible'), { recursive: true })
const outDir = path.join(import.meta.dirname, '..', 'public', 'bible')
writeFileSync(path.join(outDir, 'books.json'), JSON.stringify(books))
writeFileSync(path.join(outDir, 'kjv.json'), JSON.stringify(bookData))

console.log(`Wrote ${books.length} books to public/bible/books.json`)
console.log(`Wrote verse text to public/bible/kjv.json`)
