import os
import json
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

if url and key:
    supabase: Client = create_client(url, key)
else:
    supabase = None


class SignupRequest(BaseModel):
    username: str
    first_name: str
    last_name: str
    face_descriptor: List[float]  # 128-number face embedding from face-api.js


class LoginRequest(BaseModel):
    username: str


@app.get("/")
def read_root():
    return {"message": "Face Recognition API is running."}


@app.post("/api/signup")
async def signup(req: SignupRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured.")

    # Check if username already exists
    response = supabase.table("users").select("username").eq("username", req.username).execute()
    if len(response.data) > 0:
        raise HTTPException(status_code=400, detail="Username already exists. Please choose another.")

    try:
        user_data = {
            "username": req.username,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "face_descriptor": json.dumps(req.face_descriptor),  # Store as JSON string
        }
        supabase.table("users").insert(user_data).execute()
        return {"success": True, "message": "User signed up successfully!"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/get-descriptor/{username}")
async def get_descriptor(username: str):
    """Returns the stored face descriptor for a username so the browser can compare."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured.")

    response = supabase.table("users").select("*").eq("username", username).execute()
    if len(response.data) == 0:
        raise HTTPException(status_code=404, detail="User not found. Please sign up first.")

    user = response.data[0]
    descriptor = json.loads(user["face_descriptor"])

    return {
        "success": True,
        "username": user["username"],
        "first_name": user["first_name"],
        "last_name": user["last_name"],
        "face_descriptor": descriptor,
    }
