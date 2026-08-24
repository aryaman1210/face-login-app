import os
import uuid
import base64
import tempfile
import urllib.request
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# We need to import deepface and ignore some tf warnings if possible
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
from deepface import DeepFace

load_dotenv()

app = FastAPI()

# Allow frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

# We only create the client if the URL and KEY are present
if url and key:
    supabase: Client = create_client(url, key)
else:
    supabase = None

class SignupRequest(BaseModel):
    username: str
    first_name: str
    last_name: str
    image_base64: str

class LoginRequest(BaseModel):
    username: str
    image_base64: str

def save_base64_to_tempfile(base64_str: str) -> str:
    """Decodes a base64 string (optionally with data URI prefix) to a temp file."""
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]
    image_data = base64.b64decode(base64_str)
    
    fd, path = tempfile.mkstemp(suffix=".jpg")
    with os.fdopen(fd, 'wb') as f:
        f.write(image_data)
    return path

@app.post("/api/signup")
async def signup(req: SignupRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    
    # 1. Check if username already exists
    response = supabase.table("users").select("*").eq("username", req.username).execute()
    if len(response.data) > 0:
        raise HTTPException(status_code=400, detail="Username already exists")

    # 2. Decode and save image to a temporary file
    temp_img_path = save_base64_to_tempfile(req.image_base64)
    
    try:
        # 3. Upload image to Supabase Storage
        file_name = f"{req.username}_{uuid.uuid4().hex[:8]}.jpg"
        
        with open(temp_img_path, "rb") as f:
            supabase.storage.from_("faces").upload(file_name, f)
        
        # 4. Get the public URL of the uploaded image
        # Wait, if bucket is public, we can get public url:
        public_url = supabase.storage.from_("faces").get_public_url(file_name)
        
        # 5. Insert user record into the database
        user_data = {
            "username": req.username,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "image_path": file_name, # Storing the file name in storage
            "image_url": public_url
        }
        
        supabase.table("users").insert(user_data).execute()
        
        return {"message": "User signed up successfully", "username": req.username}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temp file
        if os.path.exists(temp_img_path):
            os.remove(temp_img_path)


@app.post("/api/login")
async def login(req: LoginRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    
    # 1. Fetch user from DB
    response = supabase.table("users").select("*").eq("username", req.username).execute()
    if len(response.data) == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = response.data[0]
    reference_image_url = user.get("image_url")
    
    # 2. Decode incoming login image to temp file
    login_img_path = save_base64_to_tempfile(req.image_base64)
    
    # 3. Download reference image to temp file
    fd, ref_img_path = tempfile.mkstemp(suffix=".jpg")
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        # Download the image from the URL
        req_obj = urllib.request.Request(reference_image_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_obj, context=ctx) as response_download:
            with os.fdopen(fd, 'wb') as f:
                f.write(response_download.read())
        
        # 4. Run DeepFace verification
        # Using the exact logic requested by the user
        import tensorflow as tf
        tf.config.threading.set_intra_op_parallelism_threads(1)
        tf.config.threading.set_inter_op_parallelism_threads(1)

        result = DeepFace.verify(
            img1_path=login_img_path, 
            img2_path=ref_img_path, 
            model_name="OpenFace",
            distance_metric="cosine",
            detector_backend="opencv",
            enforce_detection=True 
        )
        
        print(f"DeepFace result: {result}")
        distance = result.get('distance', 1.0)
        is_verified = result.get('verified', False)
        print(f"Distance calculated: {distance}, Verified: {is_verified}")
        
        if is_verified:
            return {
                "success": True, 
                "message": "Same Person",
                "first_name": user["first_name"],
                "last_name": user["last_name"],
                "distance": distance
            }
        else:
            return {
                "success": False,
                "message": "Face did not match",
                "distance": distance
            }
            
    except ValueError as e:
        if "Face could not be detected" in str(e) or "Exception while processing" in str(e):
            return {
                "success": False,
                "message": "No face detected in the image. Please make sure you are clearly visible.",
                "distance": 1.0
            }
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")
    finally:
        # Clean up temp files
        if os.path.exists(login_img_path):
            os.remove(login_img_path)
        if os.path.exists(ref_img_path):
            os.remove(ref_img_path)

@app.get("/")
def read_root():
    return {"message": "Face Recognition API is running."}
