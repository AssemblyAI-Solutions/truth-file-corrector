"""Thin AssemblyAI wrapper for Universal-3 Pro pre-recorded transcription."""

from __future__ import annotations

import tempfile
from pathlib import Path

import assemblyai as aai

from app.schemas import TranscribeResponse, WordTiming


_LANG_AUTO = {"auto", "", "auto-detect", "detect"}


def transcribe_file(
    *,
    api_key: str,
    audio_bytes: bytes,
    filename: str,
    model: str = "universal-3-pro",
    language: str = "auto",
    prompt: str = "",
    medical: bool = False,
) -> TranscribeResponse:
    if not api_key:
        raise ValueError("Missing AssemblyAI API key.")

    aai.settings.api_key = api_key

    # AAI's newer SDK accepts `speech_models=[<string>, ...]` directly with
    # fallback ordering, so we don't need the SpeechModel enum.
    config_kwargs: dict = {}
    if model:
        config_kwargs["speech_models"] = [model]

    lang_norm = (language or "").strip().lower()
    if lang_norm in _LANG_AUTO:
        config_kwargs["language_detection"] = True
    else:
        config_kwargs["language_code"] = language

    prompt = (prompt or "").strip()
    if prompt:
        # Newer SDKs expose `prompt`; older ones used `word_boost`. Try both.
        config_kwargs["prompt"] = prompt

    if medical:
        # No first-class flag — surface as a prompt hint if the user hasn't
        # already mentioned it. Keeps the toggle functional without depending
        # on a specific SDK feature.
        hint = "Medical interview transcription. Preserve clinical terminology."
        config_kwargs["prompt"] = (config_kwargs.get("prompt") or hint) if not prompt else f"{prompt}\n{hint}"

    try:
        config = aai.TranscriptionConfig(**config_kwargs)
    except TypeError:
        # Drop unsupported kwargs (e.g. older SDK) one at a time.
        for k in ("prompt", "speech_models", "speech_model", "language_detection"):
            config_kwargs.pop(k, None)
            try:
                config = aai.TranscriptionConfig(**config_kwargs)
                break
            except TypeError:
                continue
        else:
            config = aai.TranscriptionConfig()

    # AAI SDK transcribes from a path or URL. Write to a temp file.
    suffix = Path(filename).suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(tmp_path, config=config)
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass

    if getattr(transcript, "status", None) == aai.TranscriptStatus.error:
        raise RuntimeError(transcript.error or "AssemblyAI returned an error.")

    words: list[WordTiming] = []
    for w in transcript.words or []:
        words.append(
            WordTiming(
                text=w.text,
                start=int(w.start),
                end=int(w.end),
                confidence=float(w.confidence) if w.confidence is not None else None,
            )
        )

    duration_ms = int(getattr(transcript, "audio_duration", 0) or 0)
    if duration_ms and duration_ms < 1000 * 1000:
        # AAI returns seconds in some SDK versions, ms in others. Heuristic:
        # if value seems small, assume seconds and convert.
        if duration_ms < 60 * 60 * 10:  # < 10 hours interpreted as seconds
            duration_ms = duration_ms * 1000

    return TranscribeResponse(
        text=transcript.text or "",
        words=words,
        audio_duration_ms=duration_ms,
    )
