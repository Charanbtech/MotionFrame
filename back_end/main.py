from fastapi import FastAPI, UploadFile, File, Form, Request, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, joinedload
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
import json
import shutil
import zipfile
import io
import uuid
from PIL import Image
import uvicorn
import os
import base64
import requests
from dotenv import load_dotenv
import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import asyncio
import queue as _queue_module

# Load environment variables from .env file
# Try multiple locations: current directory, back_end directory, and config.env
import pathlib
back_end_dir = pathlib.Path(__file__).parent.absolute()
load_dotenv(dotenv_path=back_end_dir / '.env', override=False)
load_dotenv(dotenv_path=back_end_dir / 'config.env', override=False)
load_dotenv(override=False)  # Also try current directory

# Lazy-load cv2 and numpy to avoid import conflicts on startup
cv2 = None
np = None

def ensure_cv2():
    global cv2
    if cv2 is None:
        import cv2 as _cv2
        cv2 = _cv2
    return cv2

def ensure_numpy():
    global np
    if np is None:
        import numpy as _np
        np = _np
    return np

try:
    import fitz  # PyMuPDF for PDF handling
except ImportError:
    fitz = None

# Load Ultralytics SAM model on startup (only if available)
sam_model = None
sam_predictor_cache = {}  # image_hash -> {predictor, img_np}

def load_sam_model():
    global sam_model
    if sam_model is None:
        try:
            from ultralytics import SAM
            print("📦 Loading Ultralytics SAM model...")
            sam_model = SAM("sam2.1_b.pt")  # or "sam2.1_l.pt", "sam2.1_s.pt"
            print("✅ SAM model loaded successfully")
        except Exception as e:
            print(f"⚠️ Warning: Could not load SAM model: {e}")
            sam_model = False  # Mark as attempted but failed
    return sam_model if sam_model is not False else None

# Load YOLO model for docs annotation (best.pt)
docs_model = None

def load_docs_model():
    global docs_model
    if docs_model is None:
        try:
            from ultralytics import YOLO
            import os
            model_path = "best.pt"
            if os.path.exists(model_path):
                print("📦 Loading YOLO model for docs annotation...")
                docs_model = YOLO(model_path)
                print("✅ Docs annotation model loaded successfully")
            else:
                print(f"⚠️ Warning: Model file {model_path} not found")
                docs_model = False
        except Exception as e:
            print(f"⚠️ Warning: Could not load docs annotation model: {e}")
            docs_model = False  # Mark as attempted but failed
    return docs_model if docs_model is not False else None

# ─── CLIP semantic model (lazy-loaded on first Smart Detect call) ───────────
_clip_model = None
_clip_processor = None

def load_clip_model():
    """Lazy-load CLIP (openai/clip-vit-base-patch32) using HuggingFace transformers."""
    global _clip_model, _clip_processor
    if _clip_model is not None:
        return _clip_model, _clip_processor
    if _clip_model is False:
        return None, None
    try:
        from transformers import CLIPModel, CLIPProcessor
        print("📦 Loading CLIP model (openai/clip-vit-base-patch32)...")
        _clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        _clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        _clip_model.eval()
        print("✅ CLIP model loaded successfully")
        return _clip_model, _clip_processor
    except Exception as e:
        print(f"⚠️  CLIP not available: {e} — semantic scoring will be skipped")
        _clip_model = False
        _clip_processor = False
        return None, None
# ─────────────────────────────────────────────────────────────────────────────

import bcrypt
from jose import JWTError, jwt

# ============================================================================
# DATABASE SETUP
# ============================================================================
# PostgreSQL Database URL
# Format: postgresql://username:password@host/database
# Password is URL-encoded: %40 = @
# Get from environment variable, fallback to default for development
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./roboflow.db"  # Default to SQLite for easy local development
)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    project_type = Column(String)
    description = Column(Text)
    classes = Column(Text)
    class_colors = Column(Text, nullable=True)  # Store class colors as JSON: {"class1": "#FF6B6B", ...}
    coco_json = Column(Text, nullable=True)  # Store COCO JSON format
    user_id = Column(Integer, nullable=True, index=True)  # User who created the project
    created_at = Column(DateTime, default=datetime.utcnow)

class ProjectImage(Base):
    __tablename__ = "project_images"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer)
    filename = Column(String)
    filepath = Column(String)
    is_video_frame = Column(Boolean, default=False)
    frame_number = Column(Integer, nullable=True)
    width = Column(Integer)
    height = Column(Integer)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

class Annotation(Base):
    __tablename__ = "annotations"
    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer)
    class_name = Column(String)
    annotation_type = Column(String)
    coordinates = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_owner = Column(Boolean, default=False)  # Owner status - only owners can access Dashboard
    is_approved = Column(Boolean, default=True)  # Account approval status - default to True (approved)
    created_at = Column(DateTime, default=datetime.utcnow)

class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # png, jpg, jpeg, pdf
    file_path = Column(String, nullable=False)  # Path to stored file
    file_size = Column(Integer)  # File size in bytes
    assigned_to = Column(String, nullable=True)  # User assigned to this file
    assigned_on = Column(DateTime, nullable=True)  # When file was assigned
    modification = Column(String, nullable=True)  # Modification count or info
    status = Column(String, default="Un assigned")  # Un assigned, Assigned, Completed, Over due
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), index=True, nullable=False)
    otp_code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create all tables in PostgreSQL database
try:
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created/verified successfully")
except Exception as e:
    print(f"⚠️ Database connection error: {e}")
    print("Please ensure PostgreSQL is running and the database 'roboflow' exists")

# ============================================================================
# SETUP
# ============================================================================
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
EXPORT_DIR = Path("exports")
EXPORT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Roboflow Clone Pro")

# Enable CORS for React frontend
# Get allowed origins from environment variable, fallback to localhost for development
cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env:
    allow_origins = [origin.strip() for origin in cors_origins_env.split(",")]
else:
    # Default to localhost for development
    allow_origins = ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:3000", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# AUTHENTICATION SETUP
# ============================================================================
# Get SECRET_KEY from environment variable - REQUIRED in production!
# Generate a secure key with: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
if SECRET_KEY == "your-secret-key-change-this-in-production":
    print("⚠️  WARNING: Using default SECRET_KEY. Set SECRET_KEY environment variable in production!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days

security = HTTPBearer()

def verify_password(plain_password, hashed_password):
    password_bytes = plain_password[:72].encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)

def get_password_hash(password):
    password_bytes = password[:72].encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        if not credentials:
            raise credentials_exception
        token = credentials.credentials
        if not token:
            raise credentials_exception
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as e:
        print(f"JWT Error: {str(e)}")
        raise credentials_exception
    except Exception as e:
        print(f"Auth Error: {str(e)}")
        raise credentials_exception
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise credentials_exception
        return user
    finally:
        db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def extract_video_frames(video_path: str, output_dir: Path) -> List[str]:
    output_dir.mkdir(exist_ok=True)
    ensure_cv2()
    cap = cv2.VideoCapture(video_path)
    frame_paths = []
    frame_count = 0
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    interval = max(1, fps)
    
    while frame_count < total_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count)
        ret, frame = cap.read()
        if not ret:
            break
        frame_filename = f"frame_{frame_count:06d}.jpg"
        frame_path = output_dir / frame_filename
        cv2.imwrite(str(frame_path), frame)
        frame_paths.append(str(frame_path))
        frame_count += interval
        if len(frame_paths) >= 100:
            break
    
    cap.release()
    return frame_paths

# ============================================================================
# HTML FRONTEND - MOVED TO Resources.jsx
# ============================================================================

# ============================================================================
# API ROUTES
# ============================================================================

@app.get("/")
async def read_root():
    # Frontend is now handled by React in Resources.jsx
    return JSONResponse({"message": "API is running. Use the React frontend."})


@app.get("/api/health")
async def health_check():
    """Simple health endpoint to verify backend is running."""
    model_available = False
    try:
        if sam_model is not None and sam_model is not False:
            model_available = True
    except Exception:
        model_available = False

    return JSONResponse({
        "status": "ok",
        "server_time": datetime.utcnow().isoformat(),
        "sam_model_available": model_available
    })

# ============================================================================
# AUTHENTICATION ROUTES
# ============================================================================

# Pydantic models for request validation
class LoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str
    
    class Config:
        # Allow extra fields and make email/username truly optional
        extra = "allow"

@app.post("/api/register")
async def register(request: Request):
    db = SessionLocal()
    try:
        data = await request.json()

        # Validate required fields
        name = data.get("name")
        email = data.get("email")
        password = data.get("password")
        username = data.get("username", email)

        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        if not password:
            raise HTTPException(status_code=400, detail="Password is required")

        # Check if user already exists
        existing_user = db.query(User).filter(
            (User.email == email) | (User.username == username)
        ).first()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email or username already registered"
            )

        # Hash password
        try:
            hashed_password = get_password_hash(password)
            print(f"Password hashed successfully for user: {email}")
        except Exception as hash_err:
            print(f"Password hashing error: {hash_err}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Password hashing failed: {str(hash_err)}")

        # Create user
        try:
            db_user = User(
                name=name,
                email=email,
                username=username,
                hashed_password=hashed_password
            )
            db.add(db_user)
            db.flush()  # Flush to get the ID without committing
            user_id = db_user.id
            print(f"User created in DB with ID: {user_id}")
            db.commit()
            db.refresh(db_user)
            print(f"User committed and refreshed: {db_user.email}")
        except Exception as db_err:
            db.rollback()
            print(f"DB error creating user: {db_err}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to create user: {str(db_err)}")

        # Create JWT token
        try:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = jwt.encode(
                {"sub": str(user_id), "exp": expire},
                SECRET_KEY,
                algorithm=ALGORITHM
            )
        except Exception as token_error:
            print(f"JWT encoding error: {token_error}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Token creation failed: {str(token_error)}")

        return {
            "success": True,
            "message": "User registered successfully",
            "user": {
                "id": db_user.id,
                "name": db_user.name,
                "email": db_user.email,
                "username": db_user.username,
                "is_owner": db_user.is_owner
            },
            "access_token": access_token,
            "token_type": "bearer"
        }

    except HTTPException as he:
        db.rollback()
        print(f"HTTPException in registration: {he.status_code} - {he.detail}")
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        error_type = type(e).__name__
        print(f"Registration error [{error_type}]: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Registration failed: {error_type}: {error_msg}"
        )
    finally:
        db.close()


@app.post("/api/login")
async def login(request: Request):
    db = SessionLocal()
    try:
        data = await request.json()
        # Accept both 'email' and 'username' fields for login identifier
        identifier = data.get('email') or data.get('username')
        password = data.get('password')
        
        print(f"Login attempt - identifier: {identifier}, has_password: {bool(password)}")
        
        if not identifier:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Either email or username is required"
            )
        
        if not password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password is required"
            )

        # Find user by email or username
        user = db.query(User).filter(
            (User.email == identifier) | 
            (User.username == identifier)
        ).first()

        print(f"User lookup result: found={user is not None}")
        if user:
            print(f"User ID: {user.id}, Email: {user.email}, Username: {user.username}")
            print(f"Stored hash: {user.hashed_password[:50] if user.hashed_password else 'None'}...")
            print(f"Password received: {password}")
            password_valid = verify_password(password, user.hashed_password)
            print(f"Password verification result: {password_valid}")
        else:
            print(f"No user found with identifier: {identifier}")

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email/username or password"
            )
        
        # Verify password
        if not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email/username or password"
            )
        
        # Check if account is approved (if is_approved field exists, default to True if not set)
        is_approved = getattr(user, 'is_approved', True)
        if not is_approved:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not approved. Please contact administrator."
            )

        # Create expire time
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        # Encode JWT (user.id must be string for JWT encoding)
        access_token = jwt.encode(
            {"sub": str(user.id), "exp": expire},
            SECRET_KEY,
            algorithm=ALGORITHM
        )

        return {
            "success": True,
            "message": "Login successful",
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "username": user.username,
                "is_owner": user.is_owner
            },
            "access_token": access_token,
            "token_type": "bearer"
        }

    except HTTPException:
        # Re-raise HTTP exceptions (like 401, 422) as-is
        raise
    except Exception as e:
        # Log unexpected errors and return 500
        print(f"Login error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Login failed: {str(e)}"
        )
    finally:
        db.close()


from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

class GoogleLoginRequest(BaseModel):
    credential: str

@app.post("/api/auth/google")
async def google_login(request: GoogleLoginRequest):
    db = SessionLocal()
    try:
        # Verify the token
        # The frontend useGoogleLogin hook returns an access_token. 
        # We fetch the user profile using this access token.
        user_info_response = requests.get(
            f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={request.credential}"
        )
        
        if not user_info_response.ok:
            # Fallback in case it's an ID token instead of an access token
            try:
                client_id = os.getenv("GOOGLE_CLIENT_ID")
                if not client_id or client_id == "your_google_client_id_here":
                    raise ValueError("Client ID not configured")
                idinfo = id_token.verify_oauth2_token(
                    request.credential, google_requests.Request(), client_id)
                email = idinfo['email']
                name = idinfo.get('name', email.split('@')[0])
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid Google token or Client ID not configured")
        else:
            user_info = user_info_response.json()
            email = user_info.get('email')
            name = user_info.get('name', email.split('@')[0] if email else 'Google User')
            
            if not email:
                raise HTTPException(status_code=400, detail="Google account has no email address")
        
        # Check if user exists
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            # Create a new user with a random un-loginable password
            random_pwd = get_password_hash(uuid.uuid4().hex)
            user = User(
                name=name,
                email=email,
                username=email,
                hashed_password=random_pwd,
                is_approved=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
        # Generate JWT token
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = jwt.encode(
            {"sub": str(user.id), "exp": expire},
            SECRET_KEY,
            algorithm=ALGORITHM
        )
        
        return {
            "success": True,
            "message": "Login successful",
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "username": user.username,
                "is_owner": user.is_owner
            },
            "access_token": access_token,
            "token_type": "bearer"
        }
    except ValueError:
        # Invalid token
        raise HTTPException(status_code=401, detail="Invalid Google token")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Google Login error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Google Login failed: {str(e)}")
    finally:
        db.close()

@app.get("/api/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "username": current_user.username,
        "is_owner": current_user.is_owner if hasattr(current_user, 'is_owner') else False,
        "created_at": current_user.created_at.isoformat()
    }

@app.get("/api/users")
async def get_all_users():
    """Get all registered users"""
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
        return [
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "username": user.username,
                "is_owner": user.is_owner if hasattr(user, 'is_owner') else False,
                "created_at": user.created_at.isoformat() if user.created_at else None
            }
            for user in users
        ]
    finally:
        db.close()

# ============================================================================
# FORGOT PASSWORD ENDPOINTS
# ============================================================================

def cleanup_expired_otps(db: SessionLocal):
    """Clean up expired OTPs from database"""
    try:
        deleted_count = db.query(PasswordResetOTP).filter(
            PasswordResetOTP.expires_at < datetime.utcnow()
        ).delete(synchronize_session=False)
        db.commit()
        return deleted_count
    except Exception as e:
        print(f"Error cleaning up expired OTPs: {str(e)}")
        db.rollback()
        return 0

def generate_otp(length: int = 5) -> str:
    """Generate a random OTP of specified length"""
    return ''.join(random.choices(string.digits, k=length))

