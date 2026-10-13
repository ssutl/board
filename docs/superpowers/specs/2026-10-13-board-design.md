# Board — design

board.ssutl.com: a public library of my taste (product design, cars, clothes,
spaces, anything). I dump screenshots and links into it with no filing; it reads
each one, and boards form on their own from what I collect. Anyone can browse;
only I can add or edit.

Modelled on Reads (reads.ssutl.com): own repo, own Vercel project, linked out
from the ssutl-web portfolio.

## Decisions

| Question | Decision |
|---|---|
| Purpose | Curate my taste across domains; see patterns in it over time |
| Visibility | Public to browse, only I add/edit (password → signed cookie, as Reads) |
| Capture | Phone: share sheet via an Apple Shortcut. Desktop: paste/drag/URL on `/edit` |
| Links | Save the page's og:image + title; no og:image → link card. Instagram/Pinterest/X: link card with a "screenshot this instead" hint |
| Sorting | Boards emerge from the pile (no predefined categories) |
| Stability | Sticky: boards never reshuffle on their own; new boards form from Loose; splits/merges are suggestions I approve |
| Multi-board | An item can sit on up to 3 boards |
| Public look | Gallery wall: grid of board covers → masonry per board |
| Repo | New `board` repo, not inside ssutl-web |

## Stack

