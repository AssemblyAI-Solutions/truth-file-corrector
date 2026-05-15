import type { AlignResponse, TranscribeResponse, WordTiming } from "./alignment";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

export type TranscribeOptions = {
  apiKey: string;
  audio: File;
  model: string;
  language: string;
  prompt: string;
  medical: boolean;
};

export async function transcribe(opts: TranscribeOptions): Promise<TranscribeResponse> {
  const fd = new FormData();
  fd.append("audio", opts.audio);
  fd.append("model", opts.model);
  fd.append("language", opts.language);
  fd.append("prompt", opts.prompt);
  fd.append("medical", String(opts.medical));

  const res = await fetch(`${BASE}/api/transcribe`, {
    method: "POST",
    headers: { "x-aai-key": opts.apiKey },
    body: fd,
  });
  if (!res.ok) {
    const detail = await safeError(res);
    throw new Error(detail || `Transcribe failed (${res.status})`);
  }
  return res.json();
}

export type AlignOptions = {
  groundTruth: string;
  asrText: string;
  asrWords: WordTiming[];
  whisperNormalize: boolean;
  ignoreDisfluencies: boolean;
};

export async function align(opts: AlignOptions): Promise<AlignResponse> {
  const res = await fetch(`${BASE}/api/align`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ground_truth: opts.groundTruth,
      asr_text: opts.asrText,
      asr_words: opts.asrWords,
      whisper_normalize: opts.whisperNormalize,
      ignore_disfluencies: opts.ignoreDisfluencies,
    }),
  });
  if (!res.ok) {
    const detail = await safeError(res);
    throw new Error(detail || `Align failed (${res.status})`);
  }
  return res.json();
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    return JSON.stringify(body);
  } catch {
    return res.statusText;
  }
}