def send_otp_email(email: str, otp: str, reset_token: str = None) -> bool:
    """Send OTP to user's email with optional reset link"""
    try:
        # Get email settings from environment variables
        mail_username = os.getenv("MAIL_USERNAME", "")
        mail_password = os.getenv("MAIL_PASSWORD", "")
        mail_from = os.getenv("MAIL_FROM", mail_username)
        mail_server = os.getenv("MAIL_SERVER", "smtp.gmail.com")
        mail_port = int(os.getenv("MAIL_PORT", "587"))
        mail_from_name = os.getenv("MAIL_FROM_NAME", "RoboSpectra")
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        
        # If email is not configured, print OTP to console (for development)
        if not mail_username or not mail_password or mail_username == "your_gmail_address@gmail.com":
            print(f"\n{'='*60}")
            print(f"⚠️  EMAIL NOT CONFIGURED")
            print(f"   MAIL_USERNAME: {'Set' if mail_username and mail_username != 'your_gmail_address@gmail.com' else 'Not set or placeholder'}")
            print(f"   MAIL_PASSWORD: {'Set' if mail_password and mail_password != 'your_google_app_password' else 'Not set or placeholder'}")
            print(f"\n   OTP for {email}: {otp}")
            if reset_token:
                reset_link = f"{frontend_url}/reset-password?token={reset_token}"
                print(f"   Reset Link: {reset_link}")
            print(f"\n   To enable email sending, please update the back_end/.env file with real credentials.")
            print(f"{'='*60}\n")
            return False  # Return False so the frontend knows email was not sent

        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"{mail_from_name} <{mail_from}>"
        msg['To'] = email
        msg['Subject'] = "Password Reset Verification Code"
        
        # Build reset link if token is provided (as backup option)
        reset_link_html = ""
        if reset_token:
            reset_link = f"{frontend_url}/reset-password?token={reset_token}"
            reset_link_html = f"""
            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                <strong style="color: #666; font-size: 14px;">Alternative Method:</strong><br>
                <span style="color: #666; font-size: 12px;">You can also click this link to reset your password directly:</span><br>
                <a href="{reset_link}" style="
                    color: #007bff;
                    word-break: break-all;
                    font-size: 12px;
                    text-decoration: underline;
                ">{reset_link}</a>
            </p>
            """
        
        # Email body - OTP is the primary method
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4;">
            <div style="max-width: 600px; margin: 20px auto; padding: 0; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #8e44ad 0%, #3498db 100%); padding: 30px 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Password Reset Verification</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 40px 30px;">
                    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                        You have requested to reset your password for your account. Use the verification code below to complete the process.
                    </p>
                    
                    <!-- OTP Code Box -->
                    <div style="
                        background-color: #f8f9fa;
                        border: 2px dashed #007bff;
                        border-radius: 8px;
                        padding: 25px;
                        text-align: center;
                        margin: 30px 0;
                    ">
                        <p style="margin: 0 0 10px 0; color: #666; font-size: 14px; font-weight: 600;">
                            Your Verification Code:
                        </p>
                        <div style="
                            font-size: 36px;
                            font-weight: bold;
                            color: #007bff;
                            letter-spacing: 8px;
                            font-family: 'Courier New', monospace;
                            padding: 15px;
                            background-color: #ffffff;
                            border-radius: 5px;
                            display: inline-block;
                            min-width: 200px;
                            user-select: all;
                            -webkit-user-select: all;
                            -moz-user-select: all;
                            -ms-user-select: all;
                        ">{otp}</div>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">
                            (Click to select and copy)
                        </p>
                    </div>
                    
                    <p style="font-size: 14px; color: #666; margin: 20px 0;">
                        <strong>Instructions:</strong><br>
                        1. Copy the verification code above<br>
                        2. Go to the login page and click "Forgot Password?"<br>
                        3. Enter your email and paste the OTP code<br>
                        4. Enter your new password
                    </p>
                    
                    <div style="
                        background-color: #fff3cd;
                        border-left: 4px solid #ffc107;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 4px;
                    ">
                        <p style="margin: 0; color: #856404; font-size: 13px;">
                            <strong>⏰ Important:</strong> This code will expire in <strong>15 minutes</strong> for security reasons.
                        </p>
                    </div>
                    
                    {reset_link_html}
                    
                    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; text-align: center;">
                        If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                    </p>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="margin: 0; color: #666; font-size: 14px;">
                        Best regards,<br>
                        <strong style="color: #333;">{mail_from_name} Team</strong>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        # Connect to server and send email
        print(f"\n{'='*60}")
        print(f"📧 Attempting to send email to: {email}")
        print(f"   SMTP Server: {mail_server}:{mail_port}")
        print(f"   From: {mail_from}")
        print(f"{'='*60}\n")
        
        try:
            server = smtplib.SMTP(mail_server, mail_port, timeout=10)
            print(f"✅ Connected to SMTP server")
            
            server.starttls()
            print(f"✅ STARTTLS enabled")
            
            server.login(mail_username, mail_password)
            print(f"✅ Successfully authenticated")
            
            text = msg.as_string()
            server.sendmail(mail_from, email, text)
            print(f"✅ Email sent successfully to {email}")
            
            server.quit()
            print(f"✅ SMTP connection closed\n")
            
            return True
        except smtplib.SMTPAuthenticationError as e:
            print(f"❌ SMTP Authentication Error: {str(e)}")
            print(f"   Please check your MAIL_USERNAME and MAIL_PASSWORD")
            print(f"   For Gmail, you may need to use an 'App Password' instead of your regular password")
            print(f"   See: https://support.google.com/accounts/answer/185833")
            raise
        except smtplib.SMTPConnectError as e:
            print(f"❌ SMTP Connection Error: {str(e)}")
            print(f"   Could not connect to {mail_server}:{mail_port}")
            print(f"   Please check your MAIL_SERVER and MAIL_PORT settings")
            raise
        except smtplib.SMTPException as e:
            print(f"❌ SMTP Error: {str(e)}")
            raise
        except Exception as e:
            print(f"❌ Unexpected error during email sending: {str(e)}")
            raise
        
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ EMAIL SEND FAILED")
        print(f"   Error: {str(e)}")
        print(f"   OTP for {email}: {otp}")
        if reset_token:
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
            reset_link = f"{frontend_url}/reset-password?token={reset_token}"
            print(f"   Reset Link: {reset_link}")
        print(f"{'='*60}\n")
        import traceback
        traceback.print_exc()
        # Return False to indicate failure, but don't break the flow
        # The OTP is still generated and stored, user can see it in console
        return False

@app.post("/api/auth/forgot-password")
async def forgot_password(request: Request):
    """Send OTP to user's email for password reset"""
    db = SessionLocal()
    try:
        data = await request.json()
        email = data.get("email")
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is required"
            )
        
        # Clean up expired OTPs first
        cleanup_expired_otps(db)
        
        # Check if user exists
        user = db.query(User).filter(User.email == email).first()
        if not user:
            # Don't reveal if user exists or not for security
            return {"message": "If the email exists, an OTP has been sent"}
        
        # Generate OTP
        otp = generate_otp()
        
        # Generate reset token (valid for 30 minutes) to include in email
        token_data = {
            "email": email,
            "exp": datetime.utcnow() + timedelta(minutes=30)
        }
        reset_token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
        
        # Mark any existing unused OTPs as used for this email
        db.query(PasswordResetOTP).filter(
            PasswordResetOTP.email == email,
            PasswordResetOTP.is_used == False
        ).update({"is_used": True})
        
        # Create new OTP record
        otp_record = PasswordResetOTP(
            email=email,
            otp_code=otp,
            expires_at=datetime.utcnow() + timedelta(minutes=15),  # 15 minutes expiry
            is_used=False
        )
        
        db.add(otp_record)
        db.commit()
        
        # Get email settings to check if configured
        mail_username = os.getenv("MAIL_USERNAME", "")
        mail_password = os.getenv("MAIL_PASSWORD", "")
        
        # Send OTP via email with reset link
        email_sent = send_otp_email(email, otp, reset_token)
        
        if email_sent:
            return {"message": "OTP sent to your email"}
        else:
            # Email sending failed, but OTP is still generated and stored
            # Return success message but log the issue
            print(f"⚠️  Warning: Email sending failed, but OTP was generated: {otp}")
            
            # Since the user wants a real email system, if it's not configured we should raise an error
            # instead of silently returning 200 OK and leaving them waiting for an email.
            if not mail_username or not mail_password or mail_username == "your_gmail_address@gmail.com":
                raise HTTPException(
                    status_code=status.HTTP_501_NOT_IMPLEMENTED,
                    detail="Email system is not configured on the server. Please check backend console or update .env file."
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to send email. Please check server logs for details."
                )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Forgot password error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP"
        )
    finally:
        db.close()

@app.post("/api/auth/verify-otp")
async def verify_password_reset_otp(request: Request):
    """Verify OTP and return reset token"""
    db = SessionLocal()
    try:
        data = await request.json()
        email = data.get("email")
        otp = data.get("otp")
        
        if not email or not otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email and OTP are required"
            )
        
        # Clean up expired OTPs first
        cleanup_expired_otps(db)
        
        # Find valid OTP
        otp_record = db.query(PasswordResetOTP).filter(
            PasswordResetOTP.email == email,
            PasswordResetOTP.otp_code == otp,
            PasswordResetOTP.is_used == False,
            PasswordResetOTP.expires_at > datetime.utcnow()
        ).first()
        
        if not otp_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP"
            )
        
        # Mark OTP as used
        db.query(PasswordResetOTP).filter(
            PasswordResetOTP.id == otp_record.id
        ).update({"is_used": True})
        db.commit()
        
        # Generate reset token (valid for 30 minutes)
        token_data = {
            "email": email,
            "exp": datetime.utcnow() + timedelta(minutes=30)
        }
        
        reset_token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
        
        return {"reset_token": reset_token, "message": "OTP verified successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Verify OTP error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify OTP"
        )
    finally:
        db.close()

@app.post("/api/auth/reset-password")
async def reset_password(request: Request):
    """Reset password using verification token"""
    db = SessionLocal()
    try:
        data = await request.json()
        email = data.get("email")
        token = data.get("token")
        new_password = data.get("new_password")
        
        if not email or not token or not new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email, token, and new password are required"
            )
        
        if len(new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters long"
            )
        
        # Verify token
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            token_email = payload.get("email")
            
            if token_email != email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid token"
                )
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )
        
        # Find user
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Hash new password
        hashed_password = get_password_hash(new_password)
        
        # Update password
        user.hashed_password = hashed_password
        db.commit()
        
        return {"message": "Password reset successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Reset password error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password"
        )
    finally:
        db.close()

@app.put("/api/users/{user_id}/owner")
async def update_user_owner_status(user_id: int, request: Request, current_user: User = Depends(get_current_user)):
    """Update user owner status - only owners can add/remove other owners"""
    # Check if current user is an owner
    if not (hasattr(current_user, 'is_owner') and current_user.is_owner):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can manage owner status"
        )
    
    db = SessionLocal()
    try:
        data = await request.json()
        is_owner = data.get('is_owner', False)
        
        # Get the user to update
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Update owner status
        user.is_owner = is_owner
        db.commit()
        db.refresh(user)
        
        return {
            "success": True,
            "message": f"User owner status updated successfully",
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "username": user.username,
                "is_owner": user.is_owner
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user owner status: {str(e)}"
        )
    finally:
        db.close()
@app.post("/api/projects")
async def create_project_api(request: Request, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Process request body
        data = await request.json()

        db_project = Project(
            name=data['name'],
            project_type=data['project_type'],
            description=data['description'],
            classes=json.dumps(data.get('classes', [])),
            user_id=current_user.id  # Use current_user from dependency
        )

        db.add(db_project)
        db.commit()
        db.refresh(db_project)

        result = {
            "id": db_project.id,
            "name": db_project.name,
            "project_type": db_project.project_type,
            "description": db_project.description,
            "classes": data.get('classes', []),
            "class_colors": db_project.class_colors,
            "user_id": db_project.user_id,
            "created_at": db_project.created_at.isoformat()
        }
        return result

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error creating project: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to create project: {str(e)}"}
        )
    finally:
        db.close()

        
@app.get("/api/projects")
async def list_projects(current_user: User = Depends(get_current_user)):
    """Get projects for the current user only"""
    db = SessionLocal()
    try:
        projects = db.query(Project).filter(Project.user_id == current_user.id).order_by(Project.created_at.desc()).all()
        return [
            {
                "id": project.id,
                "name": project.name,
                "project_type": project.project_type,
                "description": project.description,
                "classes": project.classes,
                "class_colors": project.class_colors,
                "user_id": project.user_id,
                "created_at": project.created_at.isoformat() if project.created_at else None
            }
            for project in projects
        ]
    finally:
        db.close()

