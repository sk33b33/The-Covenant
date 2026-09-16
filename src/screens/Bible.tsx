import { useEffect, useMemo, useRef, useState } from 'react'
import { BackIcon, ChevronLeft, ChevronRight, CloseIcon, SearchIcon } from '@/art/icons'
import { Panel } from '@/components/ui'
import { loadBibleData, searchVerses, type BibleData, type SearchResult } from '@/lib/bible'
import { useNav } from '@/store/nav'
import { cx } from '@/lib/cx'

/**
 * The King James Version, in full — book and chapter navigation, verse-by-
 * verse reading with paragraph grouping like a printed edition, and a plain
 * text search across all 31,102 verses.
 *
 * The ~4 MB of verse text is fetched lazily (`loadBibleData`) rather than
 * bundled, so nothing here costs anything until a player actually opens this
 * screen. Book/chapter/search navigation is local component state rather
 * than routes on the global nav stack — like Profile's own edit-name toggle,
 * none of it needs to survive leaving the screen or be a back-button target
 * in its own right; only leaving the Bible screen entirely goes through
 * `useNav`.
 */

type View =
  | { mode: 'books' }
  | { mode: 'chapters'; bookIndex: number }
  | { mode: 'reading'; bookIndex: number; chapter: number; highlightVerse?: number }
  | { mode: 'search' }

export function Bible() {
  const exit = useNav((s) => s.back)
  const [data, setData] = useState<BibleData | null>(null)
  const [error, setError] = useState(false)
  const [view, setView] = useState<View>({ mode: 'books' })

  useEffect(() => {
    let cancelled = false
    loadBibleData()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The books list is the root of this screen's own internal navigation —
  // everywhere else, "back" steps up one level here first, and only exits
  // the whole screen once there is nowhere left to step up to.
  const goBack = () => {
    if (view.mode === 'reading') {
      setView({ mode: 'chapters', bookIndex: view.bookIndex })
    } else if (view.mode === 'chapters' || view.mode === 'search') {
      setView({ mode: 'books' })
    } else {
      exit()
    }
  }

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-app px-4 pt-safe pb-tabbar">
        <Header view={view} data={data} onBack={goBack} onSearch={() => setView({ mode: 'search' })} />

        {error && (
          <Panel className="p-4 mt-4 text-center text-sm text-ink-muted">
            Could not load the text. Check your connection and try again.
          </Panel>
        )}

        {!error && !data && (
          <div className="pt-16 text-center text-sm text-ink-muted">Loading scripture…</div>
        )}

        {data && view.mode === 'books' && (
          <BookList data={data} onPick={(bookIndex) => setView({ mode: 'chapters', bookIndex })} />
        )}

        {data && view.mode === 'chapters' && (
          <ChapterGrid
            data={data}
            bookIndex={view.bookIndex}
            onPick={(chapter) => setView({ mode: 'reading', bookIndex: view.bookIndex, chapter })}
          />
        )}

        {data && view.mode === 'reading' && (
          <Reading
            data={data}
            bookIndex={view.bookIndex}
            chapter={view.chapter}
            highlightVerse={view.highlightVerse}
            onNavigate={(bookIndex, chapter) => setView({ mode: 'reading', bookIndex, chapter })}
          />
        )}

        {data && view.mode === 'search' && (
          <Search
            data={data}
            onPick={(result) =>
              setView({
                mode: 'reading',
                bookIndex: result.bookIndex,
                chapter: result.chapter,
                highlightVerse: result.verse,
              })
            }
          />
        )}
      </div>
    </div>
  )
}

function Header({
  view,
  data,
  onBack,
  onSearch,
}: {
  view: View
  data: BibleData | null
  onBack: () => void
  onSearch: () => void
}) {
  const title =
    view.mode === 'books'
      ? 'The Bible'
      : view.mode === 'search'
        ? 'Search'
        : (data?.books[view.bookIndex]?.name ?? '')

  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        onClick={onBack}
        className="neu w-10 h-10 rounded-pill grid place-items-center text-ink-muted shrink-0"
        aria-label="Back"
      >
        <BackIcon size={20} />
      </button>
      <h1 className="font-display text-lg tracking-wide flex-1 truncate">{title}</h1>
      {view.mode === 'books' && (
        <button
          onClick={onSearch}
          className="neu w-10 h-10 rounded-pill grid place-items-center text-ink-muted shrink-0"
          aria-label="Search"
        >
          <SearchIcon size={19} />
        </button>
      )}
    </div>
  )
}

function BookList({
  data,
  onPick,
}: {
  data: BibleData
  onPick: (bookIndex: number) => void
}) {
  const old = data.books.map((b, i) => ({ ...b, index: i })).filter((b) => b.testament === 'old')
  const newT = data.books.map((b, i) => ({ ...b, index: i })).filter((b) => b.testament === 'new')

  return (
    <div className="mt-4 space-y-6">
      <BookGroup title="Old Testament" books={old} onPick={onPick} />
      <BookGroup title="New Testament" books={newT} onPick={onPick} />
    </div>
  )
}

