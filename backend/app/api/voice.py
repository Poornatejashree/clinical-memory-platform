import logging

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from groq import Groq
from app.config import settings
from app.core.security import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), user=Depends(get_current_user)):
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured, so voice transcription is unavailable.",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio file content received.")

    client = Groq(api_key=settings.GROQ_API_KEY)
    filename = audio.filename or "handoff.webm"

    for model in ("whisper-large-v3-turbo", "whisper-large-v3"):
        try:
            transcription = client.audio.transcriptions.create(
                file=(filename, audio_bytes),
                model=model,
                response_format="text",
            )
            transcript = transcription if isinstance(transcription, str) else str(transcription)
            return {
                "transcript": transcript,
                "text": transcript,
                "provider": "groq",
                "model": model,
            }
        except Exception as exc:
            logger.exception("Groq transcription failed with model %s", model)
            last_error = exc

    raise HTTPException(
        status_code=502,
        detail=f"Groq transcription failed: {type(last_error).__name__}",
    )