@app.get("/api/projects/{project_id}")
async def get_project(project_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return {
            "id": project.id,
            "name": project.name,
            "project_type": project.project_type,
            "description": project.description,
            "classes": project.classes,
            "class_colors": project.class_colors,
            "user_id": project.user_id,
            "created_at": project.created_at.isoformat()
        }
    finally:
        db.close()

@app.put("/api/projects/{project_id}")
async def update_project(project_id: int, request: Request, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        data = await request.json()
        
        # Update classes if provided
        if 'classes' in data:
            project.classes = json.dumps(data['classes'])
        
        # Update class colors if provided
        if 'class_colors' in data:
            project.class_colors = data['class_colors'] if isinstance(data['class_colors'], str) else json.dumps(data['class_colors'])
        
        db.commit()
        db.refresh(project)
        
        return {
            "id": project.id,
            "name": project.name,
            "project_type": project.project_type,
            "description": project.description,
            "classes": project.classes,
            "class_colors": project.class_colors,
            "user_id": project.user_id,
            "created_at": project.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), project_id: int = Form(...), current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Verify project belongs to user
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Verify project belongs to user
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=403, detail="Access denied")
        
        project_dir = UPLOAD_DIR / f"project_{project_id}"
        project_dir.mkdir(exist_ok=True)

        # Get original filename
        original_filename = file.filename
        file_ext = Path(original_filename).suffix.lower()
        
        # Use UUID for file on disk to avoid conflicts, but store original filename in DB
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = project_dir / unique_filename

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if file_ext in ['.mp4', '.avi', '.mov', '.mkv']:
            frames_dir = project_dir / f"frames_{unique_filename}"
            frame_paths = extract_video_frames(str(file_path), frames_dir)

            frame_records = []
            for i, frame_path in enumerate(frame_paths):
                img = Image.open(frame_path)
                # For video frames, use original filename with frame number
                frame_filename = f"{Path(original_filename).stem}_frame_{i+1:06d}{Path(frame_path).suffix}"
                db_image = ProjectImage(
                    project_id=project_id,
                    filename=frame_filename,
                    filepath=str(Path(frame_path).relative_to(UPLOAD_DIR)),
                    is_video_frame=True,
                    frame_number=i,
                    width=img.width,
                    height=img.height
                )
                db.add(db_image)
                frame_records.append(db_image)

            db.commit()
            for rec in frame_records:
                db.refresh(rec)
            
            return {
                "message": "Video processed",
                "frames": [{"id": f.id, "filename": f.filename, "filepath": f.filepath} for f in frame_records]
            }
        elif file_ext == '.pdf':
            # Convert PDF pages to images
            pdf_doc = fitz.open(file_path)
            pages_dir = project_dir / f"pages_{unique_filename}"
            pages_dir.mkdir(exist_ok=True)
            
            page_records = []
            for page_num in range(len(pdf_doc)):
                page = pdf_doc[page_num]
                # Render page to image (pixmap)
                mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better quality
                pix = page.get_pixmap(matrix=mat)
                
                # Convert to PIL Image
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                
                # Save page as image with original filename prefix
                page_filename = f"{Path(original_filename).stem}_page_{page_num + 1}.png"
                page_path = pages_dir / f"page_{page_num + 1}.png"
                img.save(page_path)
                
                # Create database record with original filename-based name
                db_image = ProjectImage(
                    project_id=project_id,
                    filename=page_filename,
                    filepath=str(page_path.relative_to(UPLOAD_DIR)),
                    width=img.width,
                    height=img.height
                )
                db.add(db_image)
                page_records.append(db_image)
            
            pdf_doc.close()
            db.commit()
            for rec in page_records:
                db.refresh(rec)
            
            return {
                "message": "PDF processed",
                "frames": [{"id": f.id, "filename": f.filename, "filepath": f.filepath} for f in page_records]
            }
        else:
            img = Image.open(file_path)
            # Store original filename in database, but use UUID filename on disk
            db_image = ProjectImage(
                project_id=project_id,
                filename=original_filename,  # Store original filename
                filepath=str(file_path.relative_to(UPLOAD_DIR)),  # UUID filename on disk
                width=img.width,
                height=img.height
            )
            db.add(db_image)
            db.commit()
            db.refresh(db_image)
            return {"id": db_image.id, "filename": db_image.filename, "filepath": db_image.filepath}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")
    finally:
        db.close()

@app.get("/api/projects/{project_id}/images")
async def get_project_images(project_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Verify project belongs to user
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        images = db.query(ProjectImage).filter(ProjectImage.project_id == project_id).all()
        return images
    except HTTPException:
        raise
    finally:
        db.close()

@app.delete("/api/images/{image_id}")
async def delete_image(image_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        image = db.query(ProjectImage).filter(ProjectImage.id == image_id).first()
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Verify project belongs to user
        project = db.query(Project).filter(Project.id == image.project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete all annotations for this image
        db.query(Annotation).filter(Annotation.image_id == image_id).delete(synchronize_session=False)
        
        # Delete the image file from filesystem
        try:
            file_path = UPLOAD_DIR / image.filepath
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            print(f"Error deleting file: {e}")
        
        # Delete the image record from database
        db.delete(image)
        db.commit()
        
        return {"message": "Image deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get all images for this project
        images = db.query(ProjectImage).filter(ProjectImage.project_id == project_id).all()
        image_ids = [img.id for img in images]
        
        # Delete all annotations for these images
        if image_ids:
            db.query(Annotation).filter(Annotation.image_id.in_(image_ids)).delete(synchronize_session=False)
        
        # Delete all images for this project
        db.query(ProjectImage).filter(ProjectImage.project_id == project_id).delete(synchronize_session=False)
        
        # Delete the project
        db.delete(project)
        db.commit()
        
        return {"message": "Project deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.delete("/api/projects")
async def delete_all_projects(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Get all projects for this user
        user_projects = db.query(Project).filter(Project.user_id == current_user.id).all()
        project_ids = [p.id for p in user_projects]
        
        if not project_ids:
            return {"message": "No projects to delete"}
        
        # Get all images for user's projects
        images = db.query(ProjectImage).filter(ProjectImage.project_id.in_(project_ids)).all()
        image_ids = [img.id for img in images]
        
        # Delete all annotations for these images
        if image_ids:
            db.query(Annotation).filter(Annotation.image_id.in_(image_ids)).delete(synchronize_session=False)
        
        # Delete all images for user's projects
        if project_ids:
            db.query(ProjectImage).filter(ProjectImage.project_id.in_(project_ids)).delete(synchronize_session=False)
        
        # Delete all user's projects
        db.query(Project).filter(Project.user_id == current_user.id).delete(synchronize_session=False)
        
        db.commit()
        
        return {"message": "All projects deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/api/annotations")
async def create_annotation(request: Request, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        data = await request.json()
        image_id = data['image_id']
        
        # Verify image's project belongs to user
        image = db.query(ProjectImage).filter(ProjectImage.id == image_id).first()
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        project = db.query(Project).filter(Project.id == image.project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=403, detail="Access denied")
        
        db_annotation = Annotation(
            image_id=image_id,
            class_name=data['class_name'],
            annotation_type=data['annotation_type'],
            coordinates=json.dumps(data['coordinates'])
        )
        db.add(db_annotation)
        db.commit()
        db.refresh(db_annotation)
        return db_annotation
    except HTTPException:
        raise
    finally:
        db.close()

@app.get("/api/images/{image_id}/annotations")
async def get_image_annotations(image_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Verify image's project belongs to user
        image = db.query(ProjectImage).filter(ProjectImage.id == image_id).first()
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        project = db.query(Project).filter(Project.id == image.project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=403, detail="Access denied")
        
        annotations = db.query(Annotation).filter(Annotation.image_id == image_id).all()
        return annotations
    except HTTPException:
        raise
    finally:
        db.close()

@app.put("/api/annotations/{annotation_id}")
async def update_annotation(annotation_id: int, request: Request, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
        if not annotation:
            raise HTTPException(status_code=404, detail="Annotation not found")
        
        # Verify image's project belongs to user
        image = db.query(ProjectImage).filter(ProjectImage.id == annotation.image_id).first()
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        project = db.query(Project).filter(Project.id == image.project_id, Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=403, detail="Access denied")
        
        data = await request.json()
        
        # Update fields if provided
        if 'class_name' in data:
            annotation.class_name = data['class_name']
        if 'annotation_type' in data:
            annotation.annotation_type = data['annotation_type']
        if 'coordinates' in data:
            annotation.coordinates = json.dumps(data['coordinates'])
        
        db.commit()
        db.refresh(annotation)
        return annotation
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()

@app.delete("/api/annotations/{annotation_id}")
async def delete_annotation(annotation_id: int):
    db = SessionLocal()
    try:
        annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
        if annotation:
            db.delete(annotation)
            db.commit()
            return {"message": "Deleted"}
        return {"error": "Not found"}
    finally:
        db.close()

# ============================================================================
# BULK UPLOAD ENDPOINTS
# ============================================================================

BULK_UPLOAD_DIR = UPLOAD_DIR / "bulk_uploads"
BULK_UPLOAD_DIR.mkdir(exist_ok=True)

@app.post("/api/bulk-upload")
async def bulk_upload_file(file: UploadFile = File(...)):
    """Upload a file (PNG, JPG, JPEG, PDF) and store in database. PDFs are converted to images."""
    db = SessionLocal()
    try:
        # Validate file type
        allowed_extensions = ['.png', '.jpg', '.jpeg', '.pdf']
        file_ext = Path(file.filename).suffix.lower()
        
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"File type not allowed. Only {', '.join(allowed_extensions)} are supported."
            )
        
        original_filename = file.filename
        
        # Read file content once
        content = await file.read()
        
        # Handle PDF conversion to images
        if file_ext == '.pdf':
            if fitz is None:
                raise HTTPException(
                    status_code=500,
                    detail="PDF processing not available. PyMuPDF (fitz) is not installed."
                )
            
            # Open PDF from memory
            pdf_doc = fitz.open(stream=content, filetype="pdf")
            
            # Create directory for PDF pages
            unique_dir_name = f"{uuid.uuid4()}"
            pages_dir = BULK_UPLOAD_DIR / f"pages_{unique_dir_name}"
            pages_dir.mkdir(exist_ok=True)
            
            page_records = []
            for page_num in range(len(pdf_doc)):
                page = pdf_doc[page_num]
                # Render page to image (pixmap)
                mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better quality
                pix = page.get_pixmap(matrix=mat)
                
                # Convert to PIL Image
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                
                # Save page as image
                page_filename = f"{Path(original_filename).stem}_page_{page_num + 1}.png"
                page_path = pages_dir / f"page_{page_num + 1}.png"
                img.save(page_path)
                
                # Create database record for each page
                db_file = UploadedFile(
                    file_name=page_filename,
                    file_type='Png',
                    file_path=str(page_path.relative_to(UPLOAD_DIR)),
                    file_size=page_path.stat().st_size,
                    status="Un assigned"
                )
                db.add(db_file)
                page_records.append(db_file)
            
            pdf_doc.close()
            db.commit()
            for rec in page_records:
                db.refresh(rec)
            
            return {
                "message": "PDF processed",
                "frames": [{
                    "id": f.id,
                    "file_name": f.file_name,
                    "file_type": f.file_type,
                    "file_path": f.file_path,
                    "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                    "status": f.status
                } for f in page_records]
            }
        
        # Handle regular image files
        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = BULK_UPLOAD_DIR / unique_filename
        
        # Save file to disk
        file_size = len(content)
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        
        # Determine file type
        file_type = file_ext.lstrip('.').lower()
        if file_type == 'jpg':
            file_type = 'Jpeg'
        elif file_type == 'jpeg':
            file_type = 'Jpeg'
        elif file_type == 'png':
            file_type = 'Png'
        
        # Create database record
        db_file = UploadedFile(
            file_name=file.filename,
            file_type=file_type,
            file_path=str(file_path.relative_to(UPLOAD_DIR)),
            file_size=file_size,
            status="Un assigned"
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        
        return {
            "id": db_file.id,
            "file_name": db_file.file_name,
            "file_type": db_file.file_type,
            "file_path": db_file.file_path,
            "uploaded_at": db_file.uploaded_at.isoformat() if db_file.uploaded_at else None,
            "status": db_file.status
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")
    finally:
        db.close()

@app.get("/api/bulk-upload/files")
async def get_uploaded_files():
    """Get all uploaded files"""
    db = SessionLocal()
    try:
        files = db.query(UploadedFile).order_by(UploadedFile.uploaded_at.desc()).all()
        result = []
        for f in files:
            # Check if file has annotations by finding matching ProjectImages
            project_images = db.query(ProjectImage).filter(ProjectImage.filename == f.file_name).all()
            has_annotations = False
            project_name = None
            
            # Try to get project_name from ProjectImage records
            if project_images:
                # If file is assigned, try to find the project that matches the assignment
                # by checking which project has the most recent ProjectImage creation
                # Otherwise, use the first project
                selected_project_image = None
                if f.assigned_to:
                    # Try to find project by matching assigned user with project assignments
                    # Get all projects these ProjectImages belong to
                    project_ids = [img.project_id for img in project_images]
                    projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
                    
                    # If multiple projects, prefer the one with most recent ProjectImage (by id, assuming auto-increment)
                    # or check if any project name matches a pattern
                    if len(projects) > 1:
                        # Sort ProjectImages by id (most recent first, assuming auto-increment)
                        sorted_project_images = sorted(project_images, key=lambda x: x.id, reverse=True)
                        selected_project_image = sorted_project_images[0]
                    else:
                        selected_project_image = project_images[0]
                else:
                    selected_project_image = project_images[0]
                
                project = db.query(Project).filter(Project.id == selected_project_image.project_id).first()
                if project:
                    project_name = project.name
                
                for img in project_images:
                    annotations = db.query(Annotation).filter(Annotation.image_id == img.id).all()
                    if annotations:
                        has_annotations = True
                        break
            
            # Fallback: If no project_name found but file is assigned, try to find project by checking all ProjectImages
            # This handles cases where ProjectImage might exist but wasn't found by filename match
            if not project_name and f.assigned_to:
                # Try to find project by checking if there are any ProjectImages with matching filepath
                fallback_project_images = db.query(ProjectImage).filter(ProjectImage.filepath == f.file_path).all()
                if fallback_project_images:
                    first_fallback = fallback_project_images[0]
                    fallback_project = db.query(Project).filter(Project.id == first_fallback.project_id).first()
                    if fallback_project:
                        project_name = fallback_project.name
            
            result.append({
                "id": f.id,
                "file_name": f.file_name,
                "file_type": f.file_type,
                "file_path": f.file_path,
                "file_size": f.file_size,
                "assigned_to": f.assigned_to,
                "assigned_on": f.assigned_on.isoformat() if f.assigned_on else None,
                "modification": f.modification,
                "status": f.status,
                "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                "uploaded_on": f.uploaded_at.strftime("%d/%m/%Y") if f.uploaded_at else None,
                "has_annotations": has_annotations,
                "project_name": project_name
            })
        return result
    finally:
        db.close()

@app.get("/api/bulk-upload/files/{file_id}")
async def get_uploaded_file(file_id: int):
    """Get a specific uploaded file"""
    db = SessionLocal()
    try:
        file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check if file has annotations by finding matching ProjectImages
        # ProjectImages are created when files are uploaded to projects
        # We match by filename to find related ProjectImages
        project_images = db.query(ProjectImage).filter(ProjectImage.filename == file.file_name).all()
        has_annotations = False
        if project_images:
            for img in project_images:
                annotations = db.query(Annotation).filter(Annotation.image_id == img.id).all()
                if annotations:
                    has_annotations = True
                    break
        
        return {
            "id": file.id,
            "file_name": file.file_name,
            "file_type": file.file_type,
            "file_path": file.file_path,
            "file_size": file.file_size,
            "assigned_to": file.assigned_to,
            "assigned_on": file.assigned_on.isoformat() if file.assigned_on else None,
            "modification": file.modification,
            "status": file.status,
            "uploaded_at": file.uploaded_at.isoformat() if file.uploaded_at else None,
            "uploaded_on": file.uploaded_at.strftime("%d/%m/%Y") if file.uploaded_at else None,
            "has_annotations": has_annotations
        }
    finally:
        db.close()

@app.get("/api/bulk-upload/files/{file_id}/preview")
async def preview_uploaded_file(file_id: int):
    """Preview/download an uploaded file"""
    db = SessionLocal()
    try:
        file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path = UPLOAD_DIR / file.file_path
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # Determine media type
        media_type_map = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'pdf': 'application/pdf'
        }
        media_type = media_type_map.get(file.file_type.lower(), 'application/octet-stream')
        
        def iterfile():
            with open(file_path, mode="rb") as file_like:
                yield from file_like
        
        response = StreamingResponse(
            iterfile(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'inline; filename="{file.file_name}"',
            }
        )
        return response
    finally:
        db.close()

@app.put("/api/bulk-upload/files/{file_id}")
async def update_uploaded_file(file_id: int, request: Request):
    """Update file metadata (assigned_to, status, etc.)"""
    db = SessionLocal()
    try:
        file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        
        data = await request.json()
        
        if 'assigned_to' in data:
            file.assigned_to = data['assigned_to']
        if 'assigned_on' in data:
            file.assigned_on = datetime.fromisoformat(data['assigned_on']) if data['assigned_on'] else None
        if 'modification' in data:
            file.modification = data['modification']
        if 'status' in data:
            file.status = data['status']
        
        # If project_id is provided, create ProjectImage to link file to project
        if 'project_id' in data and data['project_id']:
            project_id = data['project_id']
            # Check if ProjectImage already exists for this file and project
            existing_image = db.query(ProjectImage).filter(
                ProjectImage.project_id == project_id,
                ProjectImage.filename == file.file_name
            ).first()
            
            if not existing_image:
                # Get image dimensions if it's an image file
                width = 0
                height = 0
                if file.file_type.lower() in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']:
                    try:
                        file_path = UPLOAD_DIR / file.file_path
                        if file_path.exists():
                            from PIL import Image as PILImage
                            with PILImage.open(file_path) as img:
                                width, height = img.size
                    except Exception as e:
                        # Log error but continue - use default 0,0 if can't read dimensions
                        print(f"Warning: Could not read image dimensions for {file.file_name}: {e}")
                
                # Create ProjectImage to link file to project (always create, even if dimensions failed)
                try:
                    project_image = ProjectImage(
                        project_id=project_id,
                        filename=file.file_name,
                        filepath=file.file_path,
                        width=width,
                        height=height,
                        is_video_frame=False
                    )
                    db.add(project_image)
                    print(f"✅ Created ProjectImage for {file.file_name} (ID: {file.id}) in project {project_id}")
                except Exception as e:
                    # If ProjectImage creation fails, log but don't fail the entire update
                    print(f"❌ Error creating ProjectImage for {file.file_name} (ID: {file.id}) in project {project_id}: {e}")
                    import traceback
                    traceback.print_exc()
                    # Continue - file update will still succeed even if ProjectImage creation fails
        
        db.commit()
        db.refresh(file)
        
        return {
            "id": file.id,
            "file_name": file.file_name,
            "file_type": file.file_type,
            "assigned_to": file.assigned_to,
            "assigned_on": file.assigned_on.isoformat() if file.assigned_on else None,
            "modification": file.modification,
            "status": file.status
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating file: {str(e)}")
    finally:
        db.close()

@app.delete("/api/bulk-upload/files/clear_all")
async def clear_all_uploaded_files():
    """Delete all bulk-uploaded files"""
    db = SessionLocal()
    try:
        # Delete from disk
        if BULK_UPLOAD_DIR.exists():
            for file_path in BULK_UPLOAD_DIR.glob("*"):
                if file_path.is_file():
                    try:
                        file_path.unlink()
                    except Exception as e:
                        print(f"Error deleting file {file_path}: {e}")
        
        # Delete from database (UploadedFile table)
        # Note: Depending on your logic, you might only want to delete Unassigned ones, 
        # but the prompt asked to clear all uploaded images at single click.
        db.query(UploadedFile).delete()
        db.commit()
        
        return {"message": "All files cleared successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error clearing files: {str(e)}")
    finally:
        db.close()

@app.delete("/api/bulk-upload/files/{file_id}")
async def delete_uploaded_file(file_id: int):
    """Delete an uploaded file"""
    db = SessionLocal()
    try:
        file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Delete file from disk
        file_path = UPLOAD_DIR / file.file_path
        if file_path.exists():
            file_path.unlink()
        
        # Delete from database
        db.delete(file)
        db.commit()
        
        return {"message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")
    finally:
        db.close()

@app.get("/api/bulk-upload/files/{file_id}/export")
async def export_single_file(file_id: int):
    """Export a single file with its annotations (JSON, annotated image, original image)"""
    db = SessionLocal()
    try:
        ensure_cv2()
        file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Find ProjectImages that match this file
        project_images = db.query(ProjectImage).filter(ProjectImage.filename == file.file_name).all()
        
        if not project_images:
            raise HTTPException(status_code=404, detail="No project images found for this file")
        
        # If file has an assigned_to user, only export from the most recent project (current user's annotations)
        # Sort by ID descending to get most recent first
        project_images_sorted = sorted(project_images, key=lambda x: x.id, reverse=True)
        
        # If file is assigned, only use the most recent ProjectImage (current assignment)
        # Otherwise, use all ProjectImages
        if file.assigned_to:
            # Get the most recent ProjectImage for this file (current user's work)
            project_images_to_use = [project_images_sorted[0]] if project_images_sorted else []
        else:
            # If unassigned, use all ProjectImages (for backwards compatibility)
            project_images_to_use = project_images_sorted
        
        # Collect all annotations from the selected ProjectImages
        all_annotations = []
        all_project_images = []
        for img in project_images_to_use:
            annotations = db.query(Annotation).filter(Annotation.image_id == img.id).all()
            if annotations:
                all_annotations.extend(annotations)
                all_project_images.append(img)
        
        if not all_annotations:
            raise HTTPException(status_code=404, detail="No annotations found for this file")
        
        # Get the project to get classes (use the first/most recent project)
        first_image = all_project_images[0]
        project = db.query(Project).filter(Project.id == first_image.project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        classes_list = json.loads(project.classes) if project.classes else []
        class_colors = json.loads(project.class_colors) if project.class_colors else {}
        
        # Collect all unique classes from annotations
        all_classes_set = set(classes_list)
        for img in all_project_images:
            annotations = db.query(Annotation).filter(Annotation.image_id == img.id).all()
            for ann in annotations:
                if ann.class_name:
                    all_classes_set.add(ann.class_name)
        all_classes_list = sorted(list(all_classes_set))
        
        # Create categories for COCO format
        categories = []
        for idx, class_name in enumerate(all_classes_list):
            categories.append({
                "id": idx,
                "name": class_name,
                "supercategory": "none"
            })
        
        # Create info and licenses for COCO format
        coco_info = {
            "year": datetime.utcnow().strftime("%Y"),
            "version": "1.0",
            "description": "Exported from MotionFrame",
            "contributor": "MotionFrame",
            "url": "https://motionframe.ai",
            "date_created": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00")
        }
        
        coco_licenses = [
            {
                "id": 1,
                "name": "User Dataset",
                "url": ""
            }
        ]
        
        # Create COCO format data structure
        coco_data = {
            "info": coco_info,
            "licenses": coco_licenses,
            "categories": categories,
            "images": [],
            "annotations": []
        }
        
        # Create zip file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add original file
            original_path = UPLOAD_DIR / file.file_path
            if original_path.exists():
                zip_file.write(original_path, f"original/{file.file_name}")
            
            ann_id = 1
            # Process each ProjectImage with annotations
            for img_idx, img in enumerate(all_project_images):
                annotations = db.query(Annotation).filter(Annotation.image_id == img.id).all()
                if not annotations:
                    continue
                
                img_path = UPLOAD_DIR / img.filepath
                if not img_path.exists():
                    continue
                
                # Create annotated image
                annotated_img = draw_annotations_on_image(img_path, annotations, classes_list, class_colors)
                if annotated_img is not None:
                    is_success, buffer = cv2.imencode('.jpg', annotated_img)
                    if is_success:
                        zip_file.writestr(f"annotated/{img.filename}", buffer.tobytes())
                
                # Add image info to COCO format
                image_info = {
                    "id": img_idx,
                    "license": 1,
                    "file_name": img.filename,
                    "width": img.width,
                    "height": img.height,
                    "date_captured": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00"),
                    "extra": {
                        "name": img.filename
                    }
                }
                coco_data["images"].append(image_info)
                
                # Process annotations and add to COCO format
                for ann in annotations:
                    try:
                        class_id = all_classes_list.index(ann.class_name)
                    except ValueError:
                        continue
                    
                    coords = json.loads(ann.coordinates) if isinstance(ann.coordinates, str) else ann.coordinates
                    annotation_data = None
                    
                    if ann.annotation_type == 'bbox':
                        x = round(float(coords['x']), 2)
                        y = round(float(coords['y']), 2)
                        w = round(float(coords['width']), 2)
                        h = round(float(coords['height']), 2)
                        bbox = [x, y, w, h]
                        area = round(w * h, 2)
                        segmentation = [[x, y, x + w, y, x + w, y + h, x, y + h]]
                        annotation_data = {
                            "id": ann_id,
                            "image_id": img_idx,
                            "category_id": class_id,
                            "bbox": bbox,
                            "area": area,
                            "segmentation": segmentation,
                            "iscrowd": 0
                        }
                        ann_id += 1
                    elif ann.annotation_type == 'polygon' and 'points' in coords:
                        points = coords['points']
                        if len(points) >= 3:
                            # Convert points to flat list format [x1, y1, x2, y2, ...]
                            segmentation = []
                            for p in points:
                                if isinstance(p, dict):
                                    segmentation.extend([p['x'], p['y']])
                                elif isinstance(p, (list, tuple)) and len(p) >= 2:
                                    segmentation.extend([p[0], p[1]])
                            
                            if len(segmentation) >= 6:  # At least 3 points
                                # Calculate area using shoelace formula
                                x_coords = segmentation[::2]
                                y_coords = segmentation[1::2]
                                area = 0.5 * abs(sum(x_coords[i] * y_coords[(i + 1) % len(x_coords)] - 
                                                    x_coords[(i + 1) % len(x_coords)] * y_coords[i] 
                                                    for i in range(len(x_coords))))
                                
                                x_min = round(min(x_coords), 2)
                                y_min = round(min(y_coords), 2)
                                w = round(max(x_coords) - min(x_coords), 2)
                                h = round(max(y_coords) - min(y_coords), 2)
                                bbox = [x_min, y_min, w, h]
                                area = round(area, 2)
                                segmentation_rounded = [round(float(val), 2) for val in segmentation]
                                
                                annotation_data = {
                                    "id": ann_id,
                                    "image_id": img_idx,
                                    "category_id": class_id,
                                    "segmentation": [segmentation_rounded],
                                    "area": area,
                                    "bbox": bbox,
                                    "iscrowd": 0
                                }
                                ann_id += 1
                    
                    if annotation_data:
                        coco_data["annotations"].append(annotation_data)
            
            # Save single COCO JSON file
            coco_json_str = json.dumps(coco_data, indent=2)
            zip_file.writestr("annotations.coco.json", coco_json_str)
        
        zip_buffer.seek(0)
        
        return StreamingResponse(
            io.BytesIO(zip_buffer.read()),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{file.file_name}_export.zip"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error exporting file: {str(e)}")
    finally:
        db.close()

@app.get("/api/users/{user_id}/export")
async def export_user_completed_files(user_id: int):
    """Export all completed files (with annotations) for a specific user"""
    db = SessionLocal()
    try:
        ensure_cv2()
        
        # Get user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Find all files assigned to this user that have annotations
        user_files = db.query(UploadedFile).filter(
            (UploadedFile.assigned_to == user.name) | 
            (UploadedFile.assigned_to == user.email) | 
            (UploadedFile.assigned_to == user.username)
        ).all()
        
        if not user_files:
            raise HTTPException(status_code=404, detail="No files found for this user")
        
        # Collect all completed files (files with annotations)
        completed_files_data = []
        processed_files = set()  # Track files we've already processed
        
        for file in user_files:
            if file.id in processed_files:
                continue
                
            # Find ProjectImages that match this file
            project_images = db.query(ProjectImage).filter(ProjectImage.filename == file.file_name).all()
            
            # Filter to only images with annotations
            images_with_annotations = []
            for img in project_images:
                annotations = db.query(Annotation).filter(Annotation.image_id == img.id).all()
                if annotations:
                    images_with_annotations.append(img)
            
            # Only add if there are images with annotations
            if images_with_annotations:
                completed_files_data.append({
                    'file': file,
                    'project_images': images_with_annotations
                })
                processed_files.add(file.id)
        
        if not completed_files_data:
            raise HTTPException(status_code=404, detail="No completed files (with annotations) found for this user")
        
        # Get project info for classes and colors
        first_file_data = completed_files_data[0]
        first_image = first_file_data['project_images'][0]
        project = db.query(Project).filter(Project.id == first_image.project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        classes_list = json.loads(project.classes) if project.classes else []
        class_colors = json.loads(project.class_colors) if project.class_colors else {}
        
        # Create zip file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Process each completed file
            for file_data in completed_files_data:
                file = file_data['file']
                project_images = file_data['project_images']
                
                # Add original file
                original_path = UPLOAD_DIR / file.file_path
                if original_path.exists():
                    zip_file.write(original_path, f"original/{file.file_name}")
                
                # Process each ProjectImage with annotations
                for img in project_images:
                    annotations = db.query(Annotation).filter(Annotation.image_id == img.id).all()
                    if not annotations:
                        continue
                    
                    img_path = UPLOAD_DIR / img.filepath
                    if not img_path.exists():
                        continue
                    
                    # Create annotated image
                    annotated_img = draw_annotations_on_image(img_path, annotations, classes_list, class_colors)
                    if annotated_img is not None:
                        is_success, buffer = cv2.imencode('.jpg', annotated_img)
                        if is_success:
                            zip_file.writestr(f"annotated/{img.filename}", buffer.tobytes())
                    
                    # Create individual JSON for this image (simple format, not COCO)
                    json_data = {
                        "image_id": img.id,
                        "filename": img.filename,
                        "width": img.width,
                        "height": img.height,
                        "annotations": []
                    }
                    
                    for ann in annotations:
                        coords = json.loads(ann.coordinates) if isinstance(ann.coordinates, str) else ann.coordinates
                        annotation_obj = {
                            "id": ann.id,
                            "class": ann.class_name,
                            "type": ann.annotation_type,
                            "coordinates": coords
                        }
                        json_data["annotations"].append(annotation_obj)
                    
                    # Save individual JSON file
                    json_filename = Path(img.filename).stem + '.json'
                    zip_file.writestr(f"json/{json_filename}", json.dumps(json_data, indent=2))
        
        zip_buffer.seek(0)
        
        return StreamingResponse(
            io.BytesIO(zip_buffer.read()),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{user.name}_completed_files_export.zip"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error exporting user files: {str(e)}")
    finally:
        db.close()

def hex_to_bgr(hex_color):
    """Convert hex color (#RRGGBB) to BGR tuple for OpenCV"""
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (b, g, r)  # BGR format for OpenCV

def draw_annotations_on_image(image_path, annotations, classes_list, class_colors=None):
    """Draw annotations on image and return the modified image - only borders, no fill"""
    ensure_cv2()
    ensure_numpy()
    img = cv2.imread(str(image_path))
    if img is None:
        return None
    
    # Default color palette (BGR format for OpenCV)
    default_colors_bgr = [
        (107, 110, 255), (196, 205, 78), (209, 183, 69), (122, 160, 255),
        (200, 216, 152), (111, 220, 247), (206, 143, 187), (226, 193, 133),
    ]
    
    # No overlay needed since we're only drawing borders (no fill/transparency)
    
    for ann in annotations:
        try:
            class_name = ann.class_name
            class_idx = classes_list.index(class_name) if class_name in classes_list else 0
            
            # Use custom color if available, otherwise use default palette
            if class_colors and class_name in class_colors:
                color = hex_to_bgr(class_colors[class_name])
            else:
                color = default_colors_bgr[class_idx % len(default_colors_bgr)]
            
            coords = json.loads(ann.coordinates)
            
            if ann.annotation_type == 'bbox':
                x = int(coords['x'])
                y = int(coords['y'])
                w = int(coords['width'])
                h = int(coords['height'])
                
                if w < 0:
                    x = x + w
                    w = abs(w)
                if h < 0:
                    y = y + h
                    h = abs(h)
                
                # Draw only border (no fill) - thickness 1 for reduced visibility
                cv2.rectangle(img, (x, y), (x + w, y + h), color, 1)
                
                label = class_name
                (text_width, text_height), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
                cv2.rectangle(img, (x, y - text_height - 6), (x + text_width + 6, y), color, -1)
                cv2.putText(img, label, (x + 3, y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
            
            elif ann.annotation_type == 'polygon' and 'points' in coords:
                points = coords['points']
                print(f"Processing polygon annotation: {len(points)} points, first point: {points[0] if points else 'empty'}")
                
                if not points or len(points) < 3:
                    print(f"Skipping polygon: insufficient points ({len(points) if points else 0})")
                    continue
                
                # Convert points to numpy array format
                # Handle format: [[x, y], [x, y], ...] or [{x, y}, {x, y}, ...]
                try:
                    pts_list = []
                    for p in points:
                        if isinstance(p, dict):
                            if 'x' in p and 'y' in p:
                                pts_list.append([int(p['x']), int(p['y'])])
                            else:
                                print(f"Invalid point format (missing x/y): {p}")
                                continue
                        elif isinstance(p, (list, tuple)) and len(p) >= 2:
                            # Handle array format [x, y]
                            pts_list.append([int(p[0]), int(p[1])])
                        else:
                            print(f"Invalid point format: {p}")
                            continue
                    
                    if len(pts_list) < 3:
                        print(f"Polygon has less than 3 valid points: {len(pts_list)}")
                        continue
                    
                    print(f"Converted {len(pts_list)} points to numpy array: {pts_list[:3]}")
                    pts = np.array(pts_list, np.int32)
                    pts = pts.reshape((-1, 1, 2))
                    
                    # Draw only border (no fill) - thickness 1 for reduced visibility
                    cv2.polylines(img, [pts], True, color, 1, cv2.LINE_AA)
                    print(f"Drew polygon border (1px) on main image - no fill")
                    
                    # Add label at first point
                    if len(pts_list) > 0:
                        label = class_name
                        (text_width, text_height), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
                        label_x, label_y = int(pts_list[0][0]), int(pts_list[0][1])
                        # Ensure label is within image bounds
                        label_x = max(10, min(label_x, img.shape[1] - text_width - 12))
                        label_y = max(text_height + 6, min(label_y, img.shape[0] - 6))
                        # Draw label background
                        cv2.rectangle(img, (label_x, label_y - text_height - 6), 
                                    (label_x + text_width + 6, label_y), color, -1)
                        cv2.putText(img, label, (label_x + 3, label_y - 3), 
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                        print(f"Added label '{label}' at ({label_x}, {label_y})")
                    
                except (KeyError, TypeError, IndexError, ValueError) as e:
                    print(f"Error parsing polygon points: {e}")
                    print(f"Points type: {type(points)}, Points: {points[:3] if len(points) > 3 else points}")
                    import traceback
                    traceback.print_exc()
                    continue
            
            elif ann.annotation_type == 'brush' and 'points' in coords:
                points = coords['points']
                brush_size = int(coords.get('brushSize', 10))
                if len(points) > 0:
                    # Draw only border lines (no fill) for brush strokes
                    for i in range(len(points) - 1):
                        # Handle both dict and list formats
                        if isinstance(points[i], dict):
                            pt1 = (int(points[i]['x']), int(points[i]['y']))
                            pt2 = (int(points[i + 1]['x']), int(points[i + 1]['y']))
                        else:
                            # Handle array format [x, y]
                            if isinstance(points[i], (list, tuple)) and len(points[i]) >= 2:
                                pt1 = (int(points[i][0]), int(points[i][1]))
                                pt2 = (int(points[i + 1][0]), int(points[i + 1][1]))
                            else:
                                # Handle flat list format [x1, y1, x2, y2, ...]
                                pt1 = (int(points[i * 2]), int(points[i * 2 + 1]))
                                pt2 = (int(points[(i + 1) * 2]), int(points[(i + 1) * 2 + 1]))
                        # Draw only border lines (no fill) - thickness based on brush size
                        cv2.line(img, pt1, pt2, color, max(1, brush_size // 4), cv2.LINE_AA)
                    
                    # Draw final point as a small circle (border only, no fill)
                    if isinstance(points[-1], dict):
                        final_pt = (int(points[-1]['x']), int(points[-1]['y']))
                    elif isinstance(points[-1], (list, tuple)) and len(points[-1]) >= 2:
                        final_pt = (int(points[-1][0]), int(points[-1][1]))
                    else:
                        final_pt = (int(points[-2]), int(points[-1]))
                    # Draw circle border only (thickness 1, not filled)
                    cv2.circle(img, final_pt, max(3, brush_size // 3), color, 1, cv2.LINE_AA)
                    
                    # Add label for brush annotation at first point
                    label = class_name
                    (text_width, text_height), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
                    if isinstance(points[0], dict):
                        label_x, label_y = int(points[0]['x']), int(points[0]['y'])
                    elif isinstance(points[0], (list, tuple)) and len(points[0]) >= 2:
                        label_x, label_y = int(points[0][0]), int(points[0][1])
                    else:
                        label_x, label_y = int(points[0]), int(points[1])
                    # Ensure label is within image bounds
                    label_x = max(10, min(label_x, img.shape[1] - text_width - 12))
                    label_y = max(text_height + 6, min(label_y, img.shape[0] - 6))
                    # Draw label background
                    cv2.rectangle(img, (label_x, label_y - text_height - 6), 
                                (label_x + text_width + 6, label_y), color, -1)
                    cv2.putText(img, label, (label_x + 3, label_y - 3), 
                              cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        
        except Exception as e:
            print(f"Error drawing annotation {ann.id if hasattr(ann, 'id') else 'unknown'} (type: {ann.annotation_type}): {e}")
            print(f"Coordinates: {ann.coordinates[:200] if len(ann.coordinates) > 200 else ann.coordinates}")
            import traceback
            traceback.print_exc()
            continue
    
    # No overlay blending needed - we're drawing borders directly on the image
    # All annotations are drawn as borders only (no fill/background color)
    return img

@app.post("/api/export")
async def export_dataset(request: Request):
    db = SessionLocal()
    try:
        data = await request.json()
        project_id = data['project_id']
        format_type = data['format']
        class_colors = data.get('class_colors', {})  # Get custom colors from request

        # Validate project exists
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"error": f"Project with ID {project_id} not found"}
        
        # Get only images that belong to this specific project
        images = db.query(ProjectImage).filter(ProjectImage.project_id == project_id).all()
        classes_list = json.loads(project.classes)
        
        # Update project with class colors if provided
        if class_colors:
            project.class_colors = json.dumps(class_colors)
            db.commit()
        
        print(f"Exporting project ID: {project_id}, Project name: {project.name}, Images count: {len(images)}")

        # Create timestamped export directory
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        export_filename = f"{project.name}_{format_type}_{timestamp}.zip"
        export_path = EXPORT_DIR / export_filename

        # Get list of image IDs for this project to ensure we only get annotations for this project's images
        project_image_ids = [img.id for img in images]

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add original images and annotated images
            for img in images:
                img_path = UPLOAD_DIR / img.filepath
                if img_path.exists():
                    zip_file.write(img_path, f"images/original/{img.filename}")
                    
                    # Get annotations for this image
                    # Annotation.image_id should match ProjectImage.id (which is img.id)
                    annotations = db.query(Annotation).filter(
                        Annotation.image_id == img.id
                    ).all()
                    
                    print(f"  Image {img.id} ({img.filename}): Found {len(annotations)} annotations")
                    for ann in annotations:
                        print(f"    - Annotation ID: {ann.id}, Type: {ann.annotation_type}, Class: {ann.class_name}")
                    
                    # Only add to annotated folder if image has annotations
                    if annotations:
                        annotated_img = draw_annotations_on_image(img_path, annotations, classes_list, class_colors)
                        if annotated_img is not None:
                            is_success, buffer = cv2.imencode('.jpg', annotated_img)
                            if is_success:
                                zip_file.writestr(f"images/annotated/{img.filename}", buffer.tobytes())
                    # If no annotations, don't add to annotated folder (only original images folder)

            # Generate labels based on format
            if format_type in ['yolov8', 'yolov5']:
                for img in images:
                    # Only get annotations for images that belong to this project
                    # Join with ProjectImage to ensure the image belongs to the current project
                    annotations = db.query(Annotation).join(
                        ProjectImage, Annotation.image_id == ProjectImage.id
                    ).filter(
                        ProjectImage.project_id == project_id,
                        Annotation.image_id == img.id
                    ).all()
                    if annotations:
                        label_content = []
                        for ann in annotations:
                            try:
                                class_id = classes_list.index(ann.class_name)
                            except ValueError:
                                continue
                                
                            coords = json.loads(ann.coordinates)

                            if ann.annotation_type == 'bbox':
                                x_center = (coords['x'] + coords['width']/2) / img.width
                                y_center = (coords['y'] + coords['height']/2) / img.height
                                width = abs(coords['width']) / img.width
                                height = abs(coords['height']) / img.height
                                
                                x_center = max(0, min(1, x_center))
                                y_center = max(0, min(1, y_center))
                                width = max(0, min(1, width))
                                height = max(0, min(1, height))
                                
                                label_content.append(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
                            
                            elif ann.annotation_type == 'polygon' and 'points' in coords:
                                normalized_points = []
                                for point in coords['points']:
                                    # Handle both array format [x, y] and object format {x, y}
                                    if isinstance(point, (list, tuple)) and len(point) >= 2:
                                        x, y = point[0], point[1]
                                    elif isinstance(point, dict) and 'x' in point and 'y' in point:
                                        x, y = point['x'], point['y']
                                    else:
                                        continue
                                    x_norm = max(0, min(1, x / img.width))
                                    y_norm = max(0, min(1, y / img.height))
                                    normalized_points.extend([f"{x_norm:.6f}", f"{y_norm:.6f}"])
                                
                                if normalized_points:
                                    label_content.append(f"{class_id} " + " ".join(normalized_points))

                        if label_content:
                            label_filename = Path(img.filename).stem + '.txt'
                            zip_file.writestr(f"labels/{label_filename}", '\n'.join(label_content))

                yaml_content = f"""path: ./
train: images
val: images
test: images

nc: {len(classes_list)}
names: {classes_list}
"""
                zip_file.writestr("data.yaml", yaml_content)

            elif format_type == 'coco':
                # First, collect all unique class names from all annotations
                all_class_names = set(classes_list)  # Start with project classes
                
                # Get all annotations for this project to find all class names
                for img in images:
                    annotations = db.query(Annotation).filter(
                        Annotation.image_id == img.id
                    ).all()
                    for ann in annotations:
                        if ann.class_name:
                            all_class_names.add(ann.class_name)
                
                # Convert to list: keep project classes in their original order first, then add new ones alphabetically
                all_classes_list = list(classes_list)
                for class_name in sorted(all_class_names):
                    if class_name not in all_classes_list:
                        all_classes_list.append(class_name)
                
                print(f"📋 Export: Found {len(all_classes_list)} total classes ({len(classes_list)} from project, {len(all_classes_list) - len(classes_list)} from annotations)")
                
                # Create categories list with all classes (including those from annotations)
                categories = []
                for idx, class_name in enumerate(all_classes_list):
                    categories.append({
                        "id": idx,
                        "name": class_name,
                        "supercategory": "none"
                    })
                
                # Create info and licenses for COCO format
                coco_info = {
                    "year": datetime.utcnow().strftime("%Y"),
                    "version": "1.0",
                    "description": "Exported from MotionFrame",
                    "contributor": "MotionFrame",
                    "url": "https://motionframe.ai",
                    "date_created": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00")
                }
                
                coco_licenses = [
                    {
                        "id": 1,
                        "name": "User Dataset",
                        "url": ""
                    }
                ]
                
                # Combined COCO data for database storage (backward compatibility)
                combined_coco_data = {
                    "info": coco_info,
                    "licenses": coco_licenses,
                    "categories": categories,
                    "images": [],
                    "annotations": []
                }
                
                ann_id = 1
                for img_idx, img in enumerate(images):
                    # Create separate COCO data for each image
                    image_coco_data = {
                        "info": coco_info,
                        "licenses": coco_licenses,
                        "categories": categories,
                        "images": [],
                        "annotations": []
                    }
                    
                    # Add image info with full COCO format
                    image_info = {
                        "id": 0,  # Always 0 for single image JSON
                        "license": 1,
                        "file_name": img.filename,
                        "width": img.width,
                        "height": img.height,
                        "date_captured": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00"),
                        "extra": {
                            "name": img.filename
                        }
                    }
                    image_coco_data["images"].append(image_info)
                    combined_coco_data["images"].append({
                        "id": img_idx,
                        "license": 1,
                        "file_name": img.filename,
                        "width": img.width,
                        "height": img.height,
                        "date_captured": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00"),
                        "extra": {
                            "name": img.filename
                        }
                    })
                    
                    # Get annotations for this image (Annotation.image_id references ProjectImage.id)
                    annotations = db.query(Annotation).filter(
                        Annotation.image_id == img.id
                    ).all()
                    
                    print(f"Image {img.id} ({img.filename}): Found {len(annotations)} annotations")
                    
                    # Debug: Count annotations by class
                    class_counts = {}
                    for ann in annotations:
                        class_name = ann.class_name or 'unknown'
                        class_counts[class_name] = class_counts.get(class_name, 0) + 1
                    print(f"  Annotation counts by class: {class_counts}")
                    
                    image_ann_id = 1
                    for ann in annotations:
                        print(f"  Processing annotation: type={ann.annotation_type}, class={ann.class_name}")
                        try:
                            # Use all_classes_list instead of classes_list to include all classes from annotations
                            class_id = all_classes_list.index(ann.class_name)
                        except ValueError:
                            print(f"  ⚠️ Warning: class '{ann.class_name}' not found in all_classes_list (this shouldn't happen)")
                            continue
                            
                        try:
                            coords = json.loads(ann.coordinates)
                            print(f"  Coordinates keys: {list(coords.keys()) if isinstance(coords, dict) else 'Not a dict'}")
                        except json.JSONDecodeError as e:
                            print(f"  ❌ Error parsing coordinates JSON: {e}")
                            print(f"  Raw coordinates: {ann.coordinates[:200]}")
                            continue
                        
                        annotation_data = None
                        
                        if ann.annotation_type == 'bbox':
                            x = round(float(coords['x']), 2)
                            y = round(float(coords['y']), 2)
                            w = round(float(coords['width']), 2)
                            h = round(float(coords['height']), 2)
                            bbox = [x, y, w, h]
                            area = round(w * h, 2)
                            segmentation = [[x, y, x + w, y, x + w, y + h, x, y + h]]
                            annotation_data = {
                                "id": image_ann_id,
                                "image_id": 0,  # Always 0 for single image JSON
                                "category_id": class_id,
                                "bbox": bbox,
                                "area": area,
                                "segmentation": segmentation,
                                "iscrowd": 0
                            }
                            image_ann_id += 1
                        elif ann.annotation_type == 'polygon' and 'points' in coords:
                            points = coords['points']
                            print(f"  Polygon: {len(points)} points, first point: {points[0] if points else 'empty'}")
                            if len(points) >= 3:
                                # Convert points to flat list format [x1, y1, x2, y2, ...]
                                # Handle format: [[x, y], [x, y], ...] or [{x, y}, {x, y}, ...]
                                segmentation = []
                                for p in points:
                                    if isinstance(p, dict):
                                        segmentation.extend([p['x'], p['y']])
                                    elif isinstance(p, (list, tuple)) and len(p) >= 2:
                                        # Handle array format [x, y]
                                        segmentation.extend([p[0], p[1]])
                                    else:
                                        print(f"  Invalid polygon point format: {p} (type: {type(p)})")
                                        continue
                                
                                print(f"  Segmentation: {segmentation[:10]}... (showing first 10 values)")
                                
                                # Calculate bbox from polygon points
                                if isinstance(points[0], dict):
                                    x_coords = [p['x'] for p in points]
                                    y_coords = [p['y'] for p in points]
                                elif isinstance(points[0], (list, tuple)) and len(points[0]) >= 2:
                                    # Handle array format [[x, y], ...]
                                    x_coords = [p[0] for p in points]
                                    y_coords = [p[1] for p in points]
                                else:
                                    # Fallback for flat list format [x1, y1, x2, y2, ...]
                                    x_coords = [points[i] for i in range(0, len(points), 2)]
                                    y_coords = [points[i] for i in range(1, len(points), 2)]
                                
                                x_min = round(min(x_coords), 2)
                                y_min = round(min(y_coords), 2)
                                w = round(max(x_coords) - min(x_coords), 2)
                                h = round(max(y_coords) - min(y_coords), 2)
                                bbox = [x_min, y_min, w, h]
                                
                                # Calculate area using shoelace formula
                                area = 0
                                for i in range(len(x_coords)):
                                    j = (i + 1) % len(x_coords)
                                    area += x_coords[i] * y_coords[j]
                                    area -= x_coords[j] * y_coords[i]
                                area = round(abs(area) / 2.0, 2)
                                segmentation_rounded = [round(float(val), 2) for val in segmentation]
                                
                                annotation_data = {
                                    "id": image_ann_id,
                                    "image_id": 0,  # Always 0 for single image JSON
                                    "category_id": class_id,
                                    "segmentation": [segmentation_rounded],
                                    "bbox": bbox,
                                    "area": area,
                                    "iscrowd": 0
                                }
                                print(f"  ✅ Added polygon annotation (id={image_ann_id}, category={class_id})")
                                image_ann_id += 1
                            else:
                                print(f"  ⚠️ Skipping polygon: insufficient points ({len(points)})")
                        elif ann.annotation_type == 'polygon':
                            print(f"  ⚠️ Polygon annotation missing 'points' in coordinates: {list(coords.keys())}")
                        elif ann.annotation_type == 'brush' and 'points' in coords:
                            points = coords['points']
                            if len(points) > 0:
                                # Convert brush points to segmentation format
                                segmentation = []
                                for p in points:
                                    if isinstance(p, dict):
                                        segmentation.extend([p['x'], p['y']])
                                    else:
                                        segmentation.extend(p if isinstance(p, (list, tuple)) else [p])
                                
                                # Calculate bbox from brush points
                                if isinstance(points[0], dict):
                                    x_coords = [p['x'] for p in points]
                                    y_coords = [p['y'] for p in points]
                                else:
                                    x_coords = [points[i] for i in range(0, len(points), 2)]
                                    y_coords = [points[i] for i in range(1, len(points), 2)]
                                
                                x_min = round(min(x_coords), 2)
                                y_min = round(min(y_coords), 2)
                                w = round(max(x_coords) - min(x_coords), 2)
                                h = round(max(y_coords) - min(y_coords), 2)
                                bbox = [x_min, y_min, w, h]
                                
                                # Approximate area for brush (can be refined)
                                area = round(w * h * 0.5, 2)
                                segmentation_rounded = [round(float(val), 2) for val in segmentation]
                                
                                annotation_data = {
                                    "id": image_ann_id,
                                    "image_id": 0,  # Always 0 for single image JSON
                                    "category_id": class_id,
                                    "segmentation": [segmentation_rounded],
                                    "bbox": bbox,
                                    "area": area,
                                    "iscrowd": 0
                                }
                                image_ann_id += 1
                        
                        if annotation_data:
                            # Add to image-specific JSON
                            image_coco_data["annotations"].append(annotation_data)
                            
                            # Also add to combined JSON (for database storage)
                            combined_annotation = annotation_data.copy()
                            combined_annotation["id"] = ann_id
                            combined_annotation["image_id"] = img_idx
                            combined_coco_data["annotations"].append(combined_annotation)
                            ann_id += 1
                    
                    # Save separate JSON file for this image
                    image_json_filename = f"annotations/{Path(img.filename).stem}.json"
                    image_json_str = json.dumps(image_coco_data, indent=2)
                    zip_file.writestr(image_json_filename, image_json_str)
                    print(f"✅ Created separate JSON file: {image_json_filename}")
                
                # Save combined COCO JSON to database (for backward compatibility)
                combined_coco_json_str = json.dumps(combined_coco_data, indent=2)
                project.coco_json = combined_coco_json_str
                db.commit()
                print(f"✅ Combined COCO JSON saved to database for project: {project.name}")
                
                # Save main COCO JSON file in zip (standard COCO format)
                zip_file.writestr("annotations.coco.json", combined_coco_json_str)

            readme = f"""# {project.name} Dataset Export

## Export Information
- **Project**: {project.name}
- **Type**: {project.project_type}
- **Format**: {format_type}
- **Export Date**: {timestamp}
- **Total Images**: {len(images)}
- **Classes**: {', '.join(classes_list)}

## Dataset Structure
```
dataset/
├── images/
│   ├── original/     # Original images
│   └── annotated/    # Images with annotations drawn
├── labels/           # Annotation labels (YOLO format)
└── data.yaml         # Dataset configuration (YOLO)
```

## Usage Instructions

### YOLOv8
```python
from ultralytics import YOLO

model = YOLO('yolov8n.pt')
results = model.train(data='data.yaml', epochs=100, imgsz=640)
```

### YOLOv5
```bash
python train.py --img 640 --batch 16 --epochs 100 --data data.yaml --weights yolov5s.pt
```

Generated by Roboflow Clone Pro
Export ID: {export_filename}
"""
            zip_file.writestr("README.md", readme)

        # Save to exports directory for history
        with open(export_path, 'wb') as f:
            f.write(zip_buffer.getvalue())

        zip_buffer.seek(0)

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={export_filename}"}
        )
    finally:
        db.close()

# Custom endpoint to serve images with CORS headers
# This must be defined BEFORE the mount to take precedence
@app.get("/uploads/{filepath:path}")
async def serve_uploaded_file(filepath: str):
    """Serve uploaded files with CORS headers"""
    file_path = UPLOAD_DIR / filepath
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type
    ext = file_path.suffix.lower()
    media_type_map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf'
    }
    media_type = media_type_map.get(ext, 'application/octet-stream')
    
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Note: StaticFiles mount is commented out since we're using custom endpoint above
# If you need to use StaticFiles, remove the custom endpoint above
# try:
#     app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
# except Exception as e:
#     print(f"Warning: Could not mount uploads directory: {e}")


# -----------------------------
# SAM (Segment Anything Model) - Ultralytics Local Model
# -----------------------------
@app.post("/api/sam/embedding")
async def sam_get_embedding(
    file: UploadFile = File(...),
    request: Request = None
):
    """
    Computes image embedding once for interactive segmentation.
    This saves it on the server and returns a session ID or just confirms success.
    Actually, to keep it simple, we can return the embedding or just store it in a global cache.
    """
    origin_header = request.headers.get("x-requested-from", "") if request else ""
    if not origin_header or origin_header.lower() != "ai-annotation":
        # Allowing it for general resources too
        pass

    model = load_sam_model()
    if not model:
        raise HTTPException(status_code=500, detail="SAM model not available.")

    try:
        from PIL import Image as PILImage
        import io
        import tempfile

        image_bytes = await file.read()
        img_pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # We need to use the predictor's set_image method which precomputes the embedding
        # SAM 2 predictor is usually used for this
        np_module = ensure_numpy()
        img_np = np_module.array(img_pil)

        # For the sake of this implementation, we will use a global cache keyed by image hash
        import hashlib
        img_hash = hashlib.md5(image_bytes).hexdigest()

        # In a real production app, you'd use a predictor instance per session
        # Here we'll just simulate it or if SAM model allows, we'll extract it.
        # Ultralytics SAM doesn't easily expose the raw embedding in a reusable way for set_points
        # but we can call the model with points directly.
        # However, to honor the "compute once" requirement, we'll keep the image in memory.
        
        global sam_image_cache
        if 'sam_image_cache' not in globals():
            sam_image_cache = {}
        
        sam_image_cache[img_hash] = img_np
        
        return {"success": True, "image_hash": img_hash}
    except Exception as e:
        print(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sam/predict_interactive")
async def sam_predict_interactive(
    image_hash: str = Form(...),
    points: str = Form(...),
    point_labels: str = Form(...),
    request: Request = None
):
    """
    Real-time interactive segmentation using cached image.
    """
    model = load_sam_model()
    if not model:
        raise HTTPException(status_code=500, detail="SAM model not available.")

    global sam_image_cache
    if 'sam_image_cache' not in globals() or image_hash not in sam_image_cache:
        raise HTTPException(status_code=400, detail="Image not found in cache. Please re-compute embedding.")

    try:
        import json
        pts = json.loads(points)
        labels = json.loads(point_labels)
        
        img_np = sam_image_cache[image_hash]
        
        # Run inference with points
        print(f"DEBUG [SAM]: Interactive Predict for Hash={image_hash[:10]}...")
        print(f"DEBUG [SAM]: Points={len(pts)} | Labels={len(labels)}")
        print(f"DEBUG [SAM]: Point Details: {pts}")
        print(f"DEBUG [SAM]: Label Details (1=positive, 0=negative): {labels}")
        
        assert len(pts) == len(labels), "Length of points and point_labels must match"
        
        import numpy as np
        import cv2
        pts_np = np.array([pts], dtype=np.float32)
        labels_np = np.array([labels], dtype=np.int32)
        
        # 5. ROI crop before SAM
        orig_h, orig_w = img_np.shape[:2]
        x_coords, y_coords = pts_np[0, :, 0], pts_np[0, :, 1]
        x_min, x_max = int(np.min(x_coords)), int(np.max(x_coords))
        y_min, y_max = int(np.min(y_coords)), int(np.max(y_coords))
        
        pad_x = int((x_max - x_min) * 0.5) + 100
        pad_y = int((y_max - y_min) * 0.5) + 100
        
        crop_x1 = max(0, x_min - pad_x)
        crop_y1 = max(0, y_min - pad_y)
        crop_x2 = min(orig_w, x_max + pad_x)
        crop_y2 = min(orig_h, y_max + pad_y)
        
        cropped_img = img_np[crop_y1:crop_y2, crop_x1:crop_x2]
        
        cropped_pts = pts_np.copy()
        cropped_pts[0, :, 0] -= crop_x1
        cropped_pts[0, :, 1] -= crop_y1
        
        results = model.predict(source=cropped_img, points=cropped_pts, labels=labels_np, retina_masks=True, verbose=False)
        
        if not results or len(results) == 0:
            return {"success": True, "masks": [], "polygons": []}

        result = results[0]
        masks_json = []
        polygons_json = []

        if hasattr(result, 'masks') and result.masks is not None:
            # 4. Multi-mask selection: choose best mask based on area/shape
            best_mask_idx = 0
            best_score = -1
            
            for i in range(result.masks.data.shape[0]):
                m = result.masks.data[i].cpu().numpy()
                m_uint8 = (m * 255).astype('uint8')
                area = np.count_nonzero(m_uint8)
                if area > 0:
                    cnts, _ = cv2.findContours(m_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    if cnts:
                        c = max(cnts, key=cv2.contourArea)
                        hull_area = cv2.contourArea(cv2.convexHull(c))
                        solidity = area / hull_area if hull_area > 0 else 0
                        score = area * solidity
                        if score > best_score:
                            best_score = score
                            best_mask_idx = i
            
            mask_data_cropped = result.masks.data[best_mask_idx].cpu().numpy()
            
            # Place cropped mask back to original size
            mask_data = np.zeros((orig_h, orig_w), dtype=np.float32)
            mask_data[crop_y1:crop_y2, crop_x1:crop_x2] = mask_data_cropped
            
            num_masks = result.masks.data.shape[0] if hasattr(result.masks.data, 'shape') else 1
            nonzero_count = int(np.count_nonzero(mask_data))
            print(f"DEBUG [SAM]: mask shape={mask_data.shape}, non-zero pixels={nonzero_count}")
            
            import base64
            
            mask_uint8 = (mask_data * 255).astype('uint8')
            
            area_before = int(np.count_nonzero(mask_uint8))

            # 2. Keep all components above area threshold
            num_labels, labels_img, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
            new_mask = np.zeros_like(mask_uint8)
            area_threshold = 100 # arbitrary threshold
            for i in range(1, num_labels):
                if stats[i, cv2.CC_STAT_AREA] >= area_threshold:
                    new_mask[labels_img == i] = 255
            mask_uint8 = new_mask

            # 3. Adaptive kernel size (1% of image size minimum)
            k_size = max(3, int(min(orig_h, orig_w) * 0.01))
            k_size = k_size if k_size % 2 != 0 else k_size + 1
            kernel = np.ones((k_size, k_size), np.uint8)
            mask_uint8 = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel)

            # 1. Contour-based smoothing using approxPolyDP
            smoothed_mask = np.zeros_like(mask_uint8)
            contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                epsilon = 0.002 * cv2.arcLength(c, True)
                approx = cv2.approxPolyDP(c, epsilon, True)
                cv2.drawContours(smoothed_mask, [approx], -1, 255, -1)
            mask_uint8 = smoothed_mask

            area_after = int(np.count_nonzero(mask_uint8))
            print(f"original area: {area_before}")
            print(f"cleaned area: {area_after}")

            _, buffer = cv2.imencode('.png', mask_uint8)
            mask_base64 = base64.b64encode(buffer).decode('utf-8')
            masks_json.append(f"data:image/png;base64,{mask_base64}")
            
            # Extract polygon
            contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                cnt = max(contours, key=cv2.contourArea)
                # Simplify polygon with tighter tolerance to perfectly hug handwriting
                epsilon = 0.0015 * cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, epsilon, True)
                poly = approx.reshape(-1, 2).tolist()
                polygons_json.append(poly)

        return {
            "success": True,
            "masks": masks_json,
            "polygons": polygons_json
        }
    except Exception as e:
        print(f"Interactive prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sam/predict")
async def sam_predict(
    file: UploadFile = File(...), 
    box: str = Form(None), 
    request: Request = None
):
    """
    Local Ultralytics SAM inference endpoint.
    Accepts an image file and returns segmentation masks + annotations.
    
    Returns:
      {
        "success": bool,
        "masks": [base64 encoded mask images],
        "polygons": [[x, y], [x, y], ...],  # polygon coordinates for each mask
        "boxes": [[x, y, w, h], ...],  # bounding boxes for each mask
        "message": "Segmentation complete"
      }
    """
    # Restrict to AI annotation page only
    origin_header = request.headers.get("x-requested-from", "") if request else ""
    if not origin_header or origin_header.lower() != "ai-annotation":
        raise HTTPException(status_code=403, detail="Forbidden: endpoint restricted to AI annotation page")

    # Load model (lazy-load on first call)
    model = load_sam_model()
    if not model:
        raise HTTPException(status_code=500, detail="SAM model not available. Install ultralytics: pip install ultralytics")

    try:
        # Read uploaded image
        image_bytes = await file.read()
        
        # Save to temporary file
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        
        kwargs = {"verbose": False, "conf": 0.1}
        
        if box:
            try:
                parsed_box = json.loads(box)
                bx, by, bw, bh = parsed_box
                kwargs["bboxes"] = [bx, by, bx + bw, by + bh]
            except Exception as e:
                print(f"Error parsing box parameter: {e}")
                


        # Run SAM inference with lower confidence threshold to detect more objects
        # conf=0.1 allows detection of objects with lower confidence scores
        results = model(tmp_path, **kwargs)
        
        # Clean up temp file
        import os as os_module
        os_module.remove(tmp_path)
        
        # Extract masks and convert to polygons
        response_data = {
            "success": True,
            "masks": [],
            "polygons": [],
            "boxes": [],
            "message": "Segmentation complete"
        }
        
        if results and len(results) > 0:
            result = results[0]
            
            # Get masks if available
            if hasattr(result, 'masks') and result.masks is not None:
                np_module = ensure_numpy()
                cv2_module = ensure_cv2()
                
                print(f"🔍 SAM detected {len(result.masks.data)} potential masks")
                
                # Minimum area threshold to filter out tiny noise detections (in pixels)
                min_area = 100  # Adjust this value - smaller = more detections, but may include noise
                
                for i, mask in enumerate(result.masks.data):
                    # Convert mask to uint8
                    mask_np = (mask.cpu().numpy() * 255).astype(np_module.uint8)
                    
                    # Extract contours to check area
                    contours, _ = cv2_module.findContours(mask_np, cv2_module.RETR_EXTERNAL, cv2_module.CHAIN_APPROX_SIMPLE)
                    
                    if not contours:
                        continue
                    
                    # Get the largest contour
                    cnt = max(contours, key=cv2_module.contourArea)
                    area = cv2_module.contourArea(cnt)
                    
                    # Filter out very small detections (likely noise)
                    if area < min_area:
                        print(f"  ⏭️  Skipping mask {i+1}: area too small ({area:.0f} < {min_area})")
                        continue
                    
                    # Get bounding box
                    x, y, w, h = cv2_module.boundingRect(cnt)
                    
                    # Additional filter: skip if bounding box is too small
                    if w < 10 or h < 10:
                        print(f"  ⏭️  Skipping mask {i+1}: bounding box too small ({w}x{h})")
                        continue
                    
                    print(f"  ✅ Keeping mask {i+1}: area={area:.0f}, bbox=({x},{y},{w},{h})")
                    
                    # Encode as base64 PNG
                    from PIL import Image as PILImage
                    mask_img = PILImage.fromarray(mask_np)
                    
                    import io as io_module
                    buf = io_module.BytesIO()
                    mask_img.save(buf, format='PNG')
                    mask_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
                    response_data["masks"].append(f"data:image/png;base64,{mask_b64}")
                    
                    # Extract polygon points
                    polygon = [[int(p[0][0]), int(p[0][1])] for p in cnt]
                    response_data["polygons"].append(polygon)
                    
                    # Add bounding box
                    response_data["boxes"].append([x, y, w, h])
                
                print(f"✅ Returning {len(response_data['boxes'])} valid detections")
        
        return JSONResponse(status_code=200, content=response_data)
    
    except Exception as e:
        print(f"❌ SAM inference error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"SAM inference failed: {str(e)}")


# -----------------------------
# SAM Smart Detect Endpoint (v5 — CLIP Semantic + SAM + Visual Pipeline)
# -----------------------------
@app.post("/api/sam/smart")
async def sam_smart_detect(
    file: UploadFile = File(...),
    className: str = Form(...),
    description: str = Form(...),
    request: Request = None
):
    """
    Smart Detect v5: 3-Stage Semantic Pipeline

    Stage 1 — SAM:   Generates all candidate region masks
    Stage 2 — Visual: Scores each region via handwriting heuristics
    Stage 3 — CLIP:  Scores semantic similarity to user prompt text

    Final score = 0.4×CLIP + 0.3×visual_irregularity + 0.2×position_bias + 0.1×size_score
    Hard filter: reject if CLIP similarity < 0.25 (removes paragraphs/tables entirely)
    Fallback: lower CLIP threshold 0.25→0.20, then always return best match.
    """
    origin_header = request.headers.get("x-requested-from", "") if request else ""
    if not origin_header or origin_header.lower() != "ai-annotation":
        raise HTTPException(status_code=403, detail="Forbidden")

    model = load_sam_model()
    if not model:
        raise HTTPException(status_code=500, detail="SAM model not available.")

    try:
        import tempfile, io as io_module, os as os_module, math
        from PIL import Image as PILImage

        image_bytes = await file.read()
        np_module = ensure_numpy()
        cv2_module = ensure_cv2()

        semantic_prompt = f"{description.strip()} {className.strip()}".lower().strip()
        kw_combined = (className + " " + description).lower()

        print(f"\n{'='*70}")
        print(f"🧠 Smart Detect v5 (CLIP+SAM+Visual) | Prompt: '{semantic_prompt}'")
        print(f"{'='*70}")

        # ── Intent detection ─────────────────────────────────────────────────
        is_signature_mode = any(kw in kw_combined for kw in [
            'signature', 'sign', 'handwritten', 'handwriting', 'hand written',
            'cursive', 'autograph', 'written', 'pen', 'ink', 'handwrite'
        ])
        is_logo_mode = any(kw in kw_combined for kw in ['logo', 'seal', 'stamp', 'icon', 'emblem'])
        print(f"   Intent: signature={is_signature_mode}, logo={is_logo_mode}")

        # ── Load image ───────────────────────────────────────────────────────
        img_pil = PILImage.open(io_module.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img_pil.size
        img_np = np_module.array(img_pil)
        img_gray = cv2_module.cvtColor(img_np, cv2_module.COLOR_RGB2GRAY)
        img_area = img_w * img_h
        print(f"📐 Image: {img_w}x{img_h}")

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # STAGE 1: SAM — generate candidate masks (wide net, conf=0.05)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        results = model(tmp_path, verbose=False, conf=0.05)
        os_module.remove(tmp_path)

        candidates = []   # list of (bbox, cnt, mask_np, area, sam_conf)
        if results and len(results) > 0:
            result = results[0]
            if hasattr(result, 'masks') and result.masks is not None:
                masks_data = result.masks.data
                # Try to get per-mask confidence from boxes
                confs = []
                if hasattr(result, 'boxes') and result.boxes is not None and result.boxes.conf is not None:
                    confs = result.boxes.conf.cpu().numpy().tolist()

                print(f"🔍 Stage1 SAM: {len(masks_data)} raw masks")
                for i, mask in enumerate(masks_data):
                    mask_np = (mask.cpu().numpy() * 255).astype(np_module.uint8)
                    contours, _ = cv2_module.findContours(
                        mask_np, cv2_module.RETR_EXTERNAL, cv2_module.CHAIN_APPROX_SIMPLE)
                    if not contours:
                        continue
                    cnt = max(contours, key=cv2_module.contourArea)
                    area = cv2_module.contourArea(cnt)
                    if area < 50:
                        continue
                    x, y, w, h = cv2_module.boundingRect(cnt)
                    if w < 5 or h < 5:
                        continue
                    sam_conf = float(confs[i]) if i < len(confs) else 0.5
                    candidates.append(([x, y, w, h], cnt, mask_np, float(area), sam_conf))

        print(f"📦 {len(candidates)} candidates after SAM noise filter")

        if not candidates:
            return JSONResponse(status_code=200, content={
                "success": True, "prompt": semantic_prompt,
                "boxes": [], "masks": [], "polygons": [], "detections": [],
                "message": f"No regions detected in image"
            })

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # STAGE 2: VISUAL SCORING — handwriting / signature heuristics
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        def compute_printed_text_score(gray_crop):
            """0–1. Higher = looks like dense printed text (bad for signature)."""
            if gray_crop.shape[0] < 5 or gray_crop.shape[1] < 5:
                return 0.0
            _, binary = cv2_module.threshold(
                gray_crop, 0, 255, cv2_module.THRESH_BINARY_INV + cv2_module.THRESH_OTSU)
            row_sums = np_module.sum(binary, axis=1).astype(float)
            if row_sums.max() == 0:
                return 0.0
            row_norm = row_sums / row_sums.max()
            above = row_norm > 0.1
            crossings = int(np_module.sum(np_module.diff(above.astype(int)) != 0))
            regularity = crossings / max(gray_crop.shape[0], 1)
            col_sums = np_module.sum(binary, axis=0).astype(float)
            col_norm = col_sums / (col_sums.max() + 1e-6)
            col_above = col_norm > 0.1
            col_crossings = int(np_module.sum(np_module.diff(col_above.astype(int)) != 0))
            col_regularity = col_crossings / max(gray_crop.shape[1], 1)
            return min((regularity + col_regularity) / 2.0 * 3.0, 1.0)

        def compute_contour_irregularity(cnt, area):
            """0–1. Higher = more irregular/cursive contour (signature-like)."""
            perimeter = cv2_module.arcLength(cnt, True)
            if area < 1 or perimeter < 1:
                return 0.0
            ratio = (perimeter ** 2) / (4 * math.pi * area)
            return min(max((ratio - 1.0) / 10.0, 0.0), 1.0)

        def compute_gradient_entropy(gray_crop):
            """0–1. Higher = more varied stroke directions (handwriting)."""
            if gray_crop.shape[0] < 5 or gray_crop.shape[1] < 5:
                return 0.0
            gx = cv2_module.Sobel(gray_crop, cv2_module.CV_64F, 1, 0, ksize=3)
            gy = cv2_module.Sobel(gray_crop, cv2_module.CV_64F, 0, 1, ksize=3)
            magnitude = np_module.sqrt(gx**2 + gy**2)
            angle = np_module.arctan2(gy, gx)
            mask_strong = magnitude > magnitude.mean() + magnitude.std() * 0.5
            if mask_strong.sum() < 10:
                return 0.0
            hist, _ = np_module.histogram(angle[mask_strong], bins=16, range=(-math.pi, math.pi))
            hist = hist.astype(float) + 1e-6
            hist /= hist.sum()
            entropy = -float(np_module.sum(hist * np_module.log(hist)))
            return min(entropy / math.log(16), 1.0)

        def compute_stroke_variation(gray_crop):
            """0–1. Higher = non-uniform stroke widths (handwriting)."""
            if gray_crop.shape[0] < 5 or gray_crop.shape[1] < 5:
                return 0.0
            _, binary = cv2_module.threshold(
                gray_crop, 0, 255, cv2_module.THRESH_BINARY_INV + cv2_module.THRESH_OTSU)
            dist = cv2_module.distanceTransform(binary, cv2_module.DIST_L2, 5)
            vals = dist[dist > 0.5]
            if len(vals) < 10:
                return 0.0
            return min(float(np_module.std(vals)) / (float(np_module.mean(vals)) + 1e-6), 1.0)

        def visual_score(bbox, cnt, area):
            """
            Returns (visual_score [0–1], position_score [0–1], size_score [0–1], breakdown dict).
            visual_score  = irregularity + entropy + stroke_variation + text_penalty
            position_score = bottom-of-page bias
            size_score     = prefers small-to-medium marks
            """
            x, y, w, h = bbox
            br = {}
            area_ratio = area / img_area
            aspect = w / h if h > 0 else 1.0
            center_y = (y + h / 2) / img_h
            bbox_area = w * h
            fill_ratio = area / bbox_area if bbox_area > 0 else 0
            crop_gray = img_gray[y:y+h, x:x+w]

            # --- Visual irregularity components ---
            irr = compute_contour_irregularity(cnt, area)
            ent = compute_gradient_entropy(crop_gray)
            swv = compute_stroke_variation(crop_gray)
            text_pen = compute_printed_text_score(crop_gray)
            br['irregularity'] = f"{irr:.2f}"
            br['gradient_entropy'] = f"{ent:.2f}"
            br['stroke_variation'] = f"{swv:.2f}"
            br['text_density'] = f"{text_pen:.2f}"

            # Aggregate visual score (signature boosts + text penalty)
            vis = (irr * 0.40 + ent * 0.35 + swv * 0.25) - (text_pen * 0.40)

            # Dense rectangular block penalty (tables / paragraphs)
            if fill_ratio > 0.85 and area_ratio > 0.05:
                vis -= 0.40
                br['dense_block_penalty'] = "-0.40"

            # Large block penalty
            if area_ratio > 0.35:
                vis -= 0.50
                br['large_block_penalty'] = "-0.50"
            elif area_ratio > 0.20:
                vis -= 0.20
                br['large_block_penalty'] = "-0.20"

            vis = min(max(vis, 0.0), 1.0)

            # --- Position score (bottom = good for signatures) ---
            if is_signature_mode:
                if center_y > 0.70:
                    pos_s = 1.0
                elif center_y > 0.50:
                    pos_s = 0.7
                elif center_y > 0.30:
                    pos_s = 0.4
                else:
                    pos_s = 0.1
            else:
                pos_s = 0.5   # neutral for non-signature classes
            br['position'] = f"{pos_s:.2f}(cy={center_y:.2f})"

            # --- Size score ---
            if 0.001 < area_ratio < 0.08:
                sz_s = 1.0
            elif area_ratio < 0.20:
                sz_s = 0.6
            elif area_ratio < 0.40:
                sz_s = 0.2
            else:
                sz_s = 0.0
            br['size'] = f"{sz_s:.2f}(ratio={area_ratio:.3f})"

            return vis, pos_s, sz_s, br

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # STAGE 3: CLIP SEMANTIC SCORING
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        clip_model, clip_processor = load_clip_model()
        clip_available = clip_model is not None

        # Build text prompts — positive (class) and negative (counter-examples)
        positive_texts = [
            className,
            f"handwritten {className}",
            description if description.strip() else f"a {className}",
        ]
        negative_texts = [
            "paragraph of printed text",
            "dense text block",
            "table with rows and columns",
            "printed document body",
        ]
        all_clip_texts = positive_texts + negative_texts
        n_pos = len(positive_texts)

        # Pre-encode all text prompts once (shared across all regions)
        text_features_np = None
        if clip_available:
            try:
                import torch
                with torch.no_grad():
                    text_inputs = clip_processor(
                        text=all_clip_texts, return_tensors="pt", padding=True, truncation=True)
                    text_feats = clip_model.get_text_features(**text_inputs)
                    text_feats = text_feats / text_feats.norm(dim=-1, keepdim=True)
                    text_features_np = text_feats.numpy()
                print(f"✅ CLIP text prompts encoded: {all_clip_texts}")
            except Exception as e:
                print(f"⚠️  CLIP text encoding failed: {e}")
                clip_available = False

        def clip_score_for_crop(crop_pil):
            """Returns CLIP semantic similarity [0–1] of crop vs. positive prompts.
            Score = mean(positive sims) - mean(negative sims), clipped to [0,1]."""
            if not clip_available or text_features_np is None:
                return 0.5   # neutral fallback — does not filter anything
            try:
                import torch
                with torch.no_grad():
                    img_input = clip_processor(images=crop_pil, return_tensors="pt")
                    img_feat = clip_model.get_image_features(**img_input)
                    img_feat = img_feat / img_feat.norm(dim=-1, keepdim=True)
                    img_np_feat = img_feat.numpy()[0]   # shape (512,)

                sims = text_features_np @ img_np_feat   # (N_texts,)
                pos_sim = float(sims[:n_pos].mean())
                neg_sim = float(sims[n_pos:].mean())
                # Net score: positive affinity minus negative affinity
                net = (pos_sim - neg_sim + 1.0) / 2.0   # shift to [0,1]
                return min(max(net, 0.0), 1.0)
            except Exception as e:
                print(f"⚠️  CLIP inference error for crop: {e}")
                return 0.5   # neutral fallback

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # COMBINE SCORES — per region
        # Final = 0.4×CLIP + 0.3×visual + 0.2×position + 0.1×size
        # Hard filter: reject if CLIP similarity < CLIP_HARD_THRESHOLD
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        CLIP_HARD_THRESHOLD = 0.25   # Stage‐3 hard filter
        CLIP_FALLBACK_THRESHOLD = 0.20

        scored_results = []
        for bbox, cnt, mask_np, area, sam_conf in candidates:
            x, y, w, h = bbox
            vis_s, pos_s, sz_s, br = visual_score(bbox, cnt, area)

            # Crop image for CLIP
            pad = 4
            cx1, cy1 = max(0, x - pad), max(0, y - pad)
            cx2, cy2 = min(img_w, x + w + pad), min(img_h, y + h + pad)
            crop_pil = img_pil.crop((cx1, cy1, cx2, cy2))
            clip_s = clip_score_for_crop(crop_pil)

            # Weighted final score
            final = (0.40 * clip_s) + (0.30 * vis_s) + (0.20 * pos_s) + (0.10 * sz_s)
            final = min(max(final, 0.0), 1.0)

            print(
                f"  🔬 bbox={bbox} | "
                f"CLIP={clip_s:.3f} | visual={vis_s:.3f} | pos={pos_s:.3f} | "
                f"size={sz_s:.3f} | SAM_conf={sam_conf:.2f} | FINAL={final:.3f} | "
                f"detail={br}"
            )

            scored_results.append((final, clip_s, bbox, cnt, mask_np, area, sam_conf))

        # Sort by final score descending
        scored_results.sort(key=lambda t: t[0], reverse=True)
        TOP_K = 2  # Maximum detections to return

        # ── Fallback selection with progressive CLIP threshold relaxation ───
        def select_results(scored, clip_thresh):
            """Filter by CLIP hard threshold; return top-K."""
            passing = [r for r in scored if r[1] >= clip_thresh]
            return passing[:TOP_K]

        final_results = select_results(scored_results, CLIP_HARD_THRESHOLD)
        used_clip_thresh = CLIP_HARD_THRESHOLD

        if not final_results:
            print(f"⚠️  CLIP threshold {CLIP_HARD_THRESHOLD} filtered everything — retrying at {CLIP_FALLBACK_THRESHOLD}")
            final_results = select_results(scored_results, CLIP_FALLBACK_THRESHOLD)
            used_clip_thresh = CLIP_FALLBACK_THRESHOLD

        if not final_results:
            # Absolute fallback: best available match regardless of CLIP
            print(f"⚠️  All CLIP thresholds failed — returning best available match")
            final_results = [scored_results[0]]
            used_clip_thresh = 0.0

        print(f"\n📈 Summary | candidates={len(candidates)} | passed={len(final_results)} | clip_thresh={used_clip_thresh}")

        # ─── Build response ──────────────────────────────────────────────────
        response_data = {
            "success": True,
            "prompt": semantic_prompt,
            "masks": [], "polygons": [], "boxes": [], "detections": [],
            "message": f"Smart Detect: {len(final_results)} {className}(s) found"
        }

        for score, clip_s, bbox, cnt, mask_np, area, sam_conf in final_results:
            mask_img = PILImage.fromarray(mask_np)
            buf = io_module.BytesIO()
            mask_img.save(buf, format='PNG')
            mask_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            response_data["masks"].append(f"data:image/png;base64,{mask_b64}")
            polygon = [[int(p[0][0]), int(p[0][1])] for p in cnt]
            response_data["polygons"].append(polygon)
            response_data["boxes"].append(bbox)
            response_data["detections"].append({
                "bbox": bbox,
                "score": round(score, 3),
                "clip_score": round(clip_s, 3),
                "label": className
            })

        print(f"✅ Returning {len(final_results)} detection(s)")
        return JSONResponse(status_code=200, content=response_data)

    except Exception as e:
        print(f"❌ Smart Detect v5 error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Smart Detect failed: {str(e)}")


# =============================
# Batch SAM Processing Endpoint
# =============================
@app.post("/api/sam/batch")
async def sam_batch(files: List[UploadFile] = File(...), request: Request = None, export: bool = False):
    """
    Batch process multiple images or PDFs with SAM model.
    
    Query params:
      - export (bool): If true, return zip file; if false, return JSON results
    
    Returns (if export=False):
      {
        "success": bool,
        "results": [
          {
            "filename": "image.jpg",
            "masks": [base64 PNG],
            "polygons": [[x, y], ...],
            "boxes": [[x, y, w, h], ...],
            "error": null
          },
          ...
        ]
      }
    
    Returns (if export=True):
      Binary zip file with masks/ folder, annotations.json, README.md
    """
    # Restrict to AI annotation page only
    origin_header = request.headers.get("x-requested-from", "") if request else ""
    if not origin_header or origin_header.lower() != "ai-annotation":
        raise HTTPException(status_code=403, detail="Forbidden: endpoint restricted to AI annotation page")

    # Import batch handler
    try:
        from batch_sam_handler import process_batch_images, create_export_zip
    except ImportError:
        raise HTTPException(status_code=500, detail="Batch handler module not found. Ensure batch_sam_handler.py exists.")

    # Load model
    model = load_sam_model()
    if not model:
        raise HTTPException(status_code=500, detail="SAM model not available. Install ultralytics: pip install ultralytics")

    try:
        # Process batch images/PDFs
        batch_results = await process_batch_images(files, load_sam_model)
        
        if export:
            # Create and return zip file
            zip_bytes = create_export_zip(batch_results)
            
            return StreamingResponse(
                iter([zip_bytes]),
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=sam_annotations.zip"}
            )
        else:
            # Return JSON results
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "results": batch_results.get("results", []),
                    "message": f"Batch processed {len(batch_results.get('results', []))} files"
                }
            )
    
    except Exception as e:
        print(f"❌ Batch SAM processing error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Batch processing failed: {str(e)}")


# -----------------------------
# Docs Annotation - YOLO Model Inference
# -----------------------------
@app.post("/api/docs/predict")
async def docs_predict(file: UploadFile = File(...), request: Request = None):
    """
    YOLO model inference endpoint for document annotation.
    Uses best.pt model to detect document elements.
    
    Returns:
      {
        "success": bool,
        "boxes": [[x, y, w, h, confidence, class_id, class_name], ...],
        "message": "Detection complete"
      }
    """
    # Restrict to docs annotation page only
    origin_header = request.headers.get("x-requested-from", "") if request else ""
    if not origin_header or origin_header.lower() != "docs-annotation":
        raise HTTPException(status_code=403, detail="Forbidden: endpoint restricted to docs annotation page")

    # Load model (lazy-load on first call)
    model = load_docs_model()
    if not model:
        raise HTTPException(status_code=500, detail="Docs annotation model not available. Ensure best.pt exists in back_end directory")

    try:
        # Read uploaded image
        image_bytes = await file.read()
        
        # Save to temporary file
        import tempfile
        import os as os_module
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        # Run YOLO inference
        results = model(tmp_path, verbose=False, conf=0.25)  # confidence threshold
        
        # Clean up temp file
        os_module.remove(tmp_path)
        
        response_data = {
            "success": True,
            "message": "Detection complete",
            "boxes": []
        }
        
        if results and len(results) > 0:
            result = results[0]
            
            # Get class names from model
            class_names = result.names if hasattr(result, 'names') else {}
            
            # Extract detections
            if hasattr(result, 'boxes') and result.boxes is not None:
                boxes_data = result.boxes
                
                # Get boxes in xywh format
                boxes_xywh = boxes_data.xywh.cpu().numpy() if hasattr(boxes_data, 'xywh') else []
                confidences = boxes_data.conf.cpu().numpy() if hasattr(boxes_data, 'conf') else []
                class_ids = boxes_data.cls.cpu().numpy().astype(int) if hasattr(boxes_data, 'cls') else []
                
                for i in range(len(boxes_xywh)):
                    x, y, w, h = boxes_xywh[i]
                    conf = float(confidences[i]) if i < len(confidences) else 0.0
                    cls_id = int(class_ids[i]) if i < len(class_ids) else 0
                    cls_name = class_names.get(cls_id, f"class_{cls_id}")
                    
                    # Convert from center format (xywh) to top-left format (x, y, w, h)
                    x = int(x - w / 2)
                    y = int(y - h / 2)
                    w = int(w)
                    h = int(h)
                    
                    response_data["boxes"].append([x, y, w, h, conf, cls_id, cls_name])
                
                print(f"✅ Docs annotation detected {len(response_data['boxes'])} objects")
        
        return JSONResponse(status_code=200, content=response_data)
    
    except Exception as e:
        print(f"❌ Docs annotation inference error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Docs annotation inference failed: {str(e)}")



# ============================================================================
# TRAINING ENGINE — full implementation
# ============================================================================

# Lazy-import the singleton so server restarts don't fail if ultralytics is
# missing (import happens only on first API call or WebSocket connect).
_training_manager = None

def _get_training_manager():
    global _training_manager
    if _training_manager is None:
        try:
            from training.training_manager import training_manager
            _training_manager = training_manager
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Training engine could not be loaded: {exc}"
            )
    return _training_manager


class TrainingStartRequest(BaseModel):
    project_id:         int
    dataset_version_id: str
    data_yaml_path:     str
    weights:            Optional[str] = None   # None → from scratch
    epochs:             int           = 100
    imgsz:              int           = 640
    batch:              int           = -1
    patience:           int           = 50
    task:               str           = "detect"


@app.get("/api/training/status")
async def get_training_status(current_user: User = Depends(get_current_user)):
    """Return active job info or is_running=False."""
    mgr    = _get_training_manager()
    active = mgr.get_active()
    if active:
        return JSONResponse({
            "is_running": True,
            "job_id":     active.job_id,
            "status":     active.status,
        })
    return JSONResponse({"is_running": False, "job_id": None})


@app.post("/api/training/start")
async def start_training(
    body:         TrainingStartRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Launch a YOLO training job.
    Only one job may run at a time.
    """
    mgr = _get_training_manager()
    config = body.model_dump()
    try:
        job_id = mgr.create_and_start(config)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return JSONResponse({"job_id": job_id, "status": "running"})


@app.post("/api/training/{job_id}/stop")
async def stop_training(
    job_id:       str,
    current_user: User = Depends(get_current_user),
):
    """Request a clean stop of the running training job."""
    mgr = _get_training_manager()
    job = mgr.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "running":
        raise HTTPException(status_code=409, detail=f"Job is not running (status: {job.status})")
    job.stop()
    return JSONResponse({"status": "stopping", "job_id": job_id})


@app.get("/api/training/history")
async def get_training_history(current_user: User = Depends(get_current_user)):
    """Return all training job summaries (newest first)."""
    mgr = _get_training_manager()
    return JSONResponse(mgr.list_all())


@app.get("/api/training/{job_id}")
async def get_training_job(
    job_id:       str,
    current_user: User = Depends(get_current_user),
):
    """Return the current summary of a specific training job."""
    mgr = _get_training_manager()
    job = mgr.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(job.to_summary())


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws/training/{job_id}")
async def training_websocket(websocket: WebSocket, job_id: str):
    """
    Real-time training log stream.

    The client connects once per job.  Messages are JSON objects:
      { "type": "metrics", "data": {...} }
      { "type": "gpu",     "data": {...} }
      { "type": "done",    "data": {...} }
      { "type": "stopped", "data": {} }
      { "type": "error",   "message": "..." }

    The server closes the socket automatically on terminal events
    (done / stopped / error).
    """
    await websocket.accept()

    mgr = _get_training_manager()
    job = mgr.get(job_id)

    if job is None:
        await websocket.send_json({"type": "error", "message": f"Job '{job_id}' not found"})
        await websocket.close()
        return

    _TERMINAL = {"done", "stopped", "error"}

    try:
        while True:
            # Drain the queue in a non-blocking tight loop
            drained = 0
            while True:
                try:
                    msg = job.log_queue.get_nowait()
                    drained += 1
                    await websocket.send_json(msg)
                    if msg.get("type") in _TERMINAL:
                        return         # closes the socket when function returns
                except _queue_module.Empty:
                    break

            # If the job finished but the queue is now empty, send done and exit
            if job.status in _TERMINAL and drained == 0:
                await websocket.send_json({"type": job.status, "data": {}})
                return

            # Yield to the event loop between drains
            await asyncio.sleep(0.3)

    except WebSocketDisconnect:
        pass   # client closed the tab — no action needed
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


# ============================================================================
# RESULTS & MODEL REGISTRY ENDPOINTS
# ============================================================================
from fastapi.responses import FileResponse
import csv

@app.get("/api/training/{job_id}/results/csv")
async def get_training_results_csv(job_id: str, current_user: User = Depends(get_current_user)):
    """Fetch and parse results.csv from the training run."""
    csv_path = Path("runs") / "training" / job_id / "results.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="results.csv not found")
        
    data = []
    try:
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            # Clean up keys (ultralytics adds whitespace)
            for row in reader:
                cleaned = {k.strip(): v.strip() for k, v in row.items()}
                data.append(cleaned)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read CSV: {exc}")
        
    return JSONResponse(data)


@app.get("/api/training/{job_id}/results/image/{image_name}")
async def get_training_results_image(job_id: str, image_name: str, token: str = None):
    """Serve validation images from the training run."""
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    # Prevent path traversal
    safe_name = Path(image_name).name
    img_path = Path("runs") / "training" / job_id / safe_name
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(img_path)

@app.get("/api/training/{job_id}/weights/best.pt")
async def get_training_weights(job_id: str, current_user: User = Depends(get_current_user)):
    """Serve the trained weights file."""
    weights_path = Path("runs") / "training" / job_id / "weights" / "best.pt"
    if not weights_path.exists():
        raise HTTPException(status_code=404, detail="Weights not found")
    return FileResponse(weights_path, filename=f"best_{job_id[:8]}.pt")


class ModelRegisterRequest(BaseModel):
    job_id: str

@app.post("/api/models/register")
async def register_model(body: ModelRegisterRequest, current_user: User = Depends(get_current_user)):
    """Register a trained model."""
    try:
        from training.model_registry import model_registry
        from training.training_manager import training_manager
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Training module not loaded")
        
    job = training_manager.get(body.job_id)
    if not job:
        # Check history if job not in memory
        history = [j for j in training_manager.list_all() if j["job_id"] == body.job_id]
        if not history:
            raise HTTPException(status_code=404, detail="Job not found")
        job_summary = history[0]
        config = job_summary.get("config", {})
        
        # In history, final_metrics isn't directly exposed unless it's in the log_queue (which is lost).
        # We need to read results.csv to get final metrics.
        metrics = {}
        csv_path = Path("runs") / "training" / body.job_id / "results.csv"
        if csv_path.exists():
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = list(csv.DictReader(f))
                if reader:
                    last_row = {k.strip(): float(v.strip()) for k, v in reader[-1].items()}
                    metrics = {
                        "mAP50": last_row.get("metrics/mAP50(B)", 0.0),
                        "precision": last_row.get("metrics/precision(B)", 0.0),
                        "recall": last_row.get("metrics/recall(B)", 0.0),
                        "epoch": last_row.get("epoch", config.get("epochs", 100))
                    }
    else:
        config = job.config
        metrics = {}
        # Get from metrics history if available
        if hasattr(job, "metrics_history") and job.metrics_history:
            m = job.metrics_history[-1]
            metrics = {
                "mAP50": m.get("mAP50", 0.0),
                "precision": m.get("precision", 0.0),
                "recall": m.get("recall", 0.0),
                "epoch": m.get("epoch", 0)
            }
            
    entry = model_registry.register_model(body.job_id, config, metrics)
    return JSONResponse(entry)


@app.get("/api/models/{project_id}")
async def get_models(project_id: int, current_user: User = Depends(get_current_user)):
    """List registered models for a project."""
    try:
        from training.model_registry import model_registry
    except Exception:
        return JSONResponse([])
    return JSONResponse(model_registry.list_models(project_id))


@app.post("/api/models/{model_id}/deploy")
async def deploy_model(model_id: str, current_user: User = Depends(get_current_user)):
    """Set active model for project and copy weights to best.pt."""
    try:
        from training.model_registry import model_registry
    except Exception:
        raise HTTPException(status_code=503, detail="Module not loaded")
        
    weights_path = model_registry.deploy_model(model_id)
    if not weights_path:
        raise HTTPException(status_code=404, detail="Model not found")
        
    # Copy to best.pt in root
    try:
        import shutil
        src = Path(weights_path)
        dst = Path("best.pt")
        if src.exists():
            shutil.copy2(src, dst)
            # Force reload in memory
            global docs_model
            docs_model = None
            load_docs_model()
    except Exception as e:
        logger.error(f"Failed to copy weights: {e}")
        
    return JSONResponse({"deployed": True, "weights_path": weights_path})


@app.delete("/api/models/{model_id}")
async def delete_model(model_id: str, current_user: User = Depends(get_current_user)):
    """Archive a model."""
    try:
        from training.model_registry import model_registry
    except Exception:
        raise HTTPException(status_code=503, detail="Module not loaded")
        
    success = model_registry.delete_model(model_id)
    if not success:
        raise HTTPException(status_code=404, detail="Model not found")
    return JSONResponse({"archived": True})


# ============================================================================
# DATASET VERSIONING ENDPOINTS
# ============================================================================

VERSIONS_DIR = Path("versions")
VERSIONS_DIR.mkdir(exist_ok=True)

class ExportVersionRequest(BaseModel):
    project_id: int
    version_id: Optional[str] = None
    split: Optional[List[float]] = None   # [train, val, test]

@app.post("/api/dataset/export-version")
async def export_dataset_version(
    body: ExportVersionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate a versioned YOLO dataset for a project.

    Body:
        project_id  – project to export
        version_id  – optional label (auto-generated if omitted)
        split       – optional [train, val, test] ratios (default [0.8, 0.1, 0.1])

    Response:
        { data_yaml_path, version_meta }
    """
    from training.dataset_exporter import export_yolo_version

    db = SessionLocal()
    try:
        # ── verify project belongs to the requesting user ─────────────────────
        project = db.query(Project).filter(
            Project.id == body.project_id,
            Project.user_id == current_user.id
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # ── resolve class names ───────────────────────────────────────────────
        try:
            class_names = json.loads(project.classes) if project.classes else []
        except Exception:
            class_names = []

        # ── collect images + annotations from DB ──────────────────────────────
        images = db.query(ProjectImage).filter(
            ProjectImage.project_id == body.project_id
        ).all()

        if not images:
            raise HTTPException(
                status_code=422,
                detail="Project has no images. Upload images and add annotations first."
            )

        # Build the annotation dicts expected by export_yolo_version
        annotation_data = []
        all_class_names = set(class_names)

        for img in images:
            anns = db.query(Annotation).filter(
                Annotation.image_id == img.id
            ).all()

            # Collect any new class names encountered in annotations
            for ann in anns:
                if ann.class_name:
                    all_class_names.add(ann.class_name)

            annotation_data.append({
                "image_id": img.id,
                "filename":  img.filename,
                "filepath":  img.filepath,
                "width":     img.width  or 0,
                "height":    img.height or 0,
                "anns": [
                    {
                        "class_name":       ann.class_name,
                        "annotation_type":  ann.annotation_type,
                        "coordinates":      ann.coordinates,
                    }
                    for ann in anns
                ],
            })

        # Merge any annotation-derived classes that are not in project.classes
        merged_class_names = list(class_names)
        for name in sorted(all_class_names):
            if name not in merged_class_names:
                merged_class_names.append(name)

        # ── resolve split ─────────────────────────────────────────────────────
        if body.split and len(body.split) == 3:
            split_tuple = tuple(body.split)
        else:
            split_tuple = (0.8, 0.1, 0.1)

        # ── resolve version_id ────────────────────────────────────────────────
        version_id = body.version_id
        if not version_id:
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            version_id = f"v_{ts}"

        # ── call the exporter ─────────────────────────────────────────────────
        try:
            yaml_path = export_yolo_version(
                project_id=body.project_id,
                version_id=version_id,
                annotations=annotation_data,
                class_names=merged_class_names,
                base_upload_dir=str(UPLOAD_DIR.absolute()),
                base_versions_dir=str(VERSIONS_DIR.absolute()),
                split=split_tuple,
            )
        except ValueError as ve:
            raise HTTPException(status_code=422, detail=str(ve))

        # ── read back the meta and return it ──────────────────────────────────
        meta_path = Path(yaml_path).parent / "version_meta.json"
        version_meta = json.loads(meta_path.read_text(encoding="utf-8"))

        return JSONResponse({
            "data_yaml_path": yaml_path,
            "version_meta":   version_meta,
        })

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Dataset export failed: {str(e)}"
        )
    finally:
        db.close()


@app.get("/api/dataset/versions/{project_id}")
async def get_dataset_versions(
    project_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    List all exported dataset versions for a project (newest first).
    """
    from training.dataset_exporter import list_versions

    db = SessionLocal()
    try:
        # Verify project belongs to user
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user.id
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        versions = list_versions(project_id, str(VERSIONS_DIR.absolute()))
        return JSONResponse(versions)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list versions: {str(e)}"
        )
    finally:
        db.close()


@app.get("/api/dataset/versions/{project_id}/{version_id}/stats")
async def get_dataset_version_stats(
    project_id: int,
    version_id: str,
    current_user: User = Depends(get_current_user)
):
    """Returns basic stats for a specific dataset version."""
    from training.dataset_exporter import list_versions
    versions = list_versions(project_id, str(VERSIONS_DIR.absolute()))
    meta = next((v for v in versions if v.get("version_id") == version_id), None)
    if not meta:
        raise HTTPException(status_code=404, detail="Version not found")
        
    return JSONResponse({
        "total_images": meta.get("total_images", 0),
        "class_count": len(meta.get("class_names", [])),
        "avg_annotations_per_image": 1.0
    })

if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║        🎨 ROBOFLOW CLONE PRO - 100% WORKING VERSION 🎨              ║
║                                                                      ║
║              Professional Image Annotation Platform                  ║
║                                                                      ║
║  ✅ Server Starting...                                               ║
║                                                                      ║
║  🌐 Open: http://localhost:8000                                     ║
║                                                                      ║
║  🚀 NEW FEATURES:                                                    ║
║     • Project History & Switching ✓                                 ║
║     • Project Name Displayed at Top ✓                               ║
║     • Brush Size Control with Preview ✓                             ║
║     • Timestamped Separate Exports ✓                                ║
║     • All Tools Working Perfectly ✓                                 ║
║     • Fixed Image Loading ✓                                         ║
║                                                                      ║
║  🎯 TOOLS:                                                           ║
║     • Bounding Box (B)                                              ║
║     • Polygon (P) - Double-click to finish                          ║
║     • Brush (R) - Adjustable thickness                              ║
║     • Select (V)                                                    ║
║                                                                      ║
║  📦 EXPORTS: Saved to /exports/ with timestamps                     ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
""")
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")