function BookGroup({
  title,
  books,
  onPick,
}: {
  title: string
  books: { name: string; index: number }[]
  onPick: (bookIndex: number) => void
}) {
  return (
    <div>
      <h2 className="font-display text-md mb-2 px-1">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        {books.map((book) => (
          <button
            key={book.index}
            onClick={() => onPick(book.index)}
            className="neu rounded-lg px-4 py-3 text-sm text-left truncate"
          >
            {book.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChapterGrid({
  data,
  bookIndex,
  onPick,
}: {
  data: BibleData
  bookIndex: number
  onPick: (chapter: number) => void
}) {
  const chapterCount = data.books[bookIndex]!.chapters
  const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1)

  return (
    <div className="grid grid-cols-5 gap-2 mt-4">
      {chapters.map((chapter) => (
        <button
          key={chapter}
          onClick={() => onPick(chapter)}
          className="neu rounded-lg aspect-square grid place-items-center text-sm font-medium"
        >
          {chapter}
        </button>
      ))}
    </div>
  )
}

/** Groups consecutive verses into paragraphs at each "¶" marker, the same
 *  way a printed KJV breaks paragraphs — a flat one-line-per-verse layout
 *  reads nothing like scripture actually looks on a page. */
function paragraphs(verses: string[]): { verse: number; text: string }[][] {
  const result: { verse: number; text: string }[][] = []
  verses.forEach((raw, i) => {
    const startsParagraph = raw.startsWith('¶ ') || i === 0
    const text = raw.startsWith('¶ ') ? raw.slice(2) : raw
    if (startsParagraph || result.length === 0) result.push([])
    result[result.length - 1]!.push({ verse: i + 1, text })
  })
  return result
}

function Reading({
  data,
  bookIndex,
  chapter,
  highlightVerse,
  onNavigate,
}: {
  data: BibleData
  bookIndex: number
  chapter: number
  highlightVerse?: number
  onNavigate: (bookIndex: number, chapter: number) => void
}) {
  const verses = data.verses[bookIndex]![chapter - 1]!
  const grouped = useMemo(() => paragraphs(verses), [verses])
  const highlightRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center' })
  }, [bookIndex, chapter])

  const atFirstChapterOfBook = chapter === 1
  const atLastChapterOfBook = chapter === data.books[bookIndex]!.chapters
  const atFirstBook = bookIndex === 0
  const atLastBook = bookIndex === data.books.length - 1

  const prevDisabled = atFirstChapterOfBook && atFirstBook
  const nextDisabled = atLastChapterOfBook && atLastBook

  const goPrev = () => {
    if (!atFirstChapterOfBook) return onNavigate(bookIndex, chapter - 1)
    if (!atFirstBook) onNavigate(bookIndex - 1, data.books[bookIndex - 1]!.chapters)
  }
  const goNext = () => {
    if (!atLastChapterOfBook) return onNavigate(bookIndex, chapter + 1)
    if (!atLastBook) onNavigate(bookIndex + 1, 1)
  }

  return (
    <div className="mt-4 pb-8">
      <p className="text-sm text-ink-muted mb-3">
        {data.books[bookIndex]!.name} {chapter}
      </p>

      <Panel className="p-5">
        <div className="space-y-4 text-[15px] leading-relaxed">
          {grouped.map((para, i) => (
            <p key={i}>
              {para.map(({ verse, text }) => (
                <span
                  key={verse}
                  ref={verse === highlightVerse ? highlightRef : undefined}
                  className={cx(
                    'rounded px-0.5',
                    verse === highlightVerse && 'bg-[var(--gold-leaf)]/30',
                  )}
                >
                  <sup className="text-[10px] text-ink-faint mr-1 font-semibold">{verse}</sup>
                  {text}{' '}
                </span>
              ))}
            </p>
          ))}
        </div>
      </Panel>

      <div className="flex gap-2 mt-4">
        <button
          onClick={goPrev}
          disabled={prevDisabled}
          className="neu flex-1 rounded-lg py-3 grid place-items-center disabled:opacity-40"
          aria-label="Previous chapter"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={goNext}
          disabled={nextDisabled}
          className="neu flex-1 rounded-lg py-3 grid place-items-center disabled:opacity-40"
          aria-label="Next chapter"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  )
}

function Search({ data, onPick }: { data: BibleData; onPick: (result: SearchResult) => void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchVerses(data, query), [data, query])

  return (
    <div className="mt-4">
      <div className="relative">
        <SearchIcon
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
        />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the Bible…"
          className="w-full rounded-lg pl-11 pr-10 py-3 text-base text-ink neu-sunk placeholder:text-ink-faint outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-bright)]"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-label="Clear search"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-4 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-ink-muted text-center pt-8">No verses found.</p>
          ) : (
            <>
              {results.map((result) => (
                <button
                  key={`${result.bookIndex}-${result.chapter}-${result.verse}`}
                  onClick={() => onPick(result)}
                  className="neu rounded-lg p-3.5 w-full text-left block"
                >
                  <span className="block text-xs font-semibold text-[var(--gold-deep)] mb-1">
                    {result.book} {result.chapter}:{result.verse}
                  </span>
                  <span className="block text-sm text-ink-muted line-clamp-2">
                    {result.text.startsWith('¶ ') ? result.text.slice(2) : result.text}
                  </span>
                </button>
              ))}
              {results.length === 80 && (
                <p className="text-xs text-ink-faint text-center pt-1">
                  Showing the first 80 matches — narrow your search for more.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
