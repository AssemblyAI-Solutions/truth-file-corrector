# Truth File Corrector

Local-only tool for QA'ing ASR ground-truth pairs. Drop in `(audio, ground_truth.txt)` pairings, transcribe each with AssemblyAI Universal-3 Pro, see WER (jiwer + whisper-normalizer), review every insertion / substitution / deletion, mark each as **ASR Right / Wrong / Neither**, and export corrected truth files per-pair or as a ZIP.

## Layout

```
backend/   # FastAPI + jiwer + whisper-normalizer + AssemblyAI SDK
frontend/  # Next.js 16 (App Router) + Zustand + Tailwind + JSZip
```

## Run locally

### 1. Backend (terminal A)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e .
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Health check: `curl http://127.0.0.1:8000/api/health`.

### 2. Frontend (terminal B)

```bash
cd frontend
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:3000`). Click the API-key button in the top-right and paste your AssemblyAI key — it's stored only in `localStorage` and sent on transcribe requests as the `x-aai-key` header.

## Usage

1. **Load pairings**: drag a folder onto the upload zone (left sidebar or center stage when empty).
   - **Subfolder mode**: each subfolder containing exactly one audio + one `.txt` becomes a pairing.
   - **Flat mode**: audio and text are matched by shared basename (`foo.mp3` ↔ `foo.txt`).
   - Or use the file pickers for a single pair.
2. Pick a pairing from the navigator (visible when > 1 loaded), configure language / prompt / model in the sidebar, hit **Compare Transcriptions**.
3. Listen with the audio player — the ASR transcript word-highlights in time. Click a diff's speaker button to seek to that section.
4. For each diff in the right rail, choose **ASR Right** / **ASR Wrong** / **Neither**. WER recomputes immediately. Toggle the GT card to **Corrected** to read the final reference.
5. **Download** the corrected truth for one pair, or hit **Download all** in the header for a ZIP that preserves the original subfolder structure.

## Backend API

Both endpoints live on `http://127.0.0.1:8000`. The frontend talks to them via `NEXT_PUBLIC_BACKEND_URL` (`frontend/.env.local`).

| Endpoint | Method | Body | Notes |
|---|---|---|---|
| `/api/health` | GET | — | Liveness |
| `/api/transcribe` | POST | multipart: `audio`, `model`, `language`, `prompt`, `medical`; header `x-aai-key` | Returns `{ text, words[], audio_duration_ms }` |
| `/api/align` | POST | JSON: `ground_truth`, `asr_text`, `asr_words`, `whisper_normalize`, `ignore_disfluencies` | Returns `{ wer, metrics, gt_tokens, asr_tokens, ops }` |

Re-call `/api/align` with a mutated `ground_truth` to recompute WER after corrections — no AAI round-trip.

## Verifying

Smoke-test the alignment alone (no API key needed):

```bash
curl -s -X POST http://127.0.0.1:8000/api/align \
  -H 'content-type: application/json' \
  -d '{"ground_truth":"the quick brown fox","asr_text":"the quick green fox","asr_words":[],"whisper_normalize":true,"ignore_disfluencies":true}' \
  | python3 -m json.tool
```

Expect `wer = 0.25` and one `substitute` op.
