import React, { useRef, useState, useEffect, useCallback } from "react";
import '../../src/style.scss';
import RoboSpectraLogo from '../assets/Robot.svg';

const DocsAnnotation = ({ currentProject, images, currentImageIndex, onImageSelect, onSaveAnnotations, onOpenProjectModal, onAnnotationDeleted, reloadTrigger }) => {
  const canvasRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  
  // Add CSS override for docs annotation canvas to prevent max-width/height constraints
  useEffect(() => {
    const styleId = 'docs-annotation-canvas-override';
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = `
        .docs-annotation-canvas {
          max-width: 100% !important;
          max-height: 100% !important;
          width: auto !important;
          height: auto !important;
          object-fit: contain;
        }
        .toolbar-content input:focus,
        .toolbar-content select:focus {
          border-color: rgba(102, 126, 234, 0.5) !important;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
          background: rgba(15, 22, 36, 0.8) !important;
        }
        .toolbar-content input:hover,
        .toolbar-content select:hover {
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
        .toolbar-content select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e") !important;
          background-repeat: no-repeat !important;
          background-position: right 8px center !important;
          background-size: 16px 16px !important;
          padding-right: 35px !important;
        }
        .toolbar-content::-webkit-scrollbar {
          width: 6px;
        }
        .toolbar-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .toolbar-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .toolbar-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `;
      document.head.appendChild(styleElement);
    }
  }, []);
  const [selectedImage, setSelectedImage] = useState(null);
  const [detectionResult, setDetectionResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, index }

  // Annotation State
  const [annotations, setAnnotations] = useState([]);
  const [activeTool, setActiveTool] = useState('select'); // select, box, polygon, brush
  const [classes, setClasses] = useState([]); // Will be dynamically populated from annotations
  const [manualClasses, setManualClasses] = useState(new Set()); // Track manually added classes
  const [currentClass, setCurrentClass] = useState('object');
  const [newClassName, setNewClassName] = useState('');

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [annotationsSaved, setAnnotationsSaved] = useState(false);
  const [contextNewClass, setContextNewClass] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false); // Prevent concurrent saves
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  const [isDraggingContextMenu, setIsDraggingContextMenu] = useState(false);
  const [contextMenuDragOffset, setContextMenuDragOffset] = useState({ x: 0, y: 0 });

  // Zoom and Pan State
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [imageObj, setImageObj] = useState(null); // Store the loaded image

  // Toolbar popup state
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 100 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [toolbarDragOffset, setToolbarDragOffset] = useState({ x: 0, y: 0 });

  // Helper function to normalize filepath for URLs
  const normalizeFilePath = (filepath) => {
    if (!filepath) return '';
    return filepath.replace(/\\/g, '/');
  };

  // Load image from project when currentImageIndex changes
  useEffect(() => {
    console.log('📸 DocsAnnotation useEffect triggered:', { 
      imagesLength: images?.length, 
      currentImageIndex, 
      hasImages: images && images.length > 0,
      indexValid: currentImageIndex >= 0 && currentImageIndex < (images?.length || 0)
    });
    
    if (images && images.length > 0 && currentImageIndex >= 0 && currentImageIndex < images.length) {
      const img = images[currentImageIndex];
      console.log('🖼️ Loading image in DocsAnnotation:', { 
        id: img?.id, 
        filename: img?.filename, 
        filepath: img?.filepath 
      });
      
      if (!img) {
        console.warn('⚠️ Image data is null or undefined');
        return;
      }
      
      setSelectedImage(img);
      loadImageToCanvas(img);
      setAnnotations([]);
      setDetectionResult(null);
      setAnnotationsSaved(false);
      setCurrentPoints([]);
      setIsDrawing(false);
      setSelectedAnnotationIndex(null);
      setContextMenu(null);
      // Reset zoom and pan when image changes - zoom and pan will be set to fit-to-canvas and center in loadImageToCanvas
      // Don't set zoom/pan here - let loadImageToCanvas calculate fit-to-canvas zoom and center position

      // Load existing annotations from database
      loadExistingAnnotations(img);
    } else {
      console.warn('⚠️ DocsAnnotation: Cannot load image - invalid conditions', {
        hasImages: images && images.length > 0,
        currentImageIndex,
        imagesLength: images?.length
      });
    }
  }, [currentImageIndex, images]);

  // Reload annotations when reloadTrigger changes (triggered by Resources.jsx when deleting from list)
  useEffect(() => {
    if (reloadTrigger && reloadTrigger > 0 && selectedImage) {
      loadExistingAnnotations(selectedImage);
    }
  }, [reloadTrigger, selectedImage]);

  // Delete key shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationIndex !== null) {
        handleDeleteAnnotation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationIndex]);

  // Load existing annotations from database
  const loadExistingAnnotations = async (imageData, skipIfSaving = false) => {
    if (!imageData || !imageData.id) return;
    if (skipIfSaving && isSaving) return; // Don't reload while saving

    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`http://localhost:8000/api/images/${imageData.id}/annotations`, {
        headers
      });
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          console.error('Authentication error loading annotations:', response.status);
          // Don't clear existing annotations on auth error
          return;
        }
        console.error(`Failed to load annotations: ${response.status}`);
        // Don't clear existing annotations on error
        return;
      }
      
      const data = await response.json();

      if (data && data.length > 0) {
        const loadedAnnotations = data.map(ann => {
          const coords = typeof ann.coordinates === 'string'
            ? JSON.parse(ann.coordinates)
            : ann.coordinates;

          return {
            id: ann.id, // Store database ID for updates
            type: ann.annotation_type || 'bbox',
            class: ann.class_name || 'object',
            coordinates: coords,
            points: coords.points || [],
            confidence: 1.0
          };
        });

        if (loadedAnnotations.length > 0) {
          // Only reload if we're not currently saving to avoid overwriting unsaved changes
          if (!isSaving) {
            setAnnotations(loadedAnnotations);
            setAnnotationsSaved(true);
            
            // Extract classes from loaded annotations and merge with manual classes
            const extractedClasses = extractClassesFromAnnotations(loadedAnnotations);
            const allClasses = new Set([...extractedClasses, ...manualClasses]);
            const mergedClasses = Array.from(allClasses).sort();
            if (mergedClasses.length > 0) {
              setClasses(mergedClasses);
              setCurrentClass(prevClass => {
                if (mergedClasses.includes(prevClass)) {
                  return prevClass;
                }
                return mergedClasses[0];
              });
            }
          }
        } else {
          // No annotations in database - clear local state only if not saving
          if (!isSaving) {
            setAnnotations([]);
            setAnnotationsSaved(true);
            // Keep manual classes even when no annotations
            if (manualClasses.size > 0) {
              const mergedClasses = Array.from(manualClasses).sort();
              setClasses(mergedClasses);
              setCurrentClass(mergedClasses[0]);
            }
          }
        }
      } else {
        // No annotations in database - just clear state, don't auto-detect
        if (!isSaving) {
          setAnnotations([]);
          setAnnotationsSaved(true);
          // Keep manual classes even when no annotations
          if (manualClasses.size > 0) {
            const mergedClasses = Array.from(manualClasses).sort();
            setClasses(mergedClasses);
            setCurrentClass(mergedClasses[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading existing annotations:', error);
    }
  };

  // Load image onto canvas
  const loadImageToCanvas = (imageData) => {
    if (!imageData) {
      console.error('❌ loadImageToCanvas: imageData is null or undefined');
      return;
    }

    console.log('🔄 loadImageToCanvas called with:', {
      id: imageData.id,
      filename: imageData.filename,
      filepath: imageData.filepath,
      hasFilepath: !!imageData.filepath
    });

    const filepath = normalizeFilePath(imageData.filepath);
    if (!filepath) {
      console.error("❌ Skipping image load: filepath is empty", imageData);
      return;
    }

    const imageUrl = `http://localhost:8000/uploads/${filepath}`;
    console.log('📥 Loading image from URL:', imageUrl);

    const img = new Image();
    // Set crossOrigin for canvas operations (toDataURL, etc.)
    // Backend now serves images with CORS headers via custom endpoint
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      console.log('✅ Image loaded successfully:', imageUrl);
      const canvas = canvasRef.current;
      const wrapper = canvasWrapperRef.current;
      if (!canvas || !wrapper) {
        console.error('❌ Canvas or wrapper ref is null, cannot draw image');
        return;
      }

      // Store the image object for redrawing with zoom/pan
      setImageObj(img);

      // Set canvas size to match wrapper/container (full viewport)
      const wrapperRect = wrapper.getBoundingClientRect();
      canvas.width = wrapperRect.width;
      canvas.height = wrapperRect.height;

      const ctx = canvas.getContext("2d");
      
      // Calculate fit-to-canvas zoom level and center position
      const containerWidth = wrapperRect.width;
      const containerHeight = wrapperRect.height;
      
      let fitZoom = 1; // Default zoom
      let centerPanX = 0;
      let centerPanY = 0;
      
      // Calculate zoom to fit image in container
      const scaleX = containerWidth / img.width;
      const scaleY = containerHeight / img.height;
      fitZoom = Math.min(scaleX, scaleY, 1) * 0.9; // Don't zoom in beyond 100%, only zoom out, with 10% margin
      
      // Calculate center position for the image
      // After zoom, the displayed size will be: img.width * fitZoom, img.height * fitZoom
      const scaledWidth = img.width * fitZoom;
      const scaledHeight = img.height * fitZoom;
      
      // Calculate how much space is left in the container after scaling
      const remainingWidth = containerWidth - scaledWidth;
      const remainingHeight = containerHeight - scaledHeight;
      
      // Center the image: move by half the remaining space
      // panX and panY are in canvas coordinates (applied before zoom)
      // To move X pixels in display space, we need to move X/zoom in canvas space
      if (remainingWidth > 0) {
        centerPanX = (containerWidth / 2) - (scaledWidth / 2);
      }
      if (remainingHeight > 0) {
        centerPanY = (containerHeight / 2) - (scaledHeight / 2);
      }
      
      console.log('📐 Calculating fit-to-canvas zoom and center:', {
        imageSize: { width: img.width, height: img.height },
        containerSize: { width: containerWidth, height: containerHeight },
        fitZoom,
        scaledSize: { width: scaledWidth, height: scaledHeight },
        centerPan: { x: centerPanX, y: centerPanY }
      });
      
      // Set zoom and pan to fit-to-canvas and center - this will trigger useEffect to redraw
      setZoom(fitZoom);
      setPanX(centerPanX);
      setPanY(centerPanY);
      
      // Draw image and annotations immediately
      redrawCanvas();
    };

    img.onerror = (error) => {
      console.error('❌ Failed to load image:', {
        url: imageUrl,
        filepath: imageData.filepath,
        filename: imageData.filename,
        error
      });
    };
  };

  // Redraw image with zoom and pan transformations
  // Combined function to redraw both image and annotations on single canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image with zoom and pan transformations
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(imageObj, 0, 0);
    ctx.restore();

    // Draw annotations on top of image
    drawAnnotations();
  }, [imageObj, zoom, panX, panY, annotations, selectedAnnotationIndex]);

  // Keep redrawImage for backward compatibility (calls redrawCanvas)
  const redrawImage = useCallback(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Get mouse position relative to canvas (accounting for zoom and pan)
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Get mouse position relative to canvas display area
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    // Convert to canvas internal coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = displayX * scaleX;
    const canvasY = displayY * scaleY;
    // Convert to image coordinates accounting for zoom and pan
    return {
      x: (canvasX - panX) / zoom,
      y: (canvasY - panY) / zoom
    };
  };

  // Hit detection helpers
  const isPointInPolygon = (point, vs) => {
    const x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x, yi = vs[i].y;
      const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const isPointNearPolyline = (point, points, tolerance = 10) => {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = distanceToSegment(point, p1, p2);
      if (dist <= tolerance) return true;
    }
    return false;
  };

  const distanceToSegment = (p, v, w) => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  };

  const getCanvasScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 1, y: 1 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: canvas.width / rect.width,
      y: canvas.height / rect.height
    };
  };

  const getResizeHandles = (rect, scale = { x: 1, y: 1 }) => {
    const { x, y, width, height } = rect;
    const size = 12 * Math.max(scale.x, scale.y);
    const half = size / 2;
    return [
      { name: 'nw', x: x - half, y: y - half, w: size, h: size, cursor: 'nw-resize' },
      { name: 'n', x: x + width / 2 - half, y: y - half, w: size, h: size, cursor: 'n-resize' },
      { name: 'ne', x: x + width - half, y: y - half, w: size, h: size, cursor: 'ne-resize' },
      { name: 'e', x: x + width - half, y: y + height / 2 - half, w: size, h: size, cursor: 'e-resize' },
      { name: 'se', x: x + width - half, y: y + height - half, w: size, h: size, cursor: 'se-resize' },
      { name: 's', x: x + width / 2 - half, y: y + height - half, w: size, h: size, cursor: 's-resize' },
      { name: 'sw', x: x - half, y: y + height - half, w: size, h: size, cursor: 'sw-resize' },
      { name: 'w', x: x - half, y: y + height / 2 - half, w: size, h: size, cursor: 'w-resize' }
    ];
  };

  // Cursor map for resize handles
  const cursorMap = {
    'nw': 'nw-resize', 'n': 'n-resize', 'ne': 'ne-resize',
    'e': 'e-resize', 'se': 'se-resize', 's': 's-resize',
    'sw': 'sw-resize', 'w': 'w-resize'
  };

  // Pointer event handlers
  const handlePointerDown = (e) => {
    if (!selectedImage) return;
    const { x, y } = getMousePos(e);

    // Check for resize handles first if an annotation is selected
    if (selectedAnnotationIndex !== null && annotations[selectedAnnotationIndex] && annotations[selectedAnnotationIndex].type === 'bbox') {
      const scale = getCanvasScale();
      const handles = getResizeHandles(annotations[selectedAnnotationIndex].coordinates, scale);
      const clickedHandle = handles.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (clickedHandle) {
        setResizeHandle(clickedHandle.name);
        setIsDrawing(true);
        e.target.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (activeTool === 'select') {
      // Find clicked annotation (reverse order for top-most)
      let clickedIndex = -1;
      for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        if (ann.type === 'bbox') {
          const { x: bx, y: by, width, height } = ann.coordinates;
          if (x >= bx && x <= bx + width && y >= by && y <= by + height) {
            clickedIndex = i;
            break;
          }
        } else if (ann.type === 'polygon') {
          const points = ann.points || ann.coordinates.points;
          if (points && isPointInPolygon({ x, y }, points)) {
            clickedIndex = i;
            break;
          }
        } else if (ann.type === 'brush') {
          const points = ann.points || ann.coordinates.points;
          if (points && isPointNearPolyline({ x, y }, points)) {
            clickedIndex = i;
            break;
          }
        }
      }

      if (clickedIndex !== -1) {
        // Clicked inside a BBox - enable move/crop feature
        setSelectedAnnotationIndex(clickedIndex);
        setIsMoving(true);
        e.target.setPointerCapture(e.pointerId);
        const ann = annotations[clickedIndex];

        // Store offset relative to the first point or top-left
        if (ann.type === 'bbox') {
          setMoveOffset({
            x: x - ann.coordinates.x,
            y: y - ann.coordinates.y
          });
        } else {
          setMoveOffset({ x, y });
        }

        // Show context menu initially, but it will be hidden if dragged
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          index: clickedIndex
        });
      } else {
        // Clicked outside BBox - enable panning
        setSelectedAnnotationIndex(null);
        setContextMenu(null);
        setIsPanning(true);
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const canvasX = (e.clientX - rect.left) * scaleX;
          const canvasY = (e.clientY - rect.top) * scaleY;
          setPanStartX(canvasX - panX);
          setPanStartY(canvasY - panY);
          canvas.style.cursor = 'grabbing';
        }
        e.target.setPointerCapture(e.pointerId);
      }
      return;
    }

    // Ensure we have a class selected before drawing
    if (!currentClass && classes.length > 0) {
      setCurrentClass(classes[0]);
    } else if (!currentClass) {
      // If no classes exist, create a default one
      setCurrentClass('object');
      if (!classes.includes('object')) {
        setManualClasses(prev => new Set([...prev, 'object']));
        setClasses(['object']);
      }
    }

    setIsDrawing(true);
    setStartPoint({ x, y });

    if (activeTool === 'polygon') {
      setCurrentPoints(prev => [...prev, { x, y }]);
    } else if (activeTool === 'brush') {
      setCurrentPoints([{ x, y }]);
    }
  };

  const handlePointerMove = (e) => {
    if (!selectedImage) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const { x, y } = getMousePos(e);

    // Handle panning when clicking outside BBox
    if (isPanning && activeTool === 'select') {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;
      
      const newPanX = canvasX - panStartX;
      const newPanY = canvasY - panStartY;
      
      setPanX(newPanX);
      setPanY(newPanY);
      redrawCanvas();
      return;
    }

    if (resizeHandle && selectedAnnotationIndex !== null) {
      const ann = annotations[selectedAnnotationIndex];
      let { x: bx, y: by, width: bw, height: bh } = ann.coordinates;

      if (resizeHandle.includes('n')) { bh += by - y; by = y; }
      if (resizeHandle.includes('s')) { bh = y - by; }
      if (resizeHandle.includes('w')) { bw += bx - x; bx = x; }
      if (resizeHandle.includes('e')) { bw = x - bx; }

      // Enforce minimum size
      if (bw < 5) bw = 5;
      if (bh < 5) bh = 5;

      const updatedAnnotations = [...annotations];
      updatedAnnotations[selectedAnnotationIndex] = {
        ...ann,
        id: ann.id, // Explicitly preserve ID
        coordinates: { x: bx, y: by, width: bw, height: bh }
      };
      setAnnotations(updatedAnnotations);

      if (cursorMap[resizeHandle]) {
        canvasRef.current.style.cursor = cursorMap[resizeHandle];
      }
      return;
    }

    if (activeTool === 'select') {
      if (isMoving && selectedAnnotationIndex !== null) {
        const ann = annotations[selectedAnnotationIndex];

        if (ann.type === 'bbox') {
          const newX = x - moveOffset.x;
          const newY = y - moveOffset.y;

          const updatedAnnotations = [...annotations];
          updatedAnnotations[selectedAnnotationIndex] = {
            ...ann,
            id: ann.id, // Explicitly preserve ID
            coordinates: { ...ann.coordinates, x: newX, y: newY }
          };
          setAnnotations(updatedAnnotations);
        } else if (ann.type === 'polygon' || ann.type === 'brush') {
          const dx = x - moveOffset.x;
          const dy = y - moveOffset.y;
          setMoveOffset({ x, y });

          const points = ann.points || ann.coordinates.points;
          const newPoints = points.map(p => ({ x: p.x + dx, y: p.y + dy }));

          const updatedAnnotations = [...annotations];
          updatedAnnotations[selectedAnnotationIndex] = {
            ...ann,
            id: ann.id, // Explicitly preserve ID
            points: newPoints,
            coordinates: { ...ann.coordinates, points: newPoints }
          };
          setAnnotations(updatedAnnotations);
        }

        setContextMenu(null);
        canvasRef.current.style.cursor = 'move';
        return;
      }

      if (selectedAnnotationIndex !== null && annotations[selectedAnnotationIndex].type === 'bbox') {
        const scale = getCanvasScale();
        const handles = getResizeHandles(annotations[selectedAnnotationIndex].coordinates, scale);
        const hoveredHandle = handles.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
        if (hoveredHandle) {
          canvas.style.cursor = hoveredHandle.cursor;
          return;
        }
      }

      // Check hover for cursor
      let hoveredIndex = -1;
      for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        if (ann.type === 'bbox') {
          const { x: bx, y: by, width, height } = ann.coordinates;
          if (x >= bx && x <= bx + width && y >= by && y <= by + height) {
            hoveredIndex = i;
            break;
          }
        } else if (ann.type === 'polygon') {
          const points = ann.points || ann.coordinates.points;
          if (points && isPointInPolygon({ x, y }, points)) {
            hoveredIndex = i;
            break;
          }
        } else if (ann.type === 'brush') {
          const points = ann.points || ann.coordinates.points;
          if (points && isPointNearPolyline({ x, y }, points)) {
            hoveredIndex = i;
            break;
          }
        }
      }
      // Update cursor: grab when outside BBox, move when inside
      canvas.style.cursor = hoveredIndex !== -1 ? 'move' : 'grab';
      return;
    }

    if (!isDrawing) return;

    if (activeTool === 'box') {
      redrawCanvas();
      const ctx = canvasRef.current.getContext('2d');
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 1 / zoom; // Thinner preview line
      ctx.strokeRect(startPoint.x, startPoint.y, x - startPoint.x, y - startPoint.y);
      ctx.restore();
    } else if (activeTool === 'brush') {
      setCurrentPoints(prev => [...prev, { x, y }]);
      redrawCanvas();
      const ctx = canvasRef.current.getContext('2d');
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);
      const points = [...currentPoints, { x, y }];
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2 / zoom; // Thinner brush preview
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
      }
      ctx.stroke();
      ctx.restore();
    } else if (activeTool === 'polygon') {
      redrawCanvas();
      const ctx = canvasRef.current.getContext('2d');
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 1 / zoom; // Thinner polygon preview
      ctx.beginPath();
      if (currentPoints.length > 0) {
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerUp = (e) => {
    e.target.releasePointerCapture(e.pointerId);

    if (isPanning) {
      setIsPanning(false);
      const canvas = canvasRef.current;
      if (canvas && activeTool === 'select') {
        // Reset cursor based on hover state
        const { x, y } = getMousePos(e);
        let hoveredIndex = -1;
        for (let i = annotations.length - 1; i >= 0; i--) {
          const ann = annotations[i];
          if (ann.type === 'bbox') {
            const { x: bx, y: by, width, height } = ann.coordinates;
            if (x >= bx && x <= bx + width && y >= by && y <= by + height) {
              hoveredIndex = i;
              break;
            }
          }
        }
        canvas.style.cursor = hoveredIndex !== -1 ? 'move' : 'grab';
      }
      return;
    }

    if (resizeHandle && selectedAnnotationIndex !== null) {
      saveEditedAnnotation(annotations[selectedAnnotationIndex]); // ✅ UPDATE backend
      setResizeHandle(null);
      setIsDrawing(false);    
      return;
    }

    if (isMoving && selectedAnnotationIndex !== null) {
      saveEditedAnnotation(annotations[selectedAnnotationIndex]); // ✅ UPDATE backend
    }
    setIsMoving(false);
    

    if (!isDrawing || activeTool === 'polygon') return;
    const { x, y } = getMousePos(e);

    if (activeTool === 'box') {
      const width = x - startPoint.x;
      const height = y - startPoint.y;

      if (Math.abs(width) > 5 && Math.abs(height) > 5) {
        // Ensure we have a valid class
        const annotationClass = currentClass || (classes.length > 0 ? classes[0] : 'object');
        
        const newAnnotation = {
          type: 'bbox',
          class: annotationClass,
          coordinates: {
            x: width > 0 ? startPoint.x : x,
            y: height > 0 ? startPoint.y : y,
            width: Math.abs(width),
            height: Math.abs(height)
          },
          confidence: 1.0
        };
        
        setAnnotations(prev => {
          const updated = [...prev, newAnnotation];
          return updated;
        });
        setAnnotationsSaved(false);
        
        // Force immediate redraw - useEffect will handle it, but ensure it's drawn
        requestAnimationFrame(() => {
          redrawCanvas();
        });
      }
      setIsDrawing(false);
      setStartPoint(null);
    } else if (activeTool === 'brush') {
      if (currentPoints.length > 2) {
        const newAnnotation = {
          type: 'brush',
          class: currentClass || 'object',
          coordinates: { points: currentPoints },
          points: currentPoints,
          confidence: 1.0
        };
        setAnnotations(prev => {
          const updated = [...prev, newAnnotation];
          // Force redraw after state update - useEffect will handle it
          requestAnimationFrame(() => {
            redrawCanvas();
          });
          return updated;
        });
        setAnnotationsSaved(false);
      }
      setIsDrawing(false);
      setCurrentPoints([]);
    }
  };

  const handleDoubleClick = (e) => {
    if (activeTool === 'polygon' && currentPoints.length > 2) {
      const newAnnotation = {
        type: 'polygon',
        class: currentClass || 'object',
        coordinates: { points: currentPoints },
        points: currentPoints,
        confidence: 1.0
      };
      setAnnotations(prev => {
        const updated = [...prev, newAnnotation];
        // Force redraw after state update
        setTimeout(() => {
          redrawCanvas();
        }, 0);
        return updated;
      });
      setAnnotationsSaved(false);
      setIsDrawing(false);
      setCurrentPoints([]);
    }
  };

  // Get color based on annotation class
  const getAnnotationColor = (className) => {
    const classLower = (className || '').toLowerCase();
    // Different colors for different annotation types
    if (classLower.includes('page') || classLower.includes('pagenumber') || classLower === 'page_number') {
      return '#FF6B6B'; // Red for page numbers
    } else if (classLower.includes('paragraph') || classLower.includes('para') || classLower === 'paragraph') {
      return '#4ECDC4'; // Teal for paragraphs
    } else if (classLower.includes('heading') || classLower.includes('title') || classLower === 'heading') {
      return '#95E1D3'; // Light green for headings
    } else if (classLower.includes('table') || classLower === 'table') {
      return '#F38181'; // Pink for tables
    } else if (classLower.includes('figure') || classLower.includes('image') || classLower === 'figure') {
      return '#AA96DA'; // Purple for figures
    } else {
      return '#6C5CE7'; // Default purple for other types
    }
  };

  // Draw all annotations (with zoom and pan transformations)
  // Note: This function only draws annotations, it does NOT clear or draw the image
  // Use redrawCanvas() to redraw both image and annotations
  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) {
      console.warn('drawAnnotations: Canvas or imageObj is null');
      return;
    }
    
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('drawAnnotations: Canvas has zero dimensions', {
        width: canvas.width,
        height: canvas.height
      });
      return;
    }
    
    const ctx = canvas.getContext("2d");
    
    // Don't clear canvas - image should already be drawn
    // Apply zoom and pan transformations
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    annotations.forEach((ann, index) => {
      const color = getAnnotationColor(ann.class);
      const isSelected = index === selectedAnnotationIndex;

      // Thinner borders - reduced from 2/zoom to 1/zoom for normal, 2/zoom for selected
      ctx.strokeStyle = isSelected ? '#000000' : color;
      ctx.lineWidth = isSelected ? 2 / zoom : 1 / zoom;
      ctx.fillStyle = color;

      if (ann.type === 'bbox') {
        const { x, y, width, height } = ann.coordinates;
        console.log(`drawAnnotations: Drawing bbox ${index}`, { x, y, width, height, class: ann.class });
        ctx.strokeRect(x, y, width, height);

        // Smaller font size - reduced from 14/zoom to 10/zoom
        const fontSize = 10 / zoom;
        ctx.font = `bold ${fontSize}px Arial`;
        const label = ann.class;
        const textMetrics = ctx.measureText(label);
        const labelHeight = fontSize * 1.2;
        const labelPadding = 4 / zoom;
        const labelWidth = textMetrics.width + labelPadding * 2;
        
        // Smart label positioning - place below if there's space, otherwise above
        let labelY = y - labelHeight - 2 / zoom; // Default: above
        let labelX = x;
        
        // Check if label would be cut off at top (y < labelHeight)
        if (y < labelHeight + 5 / zoom) {
          // Place below the box instead
          labelY = y + height + 2 / zoom;
        }
        
        // Check if label would go off right edge, adjust if needed
        if (labelX + labelWidth > canvas.width / zoom) {
          labelX = canvas.width / zoom - labelWidth - 2 / zoom;
        }
        
        // Ensure label doesn't go off left edge
        if (labelX < 0) {
          labelX = 2 / zoom;
        }

        // Draw label background with slight transparency
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        ctx.globalAlpha = 1.0;
        
        // Draw label text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, labelX + labelPadding, labelY + fontSize);

        if (isSelected) {
          // Resize handles - size relative to zoom
          const handleSize = 8 / zoom;
          const { x, y, width, height } = ann.coordinates;
          const handles = [
            { x: x - handleSize/2, y: y - handleSize/2, w: handleSize, h: handleSize }, // top-left
            { x: x + width/2 - handleSize/2, y: y - handleSize/2, w: handleSize, h: handleSize }, // top
            { x: x + width - handleSize/2, y: y - handleSize/2, w: handleSize, h: handleSize }, // top-right
            { x: x + width - handleSize/2, y: y + height/2 - handleSize/2, w: handleSize, h: handleSize }, // right
            { x: x + width - handleSize/2, y: y + height - handleSize/2, w: handleSize, h: handleSize }, // bottom-right
            { x: x + width/2 - handleSize/2, y: y + height - handleSize/2, w: handleSize, h: handleSize }, // bottom
            { x: x - handleSize/2, y: y + height - handleSize/2, w: handleSize, h: handleSize }, // bottom-left
            { x: x - handleSize/2, y: y + height/2 - handleSize/2, w: handleSize, h: handleSize } // left
          ];
          handles.forEach(h => {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1 / zoom;
            ctx.fillRect(h.x, h.y, h.w, h.h);
            ctx.strokeRect(h.x, h.y, h.w, h.h);
          });
        }
      } else if (ann.type === 'polygon' || ann.type === 'brush') {
        const points = ann.points || ann.coordinates.points;
        if (points && points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          if (ann.type === 'polygon') ctx.closePath();
          ctx.stroke();

          ctx.globalAlpha = 0.2;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1.0;

          if (isSelected) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([5 / zoom, 5 / zoom]);

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            points.forEach(p => {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            });
            ctx.strokeRect(minX - 5 / zoom, minY - 5 / zoom, (maxX - minX) + 10 / zoom, (maxY - minY) + 10 / zoom);
            ctx.setLineDash([]);
          }
        }
      }
    });

    ctx.restore();
  }, [annotations, selectedAnnotationIndex, zoom, panX, panY]);

  // Context menu drag handlers
  useEffect(() => {
    const handleContextMenuMouseMove = (e) => {
      if (isDraggingContextMenu && contextMenu) {
        setContextMenu({
          ...contextMenu,
          x: e.clientX - contextMenuDragOffset.x,
          y: e.clientY - contextMenuDragOffset.y
        });
      }
    };

    const handleContextMenuMouseUp = () => {
      setIsDraggingContextMenu(false);
    };

    if (isDraggingContextMenu) {
      window.addEventListener('mousemove', handleContextMenuMouseMove);
      window.addEventListener('mouseup', handleContextMenuMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleContextMenuMouseMove);
        window.removeEventListener('mouseup', handleContextMenuMouseUp);
      };
    }
  }, [isDraggingContextMenu, contextMenuDragOffset, contextMenu]);

  // Toolbar drag handlers
  const handleToolbarMouseDown = (e) => {
    // Only start drag if clicking on the header/drag handle area (not on buttons/inputs)
    const target = e.target;
    const isHeader = target.closest('.toolbar-header');
    const isDragHandle = target.closest('.toolbar-drag-handle');
    const isButton = target.tagName === 'BUTTON' || target.closest('button');
    const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.closest('input, select');
    
    if ((isHeader || isDragHandle) && !isButton && !isInput) {
      setIsDraggingToolbar(true);
      setToolbarDragOffset({
        x: e.clientX - toolbarPosition.x,
        y: e.clientY - toolbarPosition.y
      });
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const handleToolbarMouseMove = (e) => {
      if (isDraggingToolbar) {
        setToolbarPosition({
          x: e.clientX - toolbarDragOffset.x,
          y: e.clientY - toolbarDragOffset.y
        });
      }
    };

    const handleToolbarMouseUp = () => {
      setIsDraggingToolbar(false);
    };

    if (isDraggingToolbar) {
      window.addEventListener('mousemove', handleToolbarMouseMove);
      window.addEventListener('mouseup', handleToolbarMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleToolbarMouseMove);
        window.removeEventListener('mouseup', handleToolbarMouseUp);
      };
    }
  }, [isDraggingToolbar, toolbarDragOffset]);

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas || !selectedImage || !imageObj) return;

    const rect = canvas.getBoundingClientRect();
    // Mouse position relative to canvas display area
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    
    // Convert to canvas internal coordinates (account for CSS scaling)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = displayX * scaleX;
    const canvasY = displayY * scaleY;

    // Get the point in image coordinates before zoom
    const imageX = (canvasX - panX) / zoom;
    const imageY = (canvasY - panY) / zoom;

    // Calculate new zoom (deltaY > 0 means scroll down = zoom out)
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom * delta));

    // Adjust pan to keep the same image point under the cursor
    const newPanX = displayX - imageX * newZoom;
    const newPanY = displayY - imageY * newZoom;

    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  }, [selectedImage, zoom, panX, panY, imageObj]);

  useEffect(() => {
    // Use requestAnimationFrame to ensure canvas is ready and state is updated
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const wrapper = canvasWrapperRef.current;
      
      if (!canvas || !wrapper) {
        return;
      }
      
      // Ensure canvas has same dimensions as wrapper (viewport)
      const wrapperRect = wrapper.getBoundingClientRect();
      if (canvas.width !== wrapperRect.width || canvas.height !== wrapperRect.height) {
        console.log('Syncing canvas dimensions to wrapper', {
          canvas: { width: canvas.width, height: canvas.height },
          wrapper: { width: wrapperRect.width, height: wrapperRect.height },
          annotationCount: annotations.length
        });
        // Setting canvas.width/height clears the canvas, so we need to redraw after
        canvas.width = wrapperRect.width;
        canvas.height = wrapperRect.height;
      }
      
      // Always redraw everything (image and annotations) when state changes
      if (canvas.width > 0 && canvas.height > 0 && imageObj) {
        redrawCanvas();
      }
    });
  }, [annotations, selectedAnnotationIndex, zoom, panX, panY, imageObj, redrawCanvas]);

  // Add wheel event listener to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add wheel event listener to canvas
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Extract unique classes from annotations
  const extractClassesFromAnnotations = (anns) => {
    const uniqueClasses = new Set();
    anns.forEach(ann => {
      if (ann.class) {
        uniqueClasses.add(ann.class);
      }
    });
    return Array.from(uniqueClasses).sort();
  };

  // Update classes when annotations change - merge with manually added classes
  useEffect(() => {
    const extractedClasses = extractClassesFromAnnotations(annotations);
    // Merge extracted classes with manually added classes
    const allClasses = new Set([...extractedClasses, ...manualClasses]);
    const mergedClasses = Array.from(allClasses).sort();
    
    if (mergedClasses.length > 0) {
      setClasses(mergedClasses);
      // Set current class to first available if current class is not in the list
      setCurrentClass(prevClass => {
        if (mergedClasses.includes(prevClass)) {
          return prevClass;
        }
        return mergedClasses[0];
      });
    } else if (manualClasses.size > 0) {
      // If no extracted classes but manual classes exist, use those
      const manualClassesArray = Array.from(manualClasses).sort();
      setClasses(manualClassesArray);
      setCurrentClass(manualClassesArray[0]);
    } else {
      // If no classes found, set a default
      setClasses(['object']);
      setCurrentClass('object');
    }
  }, [annotations, manualClasses]);

  // Actions
  const handleAddClass = () => {
    const trimmedName = newClassName.trim();
    if (trimmedName && !classes.includes(trimmedName)) {
      // Add to manual classes set
      setManualClasses(prev => new Set([...prev, trimmedName]));
      // Update classes array immediately
      const updatedClasses = [...classes, trimmedName].sort();
      setClasses(updatedClasses);
      setCurrentClass(trimmedName);
      setNewClassName('');
    }
  };

  const saveEditedAnnotation = async (annotation) => {
    if (!annotation || !annotation.id) return; // Safety check
  
    const token = localStorage.getItem('token');
  
    const coords =
      annotation.type === 'bbox'
        ? annotation.coordinates
        : { points: annotation.points };
  
    try {
      await fetch(`http://localhost:8000/api/annotations/${annotation.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          class_name: annotation.class,
          annotation_type: annotation.type,
          coordinates: coords
        }),
      });
  
      console.log("Annotation updated:", annotation.id);
    } catch (error) {
      console.error("Error updating annotation:", error);
    }
  };
  

  const handleDeleteAnnotation = async () => {
    if (selectedAnnotationIndex === null) return;
    
    const annotationToDelete = annotations[selectedAnnotationIndex];
    if (!annotationToDelete) return;

    // Delete from database if it has an ID
    if (annotationToDelete.id && selectedImage) {
      try {
        const response = await fetch(`http://localhost:8000/api/annotations/${annotationToDelete.id}`, {
          method: 'DELETE'
        });
        if (!response.ok) {
          console.error('Failed to delete annotation from database');
          alert('Failed to delete annotation from database');
          return;
        }
        console.log(`[DELETE] Successfully deleted annotation ID ${annotationToDelete.id}`);
      } catch (error) {
        console.error('Error deleting annotation:', error);
        alert('Error deleting annotation from database');
        return;
      }
    }

    // Remove from local state
    setAnnotations(prev => prev.filter((_, i) => i !== selectedAnnotationIndex));
    setSelectedAnnotationIndex(null);
    setContextMenu(null);
    setAnnotationsSaved(true); // Mark as saved since we've synced with database
    
    // Notify parent component to reload annotations list
    if (onAnnotationDeleted) {
      onAnnotationDeleted();
    }
  };

  const handleCrop = () => {
    if (selectedAnnotationIndex === null || !selectedImage || !imageObj) return;
    const ann = annotations[selectedAnnotationIndex];
    if (ann.type !== 'bbox') return;

    const { x, y, width, height } = ann.coordinates;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Draw the cropped portion from the image object directly
    ctx.drawImage(imageObj, x, y, width, height, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `crop_${ann.class}_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    setContextMenu(null);
  };

  const handleContextClassChange = (newClass) => {
    if (selectedAnnotationIndex === null) return;

    const updatedAnnotations = [...annotations];
    const currentAnn = updatedAnnotations[selectedAnnotationIndex];
    updatedAnnotations[selectedAnnotationIndex] = {
      ...currentAnn,
      id: currentAnn.id, // Explicitly preserve ID
      class: newClass
    };

    setAnnotations(updatedAnnotations);
    setAnnotationsSaved(false);
  };

  const handleCoordinateChange = (key, value) => {
    if (selectedAnnotationIndex === null) return;
    const ann = annotations[selectedAnnotationIndex];
    if (ann.type !== 'bbox') return;

    const updatedAnnotations = [...annotations];
    updatedAnnotations[selectedAnnotationIndex] = {
      ...ann,
      id: ann.id, // Explicitly preserve ID
      coordinates: {
        ...ann.coordinates,
        [key]: parseFloat(value) || 0
      }
    };
    setAnnotations(updatedAnnotations);
    setAnnotationsSaved(false);
  };

  // Auto detection
  const runDetection = async (imageToUse = null) => {
    let img = imageToUse || selectedImage;
    
    // If selectedImage doesn't have filepath, try to get it from images array
    if (!img || (!img.filepath && !img.path && !img.url && !img.file_path)) {
      if (images && images.length > 0 && currentImageIndex >= 0 && currentImageIndex < images.length) {
        img = images[currentImageIndex];
      }
    }
    
    if (!img) {
      if (!imageToUse) {
        alert('Please select an image from the gallery first');
      }
      return;
    }

    // Check if image has filepath - try different possible property names
    const filepath = img.filepath || img.path || img.url || img.file_path;
    if (!filepath) {
      console.error("Cannot run detection: Image has no filepath", img);
      console.error("Available properties:", Object.keys(img));
      console.error("Current image index:", currentImageIndex);
      console.error("Images array:", images);
      alert('Cannot run detection: Image file path is missing. Please ensure the image was uploaded correctly.');
      return;
    }

    setLoading(true);

    try {
      const form = new FormData();
      const normalizedPath = normalizeFilePath(filepath);
      if (!normalizedPath) {
        throw new Error("Invalid filepath");
      }

      // Always fetch the image file and send it as upload
      const imageUrl = `http://localhost:8000/uploads/${normalizedPath}`;
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const blob = await response.blob();
      const filename = img.filename || img.file_name || normalizedPath.split('/').pop() || 'image.jpg';
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      form.append('file', file, filename);

      const resp = await fetch('http://localhost:8000/api/docs/predict', {
        method: 'POST',
        headers: { 'X-Requested-From': 'docs-annotation' },
        body: form
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        let errorDetail = 'Unknown error';
        try {
          const err = JSON.parse(errorText);
          errorDetail = err.detail || err.message || resp.statusText;
        } catch {
          errorDetail = errorText || resp.statusText;
        }
        console.error('Detection error:', errorDetail);
        // Don't show alert for auto-detection failures, just log
        if (imageToUse) {
          console.warn('Auto-detection failed, continuing without annotations');
        } else {
          alert('Detection error: ' + errorDetail);
        }
        return;
      }

      const data = await resp.json();
      setDetectionResult(data);

      if (data.success && data.boxes && data.boxes.length > 0) {
        const newAnnotations = data.boxes.map(box => {
          const [x, y, w, h, confidence, classId, className] = box;
          return {
            type: 'bbox',
            class: className || 'object',
            coordinates: { x, y, width: w, height: h },
            confidence: confidence
          };
        });

        setAnnotations(newAnnotations);
        setAnnotationsSaved(false);
        
        // Don't draw immediately here - let the useEffect handle it
        // The useEffect will redraw when annotations state updates
        // This avoids race conditions and ensures consistent drawing
      } else {
        // Don't show alert for auto-detection when no objects found
        if (!imageToUse) {
          alert('No objects detected.');
        }
      }
    } catch (err) {
      console.error('Detection request failed', err);
      // Don't show alert for auto-detection failures
      if (!imageToUse) {
        alert('Detection request failed: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveAnnotations = async (silent = false) => {
    if (!onSaveAnnotations || isSaving) return; // Prevent concurrent saves

    setIsSaving(true);
    setAnnotationsSaved(true); // Set to true immediately to prevent auto-save during save

    const payload = annotations.map(ann => {
      // Debug: log annotation being saved
      if (ann.id) {
        console.log(`Saving annotation with ID ${ann.id} (UPDATE)`);
      } else {
        console.log(`Saving annotation without ID (CREATE)`, ann);
      }
      return {
        id: ann.id, // Include ID if it exists (for updates)
        class: ann.class,
        type: ann.type,
        annotation_type: ann.type,
        coordinates: ann.coordinates
      };
    });

    try {
      await onSaveAnnotations(payload);
      
      // Only reload if there are annotations without IDs (newly created ones)
      // This prevents unnecessary reloads that could cause duplicates
      const hasNewAnnotations = annotations.some(ann => !ann.id);
      if (hasNewAnnotations) {
        // Reload annotations to get updated IDs for newly created ones
        // Reload immediately without delay
        if (selectedImage && !isSaving) {
          await loadExistingAnnotations(selectedImage, true);
        }
      }
      
      if (!silent) alert('Annotations saved successfully!');
    } catch (error) {
      console.error('Save failed:', error);
      setAnnotationsSaved(false); // Reset if save failed
      if (!silent) alert('Failed to save annotations.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    saveAnnotations(false);
  };

  // Auto-save effect - only save if there are unsaved changes
  // Removed setTimeout - save immediately when annotations change
  useEffect(() => {
    if (annotations.length === 0 || annotationsSaved || isSaving) return;

    // Double-check we're not already saving before triggering save
    if (!isSaving) {
      saveAnnotations(true);
    }
  }, [annotations, annotationsSaved, isSaving]);

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
        <div className="welcome-screen ssf" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh', 
          width: '100%',
          padding: '40px',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1,
          background: '#1a1a2e'
        }}>
          <div className="welcome-icon">
            <img src={RoboSpectraLogo} alt="Product Logo" style={{ height: '100px', width: 'auto' }} />
          </div>
          <div className="welcome-title">Welcome to RoboSpectra</div>
          <div className="welcome-subtitle">Professional Image Annotation Platform</div>
          <button 
            className="btn btn-primary" 
            onClick={() => onOpenProjectModal && onOpenProjectModal()} 
            style={{ fontSize: '16px', padding: '16px', marginTop: '20px' }}
          >
            Create Your Project
          </button>
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
            <button
                onClick={runDetection}
                disabled={!selectedImage || loading}
                style={{
                  ...styles.actionBtn,
                  background: loading ? '#ccc' : '#17a2b8',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? '⏳ ...' : '▶️ Auto Detect'}
            </button>
          </div>

          <div style={styles.mainLayout}>
            {/* Toolbar - Draggable Popup */}
            <div
              style={{
                ...styles.toolbarPopup,
                left: `${toolbarPosition.x}px`,
                top: `${toolbarPosition.y}px`,
                cursor: isDraggingToolbar ? 'grabbing' : 'default'
              }}
              onMouseDown={handleToolbarMouseDown}
            >
              <div 
                className="toolbar-header" 
                style={{
                  ...styles.toolbarHeader,
                  background: isDraggingToolbar ? '#2a2a3e' : '#1a1a2e',
                  cursor: isDraggingToolbar ? 'grabbing' : 'grab'
                }}
              >
                <span style={styles.toolbarHeaderTitle}>🛠️ Tools Panel</span>
                <span 
                  style={{
                    ...styles.toolbarDragHandle,
                    color: isDraggingToolbar ? '#fff' : '#888'
                  }} 
                  className="toolbar-drag-handle"
                  title="Drag to move"
                >
                  ⋮⋮
                </span>
              </div>
              <div style={styles.toolbarContent} className="toolbar-content">
                <h4 style={styles.toolTitle}>Tools</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'select', label: '👆 Select' },
                    { id: 'box', label: '⬜ Box' },
                    { id: 'polygon', label: '🔷 Polygon' },
                    { id: 'brush', label: '🖌️ Brush' }
                  ].map(tool => (
                    <button
                      key={tool.id}
                      className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                      onClick={() => setActiveTool(tool.id)}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>

              <hr style={styles.divider} />

              <h4 style={styles.toolTitle}>Classes</h4>
              <select
                style={styles.select}
                value={currentClass}
                onChange={(e) => setCurrentClass(e.target.value)}
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={styles.addClassRow}>
                <input
                  style={styles.input}
                  placeholder="New Class"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddClass()}
                />
                <button style={styles.addBtn} className="add-btn" onClick={handleAddClass}>+</button>
              </div>

              {selectedAnnotationIndex !== null && (
                <div style={styles.selectedInfo}>
                  <h4 style={styles.toolTitle}>Selected Item</h4>
                  <div style={styles.selectedControl}>
                    <label style={styles.label}>Class:</label>
                    <select
                      style={styles.select}
                      value={annotations[selectedAnnotationIndex]?.class || ''}
                      onChange={(e) => handleContextClassChange(e.target.value)}
                    >
                      {classes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {annotations[selectedAnnotationIndex]?.type === 'bbox' && (
                    <div style={styles.selectedControl}>
                      <label style={styles.label}>Coordinates:</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>X</span>
                          <input
                            type="number"
                            style={{...styles.input, padding: '8px 10px', fontSize: '13px'}}
                            value={Math.round(annotations[selectedAnnotationIndex].coordinates.x)}
                            onChange={(e) => handleCoordinateChange('x', e.target.value)}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Y</span>
                          <input
                            type="number"
                            style={{...styles.input, padding: '8px 10px', fontSize: '13px'}}
                            value={Math.round(annotations[selectedAnnotationIndex].coordinates.y)}
                            onChange={(e) => handleCoordinateChange('y', e.target.value)}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>W</span>
                          <input
                            type="number"
                            style={{...styles.input, padding: '8px 10px', fontSize: '13px'}}
                            value={Math.round(annotations[selectedAnnotationIndex].coordinates.width)}
                            onChange={(e) => handleCoordinateChange('width', e.target.value)}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>H</span>
                          <input
                            type="number"
                            style={{...styles.input, padding: '8px 10px', fontSize: '13px'}}
                            value={Math.round(annotations[selectedAnnotationIndex].coordinates.height)}
                            onChange={(e) => handleCoordinateChange('height', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={styles.actionButtons}>
                    <button
                      style={{ 
                        ...styles.actionBtn, 
                        background: 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)',
                        fontSize: '12px'
                      }}
                      onClick={handleCrop}
                      onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                      onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                      ✂️ Crop & Save
                    </button>
                    <button
                      style={{ 
                        ...styles.actionBtn, 
                        background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                        fontSize: '12px'
                      }}
                      onClick={handleDeleteAnnotation}
                      onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                      onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Canvas Area - Full Screen */}
            <div 
              style={styles.canvasContainer}
              onWheel={handleWheel}
            >
              {selectedImage ? (
                <div style={styles.canvasWrapper} ref={canvasWrapperRef}>
                  <canvas
                    className="img-canvas docs-annotation-canvas"
                    ref={canvasRef}
                    style={{
                      display: 'block',
                      cursor: activeTool === 'select' ? 'grab' : 'crosshair',
                      pointerEvents: 'auto',
                      width: '100%',
                      height: '100%',
                      background: '#1a1a2e'
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onDoubleClick={handleDoubleClick}
                  ></canvas>

                  {/* Context Menu */}
                  {contextMenu && (
                    <div style={{
                      ...styles.contextMenu,
                      left: contextMenu.x,
                      top: contextMenu.y,
                      cursor: isDraggingContextMenu ? 'grabbing' : 'default'
                    }}
                    onMouseDown={(e) => {
                      // Only start drag if clicking on the header
                      const target = e.target;
                      const isHeader = target.closest('.context-menu-header') || target.classList.contains('context-menu-header');
                      const isButton = target.tagName === 'BUTTON' || target.closest('button');
                      const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.closest('input, select');
                      
                      if (isHeader && !isButton && !isInput) {
                        setIsDraggingContextMenu(true);
                        setContextMenuDragOffset({
                          x: e.clientX - contextMenu.x,
                          y: e.clientY - contextMenu.y
                        });
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    >
                      <div 
                        className="context-menu-header"
                        style={{
                          ...styles.contextHeader,
                          cursor: 'grab',
                          userSelect: 'none'
                        }}
                      >Annotation Actions</div>
                      <button style={styles.contextBtn} onClick={handleCrop}>✂️ Crop Image</button>
                      <div style={styles.contextDivider}></div>
                      <div style={styles.contextLabel}>Change Class:</div>
                      <select
                        style={styles.contextSelect}
                        value={annotations[contextMenu.index]?.class || ''}
                        onChange={(e) => handleContextClassChange(e.target.value)}
                      >
                        {classes.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>

                      <div style={{ ...styles.contextLabel, marginTop: '8px' }}>Create Class:</div>
                      <div style={{ position: 'relative', marginBottom: '8px' }}>
                        <input
                          style={styles.contextInput}
                          value={contextNewClass}
                          onChange={(e) => setContextNewClass(e.target.value)}
                          placeholder="New class"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && contextNewClass) {
                              if (!classes.includes(contextNewClass)) {
                                setClasses([...classes, contextNewClass]);
                              }
                              handleContextClassChange(contextNewClass);
                              setContextNewClass('');
                            }
                          }}
                        />
                        <button
                          style={{ ...styles.contextAddBtn, position: 'absolute', right: '0', top: '0' }}
                          onClick={() => {
                            if (contextNewClass) {
                              if (!classes.includes(contextNewClass)) {
                                setClasses([...classes, contextNewClass]);
                              }
                              handleContextClassChange(contextNewClass);
                              setContextNewClass('');
                            }
                          }}
                        >+</button>
                      </div>
                      <button
                        style={{ ...styles.contextBtn, color: '#ff6b6b' }}
                        onClick={() => {
                          handleDeleteAnnotation();
                          setContextMenu(null);
                        }}
                      >
                        🗑️ Delete
                      </button>
                      <button
                        style={styles.closeBtn}
                        onClick={() => setContextMenu(null)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={styles.emptyState}>Select an image to start annotating</div>
              )}
            </div>

            {/* Right Panel: Image List */}
            {/* <div style={styles.rightPanel}>
              <h4 style={styles.sectionTitle}>Images ({images.length})</h4>
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
            </div> */}
          </div>
        </>
      )}
    </div>
  );
};

// Styling
const styles = {
  container: {
    padding: "0",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    fontFamily: "Arial, sans-serif",
    background: "#1a1a2e",
    color: "#e0e0e0",
    width: "100%",
    overflow: "hidden",
    position: "relative"
  },
  canvasToolbar: {
    background: "#1a1a2e",
    padding: "15px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #2a2a3e",
    flexShrink: 0
  },
  toolbarLeft: {
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
  mainLayout: {
    display: 'flex',
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    marginTop: '0',
    width: '100%',
    height: '100%'
  },
  toolbarPopup: {
    position: 'fixed',
    width: '280px',
    background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    maxHeight: '85vh',
    overflow: 'hidden',
    pointerEvents: 'auto',
  },
  toolbarHeader: {
    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
    padding: '14px 18px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'grab',
    userSelect: 'none',
    transition: 'all 0.3s ease',
    borderRadius: '16px 16px 0 0'
  },
  toolbarHeaderTitle: {
    color: '#fff',
    fontSize: '15px',
    fontWeight: '700',
    pointerEvents: 'none',
    letterSpacing: '0.3px',
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
  },
  toolbarDragHandle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '20px',
    cursor: 'grab',
    userSelect: 'none',
    lineHeight: '1',
    padding: '4px 8px',
    transition: 'all 0.2s ease',
    borderRadius: '6px'
  },
  toolbarContent: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
    maxHeight: 'calc(85vh - 60px)',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent'
  },
  toolbar: {
    width: '200px',
    background: '#16213e',
    padding: '15px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto'
  },
  toolTitle: {
    margin: '0 0 12px 0',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '1.2px',
    fontWeight: '600'
  },
  toolBtn: {
    padding: '10px',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '14px',
    transition: 'all 0.2s'
  },
  select: {
    padding: '10px 35px 10px 12px', // Add right padding for arrow
    borderRadius: '10px',
    background: 'rgba(15, 22, 36, 0.6)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e"), rgba(15, 22, 36, 0.6)',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '16px 16px, 100% 100%'
  },
  addClassRow: {
    position: 'relative',
    gap: '5px',
    display: 'flex',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '10px',
    background: 'rgba(15, 22, 36, 0.6)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    outline: 'none'
  },
  addBtn: {
    position: 'absolute',
    right: '4px',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '8px 14px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
  },
  divider: {
    border: 'none',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    margin: '8px 0',
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)'
  },
  actionBtn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '10px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
  },
  info: {
    marginTop: '10px',
    padding: '10px',
    background: '#0f1624',
    borderRadius: '4px'
  },
  infoText: {
    margin: '5px 0',
    fontSize: '12px',
    color: '#aaa'
  },
  canvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, #0a0e1a 0%, #0f1624 100%)',
    borderRadius: '0',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'auto',
    position: 'relative',
    cursor: 'default',
    padding: '20px',
    margin: 0,
    minWidth: 0,
    minHeight: 0
  },
  canvasWrapper: {
    position: "relative",
    display: "inline-block",
    minWidth: '100%',
    minHeight: '100%',
    width: 'fit-content',
    height: 'fit-content'
  },
  canvas: {
    display: "block",
    width: 'auto',
    height: 'auto'
  },
  rightPanel: {
    width: '150px',
    background: '#16213e',
    padding: '15px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column'
  },
  sectionTitle: {
    margin: "0 0 15px 0",
    color: "#fff",
    fontSize: "16px"
  },
  imageGallery: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    overflowY: "auto",
    flex: 1
  },
  imageThumb: {
    position: "relative",
    width: "100%",
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
  emptyState: {
    padding: "40px",
    textAlign: "center",
    color: "#888",
    fontSize: "16px"
  },
  selectedInfo: {
    marginTop: '15px',
    padding: '16px',
    background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.1) 0%, rgba(102, 126, 234, 0.1) 100%)',
    borderRadius: '12px',
    border: '1px solid rgba(78, 205, 196, 0.3)',
    boxShadow: '0 4px 16px rgba(78, 205, 196, 0.2)',
    backdropFilter: 'blur(10px)'
  },
  selectedControl: {
    marginBottom: '14px'
  },
  label: {
    display: 'block',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: '6px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px'
  },
  contextMenu: {
    position: 'fixed',
    background: 'rgba(22, 33, 62, 0.95)',
    border: '1px solid #4ECDC4',
    borderRadius: '8px',
    padding: '12px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
    minWidth: '150px',
    backdropFilter: 'blur(5px)'
  },
  contextHeader: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  contextBtn: {
    padding: '8px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '13px',
    transition: 'all 0.2s'
  },
  contextSelect: {
    padding: '6px',
    borderRadius: '4px',
    background: '#0f1624',
    color: 'white',
    border: '1px solid #333',
    fontSize: '13px'
  },
  contextInput: {
    flex: 1,
    padding: '6px',
    borderRadius: '4px',
    background: '#0f1624',
    color: 'white',
    border: '1px solid #333',
    fontSize: '12px',
    minWidth: '0'
  },
  contextAddBtn: {
    padding: '6px 10px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '1'
  },
  contextDivider: {
    height: '1px',
    background: '#333',
    margin: '4px 0'
  },
  contextLabel: {
    fontSize: '12px',
    color: '#aaa'
  },
  closeBtn: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '12px'
  }
};

export default DocsAnnotation;