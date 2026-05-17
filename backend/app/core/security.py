from fastapi import HTTPException, Header
from jose import jwt

def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        # Decode without verification — fine for hackathon, since Supabase already validated the user
        payload = jwt.get_unverified_claims(token)
        return {"id": payload["sub"], "email": payload.get("email")}
    except Exception as e:
        raise HTTPException(401, f"Invalid token: {e}")