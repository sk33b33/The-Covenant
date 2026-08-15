/**
 * Resolves a path under the app's base URL.
 *
 * Card art, key art and the service worker are referenced at runtime, so their
 * paths cannot be rewritten at build time the way an imported module can. A
 * root-absolute `/art/cards/jacob.webp` breaks the moment the app is served
 * from a sub-path — a GitHub Pages project site being the obvious case — and
 * breaks silently: every card falls back to its placeholder, which looks like
 * missing art rather than a broken deploy.
 *
 * `import.meta.env.BASE_URL` is whatever Vite was built with, and always ends
 * in a slash.
 */
export const asset = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
