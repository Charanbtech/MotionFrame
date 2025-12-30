import React, { useRef, useState, useEffect } from "react";

const Annotation = ({ currentProject, images, currentImageIndex, onImageSelect, onSaveAnnotations }) => {
  const canvasRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [samResult, setSamResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [boxes, setBoxes] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [annotationsSaved, setAnnotationsSaved] = useState(false);

  // Helper function to normalize filepath for URLs (replace backslashes with forward slashes)
  const normalizeFilePath = (filepath) => {
    if (!filepath) return '';
    return filepath.replace(/\\/g, '/');
  };

  // Load image from project when currentImageIndex changes
  useEffect(() => {
    if (images && images.length > 0 && currentImageIndex >= 0 && currentImageIndex < images.length) {
      const img = images[currentImageIndex];
      setSelectedImage(img);
      loadImageToCanvas(img);
      setBoxes([]);
      setSamResult(null);
      setAnnotationsSaved(false); // Reset saved state when image changes
      
      // Load existing annotations from database
      loadExistingAnnotations(img);
    }
  }, [currentImageIndex, images]);

  // Load existing annotations from database and display them
  const loadExistingAnnotations = async (imageData) => {
    if (!imageData || !imageData.id) return;
    
    try {
      const response = await fetch(`http://localhost:8000/api/images/${imageData.id}/annotations`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        // Convert saved annotations to boxes format for display
        const existingBoxes = data
          .filter(ann => ann.annotation_type === 'bbox') // Only bbox annotations
          .map(ann => {
            const coords = typeof ann.coordinates === 'string' 
              ? JSON.parse(ann.coordinates) 
              : ann.coordinates;
            
            // Convert to [x, y, w, h] format for SAM display
            return [
              coords.x || 0,
              coords.y || 0,
              coords.width || 0,
              coords.height || 0
            ];
          });
        
        if (existingBoxes.length > 0) {
          setBoxes(existingBoxes);
          setAnnotationsSaved(true); // Mark as saved since they're from database
          
          // Create a mock samResult for display
          setSamResult({
            success: true,
            boxes: existingBoxes,
            message: `Loaded ${existingBoxes.length} existing annotations`
          });
          
          // Draw the boxes after a short delay to ensure canvas is ready
          setTimeout(() => {
            drawBoundingBoxes(existingBoxes);
          }, 200);
        }
      }
    } catch (error) {
      console.error('Error loading existing annotations:', error);
    }
  };

  // Load image onto canvas
  const loadImageToCanvas = (imageData) => {
    if (!imageData) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `http://localhost:8000/uploads/${normalizeFilePath(imageData.filepath)}`;
    
    img.onload = () => {
      const canvas = imageCanvasRef.current;
      const overlayCanvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // Clear overlay canvas
      if (overlayCanvas) {
        const overlayCtx = overlayCanvas.getContext("2d");
        overlayCanvas.width = img.width;
        overlayCanvas.height = img.height;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
    };

    img.onerror = () => {
      console.error('Failed to load image:', imageData.filepath);
    };
  };

  // Call backend Ultralytics SAM
  const runSAM = async () => {
    if (!selectedImage) {
      alert('Please select an image from the gallery first');
      return;
    }

    setLoading(true);
    
    try {
      // Fetch the image file
      const imageUrl = `http://localhost:8000/uploads/${normalizeFilePath(selectedImage.filepath)}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], selectedImage.filename, { type: blob.type });

      const form = new FormData();
      form.append('file', file, selectedImage.filename);

      const resp = await fetch('/api/sam/predict', {
        method: 'POST',
        headers: {
          'X-Requested-From': 'ai-annotation'
        },
        body: form
      });

      if (!resp.ok) {
        const err = await resp.json();
        alert('SAM error: ' + (err.detail || resp.statusText));
        return;
      }

      const data = await resp.json();
      setSamResult(data);
      
      console.log('📦 SAM API Response:', {
        success: data.success,
        boxesCount: data.boxes?.length || 0,
        masksCount: data.masks?.length || 0,
        message: data.message
      });
      
      if (data.success && data.boxes && data.boxes.length > 0) {
        setBoxes(data.boxes);
        setAnnotationsSaved(false); // Reset saved state when new detection runs
        console.log('✅ SAM returned', data.boxes.length, 'detected objects');
        console.log('📦 Bounding boxes:', data.boxes);
        // Draw all bounding boxes immediately - wait for next render cycle to ensure canvas is ready
        setTimeout(() => {
          drawBoundingBoxes(data.boxes);
        }, 150);
      } else {
        const msg = data.boxes?.length === 0 
          ? 'No objects detected. The model may need adjustment or the image may not contain detectable objects.'
          : 'No objects detected. Try a different image.';
        alert(msg);
        console.warn('⚠️ No boxes in response:', data);
      }
    } catch (err) {
      console.error('SAM request failed', err);
      alert('SAM request failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Draw bounding boxes on canvas overlay
  const drawBoundingBoxes = (boxesToDraw = boxes) => {
    const canvas = canvasRef.current;
    const imageCanvas = imageCanvasRef.current;
    if (!canvas || !imageCanvas || !boxesToDraw || boxesToDraw.length === 0) return;

    const ctx = canvas.getContext("2d");
    canvas.width = imageCanvas.width;
    canvas.height = imageCanvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Color palette for different objects
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', 
      '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#A52A2A',
      '#808080', '#000080', '#008000', '#800000', '#008080'
    ];

    // Draw all bounding boxes
    boxesToDraw.forEach((box, index) => {
      const [x, y, w, h] = box;
      const color = colors[index % colors.length];
      
      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      
      // Draw label background
      ctx.fillStyle = color;
      ctx.font = 'bold 14px Arial';
      const label = `Object ${index + 1}`;
      const textMetrics = ctx.measureText(label);
      const textWidth = textMetrics.width;
      const textHeight = 18;
      
      // Draw label background rectangle
      ctx.fillRect(x, y - textHeight - 4, textWidth + 8, textHeight);
      
      // Draw label text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, x + 4, y - 6);
    });
  };

  // Redraw bounding boxes when boxes change or image loads
  useEffect(() => {
    if (boxes.length > 0 && imageCanvasRef.current && canvasRef.current) {
      // Small delay to ensure canvas dimensions are set
      const timer = setTimeout(() => {
        drawBoundingBoxes(boxes);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [boxes, selectedImage]);

  // Save annotations to project
  const handleSaveAnnotations = async () => {
    if (!samResult || !samResult.boxes || samResult.boxes.length === 0) {
      alert('No detections to save');
      return;
    }

    if (annotationsSaved) {
      alert('Annotations have already been saved for this detection. Run a new detection to save again.');
      return;
    }

    if (!onSaveAnnotations) {
      alert('Save function not available');
      return;
    }

    // Convert boxes to annotation format
    const annotations = samResult.boxes.map((box, index) => ({
      class: `object_${index + 1}`,
      coordinates: {
        x: box[0],
        y: box[1],
        width: box[2],
        height: box[3]
      }
    }));

    try {
      await onSaveAnnotations(annotations);
      setAnnotationsSaved(true); // Mark as saved after successful save
    } catch (error) {
      console.error('Error saving annotations:', error);
      // Don't set annotationsSaved to true if save failed
    }
  };

  // Navigation functions
  const nextImage = () => {
    if (currentImageIndex < images.length - 1 && onImageSelect) {
      onImageSelect(currentImageIndex + 1);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0 && onImageSelect) {
      onImageSelect(currentImageIndex - 1);
    }
  };

  return (
    <div style={styles.container}>
      {!currentProject ? (
        <div style={styles.emptyState}>
          <p>Please select or create a project to use AI Annotation</p>
        </div>
      ) : images.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No images in this project. Please upload images first.</p>
        </div>
      ) : (
        <>
          {/* Canvas Toolbar */}
          <div className="canvas-toolbar" style={styles.canvasToolbar}>
            <div className="toolbar-left" style={styles.toolbarLeft}>
              <button 
                className="btn btn-secondary" 
                onClick={prevImage}
                disabled={currentImageIndex === 0}
                style={{
                  ...styles.toolbarBtn,
                  opacity: currentImageIndex === 0 ? 0.5 : 1,
                  cursor: currentImageIndex === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                ← Prev
              </button>
              <span style={styles.imageCounter}>
                {currentImageIndex + 1} / {images.length}
              </span>
              <button 
                className="btn btn-secondary" 
                onClick={nextImage}
                disabled={currentImageIndex >= images.length - 1}
                style={{
                  ...styles.toolbarBtn,
                  opacity: currentImageIndex >= images.length - 1 ? 0.5 : 1,
                  cursor: currentImageIndex >= images.length - 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Next →
              </button>
            </div>
            {/* <div className="toolbar-right" style={styles.toolbarRight}>
              {selectedImage && (
                <span style={styles.imageInfo}>
                  {selectedImage.filename}
                </span>
              )}
            </div> */}
          </div>

          {/* Image Gallery */}
          <div style={styles.section}>
            <div style={styles.galleryHeader}>
              <h4 style={styles.sectionTitle}>Images ({images.length})</h4>
              <div style={styles.section}>
              <div style={styles.controlsRow}>
                {selectedImage && (
                  <div style={styles.imageInfo}>
                    <strong>Current Image:</strong> {selectedImage.filename}
                  </div>
                )}
                <button 
                  onClick={runSAM}
                  disabled={!selectedImage || loading}
                  style={{
                    ...styles.runBtn,
                    background: loading ? '#ccc' : '#007bff',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? '⏳ Processing...' : '▶️ Run Auto Detection'}
                </button>
              </div>
            </div>
            </div>
            <div style={styles.imageGallery}>
              {images.map((img, index) => (
                <div 
                  key={img.id || index} 
                  style={{
                    ...styles.imageThumb,
                    ...(index === currentImageIndex ? styles.imageThumbActive : {})
                  }}
                  onClick={() => onImageSelect && onImageSelect(index)}
                >
                  <img 
                    src={`http://localhost:8000/uploads/${normalizeFilePath(img.filepath)}`} 
                    alt={img.filename}
                    style={styles.thumbImg}
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%232a2a3e" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23888">No Image</text></svg>';
                    }}
                  />
                  <div style={styles.imageThumbOverlay}>{index + 1}</div>
                </div>
              ))}
            </div>
          </div>

          {/* SAM Controls */}
          {/* <div style={styles.section}>
            <div style={styles.controlsRow}>
              {selectedImage && (
                <div style={styles.imageInfo}>
                  <strong>Current Image:</strong> {selectedImage.filename}
                </div>
              )}
              <button 
                onClick={runSAM}
                disabled={!selectedImage || loading}
                style={{
                  ...styles.runBtn,
                  background: loading ? '#ccc' : '#007bff',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? '⏳ Processing...' : '▶️ Run SAM Detection'}
              </button>
            </div>
          </div> */}

          {/* Canvases: original + bounding box overlay */}
          {selectedImage && (
            <div style={styles.section}>
              <div style={styles.canvasWrapper}>
                <canvas
                  ref={imageCanvasRef}
                  style={{...styles.canvas, border: '2px solid #333'}}
                ></canvas>
                <canvas
                  ref={canvasRef}
                  style={{...styles.canvas, position: 'absolute', top: 0, left: 0, pointerEvents: 'none'}}
                ></canvas>
              </div>
            </div>
          )}

          {/* Detection info */}
          {boxes.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>
                ✅ Detection Complete: {boxes.length} object{boxes.length !== 1 ? 's' : ''} detected
              </h4>
              <p style={styles.infoText}>
                All detected objects are displayed with colored bounding boxes on the image above.
                {annotationsSaved && (
                  <span style={{color: '#28a745', fontWeight: 'bold', display: 'block', marginTop: '8px'}}>
                    ✓ Annotations have been saved and are now visible in the Annotations panel below.
                  </span>
                )}
              </p>
              {!annotationsSaved ? (
                <button
                  onClick={handleSaveAnnotations}
                  style={styles.saveBtn}
                >
                  💾 Save All Detections as Annotations
                </button>
              ) : (
                <div style={{...styles.saveBtn, background: '#6c757d', cursor: 'not-allowed', opacity: 0.7}}>
                  ✓ Annotations Saved
                </div>
              )}
            </div>
          )}

          {/* Result info (collapsible) */}
          {samResult && (
            <div style={styles.section}>
              <details>
                <summary style={styles.summary}>SAM Response Details</summary>
                <pre style={styles.pre}>
                  {JSON.stringify(samResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Styling
const styles = {
  container: {
    padding: "20px",
    height: "100%",
    overflowY: "auto",
    fontFamily: "Arial, sans-serif",
    background: "#1a1a2e",
    color: "#e0e0e0"
  },
  header: {
    marginBottom: "20px",
    paddingBottom: "15px",
    borderBottom: "2px solid #333"
  },
  title: {
    margin: "0 0 10px 0",
    color: "#fff",
    fontSize: "24px"
  },
  projectInfo: {
    fontSize: "14px",
    color: "#888"
  },
  projectName: {
    color: "#4ECDC4",
    fontWeight: "bold"
  },
  section: {
    padding: "15px",
    borderRadius: "8px",
    background: "#16213e"
  },
  sectionTitle: {
    margin: "0 0 15px 0",
    color: "#fff",
    fontSize: "18px"
  },
  galleryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px"
  },
  uploadBtn: {
    padding: "8px 16px",
    fontSize: "14px"
  },
  imageGallery: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: "10px",
    maxHeight: "300px",
    overflowY: "auto"
  },
  imageThumb: {
    position: "relative",
    width: "100px",
    height: "100px",
    cursor: "pointer",
    border: "2px solid #333",
    borderRadius: "4px",
    overflow: "hidden",
    transition: "all 0.2s"
  },
  imageThumbActive: {
    border: "2px solid #007bff",
    boxShadow: "0 0 10px rgba(0, 123, 255, 0.5)"
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  imageThumbOverlay: {
    position: "absolute",
    bottom: "4px",
    left: "4px",
    background: "rgba(0, 0, 0, 0.7)",
    color: "#fff",
    padding: "2px 6px",
    borderRadius: "3px",
    fontSize: "12px"
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px"
  },
  imageInfo: {
    flex: 1,
    color: "#ccc",
    fontSize: "14px"
  },
  runBtn: {
    padding: "10px 20px",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "bold"
  },
  canvasWrapper: {
    position: "relative",
    display: "inline-block",
    width: "100%",
    textAlign: "center"
  },
  canvas: {
    border: "1px solid #ccc",
    maxWidth: "100%",
    height: "auto",
    display: "block"
  },
  infoText: {
    color: "#aaa",
    fontSize: "14px",
    marginTop: "8px",
    marginBottom: "15px"
  },
  saveBtn: {
    padding: "12px 24px",
    background: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "bold"
  },
  summary: {
    cursor: "pointer",
    color: "#4ECDC4",
    fontSize: "14px",
    marginBottom: "10px"
  },
  pre: {
    maxHeight: "200px",
    overflow: "auto",
    background: "#0f1624",
    padding: "12px",
    borderRadius: "4px",
    fontSize: "12px",
    color: "#ccc",
    border: "1px solid #333"
  },
  emptyState: {
    padding: "40px",
    textAlign: "center",
    color: "#888",
    fontSize: "16px"
  },
  canvasToolbar: {
    background: "#1a1a2e",
    padding: "15px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #2a2a3e"
  },
  toolbarLeft: {
    display: "flex",
    gap: "10px",
    alignItems: "center"
  },
  toolbarRight: {
    display: "flex",
    gap: "10px",
    alignItems: "center"
  },
  toolbarBtn: {
    padding: "8px 16px",
    background: "#2a2a3e",
    color: "#e0e0e0",
    border: "1px solid #ffffff4d",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "all 0.2s"
  },
  imageCounter: {
    color: "#e0e0e0",
    fontSize: "14px",
    fontWeight: "600",
    padding: "0 10px"
  },
  imageInfo: {
    color: "#aaa",
    fontSize: "14px"
  }
};

export default Annotation;
