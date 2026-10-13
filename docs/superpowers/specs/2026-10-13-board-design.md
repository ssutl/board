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
- Gemini: a vision model for crop + caption + tags; **Gemini Embedding 2**
  (`gemini-embedding-2-preview`, multimodal) for image+caption embeddings at
  1536 dims. It is in preview, so every embedding call goes through one
  `embed()` function so the model can be swapped in one file.
- `sharp` for cropping/resizing
- Vitest

Pieces to port from Reads: session auth (`src/lib/auth`), k-means and chooseK
(`src/lib/vectors`), Gemini client and daily budget guard (`src/lib/ai`), the
`/edit` password-in-place layout, vector helpers in `src/lib/db`.

## Data model

```
items
  id              uuid
  created_at
  kind            'image' | 'link'
  status          'pending' | 'ready' | 'failed'
  attempts        int  (pipeline retries, max 3)
  error           text null
  content_hash    text unique null   (sha256 of uploaded bytes; dedupe)
  original_url    text null   Blob URL of the upload, untouched
  image_url       text null   Blob URL of the cropped image shown publicly
  source_url      text null   the link shared, if any
  title           text null   page title or AI caption
  caption         text null
  tags            jsonb  { what, colours[], materials[], era, mood[] }
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
  id, type ('split' | 'merge'), payload jsonb, status ('open' | 'accepted' | 'rejected'), created_at

settings
  drop_key_hash   (hash of the Shortcut's Bearer key)
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
- Upload size cap 15 MB; non-image files rejected (400).

## Pipeline

Runs per pending item via `after()` on drop, and via a Vercel cron every 15
minutes that picks up `pending` items and `failed` items with `attempts < 3`.

1. **Look.** One Gemini vision call on the original returns
   `{ crop: {x,y,w,h} | null, caption, what, colours[], materials[], era, mood[] }`.
   `crop` is set only when the image is a screenshot with app UI around a main
   picture. Crop with `sharp` (clamped to bounds; ignored if it would keep
   < 20% of the image), resize to max 2000 px, store as `image_url`.
   No crop → `image_url` is the resized original.
2. **Embed.** `embed({ image: image_url bytes, text: caption })` → 1536-d vector.
3. **Place.** Cosine similarity to every visible board's centroid. Join every
   board with similarity ≥ `JOIN_THRESHOLD`, best 3 at most, skipping boards
   where this item is `excluded`. None → stays Loose. Recompute affected
   centroids. Mark item `ready`.
4. **Grow.** If Loose has ≥ 12 items: k-means (Reads' chooseK) over Loose
   embeddings only. Each cluster with ≥ 6 members whose mean similarity to the
   cluster centroid ≥ `TIGHT_THRESHOLD` becomes a board. Gemini names it
   (2–4 words) and writes one sentence; cover = member nearest the centroid.
   Existing boards are not modified in this step.

Nightly cron, **suggestions**:
- **Split:** for each board with ≥ 12 items, k=2 on its members; if both halves
  have ≥ 6 items and the two sub-centroids' similarity < `SPLIT_THRESHOLD`,
  open a `split` suggestion with the two proposed groups and names.
- **Merge:** any two boards whose centroids' similarity ≥ `MERGE_THRESHOLD`
  → `merge` suggestion. One open suggestion per board pair/board at a time;
  a rejected suggestion is not reopened for the same membership.
- Accepting applies it; pinned memberships are carried over.

Thresholds live in one config file and start as: `JOIN_THRESHOLD` and
`TIGHT_THRESHOLD` tuned on my first real batch (initial guesses 0.72 / 0.75),
`SPLIT_THRESHOLD` 0.6, `MERGE_THRESHOLD` 0.9. Tuning them is expected.

Failure: any step throws → `status = 'failed'`, `attempts++`, `error` saved.
After 3 attempts it stays failed until retried by hand. Gemini calls go through
the daily budget guard; over budget → items stay pending until the next day.

## Public site

Only `ready`, non-hidden image items on non-hidden boards are ever visible.
A hidden or non-public id returns the same 404 as a missing one.

- `/` — gallery wall: board covers (cover + 2 most recent items as a mosaic),
  name, item count; boards ordered by most recently added item. Search box
  (`/` focuses it).
- `/b/[slug]` — board name and description, colour chips from members' tags
  (filter), masonry of items newest first.
- `/i/[id]` — sheet over the board (own page when opened directly): full image,
  caption, tags, source link, boards it's on, "more like this" (nearest 12
  across all boards).
- Search — embed the query text with the same model; masonry of nearest items
  plus boards whose centroid matches. Query capped at 200 chars.
- Images through `next/image` from Blob. Board cover is the board's OG image.
- Mobile-first; masonry drops to 2 columns on phones.

## Edit side (`/edit`)

Password box in place of the page without a session (as Reads). Sections:

- **Drop** — ⌘V paste, drag files, paste URL; posts to `/api/drop`.
- **Inbox** — pending and failed items; retry button on failed.
- **Loose** — grid of unplaced items, plus link cards (incl. "screenshot this
  instead" for blocked sources).
- **Suggestions** — split/merge with item previews; accept/reject.
- **Item actions** — hide/show, delete (removes Blob files), add to board
  (`pinned`), remove from board (`excluded`), use original instead of crop.
- **Board actions** — rename, edit description, choose cover, hide.
- **Shortcut** — generate/rotate the drop key (shown once), and the step-by-step
  Apple Shortcut setup: Show in Share Sheet (Images, URLs, Safari web pages)
  → Convert Image to JPEG → Get Contents of URL (POST `/api/drop`, Bearer
  header, form field) → Show Notification "Saved".

Every server action and mutating route checks the session.

## Testing

Vitest, Gemini mocked with fixed captions/crops/embeddings.

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

New Vercel project (Framework Preset: Next.js), Neon with the `vector`
extension, Vercel Blob store. Env: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`,
`GEMINI_API_KEY`, `BOARD_PASSWORD`, `BOARD_SECRET`, `CRON_SECRET`.
DNS: `board.ssutl.com` → Vercel. Add a link-out entry in ssutl-web's
`src/data/projects.ts`.

## Out of scope (v1)

Browser extension, Back Tap capture, fetching Instagram/Pinterest/X content,
multiple users, the taste-map view.
