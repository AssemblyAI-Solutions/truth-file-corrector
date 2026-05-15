export type OpType = "equal" | "substitute" | "insert" | "delete";
export type ErrorType = "substitution" | "insertion" | "deletion";

export type WordTiming = {
  text: string;
  start: number;
  end: number;
  confidence?: number | null;
};

export type GTToken = {
  id: number;
  text: string;
  norm: string;
};

export type ASRToken = {
  id: number;
  text: string;
  norm: string;
  start?: number | null;
  end?: number | null;
};

export type AlignOp = {
  id: string;
  type: OpType;
  gt: [number, number];
  asr: [number, number];
  item_id?: string | null;
};

export type DiffItem = {
  id: string;
  error_type: ErrorType;
  gt_word: string;
  asr_word: string;
  gt_idx: number | null;
  asr_idx: number | null;
  timestamp_ms: number | null;
};

export type AlignMetrics = {
  S: number;
  D: number;
  I: number;
  N_ref: number;
  N_hyp: number;
};

export type AlignResponse = {
  wer: number;
  metrics: AlignMetrics;
  gt_tokens: GTToken[];
  asr_tokens: ASRToken[];
  ops: AlignOp[];
  items: DiffItem[];
};

export type TranscribeResponse = {
  text: string;
  words: WordTiming[];
  audio_duration_ms: number;
};

export type CorrectionType = "asr-correct" | "asr-wrong" | "neither";

export type Correction = {
  type: CorrectionType;
  replacement?: string;
};

/** Rebuild the corrected ground truth by applying corrections to the GT side. */
export function applyCorrections(
  gt: GTToken[],
  asr: ASRToken[],
  ops: AlignOp[],
  corrections: Record<string, Correction | undefined>,
): string {
  const pieces: string[] = [];
  for (const op of ops) {
    if (op.type === "equal") {
      for (let i = op.gt[0]; i < op.gt[1]; i++) pieces.push(gt[i].text);
      continue;
    }
    const corr = op.item_id ? corrections[op.item_id] : undefined;
    if (!corr) {
      // Untouched: keep original GT span (deletion keeps the word, substitution keeps GT, insertion adds nothing).
      for (let i = op.gt[0]; i < op.gt[1]; i++) pieces.push(gt[i].text);
      continue;
    }
    if (corr.type === "asr-wrong") {
      // Explicitly mark ASR as wrong — keep original GT untouched.
      for (let i = op.gt[0]; i < op.gt[1]; i++) pieces.push(gt[i].text);
      continue;
    }
    if (corr.type === "asr-correct") {
      // Apply the ASR span verbatim.
      for (let i = op.asr[0]; i < op.asr[1]; i++) pieces.push(asr[i].text);
      continue;
    }
    // "neither" with optional user-supplied replacement.
    if (corr.replacement && corr.replacement.trim()) {
      pieces.push(corr.replacement.trim());
    } else {
      // No custom replacement — fall back to original GT (effectively a no-op).
      for (let i = op.gt[0]; i < op.gt[1]; i++) pieces.push(gt[i].text);
    }
  }
  return pieces.join(" ");
}

/** Locally compute WER after corrections without a network round-trip. */
export function liveWer(
  metrics: AlignMetrics,
  items: DiffItem[],
  corrections: Record<string, Correction | undefined>,
): { wer: number; substitutions: number; insertions: number; deletions: number } {
  let S = metrics.S;
  let I = metrics.I;
  let D = metrics.D;
  for (const it of items) {
    const c = corrections[it.id];
    if (!c) continue;
    // "asr-correct" or "neither" with replacement → no longer an error.
    if (c.type === "asr-correct" || (c.type === "neither" && c.replacement)) {
      if (it.error_type === "substitution") S = Math.max(0, S - 1);
      else if (it.error_type === "insertion") I = Math.max(0, I - 1);
      else if (it.error_type === "deletion") D = Math.max(0, D - 1);
    }
  }
  const denom = Math.max(1, metrics.N_ref);
  return { wer: (S + I + D) / denom, substitutions: S, insertions: I, deletions: D };
}

/** Find the ASR token index whose [start,end] contains currentMs. */
export function findPlayingAsrIndex(asr: ASRToken[], currentMs: number): number {
  for (let i = 0; i < asr.length; i++) {
    const t = asr[i];
    if (typeof t.start === "number" && typeof t.end === "number") {
      if (currentMs >= t.start && currentMs <= t.end) return i;
    }
  }
  return -1;
}

/** Per-token op metadata maps for fast highlight lookup in the renderer. */
export function indexOps(ops: AlignOp[]) {
  const gtOpId = new Map<number, string>();
  const asrOpId = new Map<number, string>();
  const gtOpType = new Map<number, OpType>();
  const asrOpType = new Map<number, OpType>();
  const gtItemId = new Map<number, string>();
  const asrItemId = new Map<number, string>();
  for (const op of ops) {
    for (let i = op.gt[0]; i < op.gt[1]; i++) {
      gtOpId.set(i, op.id);
      gtOpType.set(i, op.type);
      if (op.item_id) gtItemId.set(i, op.item_id);
    }
    for (let i = op.asr[0]; i < op.asr[1]; i++) {
      asrOpId.set(i, op.id);
      asrOpType.set(i, op.type);
      if (op.item_id) asrItemId.set(i, op.item_id);
    }
  }
  return { gtOpId, asrOpId, gtOpType, asrOpType, gtItemId, asrItemId };
}

export function werColor(wer: number): "green" | "yellow" | "red" {
  if (wer <= 0.05) return "green";
  if (wer <= 0.15) return "yellow";
  return "red";
}