- Next.js (app router) + TypeScript on Vercel
- Neon Postgres + pgvector
- Vercel Blob for images
- Gemini: `gemini-2.5-flash` (as Reads) for crop + caption + tags + board
  names; **`gemini-embedding-2`** (the multimodal model Reads already uses for
  text) for image+caption embeddings at 1536 dims. It takes no task_type, so
  task hints go in the text part (Reads' `DOCUMENT_PREFIX` / `QUERY_PREFIX`).
  Every embedding call goes through one `embed()` function.
- `sharp` for cropping/resizing
- Vitest

Pieces to port from Reads: session auth (`src/lib/auth`, cookie/env renamed to
`board_session` / `BOARD_SECRET` / `BOARD_PASSWORD`), k-means and its
tests (`src/lib/vectors`), the Gemini client and `rateLimitDelayMs`
(`src/lib/ai/gemini.ts`), the time-budget helpers (`src/lib/ai/budget.ts`, used
to stop the cron sweep before Vercel's 300 s), the `/edit` password-in-place
layout + SignInForm + signIn action, `proxy.ts`, `scripts/migrate.mts`, vector
helpers in `src/lib/db/vector.ts`. Reads' budget.ts is a *time* budget; the
daily Gemini *call cap* below is new.

## Data model

```
items
  id              uuid
  created_at
  kind            'image' | 'link'
  status          'pending' | 'processing' | 'ready' | 'failed'
  claimed_at      timestamptz null  (processing older than 10 min is reclaimed)
  attempts        int  (pipeline retries, max 3)
  error           text null
  content_hash    text unique null   (sha256 of uploaded bytes; dedupe)
  original_url    text null   Blob URL of the upload, untouched
  image_url       text null   Blob URL of the image shown publicly (cropped unless use_crop is false)
  uncropped_url   text null   Blob URL of the resized, uncropped image
  use_crop        bool default true  ("use original instead of crop" sets false and reprocesses)
  source_url      text null   the link shared, if any
  title           text null   page title or AI caption
  caption         text null
  tags            jsonb  { what, colours[], palette[], materials[], era, mood[] }
                  palette = basic colours from a fixed list (red, orange, yellow, green,
                  blue, purple, pink, brown, beige, black, white, grey, silver, gold); drives the colour chips
  width, height   int null   (of the image shown; for next/image)
  embedding       vector(1536) null
  hidden          bool default false
  blocked_source  bool default false  (Instagram/Pinterest/X link)

boards
  id, slug (unique), name, description
  cover_item_id   null
  centroid        vector(1536)
  hidden          bool default false
  created_at, updated_at

board_items
  board_id, item_id, similarity real
  pinned          bool default false   (I placed it by hand; AI never moves it)
  excluded        bool default false   (I removed it; AI never re-adds it)
  primary key (board_id, item_id)

suggestions
  id, type ('split' | 'merge'), payload jsonb, status ('open' | 'accepted' | 'rejected'),
  fingerprint text unique  (type + sorted member ids; stops a rejected suggestion reopening), created_at

ai_usage
  (day date, purpose 'pipeline' | 'search') primary key, calls int
  (daily Gemini call caps: GEMINI_DAILY_CALLS default 500 for the pipeline, SEARCH_DAILY_CALLS
  default 300 for public search, so searches can't eat the pipeline's calls)

settings
  key text primary key, value text
  drop_key_hash   (sha256 of the Shortcut's Bearer key)
  grow_lock / suggest_lock  (lease timestamps so two runs never form duplicate boards)
```

"Loose" = ready items with no non-excluded `board_items` row. No table.

A board's centroid is the mean of its member embeddings, recomputed whenever
membership changes.

## Capture: `POST /api/drop`

- Multipart form: `file` (image) **or** `url` (text). Also accepts a text
  field containing a URL (what the Shortcut sends for Safari pages).
- Auth: the edit-side session cookie **or** `Authorization: Bearer <drop key>`
  (compared against `drop_key_hash`). Anything else → 401.
- Image: compute sha256; if it exists, return the existing item (200, no new
  row). Otherwise upload the original to Blob, insert a `pending` image item,
  return `{ id }` immediately, and kick the pipeline with `after()`.
- URL: host is Instagram/Pinterest/X → `link` item with `blocked_source = true`,
  marked `ready`, never public (link cards with no image are edit-side only).
  Otherwise fetch the page (timeout 8 s, size cap), read `og:image` / `twitter:image`
  and `<title>`. With an image: download it, store as original, insert a
  `pending` image item with `source_url`. Without: `link` card, edit-side only.
- Vercel Functions reject request bodies over 4.5 MB before the route runs, so
  that is the real per-request limit. The Shortcut sends 2000 px JPEGs; desktop
  drops over 4 MB (or not JPEG/PNG/WebP/GIF) are downscaled in the browser to a
  JPEG (longest side 3000 px, then 2000 px). `MAX_UPLOAD_BYTES` (15 MB, 413)
  stays as a server-side cap. Accepted types: JPEG, PNG, WebP, GIF; anything
  else 415 (the Shortcut converts to JPEG, so HEIC never arrives).
- The form field may be `file`, `url` or `input` (the Shortcut's single field):
  a File is an image, a string is searched for its first http(s) URL.
- Outbound fetches allow http/https only and refuse localhost and private
  address literals.

## Pipeline

Runs per pending item via `after()` on drop, and via a daily sweep cron (05:00 UTC;
the project is on Vercel Hobby, which allows one run a day) that picks up `pending`
items and `failed` items with `attempts < 3`, then grows boards.

1. **Look.** One Gemini vision call on the original returns
   `{ box: [ymin, xmin, ymax, xmax] | null, caption, what, colours[], materials[], era, mood[] }`
   (box on a 0–1000 scale). `box` is set only when the image is a screenshot with app UI around a main
   picture. Crop with `sharp` (clamped to bounds; ignored if it would keep
   < 20% of the image), resize to max 2000 px, store as `image_url`.
   No crop → `image_url` is the resized original. Transparent images are flattened onto
   white during normalisation. `parseLook` and `nameBoard` truncate over-long fields
   instead of rejecting the response.
2. **Embed.** `embed({ image: image_url bytes, text: caption })` → 1536-d vector.
3. **Place.** Cosine similarity to every visible board's centroid. Join every
   board with similarity ≥ `JOIN_THRESHOLD`, best 3 at most, skipping boards
   where this item is `excluded`. None → stays Loose. Recompute affected
   centroids. Mark item `ready`.
4. **Grow.** If Loose has ≥ 12 items, seed-and-grow over Loose embeddings only
   (k-means with chooseK was rejected: Reads' `kRange` forces k ≥ 3 above 12 points,
   which would split real clusters into fragments that fail the size gate):
   pick the point with the most neighbours at similarity ≥ `TIGHT_THRESHOLD`,
   gather the points within `JOIN_THRESHOLD` of their centroid, keep the group if it
   has ≥ 6 members and mean similarity to its centroid ≥ `TIGHT_THRESHOLD`, then
   repeat. Each kept group becomes a board. Gemini names it (2–4 words) and writes
   one sentence; cover = member nearest the centroid. Existing boards are not
   modified in this step. (k-means with k = 2 is still used for split suggestions.)

Nightly cron, **suggestions**:
- **Split:** for each board with ≥ 12 items, k=2 on its members; if both halves
  have ≥ 6 items and the two sub-centroids' similarity < `SPLIT_THRESHOLD`,
  open a `split` suggestion with the two proposed groups and names.
- **Merge:** any two boards whose centroids' similarity ≥ `MERGE_THRESHOLD`
  → `merge` suggestion. One open suggestion per board pair/board at a time;
  a rejected suggestion is not reopened for the same membership.
- Accepting applies it; pinned memberships are carried over. `mergeBoards` also
  keeps the dropped board's exclusions, so a removed item doesn't come back.

Thresholds live in one config file and start as: `JOIN_THRESHOLD` and
`TIGHT_THRESHOLD` tuned on my first real batch (initial guesses 0.72 / 0.75),
`SPLIT_THRESHOLD` 0.6, `MERGE_THRESHOLD` 0.9. Tuning them is expected.

Claiming: a run sets `pending → processing` atomically before starting, so the
`after()` run and the cron never process the same item twice. The attempt is
counted at claim, not on failure. A claim stale for 10 minutes is reclaimed; if
it has already used 3 attempts, `failExhaustedClaims` marks it failed instead
(so a function that timed out can't loop forever).

Failure: any step throws → `status = 'failed'`, `error` saved.
After 3 attempts it stays failed until retried by hand. Gemini calls count
against the daily call cap; over the cap → the item goes back to pending
without using an attempt, and is picked up the next day. Images are normalised
first (EXIF rotation, JPEG) so Gemini's crop box and `sharp` agree. Gemini
returns the box as `[ymin, xmin, ymax, xmax]` on a 0–1000 scale.

## Public site

Only `ready`, non-hidden image items with at least one non-excluded membership
in a non-hidden board are ever visible (so Loose items are private). This is
one SQL fragment used by every public query.
A hidden or non-public id returns the same 404 as a missing one.

- `/` — gallery wall: board covers (cover + 2 most recent items as a mosaic),
  name, item count; boards ordered by most recently added item. Search box
  (`/` focuses it).
- `/b/[slug]` — board name and description, colour chips from members' tags
  (filter), masonry of items newest first.
- `/i/[id]` — sheet over the board (own page when opened directly): full image,
  caption, tags, source link, boards it's on, "more like this" (nearest 12
  across all boards). Similar items are only shown when the item itself is public.
- Search — embed the query text with the same model; masonry of nearest items
  plus boards whose centroid matches. Query capped at 200 chars.
- Images through `next/image` from Blob. Board cover is the board's OG image.
- Mobile-first; masonry drops to 2 columns on phones.

## Edit side (`/edit`)

Password box in place of the page without a session (as Reads). Sections:

Routes: `/edit` (drop + inbox), `/edit/loose`, `/edit/items/[id]`, `/edit/boards`,
`/edit/boards/[id]`, `/edit/suggestions`, `/edit/shortcut`.

- **Drop** (`/edit`) — ⌘V paste, drag files, paste URL; posts to `/api/drop`.
- **Inbox** (`/edit`) — pending and failed items; retry button on failed.
- **Loose** (`/edit/loose`) — grid of unplaced items, plus link cards (incl. "screenshot this
  instead" for blocked sources).
- **Suggestions** — split/merge with item previews; accept/reject.
- **Item actions** — hide/show, delete (removes Blob files), add to board
  (`pinned`), remove from board (`excluded`), use original instead of crop.
- **Board actions** — rename, edit description, choose cover, hide.
- **Shortcut** — generate/rotate the drop key (shown once), and the step-by-step
  Apple Shortcut setup: Show in Share Sheet (Images, URLs, Safari web pages)
  → Convert Image to JPEG → Resize Image (2000 px) → Get Contents of URL (POST `/api/drop`, Bearer
  header, form field) → Show Notification "Saved".

Every server action and mutating route checks the session.

## Testing

Vitest, Gemini and Blob mocked with fixed captions/crops/embeddings. SQL is
tested for real against in-memory PGlite with the pgvector extension, through
a small `query(text, params)` interface that Neon's `sql.query` also satisfies.

- Placement: thresholds, best-3 cap, excluded boards skipped, centroid updates.
- Grow: only Loose items clustered, size and tightness gates, existing boards untouched.
- Suggestions: split and merge detection, no duplicate or reopened suggestions,
  pinned memberships survive.
- Crop: clamping, the 20% guard.
- Drop: file vs URL, og:image vs link card vs blocked host, dedupe by hash,
  size/type rejection, both auth paths, 401 otherwise.
- Visibility: pending/failed/hidden items and hidden boards never appear in any
  public page or API; hidden ids 404 like missing ones.

## Setup

New Vercel project `board` (Framework Preset: Next.js), Neon in my own account with
the `vector` extension, Vercel Blob store `board-images`. Env vars are Production-only
secrets, so they can't be pulled locally; migrations run in the `vercel-build`
script on deploy rather than from a dev machine. Env: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`,
`GEMINI_API_KEY`, `BOARD_PASSWORD`, `BOARD_SECRET`, `CRON_SECRET`; optional
`GEMINI_DAILY_CALLS`, `SEARCH_DAILY_CALLS`.
DNS: `board.ssutl.com` → Vercel. Add a link-out entry in ssutl-web's
`src/data/projects.ts`.

## Out of scope (v1)

Browser extension, Back Tap capture, fetching Instagram/Pinterest/X content,
multiple users, the taste-map view.
