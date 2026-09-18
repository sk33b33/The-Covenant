# Project memory

## Portal API architecture — decided 2026-09-18

The game talks to the portal (`Covenant-TCG-Portal`) over a small custom
REST API — no third-party API gateway, no separate framework. Three
endpoints today: `POST /api/game/auth/login`, `POST /api/game/auth/logout`,
`GET/POST /api/game/save`. Bearer-token auth (hashed token in Postgres,
same pattern as the portal's own browser sessions), CORS locked to one
exact origin (`GAME_CLIENT_ORIGIN`), all built as plain Next.js route
handlers on the portal side.

**Considered and declined: rewriting this as a separate ASP.NET Core
service.** Conclusion: not worth it.
- Next.js route handlers already expose the raw `Request`/`Response`
  objects — there's no loss of control over an individual endpoint versus
  ASP.NET Core at this scale. ASP.NET Core's real advantages (mature
  middleware/DI pipeline, OpenAPI generation, gRPC/SignalR, Kestrel tuning)
  only pay off with a much larger API surface and team than this project
  has or is likely to grow into (expect maybe 5-10 endpoints total, ever —
  leaderboard, match results, social — not dozens).
- Splitting the API into its own service in *any* language adds real cost
  regardless of framework: a second codebase hitting the same Postgres
  schema (drift risk between two ORMs), or a network hop back to the
  portal for auth. Not worth it for 3 endpoints.

**Considered and declined (for now): moving off Vercel to Render/Fly.io.**
The actual technical point that's true and worth remembering if this comes
up again: a persistent host would eliminate serverless cold starts and let
the app hold a real, long-lived DB connection pool instead of routing
through Supabase's transaction-mode pooler (the workaround `DIRECT_URL` /
`prisma.config.ts` split exists for — see the portal's own
`docs/DEPLOYMENT.md`). That's a genuine speed/reliability win, and it
requires zero code rewrite if we ever do it — the same Next.js app just
runs as a normal Node server instead of on Vercel (add a Dockerfile /
Render-Fly build config, keep the same env vars, drop the
`vercel-build` script).

**Decision: stay on Vercel until there's a concrete, measured performance
problem** (nothing has been load-tested; current traffic is low). Moving
preemptively trades "zero ops effort, deploys on push" for "I manage a
server" without a benefit anyone can actually feel yet. Revisit this if
cold starts or connection churn become a real, observed issue — the move
itself is cheap when that day comes.
