from fastapi import APIRouter, UploadFile, File, Depends
from groq import Groq
from app.config import settings
from app.core.security import get_current_user

router = APIRouter()
groq_client = Groq(api_key=settings.GROQ_API_KEY)

@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), user=Depends(get_current_user)):
    audio_bytes = await audio.read()
    transcription = groq_client.audio.transcriptions.create(
        file=(audio.filename or "audio.webm", audio_bytes),
        model="whisper-large-v3",
        response_format="text",
    )
    return {"text": transcription}