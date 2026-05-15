from fastapi import APIRouter, HTTPException

from app.schemas import AlignRequest, AlignResponse
from app.services.wer import align_texts

router = APIRouter()


@router.post("/align", response_model=AlignResponse)
def align(req: AlignRequest) -> AlignResponse:
    try:
        return align_texts(
            ground_truth=req.ground_truth,
            asr_text=req.asr_text,
            asr_words=req.asr_words,
            whisper_normalize=req.whisper_normalize,
            ignore_disfluencies=req.ignore_disfluencies,
        )
    except Exception as exc:  # surface as 4xx so frontend can show the message
        raise HTTPException(status_code=400, detail=str(exc)) from exc
