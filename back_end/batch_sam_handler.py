# Batch SAM handler for the /api/sam/batch endpoint
# Processes multiple images/PDFs/folders and returns masks + polygons

import os
import json
import base64
import tempfile
import zipfile
from pathlib import Path
from datetime import datetime
from fastapi import HTTPException, UploadFile
from PIL import Image
import io

# Lazy imports (to avoid cv2/numpy import at module level)
cv2 = None
np = None
sam_model_ref = None

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

async def process_batch_images(files: list, model_getter) -> dict:
    """
    Process a batch of uploaded images/PDFs and run SAM inference.
    
    Args:
        files: List of UploadFile objects (images, PDFs, or mixed)
        model_getter: Function that returns the SAM model
    
    Returns:
        dict with results: { success, total_files, processed_count, results: [...], message }
    """
    
    model = model_getter()
    if not model:
        raise HTTPException(status_code=500, detail="SAM model not available")
    
    cv2_module = ensure_cv2()
    np_module = ensure_numpy()
    
    results = {
        "success": True,
        "total_files": len(files),
        "processed_count": 0,
        "results": [],
        "message": "Batch processing complete"
    }
    
    temp_files = []
    
    try:
        for file_idx, file in enumerate(files):
            file_result = {
                "filename": file.filename,
                "status": "pending",
                "masks": [],
                "polygons": [],
                "boxes": [],
                "error": None
            }
            
            try:
                file_bytes = await file.read()
                file_ext = Path(file.filename).suffix.lower()
                
                # List to hold images to process (for PDFs, could be multiple pages)
                images_to_process = []
                
                if file_ext == '.pdf':
                    # Convert PDF to images
                    try:
                        import fitz  # PyMuPDF
                        pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                        
                        for page_num in range(len(pdf_doc)):
                            page = pdf_doc[page_num]
                            mat = fitz.Matrix(2.0, 2.0)
                            pix = page.get_pixmap(matrix=mat)
                            img_data = pix.tobytes("png")
                            img = Image.open(io.BytesIO(img_data))
                            page_name = f"{Path(file.filename).stem}_page_{page_num + 1}"
                            images_to_process.append((page_name, np_module.array(img)))
                        
                        pdf_doc.close()
                    except Exception as e:
                        file_result["error"] = f"PDF parsing failed: {str(e)}"
                        file_result["status"] = "failed"
                        results["results"].append(file_result)
                        continue
                
                elif file_ext in ['.png', '.jpg', '.jpeg', '.bmp', '.webp']:
                    # Single image
                    img = Image.open(io.BytesIO(file_bytes))
                    img_name = Path(file.filename).stem
                    images_to_process.append((img_name, np_module.array(img)))
                
                else:
                    file_result["error"] = f"Unsupported file type: {file_ext}"
                    file_result["status"] = "failed"
                    results["results"].append(file_result)
                    continue
                
                # Process each image
                for img_name, img_np in images_to_process:
                    try:
                        # Save to temp file for SAM inference
                        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                            Image.fromarray(img_np).save(tmp.name)
                            tmp_path = tmp.name
                            temp_files.append(tmp_path)
                        
                        # Run SAM inference
                        print(f"  Running SAM on {img_name}...")
                        sam_results = model(tmp_path, verbose=False, conf=0.1)
                        
                        if sam_results and len(sam_results) > 0:
                            result = sam_results[0]
                            
                            if hasattr(result, 'masks') and result.masks is not None:
                                for mask_idx, mask in enumerate(result.masks.data):
                                    # Convert mask to uint8
                                    mask_np = (mask.cpu().numpy() * 255).astype(np_module.uint8)
                                    
                                    # Encode as base64 PNG
                                    _, buffer = cv2_module.imencode('.png', mask_np)
                                    mask_b64 = base64.b64encode(buffer).decode()
                                    file_result["masks"].append(f"data:image/png;base64,{mask_b64}")
                                    
                                    # Extract contour as polygon
                                    contours, _ = cv2_module.findContours(mask_np, cv2_module.RETR_EXTERNAL, cv2_module.CHAIN_APPROX_SIMPLE)
                                    if contours:
                                        cnt = max(contours, key=cv2_module.contourArea)
                                        polygon = [[int(p[0][0]), int(p[0][1])] for p in cnt]
                                        file_result["polygons"].append(polygon)
                                        
                                        x, y, w, h = cv2_module.boundingRect(cnt)
                                        file_result["boxes"].append([x, y, w, h])
                        
                        file_result["status"] = "success"
                        results["processed_count"] += 1
                        
                    except Exception as e:
                        print(f"  Error processing image {img_name}: {e}")
                        file_result["error"] = f"Inference failed: {str(e)}"
                        file_result["status"] = "failed"
                
            except Exception as e:
                print(f"Error with file {file.filename}: {e}")
                file_result["error"] = str(e)
                file_result["status"] = "failed"
            
            results["results"].append(file_result)
    
    finally:
        # Clean up temp files
        for tmp_path in temp_files:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception as e:
                print(f"Warning: Could not remove temp file {tmp_path}: {e}")
    
    return results


def create_export_zip(batch_results: dict) -> bytes:
    """
    Create a zip file containing:
    - Annotated images (with masks drawn)
    - Annotation JSON for each image
    - README
    """
    
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        annotations_data = {
            "metadata": {
                "timestamp": datetime.utcnow().isoformat(),
                "total_files": batch_results["total_files"],
                "processed_count": batch_results["processed_count"]
            },
            "results": []
        }
        
        for result in batch_results["results"]:
            if result["status"] == "success" and result["masks"]:
                # Save mask visualization
                for mask_idx, mask_b64 in enumerate(result["masks"]):
                    # Extract base64 data
                    img_data = base64.b64decode(mask_b64.split(',')[1])
                    mask_name = f"{result['filename']}_mask_{mask_idx}.png"
                    zip_file.writestr(f"masks/{mask_name}", img_data)
                
                # Add to annotations JSON
                result_entry = {
                    "filename": result["filename"],
                    "masks_count": len(result["masks"]),
                    "polygons": result["polygons"],
                    "boxes": result["boxes"]
                }
                annotations_data["results"].append(result_entry)
        
        # Save annotations.json
        zip_file.writestr("annotations.json", json.dumps(annotations_data, indent=2))
        
        # Save README
        readme = """# Batch AI Annotation Results

Generated by Roboflow Clone Pro - AI Annotation

## Contents
- `masks/`: Segmentation masks for each detected object
- `annotations.json`: Metadata including polygons and bounding boxes

## Format
Each result in annotations.json contains:
- `filename`: Input image filename
- `masks_count`: Number of detected objects
- `polygons`: Array of polygon coordinates for each mask
- `boxes`: Array of bounding boxes [x, y, w, h] for each mask

## Using the Results
- Import polygons as annotations in the main annotation tool
- Use masks for further processing or validation
- Export data in YOLO/COCO format for training
"""
        zip_file.writestr("README.md", readme)
    
    zip_buffer.seek(0)
    return zip_buffer.getvalue()
