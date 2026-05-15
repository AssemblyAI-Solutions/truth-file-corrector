from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class WordTiming(BaseModel):
    text: str
    start: int  # ms
    end: int  # ms
    confidence: Optional[float] = None


class TranscribeResponse(BaseModel):
    text: str
    words: list[WordTiming]
    audio_duration_ms: int


class AlignRequest(BaseModel):
    ground_truth: str
    asr_text: str
    asr_words: list[WordTiming] = Field(default_factory=list)
    whisper_normalize: bool = True
    ignore_disfluencies: bool = True


class GTToken(BaseModel):
    id: int
    text: str
    norm: str  # normalized form (may be empty if dropped by normalization/disfluency)


class ASRToken(BaseModel):
    id: int
    text: str
    norm: str
    start: Optional[int] = None
    end: Optional[int] = None


OpType = Literal["equal", "substitute", "insert", "delete"]
ErrorType = Literal["substitution", "insertion", "deletion"]


class AlignOp(BaseModel):
    id: str
    type: OpType
    gt: tuple[int, int]  # [start, end) in gt_tokens
    asr: tuple[int, int]  # [start, end) in asr_tokens
    item_id: Optional[str] = None  # set for non-equal ops, matches DiffItem.id


class DiffItem(BaseModel):
    id: str
    error_type: ErrorType
    gt_word: str
    asr_word: str
    gt_idx: Optional[int] = None  # index into gt_tokens (None for pure inserts)
    asr_idx: Optional[int] = None  # index into asr_tokens (None for pure deletes)
    timestamp_ms: Optional[int] = None


class AlignMetrics(BaseModel):
    S: int
    D: int
    I: int
    N_ref: int
    N_hyp: int


class AlignResponse(BaseModel):
    wer: float
    metrics: AlignMetrics
    gt_tokens: list[GTToken]
    asr_tokens: list[ASRToken]
    ops: list[AlignOp]
    items: list[DiffItem]
