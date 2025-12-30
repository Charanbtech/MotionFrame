# Simplified SAM endpoint for debugging
# Replace the SAM predict endpoint in main.py with this version

from fastapi import File, UploadFile, Request, HTTPException, Form
from fastapi.responses import JSONResponse
import base64
import io
from PIL import Image
import numpy as np

# Global model cache
_sam_model = None

def get_sam_model():
    """Lazy load SAM model (downloads on first call, ~500MB)"""
    global _sam_model
    
    if _sam_model is not None:
        return _sam_model
    
    try:
        print("📦 Importing ultralytics SAM...")
        from ultralytics import SAM
        
        print("📦 Loading SAM model (first time only, ~500MB download)...")
        _sam_model = SAM("sam2.1_b.pt", verbose=False)
        print("✅ SAM model loaded!")
        return _sam_model
    except ImportError as e:
        print(f"❌ ImportError: {e}")
        raise HTTPException(status_code=500, detail="ultralytics not installed: pip install ultralytics")
    except Exception as e:
        print(f"❌ Failed to load SAM: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"SAM load failed: {str(e)}")


async def sam_predict_handler(file: UploadFile = File(...), request: Request = None):
    """
    Ultra simple SAM endpoint - just for testing connectivity.
    On first call, downloads the SAM model (~500MB).
    """
    
    # Restrict to AI annotation page
    origin_header = request.headers.get("x-requested-from", "") if request else ""
    if not origin_header or origin_header.lower() != "ai-annotation":
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        # Read image
        image_bytes = await file.read()
        img = Image.open(io.BytesIO(image_bytes))
        img_np = np.array(img)
        
        print(f"🖼️  Received image: {img.size}")
        
        # Get model (this is where download happens on first run)
        print("Getting SAM model...")
        model = get_sam_model()
        
        # Run inference
        print("Running SAM inference...")
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            Image.fromarray(img_np).save(tmp.name)
            tmp_path = tmp.name
        
        try:
            results = model(tmp_path, verbose=False, conf=0.1)
            print(f"✅ SAM returned {len(results)} results")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        
        # Extract masks
        response = {
            "success": True,
            "message": f"Got {len(results)} segmentation results",
            "masks": [],
            "polygons": [],
            "boxes": []
        }
        
        if results and len(results) > 0:
            result = results[0]
            
            if hasattr(result, 'masks') and result.masks is not None:
                import cv2
                
                for i, mask in enumerate(result.masks.data):
                    # Convert mask to uint8
                    mask_np = (mask.cpu().numpy() * 255).astype(np.uint8)
                    
                    # Encode as base64
                    _, buffer = cv2.imencode('.png', mask_np)
                    mask_b64 = base64.b64encode(buffer).decode()
                    response["masks"].append(f"data:image/png;base64,{mask_b64}")
                    
                    # Get contour
                    contours, _ = cv2.findContours(mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    if contours:
                        cnt = max(contours, key=cv2.contourArea)
                        polygon = [[int(p[0][0]), int(p[0][1])] for p in cnt]
                        response["polygons"].append(polygon)
                        
                        x, y, w, h = cv2.boundingRect(cnt)
                        response["boxes"].append([x, y, w, h])
        
        print(f"✅ Returning {len(response['masks'])} masks")
        return JSONResponse(status_code=200, content=response)
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in sam_predict: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"SAM error: {str(e)}")
