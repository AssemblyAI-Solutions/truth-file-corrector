"""WER + alignment — port of the dashboard truth-file-corrector behavior.

Algorithm: Needleman-Wunsch DP over normalized words (cost 1 for sub/ins/del,
0 for match), backtrace gives one operation per cell. Each non-match operation
becomes a DiffItem at word-level granularity (no multi-word merging).

Normalization: a port of `whisperNormalizeWord` (lowercase, expand 85
contractions, strip punctuation). Disfluencies: the 4-word set `um/uh/ah/hm`,
filtered independently of normalization.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional

from app.schemas import (
    AlignMetrics,
    AlignOp,
    AlignResponse,
    ASRToken,
    DiffItem,
    GTToken,
    WordTiming,
)

_TOKEN_SPLIT = re.compile(r"\s+")
_DISFLUENCIES = {"um", "uh", "ah", "hm"}
_PUNCT_RE = re.compile(r"[^\w\s]|_", re.UNICODE)

_CONTRACTIONS: dict[str, str] = {
    "i'm": "i am", "i've": "i have", "i'll": "i will", "i'd": "i would",
    "you're": "you are", "you've": "you have", "you'll": "you will", "you'd": "you would",
    "he's": "he is", "he'll": "he will", "he'd": "he would",
    "she's": "she is", "she'll": "she will", "she'd": "she would",
    "it's": "it is", "it'll": "it will", "it'd": "it would",
    "we're": "we are", "we've": "we have", "we'll": "we will", "we'd": "we would",
    "they're": "they are", "they've": "they have", "they'll": "they will", "they'd": "they would",
    "that's": "that is", "that'll": "that will", "that'd": "that would",
    "who's": "who is", "who'll": "who will", "who'd": "who would",
    "what's": "what is", "what'll": "what will", "what'd": "what did",
    "where's": "where is", "where'll": "where will", "where'd": "where did",
    "when's": "when is", "when'll": "when will", "when'd": "when did",
    "why's": "why is", "why'll": "why will", "why'd": "why did",
    "how's": "how is", "how'll": "how will", "how'd": "how did",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not",
    "won't": "will not", "wouldn't": "would not",
    "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "can't": "cannot", "couldn't": "could not", "shouldn't": "should not",
    "mightn't": "might not", "mustn't": "must not", "needn't": "need not", "shan't": "shall not",
    "let's": "let us", "ma'am": "madam", "o'clock": "of the clock", "y'all": "you all",
    "ne'er": "never", "e'er": "ever", "'twas": "it was", "ain't": "is not",
    "there's": "there is", "there'll": "there will", "there'd": "there would",
    "here's": "here is",
}


def whisper_normalize_word(word: str) -> str:
    w = word.lower().strip()
    if not w:
        return ""
    expanded = _CONTRACTIONS.get(w)
    if expanded is not None:
        return expanded
    return _PUNCT_RE.sub("", w)


def normalize_word(
    word: str,
    *,
    ignore_disfluencies: bool,
    whisper_normalize: bool,
) -> str:
    if whisper_normalize:
        normalized = whisper_normalize_word(word)
        if ignore_disfluencies and normalized in _DISFLUENCIES:
            return ""
        return normalized
    w = word.lower().strip()
    if ignore_disfluencies and w in _DISFLUENCIES:
        return ""
    return w


@dataclass
class _DisplayToken:
    text: str
    norm: str


def _split_display(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return _TOKEN_SPLIT.split(text)


def _build_tokens(
    text: str,
    *,
    whisper_normalize: bool,
    ignore_disfluencies: bool,
) -> list[_DisplayToken]:
    out: list[_DisplayToken] = []
    for raw in _split_display(text):
        norm = normalize_word(
            raw,
            ignore_disfluencies=ignore_disfluencies,
            whisper_normalize=whisper_normalize,
        )
        out.append(_DisplayToken(text=raw, norm=norm))
    return out


def _filter_indices(tokens: list[_DisplayToken]) -> tuple[list[str], list[int]]:
    """Return (normalized_words, mapping_back_to_display_index)."""
    words: list[str] = []
    mapping: list[int] = []
    for i, t in enumerate(tokens):
        if not t.norm:
            continue
        for w in t.norm.split():
            if not w:
                continue
            words.append(w)
            mapping.append(i)
    return words, mapping


_STEP_TO_OP = {
    "match": "equal",
    "substitution": "substitute",
    "insertion": "insert",
    "deletion": "delete",
}


def align_texts(
    ground_truth: str,
    asr_text: str,
    asr_words: Iterable[WordTiming],
    whisper_normalize: bool = True,
    ignore_disfluencies: bool = True,
) -> AlignResponse:
    gt_display = _build_tokens(
        ground_truth,
        whisper_normalize=whisper_normalize,
        ignore_disfluencies=ignore_disfluencies,
    )
    asr_display = _build_tokens(
        asr_text,
        whisper_normalize=whisper_normalize,
        ignore_disfluencies=ignore_disfluencies,
    )

    timings = list(asr_words)
    asr_tokens: list[ASRToken] = []
    for i, t in enumerate(asr_display):
        timing = timings[i] if i < len(timings) else None
        asr_tokens.append(
            ASRToken(
                id=i,
                text=t.text,
                norm=t.norm,
                start=timing.start if timing else None,
                end=timing.end if timing else None,
            )
        )

    gt_norm, gt_disp = _filter_indices(gt_display)
    asr_norm, asr_disp = _filter_indices(asr_display)

    gt_out = [GTToken(id=i, text=t.text, norm=t.norm) for i, t in enumerate(gt_display)]

    # i axis = ASR (vendor), j axis = GT — mirrors the reference's variable naming.
    n = len(asr_norm)
    m = len(gt_norm)

    if n == 0 and m == 0:
        ops: list[AlignOp] = []
        if gt_display or asr_tokens:
            ops.append(
                AlignOp(
                    id="op-0",
                    type="equal",
                    gt=(0, len(gt_display)),
                    asr=(0, len(asr_tokens)),
                )
            )
        return AlignResponse(
            wer=0.0,
            metrics=AlignMetrics(S=0, D=0, I=0, N_ref=0, N_hyp=0),
            gt_tokens=gt_out,
            asr_tokens=asr_tokens,
            ops=ops,
            items=[],
        )

    # DP table (n+1) x (m+1)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if asr_norm[i - 1] == gt_norm[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = 1 + min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1])

    # Backtrace — produces one step per cell.
    steps: list[tuple[str, Optional[int], Optional[int]]] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and asr_norm[i - 1] == gt_norm[j - 1]:
            steps.append(("match", i - 1, j - 1))
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + 1:
            steps.append(("substitution", i - 1, j - 1))
            i -= 1
            j -= 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            steps.append(("insertion", i - 1, None))
            i -= 1
        else:
            steps.append(("deletion", None, j - 1))
            j -= 1
    steps.reverse()

    ops: list[AlignOp] = []
    items: list[DiffItem] = []
    prev_gt = 0
    prev_asr = 0
    S = I = D = 0

    for kind, asr_ni, gt_ni in steps:
        asr_disp_idx = asr_disp[asr_ni] if asr_ni is not None else None
        gt_disp_idx = gt_disp[gt_ni] if gt_ni is not None else None

        if kind in ("match", "substitution"):
            gt_end = (gt_disp_idx or 0) + 1
            asr_end = (asr_disp_idx or 0) + 1
        elif kind == "insertion":
            gt_end = prev_gt
            asr_end = (asr_disp_idx or 0) + 1
        else:  # deletion
            gt_end = (gt_disp_idx or 0) + 1
            asr_end = prev_asr

        # Guard against backwards spans (shouldn't normally happen).
        if gt_end < prev_gt:
            gt_end = prev_gt
        if asr_end < prev_asr:
            asr_end = prev_asr

        op_type = _STEP_TO_OP[kind]
        item_id: Optional[str] = None
        if kind != "match":
            if kind == "substitution":
                S += 1
            elif kind == "insertion":
                I += 1
            else:
                D += 1
            asr_key = asr_disp_idx if asr_disp_idx is not None else "n"
            gt_key = gt_disp_idx if gt_disp_idx is not None else "n"
            item_id = f"{kind}:{asr_key}:{gt_key}"

            # Timestamp: use the ASR token at asr_disp_idx, or nearest preceding ASR word.
            timestamp_ms: Optional[int] = None
            if asr_disp_idx is not None and asr_tokens[asr_disp_idx].start is not None:
                timestamp_ms = asr_tokens[asr_disp_idx].start
            else:
                # Find the nearest preceding ASR token with timing.
                seek_from = (asr_disp_idx - 1) if asr_disp_idx is not None else prev_asr - 1
                for k in range(seek_from, -1, -1):
                    if asr_tokens[k].end is not None:
                        timestamp_ms = asr_tokens[k].end
                        break

            items.append(
                DiffItem(
                    id=item_id,
                    error_type=kind,  # type: ignore[arg-type]
                    gt_word=(
                        gt_display[gt_disp_idx].text if gt_disp_idx is not None else ""
                    ),
                    asr_word=(
                        asr_display[asr_disp_idx].text
                        if asr_disp_idx is not None
                        else ""
                    ),
                    gt_idx=gt_disp_idx,
                    asr_idx=asr_disp_idx,
                    timestamp_ms=timestamp_ms,
                )
            )

        ops.append(
            AlignOp(
                id=f"op-{len(ops)}",
                type=op_type,  # type: ignore[arg-type]
                gt=(prev_gt, gt_end),
                asr=(prev_asr, asr_end),
                item_id=item_id,
            )
        )
        prev_gt = gt_end
        prev_asr = asr_end

    # Tail equal op for any remaining display tokens (usually trailing punctuation).
    if prev_gt < len(gt_display) or prev_asr < len(asr_display):
        ops.append(
            AlignOp(
                id=f"op-{len(ops)}",
                type="equal",
                gt=(prev_gt, len(gt_display)),
                asr=(prev_asr, len(asr_display)),
            )
        )

    # Drop zero-width ops.
    ops = [o for o in ops if not (o.gt[0] == o.gt[1] and o.asr[0] == o.asr[1])]

    wer = (S + I + D) / m if m > 0 else (1.0 if n > 0 else 0.0)

    return AlignResponse(
        wer=wer,
        metrics=AlignMetrics(S=S, D=D, I=I, N_ref=m, N_hyp=n),
        gt_tokens=gt_out,
        asr_tokens=asr_tokens,
        ops=ops,
        items=items,
    )
