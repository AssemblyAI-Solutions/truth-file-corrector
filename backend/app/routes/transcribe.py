from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from app.schemas import TranscribeResponse
from app.services.aai_client import transcribe_file

router = APIRouter()


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    audio: UploadFile = File(...),
    model: str = Form("universal"),
    language: str = Form("auto"),
    prompt: str = Form(""),
    medical: bool = Form(False),
    x_aai_key: str = Header(..., alias="x-aai-key"),
) -> TranscribeResponse:
    if not x_aai_key:
        raise HTTPException(status_code=401, detail="Missing AssemblyAI API key.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    try:
        return transcribe_file(
            api_key=x_aai_key,
            audio_bytes=audio_bytes,
            filename=audio.filename or "audio.bin",
            model=model,
            language=language,
            prompt=prompt,
            medical=medical,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
