# Truth File Corrector

A local tool for QA'ing ASR ground-truth pairs against **AssemblyAI Universal-3 Pro** async transcription. Drop a folder of `(audio, ground_truth.txt)` pairings, see WER + every insertion / substitution / deletion, mark each diff as **ASR Right / ASR Wrong / Neither** (with optional inline replacement or `[inaudible]`), and export corrected ground truth per-file or as a ZIP.

## What you need

- **Python 3.10+** (`python3 --version`)
- **Node.js 20+** and **npm** (`node --version`)
- An **AssemblyAI API key** — get one at https://www.assemblyai.com/app

## Quick start

```bash
git clone https://github.com/AssemblyAI-Solutions/truth-file-corrector.git
cd truth-file-corrector
```

### Terminal A — backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e .
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Sanity check: `curl http://127.0.0.1:8000/api/health` should return `{"status":"ok"}`.

### Terminal B — frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:3000). Click **Set API key** in the top-right and paste your AssemblyAI key — it's stored only in your browser's `localStorage` and is sent only as the `x-aai-key` header on transcribe requests.

That's it.

## Using it

1. **Load pairings** — drag a folder onto the dropzone (center of the page when empty, or under "Add more pairings" in the sidebar). Two layouts are supported:
   - **Subfolder mode**: each subfolder contains exactly one audio + one `.txt`.
   - **Flat mode**: all files in one folder, paired by shared basename (`foo.mp3` ↔ `foo.txt`).
   - Or use the **Choose ground truth / Choose audio file** pickers for a single pair.
2. **Pick a pairing** from the navigator at the top of the sidebar (visible when > 1 loaded). Use the `‹ N / total ›` arrows in the header to cycle.
3. **Configure** language / medical-mode / prompt (with one-click suggestion chips) in the sidebar.
4. Hit **Compare Transcriptions** — or **Compare all** to batch-transcribe everything that hasn't been compared yet.
5. **Listen** with the audio player. The ASR transcript word-highlights in time. Click a word in the ASR column to seek there. Click the speaker icon on a diff card to play that snippet.
6. **Review** each diff in the right rail:
   - **ASR Right** ⇒ replaces the GT span with the ASR text in the corrected output.
   - **ASR Wrong** ⇒ keeps the GT span unchanged (records that you reviewed it).
   - **Neither** ⇒ reveals an inline text field for a custom replacement and an `[inaudible]` shortcut.
7. **Toggle Whisper normalizer / Ignore disfluencies** in the right rail to see how the WER and diff list change.
8. **Export**:
   - The download icon in the GT card grabs that one corrected truth file.
   - **Download all** in the header (icon appears as soon as any pair has been compared) produces a ZIP preserving the original subfolder structure.

## Stack

- **Backend** — Python 3.10+, FastAPI, a port of OpenAI Whisper's English normalizer (`whisperNormalizeWord`: 85 contractions + lowercase + strip-punct), Needleman-Wunsch DP for word-level alignment, AssemblyAI Python SDK (`speech_models=["universal-3-pro"]`).
- **Frontend** — Next.js 16 (App Router) + TypeScript, Radix Themes + CSS Modules for layout / color tokens, Zustand for state, JSZip for bulk export, `lucide-react` icons.

## Project layout

```
backend/
├── pyproject.toml
└── app/
    ├── main.py              # FastAPI app + CORS for any localhost:*
    ├── schemas.py           # pydantic request/response models
    ├── routes/
    │   ├── transcribe.py    # POST /api/transcribe
    │   └── align.py         # POST /api/align
    └── services/
        ├── aai_client.py    # AssemblyAI SDK wrapper
        └── wer.py           # NW DP alignment + whisperNormalizeWord port

frontend/
├── app/
│   ├── layout.tsx           # Radix Theme wrapper
│   ├── page.tsx             # main page
│   └── page.module.scss     # Radix-token-based styling
├── components/
│   ├── SettingsPanel.tsx    # left sidebar
│   ├── PairingList.tsx      # multi-pair navigator
│   ├── UploadZone.tsx       # folder drag-drop + single pickers
│   ├── AudioPlayer.tsx      # HTML5 audio with word-timing broadcast
│   ├── TranscriptView.tsx   # two-pane GT + ASR with diff highlights
│   ├── ComparisonPanel.tsx  # right rail (toggles + diff cards)
│   └── SettingsButton.tsx   # API key dialog
└── lib/
    ├── alignment.ts         # types + applyCorrections / liveWer / werColor
    ├── api.ts               # fetch wrappers
    ├── store.ts             # Zustand store
    ├── pairing.ts           # folder walking + name-stem matcher
    ├── download.ts          # per-file + JSZip bulk export
    └── promptSuggestions.ts # the 6 hardcoded prompt chips + language list
```

## Backend API

Both endpoints live on `http://127.0.0.1:8000`. The frontend talks to them via `NEXT_PUBLIC_BACKEND_URL` (see `frontend/.env.local` — defaults to the localhost URL).

| Endpoint | Method | Body | Notes |
|---|---|---|---|
| `/api/health` | GET | — | Liveness |
| `/api/transcribe` | POST | multipart: `audio`, `model`, `language`, `prompt`, `medical`; header `x-aai-key` | Returns `{ text, words[], audio_duration_ms }` |
| `/api/align` | POST | JSON: `ground_truth`, `asr_text`, `asr_words`, `whisper_normalize`, `ignore_disfluencies` | Returns `{ wer, metrics, gt_tokens, asr_tokens, ops, items }` |

Re-call `/api/align` with a mutated `ground_truth` to recompute WER after corrections — no AAI round-trip needed.

## Smoke test

Verify the alignment endpoint with no API key required:

```bash
curl -s -X POST http://127.0.0.1:8000/api/align \
  -H 'content-type: application/json' \
  -d '{"ground_truth":"the quick brown fox","asr_text":"the quick green fox","asr_words":[],"whisper_normalize":true,"ignore_disfluencies":true}' \
  | python3 -m json.tool
```

Expect `wer = 0.25`, one `substitute` op, and one `substitution` item with `gt_word: "brown" / asr_word: "green"`.

## Troubleshooting

- **`ENOENT … .next/server/vendor-chunks/…`** — stale Next dev cache. `rm -rf frontend/.next` and re-run `npm run dev`.
- **`Compare failed: list index out of range`** — backend crash on alignment. Make sure you're running the current `main` (this was a bug pre-fix where whisper-normalizer expansions produced indices outside the display-token mapping).
- **Audio shows `NotSupportedError: The element has no supported sources`** — React Strict Mode double-mount issue with blob URLs; covered by current `AudioPlayer.tsx` (creates + revokes URL inside one effect).
- **Toggles don't change WER or the differences list** — the realign uses a 200ms debounce; if the WER badge still doesn't move after a half-second, check the browser console for `Realign failed: …`. The backend must be running.

## Behavior parity

The WER + alignment behavior is a faithful port of the dashboard's `truth-file-corrector` tool at `apps/dashboard/src/app/(authenticated)/tools/truth-file-corrector/`:

- Normalization: `whisperNormalizeWord` (lowercase + 85 contractions + strip-punct).
- Disfluencies: `{ um, uh, ah, hm }`.
- Alignment: Needleman-Wunsch DP (cost 1 sub/ins/del, 0 match), one item per backtrace cell so diffs are always word-level.
- WER badge thresholds: ≤ 5 % green, ≤ 15 % amber, > 15 % red.

The multi-pair experience (folder upload with name-stem matching, navigator with per-pair WER badges and "K/N reviewed" counters, **Compare all**, **Download all** ZIP) is the local addition on top of the single-pair reference flow.
