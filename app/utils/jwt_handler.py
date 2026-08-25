from jose import jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM") or "HS256"
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not configured.")
def create_token(data: dict):
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(days=1)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
