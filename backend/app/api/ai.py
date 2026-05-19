import logging

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel

from app.config import settings
from app.core.security import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


class AITestIn(BaseModel):
    message: str


@router.post("/test")
def test_groq(body: AITestIn, user=Depends(get_current_user)):
    model = settings.GROQ_MODEL
    logger.info("ai.test Groq call starting model=%s message=%s", model, body.message)
    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Answer briefly. Vary your wording naturally."},
                {"role": "user", "content": body.message},
            ],
            temperature=0.9,
        )
        logger.info("ai.test Groq call succeeded model=%s", model)
        return {
            "provider": "groq",
            "model": model,
            "answer": resp.choices[0].message.content,
        }
    except Exception as exc:
        logger.exception("ai.test Groq call failed model=%s", model)
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Groq test call failed. Check GROQ_API_KEY and model availability.",
                "error": str(exc),
            },
        )
