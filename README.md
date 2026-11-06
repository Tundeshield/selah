# Selah Studio

**One sermon. A week of ministry content.** — a Dove product.

Selah Studio turns sermon recordings into reviewable, editable and publishable media: short vertical video clips with burned‑in captions, quote graphics, sermon summaries, devotionals, articles, social captions and podcast‑ready audio. Nothing is published without a person approving it.

## Stack

| Layer | Technology |
| --- | --- |
| Web app | React 18 + Vite + TypeScript + Tailwind (`web/`) — hosted on **Netlify** |
| Design system | Modelled on Chakra UI Pro: Outfit (self-hosted), zinc greys, one accent colour, small radii |
| Auth | Firebase Authentication (email/password + Google) |
| Database | Cloud Firestore — every church record lives under `churches/{churchId}/…` |
| Media storage | Cloud Storage for Firebase |
| Backend | Cloud Functions for Firebase, 2nd gen, Node 20 (`functions/`) |
| Async processing | Cloud Tasks queues (`onTaskDispatched`) — upload, then leave the page |
| Transcription | Deepgram (pre-recorded API, word timestamps, diarisation) |
| AI analysis & writing | Anthropic Claude (structured tool output) |
| Video / audio rendering | ffmpeg (bundled via `ffmpeg-static`) |

## How it works

```
Upload ─► probe ─► transcribe ─► analyse ─► generate ─► render (per clip / podcast) ─► Needs review
                                                                                         │
                                Approve ◄───────── edit / request changes (new version) ◄┘
                                   │
                        Schedule ─► mark published manually (or record failure)
```

**Integrity safeguards (server-side)**

- Quotes for graphics and "important statements" are kept only if they match the transcript word‑for‑word (punctuation, case and filler words ignored). Edited quotes that drift are flagged.
- Scripture references are checked against what was actually spoken; unverified ones are flagged for review, never silently kept.
- Generated prose is written *about* the sermon, never in the pastor's voice. Unclear transcript passages are surfaced as review flags.
- Every asset keeps its source sermon, segment range and timestamps.
- All status changes (approve, schedule, publish) go through Cloud Functions. Firestore rules make assets, versions, publications and audit records read‑only to clients. Scheduling/publishing requires `approvedVersion === version`, so edited content needs approval again.
- No direct platform publishing in the MVP — scheduled items are clearly labelled for manual publication and are only marked published when a person confirms it.

**Roles**: Administrator (everything), Media editor (review, approve, schedule, publish), Contributor (upload, edit, request changes). Who can publish is configurable in Church Settings → Approvals.

## Setup

### 1. Firebase project

1. Create a Firebase project (the repo defaults to the id `selah-studio`; change `.firebaserc` if yours differs). Upgrade it to the **Blaze** plan (required for Cloud Functions / Cloud Tasks).
2. Enable **Authentication** → Email/Password and Google. Add your Netlify domain under Authentication → Settings → Authorized domains.
3. Create a **Firestore** database (production mode) and enable **Storage**.
4. Register a **Web app** and copy its config.

### 2. Secrets for processing

```bash
npm i -g firebase-tools
firebase login
firebase functions:secrets:set DEEPGRAM_API_KEY     # from console.deepgram.com
firebase functions:secrets:set ANTHROPIC_API_KEY    # from console.anthropic.com
```

To deploy before you have a key, set the secret to the literal value `unset`. The app then shows the integration as not configured instead of pretending to process: without Deepgram you can import `.txt`/`.srt`/`.vtt` transcripts; without Anthropic, processing stops after transcription with a clear message.

Optional non-secret settings: copy `functions/.env.example` to `functions/.env` (`ANTHROPIC_MODEL`, `DEEPGRAM_MODEL`, `FUNCTIONS_REGION`).

### 3. Deploy the backend

**Automatic (recommended, nothing to install):** `.github/workflows/firebase-deploy.yml` deploys rules, indexes and functions from GitHub Actions on every push to `main` that touches the backend, or on demand from the Actions tab. It needs one repository secret, `FIREBASE_SERVICE_ACCOUNT` (a service-account JSON key from the Firebase project). Add `DEEPGRAM_API_KEY` and `ANTHROPIC_API_KEY` as repository secrets when you have them; until then they're deployed as `unset`.

**Manual alternative:**

```bash
cd functions && npm ci && cd ..
firebase deploy --only firestore,storage,functions
```

- On first deploy of `storage.rules`, accept the prompt that lets Storage rules read Firestore (used for church membership checks).
- If enqueueing tasks fails with a permission error, grant the default compute service account `roles/cloudtasks.enqueuer` and `roles/iam.serviceAccountUser`.
- Allow quote-graphic PNG export with your logo (canvas needs CORS on the bucket):
  ```bash
  gsutil cors set cors.json gs://<your-bucket>
  ```

### 4. Deploy the web app (Netlify)

`netlify.toml` builds `web/` and serves it as an SPA. In Netlify → Site settings → Environment variables add:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FUNCTIONS_REGION   # us-central1 unless you changed it
```

Until these are set, the site shows a "Configuration needed" screen listing what's missing.

### Local development

```bash
cd web && cp .env.example .env.local   # fill in values
npm ci && npm run dev
```

To use the Firebase emulators set `VITE_USE_EMULATORS=true`, copy `functions/.secret.local.example` to `functions/.secret.local`, then run `firebase emulators:start`. The sidebar shows a "Development environment" label when emulators are in use. No sample sermons are hard-coded anywhere.

## Design system

The UI follows Chakra UI Pro's look: Outfit type, zinc greys (`#111111` text, `#52525b` muted, `#e4e4e7` borders, `#fcfcfc` page), a single accent and "sm" radii. Tokens live in `web/tailwind.config.js` and `web/src/index.css`.

The accent is a CSS variable scale (`--brand-50` … `--brand-950`). Cyan is the default; switch to teal or blue by changing `data-accent` on `<html>` in `web/index.html`, or edit the values in `index.css` for any other colour.

## Supported uploads

MP3, M4A, WAV, AAC, OGG, FLAC, MP4, MOV, WEBM, MKV — up to 2 GB. The same list is enforced in `web/src/lib/constants.ts`, `storage.rules` and `functions/src/sermons.ts`.

## Data model

```
users/{uid}                                  profile, churchIds, activeChurchId
churches/{churchId}                          profile, brand, content prefs, approval settings
  members/{uid}                              role: admin | editor | contributor
  invites/{inviteId}                         pending invitations (accepted after email verification)
  sermons/{sermonId}                         metadata, media path, processing stages + history, summary, scripture
  transcripts/{sermonId}                     timestamped segments (+ word timings in Storage)
  assets/{assetId}                           type, status, version, approvedVersion, content, source timestamps, flags
    versions/{n}                             immutable snapshot of each version (incl. media path)
    revisions/{id}                           change requests and their outcome
  publications/{id}                          platform, scheduledAt, caption, status, manual/integration, errors
  notifications/{id}                         per user, consolidated per sermon
  auditEvents/{id}                           who did what, previous → new state
```

Storage: `churches/{churchId}/sermons/{sermonId}/original.*` (originals are never modified), `churches/{churchId}/assets/{assetId}/v{n}.mp4|jpg|vtt|mp3` (every version kept), `churches/{churchId}/branding/*`.

## Not in the MVP (by design)

Direct publishing integrations, advanced video timeline editing, multi‑campus, analytics and performance‑based recommendations.

## Fonts

Video captions use Liberation Sans (SIL Open Font License, see `functions/assets/fonts/LICENSE-Liberation.txt`).
