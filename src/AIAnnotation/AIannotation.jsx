import React, { useRef, useState, useEffect, useCallback } from "react";

const Annotation = ({ currentProject, images, currentImageIndex, onImageSelect, onSaveAnnotations }) => {
  const canvasRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  // Store the loaded natural image so we can recompute scale on resize
  const naturalImgRef = useRef(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [className, setClassName] = useState('');
  const [description, setDescription] = useState('');
  const [popupClass, setPopupClass] = useState('');
  const [samResult, setSamResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [previewDetections, setPreviewDetections] = useState([]);
  const annotationsRef = useRef([]);
  const previewDetectionsRef = useRef([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPreviewId, setSelectedPreviewId] = useState(null);
  const [hoveredPreviewId, setHoveredPreviewId] = useState(null);
  const selectedPreviewIdRef = useRef(null);
  const hoveredPreviewIdRef = useRef(null);
  const [validationError, setValidationError] = useState('');
  const [annotationMode, setAnnotationMode] = useState('Auto Segment');
  const [smartDetectResults, setSmartDetectResults] = useState([]); // filtered [{bbox, score, label}]
  const [allSmartDetectResults, setAllSmartDetectResults] = useState([]); // full unfiltered results
  const [confidenceThreshold, setConfidenceThreshold] = useState(50); // 0–100
  const [noMatchMessage, setNoMatchMessage] = useState('');

  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState(null);
  const selectedAnnotationIdRef = useRef(null);
  const hoveredAnnotationIdRef = useRef(null);
  
  const [isReviewPhase, setIsReviewPhase] = useState(false);
  const isReviewPhaseRef = useRef(false);
  const smartDetectResultsRef = useRef([]);


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
      setAnnotations([]);
      setPreviewDetections([]);
      setSamResult(null);
      setSelectedPreviewId(null);
      setHoveredPreviewId(null);
      loadExistingAnnotations(img);
      setIsReviewPhase(false);
    }
  }, [currentImageIndex, images]);

  // Load existing annotations from database and display them
  const loadExistingAnnotations = async (imageData) => {
    if (!imageData || !imageData.id) return;
    
    try {
      const response = await fetch(`/api/images/${imageData.id}/annotations`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        // Convert saved annotations to boxes format for display
        const existingBoxes = data
          .filter(ann => ann.annotation_type === 'bbox') // Only bbox annotations
          .map((ann, idx) => {
            const coords = typeof ann.coordinates === 'string' 
              ? JSON.parse(ann.coordinates) 
              : ann.coordinates;
            
            // Convert to Object format for SAM display
            return {
              id: ann.id ? `db-${ann.id}` : `ann-${Date.now()}-${idx}`,
              bbox: [
                coords.x || 0,
                coords.y || 0,
                coords.width || 0,
                coords.height || 0
              ],
              label: ann.class_name || 'Object',
              classId: ann.class_id || (ann.class_name ? ann.class_name.toLowerCase().replace(/\s+/g, '-') : 'object')
            };
          });
        
        if (existingBoxes.length > 0) {
          setAnnotations(existingBoxes);

          
          // Create a mock samResult for display
          setSamResult({
            success: true,
            boxes: existingBoxes.map(b => b.bbox),
            message: `Loaded ${existingBoxes.length} existing annotations`
          });
          
          // Draw the boxes after a short delay to ensure canvas is ready
          setTimeout(() => {
            drawBoundingBoxes();
          }, 200);
        }
      }
    } catch (error) {
      console.error('Error loading existing annotations:', error);
    }
  };

  // Load image onto canvas – canvas internal resolution matches the natural image
  // but CSS (maxWidth:100%) will scale it for display.  Bounding boxes must be
  // drawn in *display* pixels, so we keep the natural image in naturalImgRef and
  // compute scale in drawBoundingBoxes.
  const loadImageToCanvas = (imageData) => {
    if (!imageData) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `/uploads/${normalizeFilePath(imageData.filepath)}`;
    
    img.onload = () => {
      const canvas = imageCanvasRef.current;
      const overlayCanvas = canvasRef.current;
      if (!canvas) return;

      // Store natural image reference for scale computation
      naturalImgRef.current = img;

      const ctx = canvas.getContext("2d");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      
      // Clear overlay canvas – same internal resolution as image canvas
      if (overlayCanvas) {
        overlayCanvas.width = img.naturalWidth;
        overlayCanvas.height = img.naturalHeight;
        overlayCanvas.getContext("2d").clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
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

    // Smart Detect requires class name + description
    if (annotationMode === 'Smart Detect') {
      if (!className.trim() || !description.trim()) {
        setValidationError('Please enter class name and description');
        return;
      }
    }
    
    setValidationError('');
    setLoading(true);
    
    try {
      // Fetch the image file
      const imageUrl = `/uploads/${normalizeFilePath(selectedImage.filepath)}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], selectedImage.filename, { type: blob.type });

      const form = new FormData();
      form.append('file', file, selectedImage.filename);

      let endpoint = '/api/sam/predict';
      
      if (annotationMode === 'Smart Detect') {
        // Smart Detect: send class + description for semantic filtering
        form.append('className', className);
        form.append('description', description);
        endpoint = '/api/sam/smart';
      }
      // Auto Segment: no extra fields, runs full segmentation

      const resp = await fetch(endpoint, {
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
        prompt: data.prompt || '',
        detectionsCount: data.detections?.length || 0,
        message: data.message
      });

      // Smart Detect: handle detections array with scores
      if (annotationMode === 'Smart Detect') {
        if (data.success && data.detections && data.detections.length > 0) {
          // Store ALL detections — filtering happens via threshold
          setAllSmartDetectResults(data.detections);
          // Apply current threshold immediately
          const thresh = confidenceThreshold / 100;
          const filtered = data.detections.filter(d => d.score >= thresh);
          setSmartDetectResults(filtered);
          setPreviewDetections(filtered.map(d => d.bbox));
          setSelectedPreviewId(null);
          setHoveredPreviewId(null);
          setIsReviewPhase(false);
          setNoMatchMessage(filtered.length === 0 ? `No detections above ${confidenceThreshold}% confidence — try lowering the threshold` : '');
          console.log('✅ Smart Detect returned', data.detections.length, 'total,', filtered.length, 'above threshold');
          setTimeout(() => { drawBoundingBoxes(); }, 150);
        } else {
          // No match — show inline message, do NOT alert
          setAllSmartDetectResults([]);
          setSmartDetectResults([]);
          setPreviewDetections([]);
          setNoMatchMessage(data.message || 'No matching objects found');
          console.warn('⚠️ Smart Detect: no matching objects', data);
        }
        return;
      }

      // Auto Segment: standard flow
      if (data.success && data.boxes && data.boxes.length > 0) {
        setSmartDetectResults([]);
        setNoMatchMessage('');
        setPreviewDetections(data.boxes);
        setSelectedPreviewId(null);
        setHoveredPreviewId(null);
        setIsReviewPhase(false);

        console.log('✅ SAM returned', data.boxes.length, 'detected objects');
        console.log('📦 Bounding boxes:', data.boxes);
        // Draw all bounding boxes immediately - wait for next render cycle to ensure canvas is ready
        setTimeout(() => {
          drawBoundingBoxes();
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

  // Draw bounding boxes on the overlay canvas.
  //
  // The boxes from the SAM API are in native image pixel coordinates.
  // The <canvas> element also has its internal resolution set to the natural
  // image dimensions, so we can draw box coordinates directly without scaling –
  // the browser CSS (maxWidth: 100%) handles the visual scaling uniformly for
  // BOTH canvases stacked on top of each other, keeping them in sync at any
  // zoom level or container size.
  const drawBoundingBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    const imageCanvas = imageCanvasRef.current;
    if (!canvas || !imageCanvas) return;

    // Sync overlay canvas internal resolution to image canvas
    if (canvas.width !== imageCanvas.width || canvas.height !== imageCanvas.height) {
      canvas.width = imageCanvas.width;
      canvas.height = imageCanvas.height;
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Color palette for different objects
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', 
      '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#A52A2A',
      '#808080', '#000080', '#008000', '#800000', '#008080'
    ];

    const drawBoxes = (boxList, isPreview) => {
      if (!boxList || boxList.length === 0) return;
      boxList.forEach((item, index) => {
        const box = Array.isArray(item) ? item : item.bbox;
        const [x, y, w, h] = box;
        const color = colors[index % colors.length];
        
        const isSelected = isPreview && index === selectedPreviewIdRef.current;
        const isSelectedAnn = !isPreview && !Array.isArray(item) && item.id === selectedAnnotationIdRef.current;
        const isHovered = isPreview && index === hoveredPreviewIdRef.current;
        const isHoveredAnn = !isPreview && !Array.isArray(item) && item.id === hoveredAnnotationIdRef.current;
        
        ctx.strokeStyle = color;
        
        if (isPreview && !isReviewPhaseRef.current) {
          ctx.setLineDash([]); 
          ctx.lineWidth = Math.max(1, canvas.width / 500); 
          ctx.globalAlpha = 0.4; // Light bounding boxes
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        } else if (isSelected || isSelectedAnn) {
          ctx.setLineDash([]); // Solid border for selected
          ctx.lineWidth = Math.max(3, canvas.width / 250); 
          ctx.strokeStyle = '#FFFFFF'; // Strong white border
          ctx.shadowColor = '#FFFFFF';
          ctx.shadowBlur = 10;
        } else if (isHovered || isHoveredAnn) {
          ctx.setLineDash([]); 
          ctx.lineWidth = Math.max(2, canvas.width / 350); 
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        } else if (isPreview) {
          ctx.setLineDash([5, 5]); // Dashed border for unselected preview
          ctx.lineWidth = Math.max(2, canvas.width / 400); 
          ctx.globalAlpha = 0.8; // stronger bounding boxes for review mode
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        } else {
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1.0;   // Full opacity
        }
        
        ctx.strokeRect(x, y, w, h);
        
        // Reset shadow for text drawing
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = color;
        const fontSize = Math.max(10, canvas.width / 75);
        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        
        let label = '';
        if (isPreview && !isReviewPhaseRef.current) {
          // Smart Detect preview: show label + confidence %
          const sdResult = smartDetectResultsRef.current[index];
          if (sdResult) {
            label = `${sdResult.label} ${Math.round(sdResult.score * 100)}%`;
          } else {
            label = 'Detection Preview';
          }
        } else {
          const itemLabel = Array.isArray(item) ? `Detection ${index + 1}` : (item.label || `Detection ${index + 1}`);
          label = itemLabel;
        }
        const textWidth = ctx.measureText(label).width;
        const textHeight = fontSize + 4;
        
        ctx.fillRect(x, y - textHeight - 4, textWidth + 8, textHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, x + 4, y - 6);
      });
    };

    drawBoxes(annotationsRef.current, false);
    drawBoxes(previewDetectionsRef.current, true);
    

    
    // Reset back to default
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }, []);

  // Keep refs in sync so the ResizeObserver callback can access latest boxes
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    previewDetectionsRef.current = previewDetections;
  }, [previewDetections]);

  useEffect(() => {
    selectedPreviewIdRef.current = selectedPreviewId;
  }, [selectedPreviewId]);

  useEffect(() => {
    hoveredPreviewIdRef.current = hoveredPreviewId;
  }, [hoveredPreviewId]);

  useEffect(() => {
    selectedAnnotationIdRef.current = selectedAnnotationId;
  }, [selectedAnnotationId]);

  useEffect(() => {
    hoveredAnnotationIdRef.current = hoveredAnnotationId;
  }, [hoveredAnnotationId]);



  useEffect(() => {
    if (selectedPreviewId !== null && className) {
      setPopupClass(className);
    }
  }, [selectedPreviewId, className]);

  useEffect(() => {
    isReviewPhaseRef.current = isReviewPhase;
  }, [isReviewPhase]);

  useEffect(() => {
    smartDetectResultsRef.current = smartDetectResults;
  }, [smartDetectResults]);

  // Re-filter smart detect results when threshold changes (no model re-run)
  useEffect(() => {
    if (annotationMode !== 'Smart Detect' || allSmartDetectResults.length === 0) return;
    const thresh = confidenceThreshold / 100;
    const filtered = allSmartDetectResults.filter(d => d.score >= thresh);
    setSmartDetectResults(filtered);
    setPreviewDetections(filtered.map(d => d.bbox));
    setSelectedPreviewId(null);
    setHoveredPreviewId(null);
    if (filtered.length === 0) {
      setNoMatchMessage(`No detections above ${confidenceThreshold}% — try lowering threshold`);
    } else {
      setNoMatchMessage('');
    }
  }, [confidenceThreshold, allSmartDetectResults, annotationMode]);

  // Redraw bounding boxes when boxes change or image loads
  useEffect(() => {
    if ((annotations.length > 0 || previewDetections.length > 0) && imageCanvasRef.current && canvasRef.current) {
      const timer = setTimeout(() => {
        drawBoundingBoxes();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [annotations, previewDetections, selectedImage, drawBoundingBoxes, selectedPreviewId, hoveredPreviewId, selectedAnnotationId, hoveredAnnotationId, isReviewPhase]);

  // Re-draw overlay whenever the wrapper is resized (browser zoom, window resize)
  // Both <canvas> elements share the same CSS width so they scale identically.
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver(() => {
      if (annotationsRef.current.length > 0 || previewDetectionsRef.current.length > 0) {
        // Canvas internal size is unchanged; CSS scaling handles display.
        // We just need to ensure the overlay canvas matches the image canvas.
        drawBoundingBoxes();
      }
    });

    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [drawBoundingBoxes]);



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

  // Canvas Interaction Handlers
  const handleCanvasMouseMove = (e) => {
    const canvas = imageCanvasRef.current;
    if (!canvas || previewDetections.length === 0 || !isReviewPhaseRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let hoveredIndex = null;
    // Iterate backwards so top-most box is evaluated first
    for (let i = previewDetections.length - 1; i >= 0; i--) {
       const [bx, by, bw, bh] = previewDetections[i];
       if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
           hoveredIndex = i;
           break;
       }
    }
    
    if (hoveredPreviewId !== hoveredIndex) {
        setHoveredPreviewId(hoveredIndex);
    }
  };



  const handleCanvasClick = (e) => {
    if (!isReviewPhaseRef.current) return;
    const canvas = imageCanvasRef.current;
    if (!canvas) return;

    if (hoveredPreviewId !== null) {
        setSelectedPreviewId(prevId => prevId === hoveredPreviewId ? null : hoveredPreviewId);
    } else {
        setSelectedPreviewId(null);
    }
  };



  const handleCanvasMouseLeave = () => {
    if (hoveredPreviewId !== null) {
      setHoveredPreviewId(null);
    }
  };

  const handleAcceptPreview = (index, overridenClass = null) => {
    if (index === null || index === undefined) return;
    const finalClass = overridenClass || className;

    if (!finalClass) {
      alert("Select a class before accepting");
      return;
    }

    const box = previewDetections[index];
    
    setAnnotations(prev => [...prev, {
      id: `ann-${Date.now()}-${index}`,
      bbox: box,
      label: finalClass,
      classId: finalClass.toLowerCase().replace(/\s+/g, '-')
    }]);
    setPreviewDetections(prev => prev.filter((_, i) => i !== index));
    setSelectedPreviewId(null);
    setHoveredPreviewId(null);
  };

  const handleRejectPreview = (index) => {
    if (index === null || index === undefined) return;
    
    setPreviewDetections(prev => prev.filter((_, i) => i !== index));
    setSelectedPreviewId(null);
    setHoveredPreviewId(null);
  };

  const renderFloatingMenu = () => {
    if (selectedPreviewId === null || !previewDetections[selectedPreviewId] || !imageCanvasRef.current) return null;
    const [x, y, w, h] = previewDetections[selectedPreviewId];
    const centerX = x + w / 2;
    const bottomY = y + h;
    
    return (
      <div style={{
        position: 'absolute',
        left: `${(centerX / imageCanvasRef.current.width) * 100}%`,
        top: `${(bottomY / imageCanvasRef.current.height) * 100}%`,
        transform: 'translate(-50%, 12px)',
        display: 'flex',
        gap: '8px',
        background: 'rgba(20, 20, 20, 0.95)',
        padding: '6px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 10,
        alignItems: 'center'
      }}>
        <input
          type="text"
          value={popupClass}
          onChange={(e) => setPopupClass(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Class name"
          style={{
            background: '#000000',
            color: '#ffffff',
            border: '1px solid #444',
            padding: '6px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            outline: 'none',
            transition: 'all 0.2s',
          }}
          onFocus={(e) => {
             e.target.style.borderColor = '#ffffff';
          }}
          onBlur={(e) => {
             e.target.style.borderColor = '#444';
          }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); handleAcceptPreview(selectedPreviewId, popupClass); }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          style={{
            background: '#ffffff',
            color: '#000000',
            border: 'none',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <span style={{color: '#4CAF50'}}>✓</span> Accept
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleRejectPreview(selectedPreviewId); }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)'; e.currentTarget.style.border = '1px solid rgba(255, 68, 68, 0.5)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.border = '1px solid rgba(255, 68, 68, 0.3)'; }}
          style={{
            background: 'transparent',
            color: '#ff4444',
            border: '1px solid rgba(255, 68, 68, 0.3)',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          ✕ Reject
        </button>
      </div>
    );
  };

  const renderWorkflowIndicator = () => {
    let activeStep = 1;

    if (isReviewPhase) {
      activeStep = 3;
    } else if (previewDetections.length > 0 || loading) {
      activeStep = 2;
    } else if (annotations.length > 0) {
      activeStep = 4;
    } else {
      activeStep = 1;
    }

    const steps = [
      { id: 1, label: 'Configure Detection' },
      { id: 2, label: 'Run Detection' },
      { id: 3, label: 'Review Objects' },
      { id: 4, label: 'Export' }
    ];

    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '24px',
        padding: '16px 0 32px 0',
        width: '100%'
      }}>
        {steps.map((step, idx) => {
          const isActive = step.id === activeStep;
          const isPast = step.id < activeStep;
          
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: isActive ? '#ffffff' : (isPast ? '#4CAF50' : '#111111'),
                color: isActive ? '#000000' : (isPast ? '#ffffff' : '#666666'),
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontSize: '13px',
                fontWeight: 'bold',
                boxShadow: isActive ? '0 0 16px rgba(255,255,255,0.6)' : 'none',
                border: isActive ? 'none' : '1px solid #333333',
                transition: 'all 0.3s ease'
              }}>
                {isPast ? '✓' : step.id}
              </div>
              <span style={{
                color: isActive ? '#ffffff' : (isPast ? '#ffffff' : '#666666'),
                fontSize: '14px',
                fontWeight: isActive ? '700' : '500',
                transition: 'all 0.3s ease',
                textShadow: isActive ? '0 0 10px rgba(255,255,255,0.5)' : 'none',
                letterSpacing: '0.3px'
              }}>
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <div style={{
                  width: '40px',
                  height: '2px',
                  background: isPast ? '#4CAF50' : '#222222',
                  transition: 'background 0.3s ease'
                }} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const getFocusStyle = () => {
    if (!selectedAnnotationId || !imageCanvasRef.current || annotations.length === 0) {
      return {
        transform: 'translate(0px, 0px) scale(1)',
        transformOrigin: '50% 50%',
        transition: 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)'
      };
    }
    
    const ann = annotations.find(a => a.id === selectedAnnotationId);
    if (!ann) return { transform: 'translate(0px, 0px) scale(1)', transformOrigin: '50% 50%', transition: 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)' };

    const [x, y, w, h] = ann.bbox;
    const canvas = imageCanvasRef.current;
    
    const centerXRelative = (x + w / 2) / canvas.width;
    const centerYRelative = (y + h / 2) / canvas.height;
    
    // Smooth zoom based on object size, usually defaulting to ~1.6
    const objRatioX = w / canvas.width;
    const objRatioY = h / canvas.height;
    const maxRatio = Math.max(objRatioX, objRatioY);
    const scale = Math.min(Math.max(1 / (maxRatio * 2), 1.2), 2.5); // cap zoom between 1.2x and 2.5x dynamically
    
    const translateX = scale * (0.5 - centerXRelative) * 100;
    const translateY = scale * (0.5 - centerYRelative) * 100;
    
    return {
      transform: `translate(${translateX}%, ${translateY}%) scale(${scale})`,
      transformOrigin: '50% 50%',
      transition: 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)'
    };
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minWidth: '320px' }}>
                  {/* Section 1: Mode Selection (top) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Configure Detection
                    </div>
                    <div style={{ display: 'flex', background: '#1a1a1a', borderRadius: '8px', padding: '4px', gap: '4px' }}>
                      <button
                        onClick={() => setAnnotationMode('Auto Segment')}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          border: 'none',
                          borderRadius: '6px',
                          background: annotationMode === 'Auto Segment' ? '#ffffff' : 'transparent',
                          color: annotationMode === 'Auto Segment' ? '#000000' : '#888888',
                          fontSize: '13px',
                          fontWeight: annotationMode === 'Auto Segment' ? '600' : '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        Auto Segment
                      </button>
                      <button
                        onClick={() => setAnnotationMode('Smart Detect')}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          border: 'none',
                          borderRadius: '6px',
                          background: annotationMode === 'Smart Detect' ? '#ffffff' : 'transparent',
                          color: annotationMode === 'Smart Detect' ? '#000000' : '#888888',
                          fontSize: '13px',
                          fontWeight: annotationMode === 'Smart Detect' ? '600' : '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        Smart Detect
                      </button>
                    </div>
                  </div>

                  {/* Section 2: Inputs (middle) */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '8px',
                    visibility: annotationMode === 'Smart Detect' ? 'visible' : 'hidden',
                    opacity: annotationMode === 'Smart Detect' ? 1 : 0,
                    transition: 'opacity 0.2s',
                    pointerEvents: annotationMode === 'Smart Detect' ? 'auto' : 'none'
                  }}>
                    <input 
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="Enter class name (e.g., Signature)"
                      style={{
                        background: '#0a0a0a',
                        color: '#ffffff',
                        border: '1px solid #333333',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s ease',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => {
                         e.target.style.borderColor = '#ffffff';
                         e.target.style.boxShadow = '0 0 8px rgba(255,255,255,0.2)';
                      }}
                      onBlur={(e) => {
                         e.target.style.borderColor = '#333333';
                         e.target.style.boxShadow = 'none';
                      }}
                    />
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what to detect (e.g., handwritten signature at bottom of document)"
                      style={{
                        background: '#0a0a0a',
                        color: '#ffffff',
                        border: '1px solid #333333',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        resize: 'vertical',
                        minHeight: '46px',
                        transition: 'all 0.2s ease',
                        fontFamily: 'inherit',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => {
                         e.target.style.borderColor = '#ffffff';
                         e.target.style.boxShadow = '0 0 8px rgba(255,255,255,0.2)';
                      }}
                      onBlur={(e) => {
                         e.target.style.borderColor = '#333333';
                         e.target.style.boxShadow = 'none';
                      }}
                    />
                    {validationError && (
                      <div style={{ color: '#ff4444', fontSize: '12px', marginTop: '4px', fontWeight: '500' }}>
                        {validationError}
                      </div>
                    )}

                    {/* Confidence Threshold Slider — Smart Detect only */}
                    {annotationMode === 'Smart Detect' && (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#888888', fontWeight: '500' }}>Confidence Threshold</span>
                          <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: '700', background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', padding: '2px 8px' }}>{confidenceThreshold}%</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="99"
                          value={confidenceThreshold}
                          onChange={e => setConfidenceThreshold(Number(e.target.value))}
                          style={{
                            width: '100%',
                            accentColor: '#4CAF50',
                            height: '4px',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', fontWeight: '500' }}>
                          <span>1% (loose)</span>
                          <span>99% (strict)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section 3: Action Button (bottom) */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#888888', fontWeight: '500' }}>
                      Mode: {annotationMode}
                    </div>
                    <button 
                      onClick={runSAM}
                      disabled={loading}
                      className="bw-run-btn"
                      style={{
                        ...styles.runBtn,
                        background: loading ? '#f5f5f5' : '#ffffff',
                        color: '#000000',
                        opacity: loading ? 0.5 : 1,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        height: '46px',
                        width: '100%',
                        maxWidth: '220px',
                        justifyContent: 'center'
                      }}
                    >
                    {loading ? (
                      <>
                        <span className="bw-spinner-small"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        Generate Results
                      </>
                    )}
                    </button>
                    {loading ? (
                      <span style={{ fontSize: '13px', color: '#aaaaaa', fontWeight: '500' }}>Analyzing image...</span>
                    ) : noMatchMessage ? (
                      <span style={{ fontSize: '13px', color: '#FF9800', fontWeight: '600' }}>⚠ {noMatchMessage}</span>
                    ) : previewDetections.length > 0 && !isReviewPhase ? (
                      <span style={{ fontSize: '13px', color: '#4CAF50', fontWeight: '600' }}>
                        {annotationMode === 'Smart Detect' && smartDetectResults.length > 0
                          ? `${smartDetectResults.length} match${smartDetectResults.length !== 1 ? 'es' : ''} found`
                          : `${previewDetections.length} object${previewDetections.length !== 1 ? 's' : ''} detected`}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#999', fontWeight: '600', letterSpacing: '0.3px', textTransform: 'uppercase' }}>EST. TIME: ~0.8S</span>
                    )}
                    {!loading && previewDetections.length > 0 && !isReviewPhase && (
                      <button 
                        onClick={() => setIsReviewPhase(true)}
                        style={{
                          background: '#4CAF50',
                          color: '#ffffff',
                          border: 'none',
                          padding: '12px 24px',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '700',
                          letterSpacing: '-0.1px',
                          cursor: 'pointer',
                          marginTop: '4px',
                          width: '100%',
                          maxWidth: '220px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        Start Review →
                      </button>
                    )}
                  </div>
                </div>
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
                    src={`/uploads/${normalizeFilePath(img.filepath)}`} 
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
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {renderWorkflowIndicator()}
              <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.section}>
                  {/* Outer shell: just centers its content */}
                  <div style={styles.canvasOuter}>
                    {/* Inner wrapper: inline-block → shrinks to exactly the image canvas size
                        so that the overlay's top:0,left:0 always aligns with the image */}
                    <div 
                      ref={canvasWrapperRef} 
                      style={{ 
                        ...styles.canvasWrapper, 
                        cursor: hoveredPreviewId !== null ? 'pointer' : 'default',
                        ...getFocusStyle()
                      }}
                      onMouseMove={handleCanvasMouseMove}
                      onClick={handleCanvasClick}
                      onMouseLeave={handleCanvasMouseLeave}
                    >
                      <canvas
                        ref={imageCanvasRef}
                        style={styles.canvas}
                      ></canvas>
                      {/* Overlay canvas: covers exactly the image canvas */}
                      <canvas
                        ref={canvasRef}
                        style={styles.canvasOverlay}
                      ></canvas>
                      {renderFloatingMenu()}
                    </div>
                  </div>
                </div>

              </div>

              {/* Sidebar */}
              <div style={{ width: '300px', flexShrink: 0 }}>
                <div style={styles.section}>
                  <h4 style={styles.sectionTitle}>Annotations ({annotations.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
                    {annotations.map((ann, idx) => (
                      <div 
                        key={ann.id}
                        onClick={() => setSelectedAnnotationId(ann.id === selectedAnnotationId ? null : ann.id)}
                        onMouseEnter={() => setHoveredAnnotationId(ann.id)}
                        onMouseLeave={() => setHoveredAnnotationId(null)}
                        style={{
                           padding: '12px',
                           background: selectedAnnotationId === ann.id ? '#2a2a2a' : (hoveredAnnotationId === ann.id ? '#222' : '#1a1a1a'),
                           border: `1px solid ${selectedAnnotationId === ann.id ? '#ffffff' : (hoveredAnnotationId === ann.id ? '#555' : '#333')}`,
                           borderRadius: '8px',
                           display: 'flex',
                           flexDirection: 'column',
                           gap: '8px',
                           transition: 'all 0.2s',
                           cursor: 'pointer'
                        }}
                      >
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <input 
                             type="text"
                             value={ann.label}
                             onChange={(e) => {
                               const newClass = e.target.value;
                               setAnnotations(prev => prev.map(a => a.id === ann.id ? { 
                                 ...a, 
                                 label: newClass,
                                 classId: newClass.toLowerCase().replace(/\s+/g, '-')
                               } : a));
                             }}
                             onClick={(e) => e.stopPropagation()}
                             style={{
                               background: '#000',
                               color: '#fff',
                               border: '1px solid #444',
                               padding: '4px 8px',
                               borderRadius: '4px',
                               fontSize: '13px',
                               outline: 'none',
                               width: '120px',
                               transition: 'all 0.2s',
                             }}
                             onFocus={(e) => {
                               e.target.style.borderColor = '#ffffff';
                             }}
                             onBlur={(e) => {
                               e.target.style.borderColor = '#444';
                             }}
                           />
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setAnnotations(prev => prev.filter(a => a.id !== ann.id));
                               if (selectedAnnotationId === ann.id) setSelectedAnnotationId(null);
                             }}
                             style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}
                           >
                              ×
                           </button>
                         </div>
                         <div style={{ fontSize: '12px', color: '#888' }}>
                            Object {idx + 1}
                         </div>
                      </div>
                    ))}
                    {annotations.length === 0 && (
                      <div style={{ color: '#888888', fontSize: '13px', textAlign: 'center', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontWeight: '600', color: '#aaaaaa', fontSize: '14px' }}>No annotations yet</div>
                        <div>Run detection and accept objects to see them here</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Styling
// Styling
const styles = {
  container: {
    padding: "24px",
    height: "100%",
    overflowY: "auto",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    background: "#000000",
    color: "#ffffff"
  },
  section: {
    padding: "20px",
    borderRadius: "12px",
    background: "#111111",
    border: "1px solid #222",
    marginBottom: "24px"
  },
  sectionTitle: {
    margin: "0 0 20px 0",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "1px"
  },
  galleryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px"
  },
  imageGallery: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "12px",
    maxHeight: "320px",
    overflowY: "auto",
    padding: "4px"
  },
  imageThumb: {
    position: "relative",
    aspectRatio: "1",
    width: "100%",
    cursor: "pointer",
    border: "1px solid #333",
    borderRadius: "8px",
    overflow: "hidden",
    transition: "all 0.2s ease"
  },
  imageThumbActive: {
    border: "2px solid #ffffff",
    transform: "scale(0.95)",
    boxShadow: "0 0 20px rgba(255, 255, 255, 0.2)"
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  imageThumbOverlay: {
    position: "absolute",
    bottom: "8px",
    left: "8px",
    background: "rgba(0, 0, 0, 0.8)",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "600",
    border: "1px solid rgba(255,255,255,0.1)"
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px"
  },
  imageInfo: {
    flex: 1,
    color: "#888",
    fontSize: "13px",
    fontWeight: "500"
  },
  runBtn: {
    padding: "12px 24px",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "700",
    letterSpacing: "-0.1px",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  // Outer shell: full width, centers the inner wrapper
  canvasOuter: {
    background: "#080808",
    borderRadius: "12px",
    border: "1px solid #222",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    width: "100%",
    overflow: "hidden"
  },
  // Inner wrapper: inline-block → shrinks to the canvas content size
  // so the absolutely-positioned overlay aligns perfectly with the image
  canvasWrapper: {
    position: "relative",
    display: "inline-block",
    maxWidth: "100%",
    lineHeight: 0  // prevent inline spacing gap below canvas
  },
  canvas: {
    display: "block",
    maxWidth: "100%",
    height: "auto"
  },
  // Overlay canvas: must cover the image canvas exactly
  canvasOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none"
  },
  infoText: {
    color: "#666",
    fontSize: "13px",
    marginTop: "8px",
    marginBottom: "20px",
    lineHeight: "1.5"
  },
  saveBtn: {
    padding: "14px 28px",
    background: "#ffffff",
    color: "#000000",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "700",
    transition: "all 0.2s ease"
  },
  summary: {
    cursor: "pointer",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "12px",
    opacity: 0.7
  },
  pre: {
    maxHeight: "200px",
    overflow: "auto",
    background: "#080808",
    padding: "16px",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#888",
    border: "1px solid #1a1a1a"
  },
  emptyState: {
    padding: "80px 40px",
    textAlign: "center",
    color: "#555",
    fontSize: "15px",
    fontWeight: "500"
  },
  canvasToolbar: {
    background: "#0a0a0a",
    padding: "16px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #1a1a1a",
    marginBottom: "24px",
    borderRadius: "12px"
  },
  toolbarLeft: {
    display: "flex",
    gap: "12px",
    alignItems: "center"
  },
  toolbarBtn: {
    padding: "10px 18px",
    background: "#111",
    color: "#fff",
    border: "1px solid #333",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    transition: "all 0.2s ease"
  },
  imageCounter: {
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    padding: "0 12px",
    minWidth: "80px",
    textAlign: "center"
  }
};

export default Annotation;
