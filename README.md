# Board

Home for my taste at board.ssutl.com: drop in screenshots and links, no filing. Each one
is read by Gemini, embedded, and placed on boards that form on their own from what I collect.
Anyone can browse; only I can add or edit.

Two surfaces:

- **The public site** — a gallery wall:
  - `/` — board covers (cover plus the two newest items, three tiles), most recently added first, and a search box.
  - `/b/[slug]` — a board's description, colour chips (filter by the members' palette) and a
    masonry of its items, newest first.
  - `/i/[id]` — one item: image, caption, tags, source link, the boards it is on and "more like
    this". Opened from a board it is a sheet over the board; opened directly it is its own page.
  - `/search` — words are embedded with the same model; nearest items plus boards whose centroid matches.
- **The edit side (`/edit`)** — behind the password:
  - `/edit` — drop (paste, drag, or paste a URL) and the inbox of pending and failed items, with retry.
  - `/edit/loose` — items on no board, plus link cards (including "screenshot this instead" for blocked sources).
  - `/edit/items/[id]` — hide/show, delete, add to a board (pins it), remove from a board
    (excludes it), use the original instead of the crop.
  - `/edit/boards` and `/edit/boards/[id]` — rename, description, cover, hide. A board
    disappears when its last member is removed.
  - `/edit/suggestions` — split and merge suggestions to accept or reject.
  - `/edit/shortcut` — generate or rotate the drop key and set up the Apple Shortcut.

## Who sees what

One SQL fragment, `PUBLIC_MEMBERSHIPS` in `src/lib/db/public.ts`, decides what is public: an item
is visible only through a membership that isn't excluded, on a board that isn't hidden, when the
item is a ready, unhidden image. Every public read goes through it, so Loose, pending, failed,
hidden and link-only items are never public. A hidden or non-public id returns the same 404 as
a missing one.

`/edit` is behind `BOARD_PASSWORD`, which signs a `board_session` cookie (`BOARD_SECRET`).
There is no sign-in page: without a session the edit layout shows a password box in its place.
The layout is not the gate. The proxy (`src/proxy.ts`) shuts `/edit` to non-navigations, and
every server action calls `requireSession()` before doing anything.

## Capture

- **Phone:** an Apple Shortcut in the share sheet (Images, URLs, Safari web pages) → Convert
  Image to JPEG → Resize Image to 2000 px wide → Get Contents of URL (POST `/api/drop`, `Authorization: Bearer <key>`, one form
  field) → Show Notification. Generate the key and see the steps at `/edit/shortcut`; only a
  hash of the key is stored, and it is shown once.
- **Desktop:** paste, drag or paste a URL on `/edit`. Images over 4 MB, or of another type
  (e.g. HEIC), are downscaled in the browser to a JPEG (longest side 3000 px, then 2000 px)
  before upload.

Vercel Functions reject request bodies over 4.5 MB before the route runs, so that is the
real per-request limit; the Shortcut sends 2000 px JPEGs and desktop drops are shrunk to fit.

`POST /api/drop` (multipart form):

- Field `file` (an image), `url` or `input` (the Shortcut's single field). A File is an image; a
  string is searched for its first http(s) URL.
- Auth: the edit session cookie or the Bearer drop key. Otherwise 401.
- Images are sniffed by magic bytes: JPEG, PNG, WebP, GIF. Anything else is 415. Over
  `MAX_UPLOAD_BYTES` (15 MB, a server-side cap behind Vercel's 4.5 MB request limit) is 413. A missing or unusable field is 400.
- The same bytes twice (sha256) return the existing item with `duplicate: true` and no new row.
  Otherwise the original goes to Blob, a `pending` item is inserted, `{ id }` returns at once
  and processing continues in `after()`.
- A URL is fetched (8 s, size capped, http/https only, private addresses refused) and its
  `og:image` / `twitter:image` is saved as the image with the page title. No image makes a link
  card, which is edit-side only. Instagram, Pinterest and X become link cards without fetching.

## Pipeline

Per item, in `src/lib/pipeline/process.ts`:

1. **Claim** `pending → processing` atomically and count the attempt. Max 3. A claim stuck
   over 10 minutes is reclaimed, or failed if it has used its attempts.
2. **Normalise** (EXIF rotation, transparency flattened onto white, JPEG) so Gemini's box and
   `sharp` agree.
3. **Look** — one `gemini-2.5-flash` call returns caption, tags and, for screenshots with app UI,
   a crop box `[ymin, xmin, ymax, xmax]` on 0–1000. A crop that would keep under 20% is ignored.
   The image is resized to 2000 px.
4. **Embed** — `gemini-embedding-2`, 1536 dimensions, from the image plus its caption.
5. **Place** — join up to 3 boards whose centroid is at least `JOIN_THRESHOLD` similar, skipping
   hidden boards and boards the item was removed from. Pinned boards count toward the 3. No match
   leaves it Loose.
6. **Grow** — with at least 12 Loose items, seed-and-grow forms new boards from Loose only. Take
   the point with the most close neighbours, gather points near its centroid, keep the group if it
   is big and tight enough, repeat. Gemini names each board. Existing boards are untouched.

When Gemini rate-limits, the item waits out the delay once (up to 65 s) and retries. If it is
still rate-limited, or the daily Gemini call cap is spent, it goes back to `pending` without
using an attempt; the inbox offers Retry for pending, failed and stuck items.

Crons (`vercel.json`; both need `CRON_SECRET`, which Vercel sends as a Bearer token):

- `/api/cron/sweep`, **daily at 05:00 UTC**: picks up pending items, retries failed ones with
  attempts left, and grows boards. Daily because the project is on Vercel Hobby, which allows
  one run a day; the drop's `after()` does the real-time work.
- `/api/cron/suggest`, daily at 04:00 UTC: opens split suggestions (a board of 12+ whose two
  k-means halves are under `SPLIT_THRESHOLD`) and merge suggestions (two boards at or over
  `MERGE_THRESHOLD`). A rejected suggestion is not reopened for the same members. Nothing
  changes until I accept.

## Setup

1. Vercel project `board` (Framework Preset: Next.js).
2. Neon in my own account, with the `vector` extension. Use the pooled connection string.
3. Vercel Blob store `board-images`.
4. Set every variable in `.env.example` as a **Production** secret. Secrets can't be pulled
   locally, so there is no local database; migrations (`scripts/migrate.mts`, files in
   `db/migrations/`) run in the `vercel-build` script on production deploys
   (preview builds skip them).
5. DNS: `board.ssutl.com` → Vercel.
6. Open `/edit`, generate a drop key, build the Shortcut.

`GEMINI_DAILY_CALLS` (default 500) caps pipeline calls per UTC day and `SEARCH_DAILY_CALLS`
(default 300) caps public searches, counted separately in `ai_usage`.

## Development

- `npm test` runs everything against in-memory PGlite with pgvector, with Gemini and Blob mocked.
  It needs no env vars.
- `npm run build` works without a database.
- `npm run db:migrate` needs `.env.local` with `DATABASE_URL`; in practice migrations run on deploy.

## Thresholds

All in `src/lib/config.ts`: join, tight, split and merge similarity, board size gates, attempts,
upload and image limits. They are first guesses. Tune them on real items once there are enough.
