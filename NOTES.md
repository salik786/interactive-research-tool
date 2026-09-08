# Build notes & assumptions

This file records decisions made where the spec left something unspecified,
plus known gaps, per the build brief's instruction to default to the
simplest correct choice and document it rather than skip the feature.

## Paper extraction: PDF upload + accuracy fixes

`POST /api/ai/extract-paper` originally only accepted a pasted abstract,
which produced fabricated citations, vague method descriptions, and missed
metrics simply because they weren't in the short text it was given. Fixed:

- Accepts either pasted text (`{ text }` as JSON) of any length, or a PDF
  (`multipart/form-data`, field `pdf`), extracted server-side with
  `pdf-parse` before anything reaches the AI call.
- `pdf-parse` (pdf.js under the hood) needed three separate environment
  fixes, each only surfacing at a different stage of testing:
  1. Next.js bundling breaks pdf.js's runtime worker-script resolution
     ("Setting up fake worker failed: Cannot find module
     '.../pdf.worker.mjs'"). Fixed with `serverExternalPackages:
     ["pdf-parse"]` in `next.config.ts`.
  2. Vercel's production runtime additionally needs `DOMMatrix` (pdf.js
     touches it for font/glyph matrix math even during plain text
     extraction) — polyfilled via the pure-JS `dommatrix` package, since
     local `next dev` didn't need it but production did.
  3. Even with (1) fixed locally, Vercel's serverless file-tracer still
     doesn't bundle the worker file into the deployed function (a
     *different* "Cannot find module" than dev's). Pointing
     `PDFParse.setWorker()` at a CDN URL fails too — Node's default ESM
     loader only allows dynamic `import()` of `file:`/`data:` URLs, not
     `https:`. Final fix: fetch the worker script once and pass it as a
     base64 `data:` URL (cached per warm serverless instance).
  Confirmed working end-to-end against the actual Vercel production
  deployment, not just local dev — the three issues were sequential and
  each masked the next until deployed.
- Returns `input_scope: 'abstract' | 'full_text'` (< 2500 chars = abstract),
  surfaced in the UI as a badge when the result came from abstract-only
  input.
- **Real bug found via manual verification against an actual paper**: the
  first version capped text sent to the model at 20,000 characters. For a
  dense paper, the Results section (where the actual reported numbers live)
  can land well past that point, after pages of method/derivation — the cap
  was silently truncating away exactly the metrics this feature exists to
  capture, and the model correctly reported "not stated" about text it
  never saw. Raised to 100,000 characters (gpt-4o's context window handles
  this trivially) and tightened the prompt to explicitly instruct reading
  the whole document before concluding a metric is absent. Verified by
  reading a real IEEE paper's ground truth directly and confirming the
  re-run extraction matched exactly (author list, DOI, algorithm
  components, and both reported result tables).
- The system prompt explicitly forbids inventing citation/title/year/author
  details not present in the given text, requires the method field to name
  actual algorithm/architecture components (not a generic category), and
  keeps `relevance_note` strictly factual — screening judgment (keep/
  exclude reasoning against the project's actual criteria) stays entirely
  in `/api/ai/screen-paper`, unchanged.

## RLS bug found during testing (fixed in the migration file)

Creating a project failed with `new row violates row-level security policy
for table "projects"` even for the correct owner. Root cause: the
`"members can view"` SELECT policy only allowed `is_project_member(id)`,
but membership is granted by an **AFTER INSERT trigger** — and Postgres
evaluates a `RETURNING *` clause against the table's SELECT policy. At the
instant of insertion, the trigger hasn't run yet, so the new row isn't
SELECT-visible, and PostgREST surfaces that as an insert failure. Fixed by
adding `or owner_id = auth.uid()` to that policy so owners can always see
their own projects, independent of trigger timing. If you ran the original
migration text before this fix, run:
```sql
drop policy if exists "members can view" on projects;
create policy "members can view" on projects for select using (
  is_project_member(id) or owner_id = auth.uid()
);
```

## Schema deviations from the spec's exact SQL

- **`profiles.email` was added** (not in the original schema). Without it,
  showing "who's on this project" or resolving an invite to an existing
  account would require an extra admin-API round trip on every render. It's
  synced from `auth.users.email` by the `handle_new_user()` trigger. If you
  already ran the original migration text before this was added, run:
  ```sql
  alter table profiles add column email text;
  update profiles p set email = u.email from auth.users u where u.id = p.id;
  ```
  and update the trigger body to include `email = new.email` on conflict.
- **`pending_invites` table implemented** (the spec offered this as the
  "robust" option vs. a documented follow-up). Invites resolve automatically
  via a trigger on `auth.users` insert for brand-new signups. For an email
  that **already has an account**, `inviteMember` resolves it immediately by
  scanning the first 1000 users via the Supabase admin API (there's no
  direct "get user by email" in `supabase-js`) — fine for a small
  research-team tool; would need pagination for a much larger user base.

## Known dev-mode limitation: streaming outline generation

`POST /api/ai/generate-outline` streams its response (per spec 6.9). Under
**`npm run dev`** (Next.js 16 with Turbopack), the streamed bytes never
reach the client — server-side logs confirm the route runs correctly end
to end (the AI call completes, every chunk passes through the logging
transform, and the `ai_generations` row is inserted), but a raw `curl`
against `localhost:3000` in dev mode gets 0 bytes and hangs. The identical
request against a **production build** (`npm run build && npm run start`)
streams real content back in a few seconds, so the application code is
correct — this is a Turbopack dev-server limitation with streaming Route
Handler responses, not a bug in this codebase. It will work correctly once
deployed to Vercel (which builds for production). If you need to exercise
this feature locally before deploying, use `npm run build && npm run start`
instead of `npm run dev`.

## Feature-level decisions

- **Reordering**: Objectives and sub-research questions support add/remove,
  plus reordering via up/down buttons on each row (persisted to `position`).
  New items are appended (`position` = current count). Buttons rather than
  drag-and-drop, since a mouse-only drag handle doesn't work on touch
  devices and the spec requires mobile support down to 375px.
- **DOI field**: added to the "Add/Edit paper" dialog even though Section
  6.6's field list doesn't mention it, because the spec's own dedupe rule
  ("upsert into sources, dedupe by DOI if present") needs a place to enter
  one.
- **AI screening route wired into the UI**: Section 7.3 requires
  `POST /api/ai/screen-paper` to exist; Section 6.6 doesn't call out a
  specific button for it, so it's surfaced as a small "Check against
  criteria" action next to "Extract with AI" in the paper dialog, using the
  same pasted-abstract box.
- **Two-step confirm**: the "arm, then confirm" delete pattern (no
  `window.confirm()`) was specified for Search Testing (6.5) and applied
  consistently everywhere else something gets deleted (papers, search
  blocks, project members, invites) for the same reason.
- **Realtime** is wired for exactly the three tables named in Section 11
  (`project_sources`, `theme_synthesis`, `search_tests`). Other lists
  (objectives, search blocks, screening criteria, outline sections) use
  optimistic local state + `revalidatePath` instead of a live subscription.
- **"Save as new version"** in the outline composer is a confirmation toast
  only — every generation is already logged unconditionally to
  `ai_generations` at generation time (per spec step 6), so there's nothing
  left to persist when the button is clicked.
- **Avatar**: implemented as a pasted image URL rather than a Storage
  upload flow, to keep account settings self-contained without adding a
  Supabase Storage bucket + upload UI for a single field.
- **Middleware**: Next.js 16 deprecated the `middleware.ts` convention in
  favor of `proxy.ts` (same behavior, new file name/export) — the codebase
  uses the new convention.

## Things that need action outside this codebase

- **Google OAuth**: the sign-in buttons and `/auth/callback` route are
  wired up, but you still need to enable the Google provider in
  Supabase Auth settings with your own OAuth client ID/secret — this repo
  can't do that for you.
- **Migration**: `supabase/migrations/0001_init.sql` needs to be run once
  against your Supabase project (SQL Editor, or `supabase db push` if you
  set up the CLI) before the app will have any tables to talk to.
- **Env vars**: copy `.env.example` to `.env.local` and fill in real values.
  The app is written to fail with a clear error (not a crash) from any
  `/api/ai/*` route if neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` is
  set — see `lib/ai/generate.ts`.
- **Seed data**: `npm run seed -- <your-email>` after you've signed up once
  in the app — creates a real project ("Integrated Visual Detection Methods
  for Fresh Produce Quality Assessment") populated from the actual
  SoSC-CDMS grant proposal content (YOLOv11 apple/tomato grading), used as
  realistic end-to-end test data across every page. Requires
  `SUPABASE_SERVICE_ROLE_KEY`.

## Models

`lib/ai/generate.ts` pins Anthropic to `claude-sonnet-4-5-20250929` and
OpenAI to `gpt-4o`. Change the two constants at the top of that file if you
want different defaults — every AI route goes through this one function, so
it's a one-file change as the spec requires.
