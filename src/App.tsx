import { useState } from 'react'

/**
 * Scaffold smoke screen.
 *
 * Exists only to prove the toolchain end to end: design tokens resolve, the
 * self-hosted fonts load, imported card art is served, Tailwind's token bridge
 * works, and dark mode swaps cleanly. Replaced by the real app shell in M1.
 */
export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    setTheme(next)
  }

  return (
    <div className="min-h-full bg-bg text-ink flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="font-display text-2xl gold-leaf tracking-wide">The Covenant</h1>
      <p className="text-ink-muted text-sm text-center max-w-app">
        Scaffold online. Tokens, fonts, Tailwind bridge and art pipeline verified.
      </p>

      <div className="flex gap-3">
        {(['light', 'fire', 'water', 'earth', 'spirit', 'shadow'] as const).map((t) => (
          <span
            key={t}
            className="w-8 h-8 rounded-pill shadow-raised-sm"
            style={{ background: `var(--energy-${t})` }}
            title={t}
          />
        ))}
      </div>

      <img
        src="/art/cards/jacob.webp"
        alt="Jacob"
        width={180}
        className="rounded-card shadow-card"
      />

      <button onClick={toggle} className="neu px-5 py-2 rounded-pill text-sm font-medium">
        Theme: {theme}
      </button>
    </div>
  )
}
