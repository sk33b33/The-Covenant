/*
 * The Covenant — service worker.
 *
 * Hand-written rather than generated. The caching this game needs is simple
 * and the rules are worth being able to read: it is a single-player game with
 * no network calls at all, so "works offline" just means "the app shell and its
 * assets are in the cache".
 *
 * Two strategies:
 *
 *   Navigations   network first, cache as fallback. A player on a flaky
 *                 connection gets the newest build when it is reachable and
 *                 the last known good one when it is not — never a blank page.
 *
 *   Everything    cache first. Card art, fonts and hashed bundles are
 *   else          immutable: a hashed filename that exists in the cache can
 *                 never be stale, and going to the network for it would waste
 *                 the one thing mobile users are short of.
 *
 * That "immutable" assumption holds for hashed bundle filenames by
 * construction, but art under public/ (card faces, key art, pack wrappers,
 * the entry chime) is referenced by a plain, unhashed path — see lib/asset.ts
 * for why. When one of those files is revised in place rather than added,
 * its URL doesn't change, so a device that already cached the old bytes would
 * keep serving them forever: cache-first never re-checks the network, and
 * nothing here was bumping VERSION to say otherwise. Bump it — right below —
 * whenever an existing art or audio file's *content* changes, not just when
 * new ones are added. `activate` deletes anything not carrying the current
 * VERSION, which is what actually forces a fresh fetch.
 */

const VERSION = 'covenant-v3'
const SHELL = `${VERSION}-shell`

/*
 * Enough to boot the app with no connection at all.
 *
 * Resolved against the worker's own scope rather than the origin root, so the
 * same file works when the app is served from a sub-path.
 */
const BASE = new URL('./', self.registration?.scope ?? self.location.href)
const at = (path) => new URL(path, BASE).pathname

const PRECACHE = [
  at('./'),
  at('index.html'),
  at('manifest.webmanifest'),
  at('fonts/cinzel-latin.woff2'),
  at('fonts/plex-latin.woff2'),
  at('icons/icon-192.png'),
  at('icons/icon-512.png'),
  at('art/key/cover.webp'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // addAll rejects the whole batch if any single request fails, which
      // would leave the worker uninstalled over one missing icon. Adding them
      // individually keeps a partial precache, which is still useful.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only GET is cacheable, and only our own origin is ours to cache.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match(at('index.html')))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit

      return fetch(request).then((response) => {
        // Opaque and error responses are not worth storing; caching them
        // would poison later loads with a permanent failure.
        if (!response.ok || response.type === 'opaque') return response

        const copy = response.clone()
        caches.open(SHELL).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})
