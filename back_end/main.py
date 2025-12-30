from fastapi import FastAPI, UploadFile, File, Form, Request, Depends, HTTPException, status
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

from passlib.context import CryptContext
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
    "postgresql://postgres:Durga1997%40%40@localhost/roboflow"  # Default for development only
)
# For PostgreSQL, we don't need connect_args like SQLite
# pool_pre_ping=True ensures connections are valid before using them
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

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

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
        if not mail_username or not mail_password:
            print(f"\n{'='*60}")
            print(f"⚠️  EMAIL NOT CONFIGURED")
            print(f"   MAIL_USERNAME: {'Set' if mail_username else 'Not set'}")
            print(f"   MAIL_PASSWORD: {'Set' if mail_password else 'Not set'}")
            print(f"\n   OTP for {email}: {otp}")
            if reset_token:
                reset_link = f"{frontend_url}/reset-password?token={reset_token}"
                print(f"   Reset Link: {reset_link}")
            print(f"\n   To enable email sending, add to back_end/.env:")
            print(f"   MAIL_USERNAME=your-email@gmail.com")
            print(f"   MAIL_PASSWORD=your-app-password")
            print(f"   MAIL_FROM=your-email@gmail.com")
            print(f"   MAIL_SERVER=smtp.gmail.com")
            print(f"   MAIL_PORT=587")
            print(f"{'='*60}\n")
            return True  # Return True so the flow continues in development
        
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
            # Only return OTP in response if email is not configured (for development)
            response = {"message": "OTP generated. Please check console for OTP code if email was not received."}
            if not mail_username or not mail_password:
                response["otp"] = otp
                response["reset_link"] = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/reset-password?token={reset_token}"
            return response
        
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
            "version": "2",
            "description": f"Exported from RoboSpectra - {file.file_name}",
            "contributor": "",
            "url": "",
            "date_created": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00")
        }
        
        coco_licenses = [
            {
                "id": 1,
                "url": "https://creativecommons.org/licenses/by/4.0/",
                "name": "CC BY 4.0"
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
                        bbox = [coords['x'], coords['y'], coords['width'], coords['height']]
                        area = coords['width'] * coords['height']
                        annotation_data = {
                            "id": ann_id,
                            "image_id": img_idx,
                            "category_id": class_id,
                            "bbox": bbox,
                            "area": area,
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
                                
                                annotation_data = {
                                    "id": ann_id,
                                    "image_id": img_idx,
                                    "category_id": class_id,
                                    "segmentation": [segmentation],
                                    "area": area,
                                    "bbox": [
                                        min(x_coords),
                                        min(y_coords),
                                        max(x_coords) - min(x_coords),
                                        max(y_coords) - min(y_coords)
                                    ],
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
                    "version": "2",
                    "description": f"Exported from RoboSpectra - {project.name}",
                    "contributor": "",
                    "url": "",
                    "date_created": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00")
                }
                
                coco_licenses = [
                    {
                        "id": 1,
                        "url": "https://creativecommons.org/licenses/by/4.0/",
                        "name": "CC BY 4.0"
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
                            bbox = [coords['x'], coords['y'], coords['width'], coords['height']]
                            area = coords['width'] * coords['height']
                            annotation_data = {
                                "id": image_ann_id,
                                "image_id": 0,  # Always 0 for single image JSON
                                "category_id": class_id,
                                "bbox": bbox,
                                "area": area,
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
                                
                                x_min, x_max = min(x_coords), max(x_coords)
                                y_min, y_max = min(y_coords), max(y_coords)
                                bbox = [x_min, y_min, x_max - x_min, y_max - y_min]
                                
                                # Calculate area using shoelace formula
                                area = 0
                                for i in range(len(x_coords)):
                                    j = (i + 1) % len(x_coords)
                                    area += x_coords[i] * y_coords[j]
                                    area -= x_coords[j] * y_coords[i]
                                area = abs(area) / 2.0
                                
                                annotation_data = {
                                    "id": image_ann_id,
                                    "image_id": 0,  # Always 0 for single image JSON
                                    "category_id": class_id,
                                    "segmentation": [segmentation],
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
                                
                                x_min, x_max = min(x_coords), max(x_coords)
                                y_min, y_max = min(y_coords), max(y_coords)
                                bbox = [x_min, y_min, x_max - x_min, y_max - y_min]
                                
                                # Approximate area for brush (can be refined)
                                area = (x_max - x_min) * (y_max - y_min) * 0.5
                                
                                annotation_data = {
                                    "id": image_ann_id,
                                    "image_id": 0,  # Always 0 for single image JSON
                                    "category_id": class_id,
                                    "segmentation": [segmentation],
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
@app.post("/api/sam/predict")
async def sam_predict(file: UploadFile = File(...), request: Request = None):
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
        
        # Run SAM inference with lower confidence threshold to detect more objects
        # conf=0.1 allows detection of objects with lower confidence scores
        results = model(tmp_path, verbose=False, conf=0.1)
        
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