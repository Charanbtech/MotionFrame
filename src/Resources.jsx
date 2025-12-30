import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import RoboSpectraLogo from './assets/Robot.svg';
import './Resources.css';
import './style.scss';
import AIAnnotation from './AIAnnotation/AIannotation';
import DocsAnnotation from './AIAnnotation/DocsAnnotation';

const Resources = () => {
  const navigate = useNavigate();
  const { user, authToken } = useAuth();
  // Global state
  const [currentProject, setCurrentProject] = useState(null);
  const [currentImage, setCurrentImage] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [images, setImages] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [classes, setClasses] = useState([]);
  const [currentClass, setCurrentClass] = useState(null);
  const [currentTool, setCurrentTool] = useState('select');
  const [brushSize, setBrushSize] = useState(10);

  // Canvas state
  const canvasRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  const [currentAnnotation, setCurrentAnnotation] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [polygonMousePos, setPolygonMousePos] = useState({ x: 0, y: 0 });
  const [brushPoints, setBrushPoints] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [imageObj, setImageObj] = useState(null);
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState(-1);
  const [docsAnnotationReloadTrigger, setDocsAnnotationReloadTrigger] = useState(0);

  // Modal states
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showProjectListModal, setShowProjectListModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAssignedFilesModal, setShowAssignedFilesModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showPolygonTooltip, setShowPolygonTooltip] = useState(false);
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [projectMode, setProjectMode] = useState('create-project'); // 'create-project' or 'assigned-files'
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  
  // PDF pages state (for displaying converted PDF pages)
  const [uploadedPdfPages, setUploadedPdfPages] = useState([]);
  
  // Assigned files states
  const [assignedFiles, setAssignedFiles] = useState([]);
  const [selectedAssignedFiles, setSelectedAssignedFiles] = useState(new Set());
  const [expandedProjectFolders, setExpandedProjectFolders] = useState(new Set());
  const [assignedFilesByProject, setAssignedFilesByProject] = useState({});
  const [selectedProjectFolders, setSelectedProjectFolders] = useState(new Set()); // Track selected folders
  const [filesQueue, setFilesQueue] = useState([]); // Queue of files to add to project
  const [newClassName, setNewClassName] = useState('');
  const [selectedClassColor, setSelectedClassColor] = useState('#FF6B6B');
  const [classColors, setClassColors] = useState({}); // Store custom colors for classes
  const [pendingAnnotation, setPendingAnnotation] = useState(null); // Annotation waiting for class selection
  const [pendingClassSelection, setPendingClassSelection] = useState(''); // Selected class in modal
  const [classPanelPosition, setClassPanelPosition] = useState({ x: 20, y: 100 }); // Position of class selection panel
  const [isDraggingClassPanel, setIsDraggingClassPanel] = useState(false);
  const [classPanelDragOffset, setClassPanelDragOffset] = useState({ x: 0, y: 0 });

  // Form states
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState('object-detection');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectClasses, setProjectClasses] = useState('');
  const [exportFormat, setExportFormat] = useState('yolov8');

  // Upload states
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  // Project list
  const [projectList, setProjectList] = useState([]);

  const colorPalette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

  // Helper function to normalize filepath for URLs (replace backslashes with forward slashes)
  const normalizeFilePath = (filepath) => {
    if (!filepath) return '';
    return filepath.replace(/\\/g, '/');
  };
console.log(authToken);
  // Autosave function to save any unsaved annotations before refresh
  const autosaveUnsavedAnnotations = () => {
    if (!currentProject || !currentImage) return;

    try {
      // Save current annotation if exists and is valid
      if (currentAnnotation) {
        if (currentAnnotation.type === 'bbox' &&
          Math.abs(currentAnnotation.width) > 5 &&
          Math.abs(currentAnnotation.height) > 5) {
          // Save bbox annotation with keepalive for reliable saving on page unload
          const coords = {
            x: currentAnnotation.x,
            y: currentAnnotation.y,
            width: currentAnnotation.width,
            height: currentAnnotation.height
          };
          const token = authToken || localStorage.getItem('token');
          fetch('http://localhost:8000/api/annotations', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              image_id: currentImage.id,
              class_name: currentAnnotation.class,
              annotation_type: currentAnnotation.type,
              coordinates: coords
            }),
            keepalive: true
          }).catch(err => console.error('Error autosaving bbox:', err));
        } else if (currentAnnotation.type === 'brush' &&
          currentAnnotation.points &&
          currentAnnotation.points.length > 5) {
          // Save brush annotation with keepalive
          const coords = {
            points: currentAnnotation.points,
            brushSize: currentAnnotation.brushSize || 10
          };
          const token = authToken || localStorage.getItem('token');
          fetch('http://localhost:8000/api/annotations', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              image_id: currentImage.id,
              class_name: currentAnnotation.class,
              annotation_type: currentAnnotation.type,
              coordinates: coords
            }),
            keepalive: true
          }).catch(err => console.error('Error autosaving brush:', err));
        }
      }

      // Save polygon if it has 3+ points
      if (currentTool === 'polygon' && polygonPoints.length >= 3 && currentClass) {
        // Save polygon annotation with keepalive
        const token = authToken || localStorage.getItem('token');
        fetch('http://localhost:8000/api/annotations', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            image_id: currentImage.id,
            class_name: currentClass,
            annotation_type: 'polygon',
            coordinates: { points: polygonPoints }
          }),
          keepalive: true
        }).catch(err => console.error('Error autosaving polygon:', err));
      }
    } catch (error) {
      console.error('Error autosaving annotations:', error);
    }
  };

  useEffect(() => {
    initializeCanvas();

    // Clear localStorage on mount to prevent auto-loading projects
    localStorage.removeItem('lastProjectId');

    // Autosave on page visibility change (refresh, tab switch, etc.)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && currentProject && currentImage) {
        if (currentAnnotation || (currentTool === 'polygon' && polygonPoints.length >= 3)) {
          // Use sendBeacon or fetch with keepalive for reliable autosave
          autosaveUnsavedAnnotations();
        }
      }
    };

    // Also handle beforeunload for page refresh
    const handleBeforeUnload = (e) => {
      if (currentProject && currentImage) {
        if (currentAnnotation || (currentTool === 'polygon' && polygonPoints.length >= 3)) {
          // Trigger autosave synchronously
          autosaveUnsavedAnnotations();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Track Space key for panning
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setIsSpacePressed(true);
        const canvas = canvasRef.current;
        if (canvas && imageObj) {
          canvas.style.cursor = 'grab';
        }
        return;
      }

      switch (e.key) {
        case 'v': case 'V': selectTool('select'); break;
        case 'b': case 'B': selectTool('bbox'); break;
        case 'p': case 'P': selectTool('polygon'); break;
        case 'r': case 'R': selectTool('brush'); break;
        case 'Delete': case 'Backspace':
          e.preventDefault();
          if (selectedAnnotationIndex >= 0) {
            deleteAnnotation(selectedAnnotationIndex);
          }
          break;
        case 'd': case 'D':
          // Ctrl+D or Cmd+D to delete selected annotation
          if ((e.ctrlKey || e.metaKey) && selectedAnnotationIndex >= 0) {
            e.preventDefault();
            deleteAnnotation(selectedAnnotationIndex);
          }
          break;
        case 'ArrowRight': nextImage(); break;
        case 'ArrowLeft': prevImage(); break;
        case 'Escape':
          if (currentTool === 'polygon' && polygonPoints.length > 0) {
            setPolygonPoints([]);
            setPolygonMousePos({ x: 0, y: 0 });
            redrawCanvas();
          }
          break;
      }
    };

    const handleKeyUp = (e) => {
      // Track Space key release
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setIsSpacePressed(false);
        const canvas = canvasRef.current;
        if (canvas && !isPanning) {
          if (currentTool === 'select' && imageObj) {
            canvas.style.cursor = 'grab';
          } else {
            canvas.style.cursor = 'crosshair';
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentProject, currentImage, currentAnnotation, polygonPoints, currentTool, currentClass]);

  // Redraw canvas when class changes to ensure annotations are visible
  useEffect(() => {
    if (currentClass && currentImage) {
      // Small delay to ensure state is updated
      const timer = setTimeout(() => {
        redrawCanvas();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentClass]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showClassDropdown && !event.target.closest('.class-dropdown-btn') && !event.target.closest('.class-dropdown-menu')) {
        setShowClassDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showClassDropdown]);

  // Close project dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProjectDropdown && !event.target.closest('[data-project-dropdown]')) {
        setShowProjectDropdown(false);
      }
    };

    if (showProjectDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showProjectDropdown]);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
  };

  const handleResize = () => {
    const canvas = canvasRef.current;
    const wrapper = canvasWrapperRef.current;
    if (!canvas || !wrapper) return;

    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    redrawCanvas();
  };

  const updateBrushSize = (value) => {
    setBrushSize(parseInt(value));
  };

  const handleMouseDown = async (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / zoom;
    const y = (e.clientY - rect.top - panY) / zoom;

    // Only allow panning with left-click + drag for select tool or when space is pressed
    // Box, Polygon, and Brush tools should not allow panning
    const shouldPan = isSpacePressed || (currentTool === 'select' && imageObj);
    
    if (shouldPan && imageObj) {
      // Start panning
        setIsPanning(true);
        setPanStartX(e.clientX - panX);
        setPanStartY(e.clientY - panY);
        setStartX(e.clientX); // Store initial mouse position to detect drag
        setStartY(e.clientY);
        canvas.style.cursor = 'grabbing';
      return;
      }

    if (currentTool === 'select') {
      // If not panning, select annotation on click
      selectAnnotationAt(x, y);
      return;
    }

    if (!currentImage) {
      showToastMessage('⚠️ Please select an image first');
      return;
    }

    // Prevent drawing new annotations if there's a pending one waiting for class selection
    if (pendingAnnotation) {
      showToastMessage('⚠️ Please select a class for the previous annotation first');
      return;
    }

    // If no class is selected, show class selection modal first
    if (!currentClass && classes.length > 0) {
      // Show modal to select class before starting to draw
      setPendingAnnotation({ type: 'pre-draw', tool: currentTool }); // Special marker for pre-draw
      setPendingClassSelection(classes[0]);
      return;
    }

    if (!currentClass) {
      showToastMessage('⚠️ Please add a class first');
      return;
    }

    setIsDrawing(true);
    setStartX(x);
    setStartY(y);

    if (currentTool === 'bbox') {
      setCurrentAnnotation({
        type: 'bbox',
        class: currentClass,
        x: x,
        y: y,
        width: 0,
        height: 0
      });
    } else if (currentTool === 'polygon') {
      // Add point to polygon (don't replace, append) - format: [[x, y], [x, y], ...]
      // Note: Class changes are handled in selectClass, which will finalize any in-progress polygon
      setPolygonPoints(prev => [...prev, [x, y]]);
      setPolygonMousePos({ x, y }); // Update mouse position
      redrawCanvas();
    } else if (currentTool === 'brush') {
      setBrushPoints([{ x, y }]);
      setCurrentAnnotation({
        type: 'brush',
        class: currentClass,
        points: [{ x, y }],
        brushSize: brushSize
      });
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Update mouse position for crosshair (in canvas coordinates)
    setMousePos({ x: canvasX, y: canvasY });
    setShowCrosshair(true);

    // Handle panning when active (only for select tool or space key)
    if (isPanning && imageObj) {
      // Pan the image
        const newPanX = e.clientX - panStartX;
        const newPanY = e.clientY - panStartY;
        setPanX(newPanX);
        setPanY(newPanY);
        redrawCanvas();
      return;
    }

    // Update cursor based on tool and panning state
    // Only show grab cursor for select tool, not for Box, Polygon, or Brush
    if (isSpacePressed && imageObj) {
      canvas.style.cursor = 'grab';
    } else if (currentTool === 'select' && imageObj) {
      canvas.style.cursor = 'grab';
    } else if (currentTool === 'select') {
      canvas.style.cursor = 'default';
    } else if (currentTool === 'bbox' || currentTool === 'polygon' || currentTool === 'brush') {
      canvas.style.cursor = 'crosshair';
    }

    // Convert to image coordinates
    const x = (canvasX - panX) / zoom;
    const y = (canvasY - panY) / zoom;

    // Redraw canvas to update crosshair
    if (!isDrawing && currentTool !== 'polygon') {
      redrawCanvas();
      return;
    }

    if (currentTool === 'bbox' && isDrawing && currentAnnotation) {
      setCurrentAnnotation({
        ...currentAnnotation,
        width: x - startX,
        height: y - startY
      });
      redrawCanvas();
      drawCurrentAnnotation();
    } else if (currentTool === 'brush' && isDrawing && currentAnnotation) {
      const newPoints = [...brushPoints, { x, y }];
      setBrushPoints(newPoints);
      setCurrentAnnotation({
        ...currentAnnotation,
        points: newPoints
      });
      redrawCanvas();
      drawCurrentAnnotation();
    } else if (currentTool === 'polygon' && polygonPoints.length > 0) {
      // Update mouse position for polygon preview
      setPolygonMousePos({ x, y });
      redrawCanvas();
    }
  };

  const handleMouseUp = (e) => {
    const canvas = canvasRef.current;

    // Handle panning mouse up
    if (isPanning) {
      // Check if it was a click (no significant movement) or a drag
      const dragThreshold = 5;
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);

      if (deltaX <= dragThreshold && deltaY <= dragThreshold && currentTool === 'select') {
        // It was a click, not a drag - try to select annotation
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - panX) / zoom;
        const y = (e.clientY - rect.top - panY) / zoom;
        selectAnnotationAt(x, y);
      }

      setIsPanning(false);
      if (canvas) {
        if (isSpacePressed && imageObj) {
          canvas.style.cursor = 'grab';
        } else if (currentTool === 'select' && imageObj) {
          canvas.style.cursor = 'grab';
        } else if (currentTool === 'bbox' || currentTool === 'polygon' || currentTool === 'brush') {
          canvas.style.cursor = 'crosshair';
        } else {
          canvas.style.cursor = 'crosshair';
        }
      }
      return;
    }

    // For drawing tools, if mouse was released without dragging, start drawing
    if (currentTool !== 'select' && !isDrawing && imageObj && currentImage) {
      const dragThreshold = 5;
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);
      
      // If it was a click (not a drag), start drawing
      if (deltaX <= dragThreshold && deltaY <= dragThreshold) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - panX) / zoom;
        const y = (e.clientY - rect.top - panY) / zoom;

        // Prevent drawing if there's a pending annotation
        if (pendingAnnotation) {
          return;
        }

        // If no class is selected, show class selection modal first
        if (!currentClass && classes.length > 0) {
          setPendingAnnotation({ type: 'pre-draw', tool: currentTool });
          setPendingClassSelection(classes[0]);
          return;
        }

        if (!currentClass) {
          showToastMessage('⚠️ Please add a class first');
          return;
        }

        setIsDrawing(true);
        setStartX(x);
        setStartY(y);

        if (currentTool === 'bbox') {
          setCurrentAnnotation({
            type: 'bbox',
            class: currentClass,
            x: x,
            y: y,
            width: 0,
            height: 0
          });
        } else if (currentTool === 'polygon') {
          setPolygonPoints([[x, y]]);
          setPolygonMousePos({ x, y });
          redrawCanvas();
        } else if (currentTool === 'brush') {
          setBrushPoints([{ x, y }]);
          setCurrentAnnotation({
            type: 'brush',
            class: currentClass,
            points: [{ x, y }],
            brushSize: brushSize
          });
        }
      }
      return;
    }

    // For polygon, don't finalize on mouse up - wait for double click
    if (currentTool === 'polygon') {
      setIsDrawing(false);
      return;
    }

    if (isDrawing && currentAnnotation) {
      if (currentTool === 'bbox') {
        if (Math.abs(currentAnnotation.width) > 5 && Math.abs(currentAnnotation.height) > 5) {
          finalizeAnnotation();
        } else {
          setCurrentAnnotation(null);
        }
      } else if (currentTool === 'brush') {
        if (brushPoints.length > 5) {
          finalizeAnnotation();
        } else {
          setCurrentAnnotation(null);
        }
      }
    }

    setIsDrawing(false);
    redrawCanvas();
  };

  const handleDoubleClick = (e) => {
    // Prevent finalizing polygon if there's a pending annotation
    if (pendingAnnotation) {
      showToastMessage('⚠️ Please select a class for the previous annotation first');
      return;
    }

    if (currentTool === 'polygon' && polygonPoints.length >= 3) {
      const ann = {
        type: 'polygon',
        class: currentClass, // Will be updated when user selects in modal
        points: [...polygonPoints]
      };
      setCurrentAnnotation(ann);
      setPolygonPoints([]);
      setPolygonMousePos({ x: 0, y: 0 }); // Reset mouse position
      // Pass the constructed annotation to finalizeAnnotation to avoid state update race
      finalizeAnnotation(ann);
    }
  };

  const drawCurrentAnnotation = () => {
    const canvas = canvasRef.current;
    if (!canvas || !currentAnnotation) return;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const color = getClassColor(currentAnnotation.class);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5, 5]);

    if (currentAnnotation.type === 'bbox') {
      ctx.strokeRect(
        currentAnnotation.x,
        currentAnnotation.y,
        currentAnnotation.width,
        currentAnnotation.height
      );
    } else if (currentAnnotation.type === 'polygon' && currentAnnotation.points) {
      ctx.beginPath();
      // Handle both array format [[x,y],...] and object format [{x,y},...] for backward compatibility
      const firstPoint = Array.isArray(currentAnnotation.points[0]) ? currentAnnotation.points[0] : [currentAnnotation.points[0].x, currentAnnotation.points[0].y];
      ctx.moveTo(firstPoint[0], firstPoint[1]);
      for (let i = 1; i < currentAnnotation.points.length; i++) {
        const point = Array.isArray(currentAnnotation.points[i]) ? currentAnnotation.points[i] : [currentAnnotation.points[i].x, currentAnnotation.points[i].y];
        ctx.lineTo(point[0], point[1]);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (currentAnnotation.type === 'brush' && currentAnnotation.points) {
      ctx.beginPath();
      ctx.moveTo(currentAnnotation.points[0].x, currentAnnotation.points[0].y);
      for (let i = 1; i < currentAnnotation.points.length; i++) {
        ctx.lineTo(currentAnnotation.points[i].x, currentAnnotation.points[i].y);
      }
      ctx.lineWidth = (currentAnnotation.brushSize || brushSize) / zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.stroke();
    }

    ctx.restore();
  };

  const drawPendingAnnotation = () => {
    const canvas = canvasRef.current;
    if (!canvas || !pendingAnnotation) return;

    // Don't draw if it's a pre-draw marker (no actual annotation to draw yet)
    if (pendingAnnotation.type === 'pre-draw') return;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw pending annotation with gold/yellow dashed line to indicate it's waiting for class
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([8 / zoom, 4 / zoom]);

    if (pendingAnnotation.type === 'bbox') {
      ctx.strokeRect(
        pendingAnnotation.x,
        pendingAnnotation.y,
        pendingAnnotation.width,
        pendingAnnotation.height
      );
    } else if (pendingAnnotation.type === 'polygon' && pendingAnnotation.points) {
      ctx.beginPath();
      const firstPoint = Array.isArray(pendingAnnotation.points[0]) 
        ? pendingAnnotation.points[0] 
        : [pendingAnnotation.points[0].x, pendingAnnotation.points[0].y];
      ctx.moveTo(firstPoint[0], firstPoint[1]);
      for (let i = 1; i < pendingAnnotation.points.length; i++) {
        const point = Array.isArray(pendingAnnotation.points[i]) 
          ? pendingAnnotation.points[i] 
          : [pendingAnnotation.points[i].x, pendingAnnotation.points[i].y];
        ctx.lineTo(point[0], point[1]);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (pendingAnnotation.type === 'brush' && pendingAnnotation.points) {
      ctx.beginPath();
      const firstPoint = pendingAnnotation.points[0];
      ctx.moveTo(firstPoint.x, firstPoint.y);
      for (let i = 1; i < pendingAnnotation.points.length; i++) {
        ctx.lineTo(pendingAnnotation.points[i].x, pendingAnnotation.points[i].y);
      }
      ctx.lineWidth = (pendingAnnotation.brushSize || brushSize) / zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  };

  const drawPolygonPreview = (mouseX, mouseY) => {
    const canvas = canvasRef.current;
    if (!canvas || polygonPoints.length === 0) return;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const color = getClassColor(currentClass);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / zoom;

    ctx.beginPath();
    ctx.moveTo(polygonPoints[0][0], polygonPoints[0][1]);
    for (let i = 1; i < polygonPoints.length; i++) {
      ctx.lineTo(polygonPoints[i][0], polygonPoints[i][1]);
    }
    ctx.lineTo(mouseX, mouseY);
    // Draw border only (no fill)
    ctx.stroke();

    polygonPoints.forEach(point => {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(point[0], point[1], 4 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
    });

    ctx.restore();
  };

  // Accept an optional annotation argument to avoid relying on state updates
  const finalizeAnnotation = async (annotationArg = null) => {
    const annotationToUse = annotationArg || currentAnnotation;
    if (!annotationToUse) return;

    // Store as pending and show class selection modal for the NEXT annotation
    // Clear current class so user must select for next annotation
    setPendingAnnotation(annotationToUse);
    setPendingClassSelection(classes.length > 0 ? classes[0] : '');
    setCurrentClass(null); // Clear current class so next annotation requires selection
    // Clear transient states but keep annotation pending
    setCurrentAnnotation(null);
    setBrushPoints([]);
    setPolygonPoints([]);
    setPolygonMousePos({ x: 0, y: 0 });
    
    // Don't add to annotations yet - wait for class selection
    redrawCanvas(); // Redraw to show pending annotation
  };

  // Save annotation after class selection
  const confirmPendingAnnotation = async () => {
    if (!pendingAnnotation || !pendingClassSelection) return;

    // Handle pre-draw class selection (before starting to draw)
    if (pendingAnnotation.type === 'pre-draw') {
      setCurrentClass(pendingClassSelection);
      setPendingAnnotation(null);
      setPendingClassSelection('');
      showToastMessage(`✓ Class "${pendingClassSelection}" selected. You can now draw.`);
      return;
    }

    // Handle post-draw class selection (after completing annotation)
    const annotationWithClass = {
      ...pendingAnnotation,
      class: pendingClassSelection
    };

    const tempId = Date.now();
    const newAnnotation = {
      ...annotationWithClass,
      id: tempId
    };

    setAnnotations(prev => [...prev, newAnnotation]);
    setPendingAnnotation(null);
    setPendingClassSelection('');
    setCurrentClass(null); // Clear current class so next annotation requires selection

    // Save to database and update with real ID
    try {
      let coords;
      if (newAnnotation.type === 'bbox') {
        coords = {
          x: newAnnotation.x,
          y: newAnnotation.y,
          width: newAnnotation.width,
          height: newAnnotation.height
        };
      } else if (newAnnotation.type === 'polygon') {
        coords = { points: newAnnotation.points };
      } else {
        coords = { points: newAnnotation.points, brushSize: newAnnotation.brushSize || 10 };
      }

      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8000/api/annotations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          image_id: currentImage.id,
          class_name: newAnnotation.class,
          annotation_type: newAnnotation.type,
          coordinates: coords
        })
      });

      if (response.ok) {
        const savedAnnotation = await response.json();
        // Update the annotation ID in the local state with the database ID
        setAnnotations(prev => prev.map(ann =>
          ann.id === tempId ? { ...ann, id: savedAnnotation.id } : ann
        ));
      }
    } catch (error) {
      console.error('Error saving annotation:', error);
    }

    updateStats();
    setTimeout(() => {
      redrawCanvas();
    }, 0);
    showToastMessage('✅ Annotation saved');
  };

  const cancelPendingAnnotation = () => {
    setPendingAnnotation(null);
    setPendingClassSelection('');
    redrawCanvas();
  };

  // Handle class panel dragging
  const handleClassPanelMouseDown = (e) => {
    // Only start drag if clicking on the header/drag handle area (not on buttons/inputs)
    const target = e.target;
    const isHeader = target.closest('.class-panel-header');
    const isDragHandle = target.closest('.class-panel-drag-handle');
    const isButton = target.tagName === 'BUTTON' || target.closest('button');
    const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.closest('input, select');
    
    if ((isHeader || isDragHandle) && !isButton && !isInput) {
      setIsDraggingClassPanel(true);
      setClassPanelDragOffset({
        x: e.clientX - classPanelPosition.x,
        y: e.clientY - classPanelPosition.y
      });
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const handleClassPanelMouseMove = (e) => {
      if (isDraggingClassPanel) {
        setClassPanelPosition({
          x: e.clientX - classPanelDragOffset.x,
          y: e.clientY - classPanelDragOffset.y
        });
      }
    };

    const handleClassPanelMouseUp = () => {
      setIsDraggingClassPanel(false);
    };

    if (isDraggingClassPanel) {
      window.addEventListener('mousemove', handleClassPanelMouseMove);
      window.addEventListener('mouseup', handleClassPanelMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleClassPanelMouseMove);
        window.removeEventListener('mouseup', handleClassPanelMouseUp);
      };
    }
  }, [isDraggingClassPanel, classPanelDragOffset, classPanelPosition]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use requestAnimationFrame for smoother redraws and to prevent blinking
    requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Ensure canvas is properly sized
      const wrapper = canvasWrapperRef.current;
      if (wrapper && (canvas.width !== wrapper.clientWidth || canvas.height !== wrapper.clientHeight)) {
        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Always redraw the image if it exists
      if (imageObj) {
        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(zoom, zoom);
        ctx.drawImage(imageObj, 0, 0, imageObj.width, imageObj.height);
        ctx.restore();
      }

      drawAnnotations();
      if (currentAnnotation) {
        drawCurrentAnnotation();
      }
      // Draw pending annotation (waiting for class selection) with special style
      if (pendingAnnotation) {
        drawPendingAnnotation();
      }
      // Draw polygon preview if polygon tool is active and has points
      if (currentTool === 'polygon' && polygonPoints.length > 0) {
        // Use current mouse position for preview
        drawPolygonPreview(polygonMousePos.x, polygonMousePos.y);
      }

      // Draw crosshair lines (x and y lines following cursor)
      if (showCrosshair && imageObj) {
        ctx.save();
        ctx.strokeStyle = 'rgb(0, 0, 0)'; // Dark color with transparency
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]); // Dashed lines

        // Vertical line (x-axis)
        ctx.beginPath();
        ctx.moveTo(mousePos.x, 0);
        ctx.lineTo(mousePos.x, canvas.height);
        ctx.stroke();

        // Horizontal line (y-axis)
        ctx.beginPath();
        ctx.moveTo(0, mousePos.y);
        ctx.lineTo(canvas.width, mousePos.y);
        ctx.stroke();

        ctx.setLineDash([]); // Reset line dash
        ctx.restore();
      }
    });
  };

  const drawAnnotations = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    annotations.forEach((ann, index) => {
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);

      const color = getClassColor(ann.class);
      ctx.strokeStyle = color;
      ctx.lineWidth = index === selectedAnnotationIndex ? 3 / zoom : 2 / zoom;
      ctx.setLineDash([]);

      if (ann.type === 'bbox') {
        // Draw border only (no fill)
        ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);

        // Draw label background
        ctx.fillStyle = color;
        const textWidth = ctx.measureText(ann.class).width;
        ctx.fillRect(ann.x, ann.y - 20 / zoom, textWidth + 10, 20 / zoom);
        ctx.fillStyle = 'white';
        ctx.font = `${14 / zoom}px Arial`;
        ctx.fillText(ann.class, ann.x + 5, ann.y - 5 / zoom);
      } else if (ann.type === 'polygon' && ann.points) {
        ctx.beginPath();
        // Handle both array format [[x,y],...] and object format [{x,y},...] for backward compatibility
        const firstPolyPoint = Array.isArray(ann.points[0]) ? ann.points[0] : [ann.points[0].x, ann.points[0].y];
        ctx.moveTo(firstPolyPoint[0], firstPolyPoint[1]);
        for (let i = 1; i < ann.points.length; i++) {
          const point = Array.isArray(ann.points[i]) ? ann.points[i] : [ann.points[i].x, ann.points[i].y];
          ctx.lineTo(point[0], point[1]);
        }
        ctx.closePath();
        // Draw border only (no fill)
        ctx.stroke();

        // Draw label background
        ctx.fillStyle = color;
        const textWidth = ctx.measureText(ann.class).width;
        ctx.fillRect(firstPolyPoint[0], firstPolyPoint[1] - 20 / zoom, textWidth + 10, 20 / zoom);
        ctx.fillStyle = 'white';
        ctx.font = `${14 / zoom}px Arial`;
        ctx.fillText(ann.class, firstPolyPoint[0] + 5, firstPolyPoint[1] - 5 / zoom);
      } else if (ann.type === 'brush' && ann.points) {
        // Brush annotations are just strokes, no fill needed
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.lineWidth = (ann.brushSize || 10) / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Draw label background for brush
        if (ann.points && ann.points.length > 0) {
          ctx.fillStyle = color;
          const firstPoint = ann.points[0];
          ctx.font = `${14 / zoom}px Arial`;
          const textWidth = ctx.measureText(ann.class).width;
          ctx.fillRect(firstPoint.x, firstPoint.y - 20 / zoom, textWidth + 10, 20 / zoom);
          ctx.fillStyle = 'white';
          ctx.fillText(ann.class, firstPoint.x + 5, firstPoint.y - 5 / zoom);
        }
      }

      ctx.restore();
    });
  };

  const selectAnnotationAt = (x, y) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.type === 'bbox') {
        if (x >= ann.x && x <= ann.x + ann.width &&
          y >= ann.y && y <= ann.y + ann.height) {
          setSelectedAnnotationIndex(i);
          redrawCanvas();
          return;
        }
      } else if (ann.type === 'polygon' && ann.points) {
        if (isPointInPolygon({ x, y }, ann.points)) {
          setSelectedAnnotationIndex(i);
          redrawCanvas();
          return;
        }
      } else if (ann.type === 'brush' && ann.points) {
        // Check if point is near any brush stroke point
        const threshold = (ann.brushSize || 10) * 1.5; // Make selection area slightly larger than brush size
        for (const point of ann.points) {
          const px = typeof point === 'object' && 'x' in point ? point.x : (Array.isArray(point) ? point[0] : point);
          const py = typeof point === 'object' && 'y' in point ? point.y : (Array.isArray(point) ? point[1] : point);
          const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
          if (distance <= threshold) {
            setSelectedAnnotationIndex(i);
            redrawCanvas();
            return;
          }
        }
      }
    }
    setSelectedAnnotationIndex(-1);
    redrawCanvas();
  };

  const isPointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      // Handle both array format [[x,y],...] and object format [{x,y},...] for backward compatibility
      const pi = Array.isArray(polygon[i]) ? polygon[i] : [polygon[i].x, polygon[i].y];
      const pj = Array.isArray(polygon[j]) ? polygon[j] : [polygon[j].x, polygon[j].y];
      const xi = pi[0], yi = pi[1];
      const xj = pj[0], yj = pj[1];
      const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const selectTool = async (tool) => {
    // If switching away from polygon tool and there are unsaved polygon points, finalize them first
    if (currentTool === 'polygon' && polygonPoints.length >= 3 && tool !== 'polygon') {
      const ann = {
        type: 'polygon',
        class: currentClass,
        points: [...polygonPoints]
      };
      setCurrentAnnotation(ann);
      const pointsToSave = [...polygonPoints];
      setPolygonPoints([]);
      setPolygonMousePos({ x: 0, y: 0 });
      // Finalize the annotation before switching tools
      await finalizeAnnotation(ann);
      // Now switch to the new tool
      setCurrentTool(tool);
      setIsDrawing(false);
      setIsPanning(false);
      setCurrentAnnotation(null);
      setBrushPoints([]);
      redrawCanvas();
      return;
    }

    // If switching away from AI Annotation or Docs Annotation tool, reload annotations to show saved ones
    const wasAITool = currentTool === 'ai-annotation' || currentTool === 'docs-annotation';
    const isAITool = tool === 'ai-annotation' || tool === 'docs-annotation';

    // IMPORTANT: When switching TO AI/Docs Annotation tools, ensure current image is loaded
    if (!wasAITool && isAITool && currentImage && images.length > 0) {
      // Trigger image reload for AI/Docs Annotation components by ensuring currentImageIndex is set
      // The useEffect in DocsAnnotation/AIAnnotation will handle the actual loading
      const imageIndex = images.findIndex(img => img.id === currentImage.id);
      if (imageIndex >= 0 && imageIndex !== currentImageIndex) {
        setCurrentImageIndex(imageIndex);
      }
    }

    // IMPORTANT: When switching away from AI tools, ensure annotations are loaded FIRST
    // This ensures AI-generated annotations are visible when using manual tools
    if (wasAITool && !isAITool && currentImage) {
      // Load annotations before switching tools to ensure they're available
      await loadAnnotations();
      // Small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setCurrentTool(tool);
    setIsDrawing(false);
    setIsPanning(false);
    setCurrentAnnotation(null);
    setPolygonPoints([]);
    setPolygonMousePos({ x: 0, y: 0 });
    setBrushPoints([]);

    // After switching to manual tools, ensure annotations are visible and canvas is ready
    if (!isAITool && currentImage) {
      // Ensure annotations are loaded and visible
      setTimeout(async () => {
        await loadAnnotations();
        // Force a redraw to show all annotations
        setTimeout(() => {
          redrawCanvas();
        }, 100);
      }, 150);
    }

    // Update cursor based on tool
    const canvas = canvasRef.current;
    if (canvas) {
      if (tool === 'select' && zoom > 0.1 && imageObj) {
        canvas.style.cursor = 'grab';
      } else if (tool === 'select') {
        canvas.style.cursor = 'default';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    }

    if (tool === 'polygon') {
      showToastMessage('🔷 Click to add points, double-click to finish');
    } else if (tool === 'brush') {
      showToastMessage('🖌️ Click and drag to draw freehand');
    } else if (tool === 'select' && zoom > 0.1) {
      showToastMessage('👆 Drag to pan image, click to select annotation');
    }

    redrawCanvas();
  };

  const getClassColor = (className) => {
    // First check if there's a custom color for this class
    if (classColors[className]) {
      return classColors[className];
    }

    const index = classes.indexOf(className);
    // If class not found, use a default color or hash-based color
    if (index === -1) {
      // Generate a consistent color based on class name hash
      let hash = 0;
      for (let i = 0; i < className.length; i++) {
        hash = className.charCodeAt(i) + ((hash << 5) - hash);
      }
      const colorIndex = Math.abs(hash) % colorPalette.length;
      return colorPalette[colorIndex];
    }
    return colorPalette[index % colorPalette.length];
  };

  // Helper function to convert hex color to rgba with transparency
  const hexToRgba = (hex, alpha = 0.3) => {
    // Remove # if present
    hex = hex.replace('#', '');
    // Parse RGB values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const showToastMessage = (message) => {
    setToastMessage(message);
    setShowToast(true);
  };

  const loadProjectList = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        setProjectList([]);
        return;
      }

      const response = await fetch('http://localhost:8000/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error('Failed to load projects:', response.status, response.statusText);
        setProjectList([]);
        return;
      }

      const projects = await response.json();
      // Ensure projects is always an array
      setProjectList(Array.isArray(projects) ? projects : []);
    } catch (error) {
      console.error('Error loading projects:', error);
      setProjectList([]);
    }
  };

  // Load project by name
  const loadProjectByName = async (projectName) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        return null;
      }

      const response = await fetch('http://localhost:8000/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error('Failed to load projects:', response.status, response.statusText);
        return null;
      }

      const projects = await response.json();
      const projectList = Array.isArray(projects) ? projects : [];
      const project = projectList.find(p => p.name === projectName);
      
      if (project) {
        await loadProject(project);
        return project;
      } else {
        showToastMessage(`⚠️ Project "${projectName}" not found`);
        return null;
      }
    } catch (error) {
      console.error('Error loading project by name:', error);
      showToastMessage('❌ Error loading project');
      return null;
    }
  };

  const deleteProject = async (projectId, projectName) => {
    if (!window.confirm(`Are you sure you want to delete project "${projectName}"? This will delete all images and annotations in this project.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // If the deleted project was the current project, clear it
        if (currentProject && currentProject.id === projectId) {
          setCurrentProject(null);
          setImages([]);
          setAnnotations([]);
          setCurrentImage(null);
          localStorage.removeItem('lastProjectId');
        }

        // Reload project list
        await loadProjectList();
        showToastMessage('✅ Project deleted successfully');
      } else {
        const data = await response.json();
        showToastMessage('❌ Error: ' + (data.error || 'Failed to delete project'));
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      showToastMessage('❌ Error deleting project');
    }
  };

  const deleteAllProjects = async () => {
    if (!window.confirm('Are you sure you want to delete ALL projects? This will delete all projects, images, and annotations. This action cannot be undone!')) {
      return;
    }

    if (!window.confirm('This is your last chance! Are you absolutely sure you want to delete everything?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8000/api/projects', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Clear current project state
        setCurrentProject(null);
        setImages([]);
        setAnnotations([]);
        setCurrentImage(null);
        localStorage.removeItem('lastProjectId');

        // Reload project list
        await loadProjectList();
        setShowProjectListModal(false);
        showToastMessage('✅ All projects deleted successfully');
      } else {
        const data = await response.json();
        showToastMessage('❌ Error: ' + (data.error || 'Failed to delete projects'));
      }
    } catch (error) {
      console.error('Error deleting all projects:', error);
      showToastMessage('❌ Error deleting projects');
    }
  };

  const loadProjectById = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/projects`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error('Failed to load projects:', response.status);
        return;
      }

      const projects = await response.json();
      const project = Array.isArray(projects) ? projects.find(p => p.id === projectId) : null;
      if (project) {
        await loadProject(project);
      } else {
        // If project not found, load first project
        if (Array.isArray(projects) && projects.length > 0) {
          await loadProject(projects[0]);
        }
      }
    } catch (error) {
      console.error('Error loading project by ID:', error);
      loadProjects();
    }
  };

  const loadProject = async (project) => {
    // Clear previous project state completely
    setAnnotations([]);
    setImages([]);
    setCurrentImage(null);
    setCurrentImageIndex(0);
    setSelectedAnnotationIndex(-1);
    setImageObj(null); // Clear the canvas image
    setClasses([]); // Clear previous classes
    setCurrentClass(null); // Clear current class

    try {
      // Fetch fresh project data from server to ensure we have latest classes
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/projects/${project.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error('Failed to load project:', response.status);
        showToastMessage('❌ Error loading project');
        return;
      }

      const freshProject = await response.json();

      // Set new project with fresh data
      setCurrentProject(freshProject);
      // Don't save to localStorage - we want to show welcome screen on refresh

      // Load new project's classes from fresh data
      const projectClasses = JSON.parse(freshProject.classes);
      setClasses(projectClasses);

      // Load class colors if available
      if (freshProject.class_colors) {
        try {
          const colors = typeof freshProject.class_colors === 'string'
            ? JSON.parse(freshProject.class_colors)
            : freshProject.class_colors;
          setClassColors(colors);
        } catch (e) {
          console.error('Error parsing class colors:', e);
          setClassColors({});
        }
      } else {
        setClassColors({});
      }

      if (projectClasses.length > 0) {
        setCurrentClass(projectClasses[0]);
      } else {
        setCurrentClass(null);
      }

      // If current tool is an AI tool, switch to select tool so manual tools work
      if (currentTool === 'ai-annotation' || currentTool === 'docs-annotation') {
        setCurrentTool('select');
      }

      // Load new project's images - pass project ID directly to avoid state timing issues
      await loadProjectImages(freshProject.id);
      showToastMessage('✅ Project loaded: ' + freshProject.name);
    } catch (error) {
      console.error('Error loading project:', error);
      showToastMessage('❌ Error loading project');
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    setShowLoading(true);
    try {
      // Get token from localStorage first (most reliable), then AuthContext
      let token = localStorage.getItem('token') || authToken;
      
      // Ensure token is a string and trim it
      if (token) {
        token = String(token).trim();
        // Remove quotes if present
        if ((token.startsWith('"') && token.endsWith('"')) || 
            (token.startsWith("'") && token.endsWith("'"))) {
          token = token.slice(1, -1);
        }
      }
      
      console.log("TOKEN CHECK:", {
        hasAuthToken: !!authToken,
        hasLocalStorageToken: !!localStorage.getItem('token'),
        tokenLength: token ? token.length : 0,
        tokenPreview: token ? token.substring(0, 30) + '...' : 'No token',
        tokenType: typeof token
      });
      
      if (!token || token === 'null' || token === 'undefined' || token === '') {
        showToastMessage('❌ Authentication token not found. Please log in again.');
        setShowLoading(false);
        navigate('/login');
        return;
      }

      const response = await fetch('http://localhost:8000/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: projectName,
          project_type: projectType,
          description: projectDescription,
          classes: projectClasses.split(',').map(c => c.trim()).filter(c => c)
        })
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to create project';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
          
          if (response.status === 401) {
            console.error('401 Unauthorized - Token issue:', {
              tokenPresent: !!token,
              tokenLength: token ? token.length : 0,
              authHeader: `Bearer ${token ? token.substring(0, 20) + '...' : 'missing'}`
            });
            errorMessage += '. Please log out and log back in.';
            // Clear potentially invalid token
            localStorage.removeItem('token');
            navigate('/login');
          }
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        showToastMessage('❌ Error: ' + errorMessage);
        setShowLoading(false);
        return;
      }

      const data = await response.json();
      
        // Close modal first
        setShowProjectModal(false);
        // Reset form fields
        setProjectName('');
        setProjectType('object-detection');
        setProjectDescription('');
        setProjectClasses('');
      // Set mode to create-project
      setProjectMode('create-project');
        // Load the newly created project
        await loadProject(data);
        // Ensure canvas is initialized after project loads
        setTimeout(() => {
          initializeCanvas();
        }, 100);
        showToastMessage('✅ Project created successfully!');
    } catch (error) {
      console.error('Error creating project:', error);
      showToastMessage('❌ Error: ' + (error.message || 'Failed to create project'));
    } finally {
    setShowLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8000/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const projects = await response.json();
      if (projects.length > 0) {
        await loadProject(projects[0]);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const finalizePolygonIfNeeded = async () => {
    // If there's an unfinished polygon with 3+ points, finalize it first
    if (currentTool === 'polygon' && polygonPoints.length >= 3 && currentClass) {
      const ann = {
        type: 'polygon',
        class: currentClass,
        points: [...polygonPoints]
      };
      setCurrentAnnotation(ann);
      setPolygonPoints([]);
      setPolygonMousePos({ x: 0, y: 0 });
      await finalizeAnnotation(ann);
      return true; // Indicates a polygon was finalized
    }
    return false; // No polygon to finalize
  };

  const selectClass = async (className) => {
    // If switching classes while drawing a polygon, finalize the current polygon first
    if (currentTool === 'polygon' && polygonPoints.length >= 3 && currentClass && currentClass !== className) {
      await finalizePolygonIfNeeded();
    }
    setCurrentClass(className);
    // Force canvas redraw to ensure annotations are visible after class change
    // Use a small delay to ensure state update is complete
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas && currentImage) {
        // Ensure canvas is properly sized
        const wrapper = canvasWrapperRef.current;
        if (wrapper) {
          canvas.width = wrapper.clientWidth;
          canvas.height = wrapper.clientHeight;
        }
        redrawCanvas();
      }
    }, 10);
  };

  const handleAddClass = () => {
    setNewClassName('');
    setSelectedClassColor(colorPalette[classes.length % colorPalette.length]);
    setShowAddClassModal(true);
  };

  const addClass = async () => {
    const className = newClassName.trim();
    if (!className) {
      showToastMessage('⚠️ Please enter a class name');
      return;
    }

    if (classes.includes(className)) {
      showToastMessage('⚠️ Class already exists');
      return;
    }

    if (!currentProject) {
      showToastMessage('⚠️ Please create or select a project first');
      return;
    }

    // Validate and fix color if needed
    let validColor = selectedClassColor;
    if (!/^#[0-9A-Fa-f]{6}$/.test(validColor)) {
      // If invalid, use default or fix it
      if (validColor.startsWith('#') && /^[0-9A-Fa-f]{1,5}$/.test(validColor.substring(1))) {
        const hex = validColor.substring(1).padEnd(6, '0');
        validColor = '#' + hex;
      } else {
        validColor = colorPalette[classes.length % colorPalette.length];
      }
    }

    const newClasses = [...classes, className];
    setClasses(newClasses);

    // Store the selected color for this class
    setClassColors(prev => ({
      ...prev,
      [className]: validColor
    }));

    if (!currentClass) {
      setCurrentClass(className);
    }

    // Update project in database with new classes and colors
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/projects/${currentProject.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          classes: newClasses,
          class_colors: JSON.stringify({ ...classColors, [className]: validColor })
        })
      });

      if (response.ok) {
        const updatedProject = await response.json();
        setCurrentProject(updatedProject);
        setShowAddClassModal(false);
        setNewClassName('');
        showToastMessage('✅ Class added: ' + className);
        redrawCanvas(); // Refresh canvas to show new class
      } else {
        // Revert on error
        setClasses(classes);
        const errorText = await response.text();
        console.error('Error adding class:', errorText);
        showToastMessage('❌ Error adding class: ' + (errorText || 'Unknown error'));
      }
    } catch (error) {
      // Revert on error
      setClasses(classes);
      console.error('Error adding class:', error);
      showToastMessage('❌ Error adding class: ' + error.message);
    }
  };

  const deleteClass = async (classNameToDelete, e) => {
    e.stopPropagation(); // Prevent selecting the class when clicking delete

    if (!currentProject) return;

    // Check if there are annotations using this class
    const hasAnnotations = annotations.some(ann => ann.class === classNameToDelete);
    if (hasAnnotations) {
      if (!window.confirm(`Class "${classNameToDelete}" has annotations. Are you sure you want to delete it? The annotations will remain but won't be associated with this class.`)) {
        return;
      }
    }

    const newClasses = classes.filter(c => c !== classNameToDelete);
    setClasses(newClasses);

    // If the deleted class was the current class, select another one or clear
    if (currentClass === classNameToDelete) {
      if (newClasses.length > 0) {
        setCurrentClass(newClasses[0]);
      } else {
        setCurrentClass(null);
      }
    }

    // Update project in database with updated classes
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/projects/${currentProject.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          classes: newClasses
        })
      });

      if (response.ok) {
        const updatedProject = await response.json();
        setCurrentProject(updatedProject);
        showToastMessage('✅ Class deleted: ' + classNameToDelete);
      } else {
        // Revert on error
        setClasses(classes);
        if (currentClass === classNameToDelete && classes.length > 0) {
          setCurrentClass(classes[0]);
        }
        showToastMessage('❌ Error deleting class');
      }
    } catch (error) {
      // Revert on error
      setClasses(classes);
      if (currentClass === classNameToDelete && classes.length > 0) {
        setCurrentClass(classes[0]);
      }
      showToastMessage('❌ Error deleting class');
    }
  };

  const deleteImage = async (imageId, imageIndex, e) => {
    e.stopPropagation(); // Prevent loading the image when clicking delete

    if (!window.confirm('Are you sure you want to delete this image? All annotations on this image will also be deleted.')) {
      return;
    }

    try {
      const token = authToken || localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/images/${imageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Reload images from server to ensure consistency
        const refreshedImages = await fetch(`http://localhost:8000/api/projects/${currentProject.id}/images`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }).then(r => r.json());
        setImages(refreshedImages);

        // If the deleted image was the current one, load another or clear
        if (imageIndex === currentImageIndex) {
          if (refreshedImages.length > 0) {
            // Load the first image, or the previous one if available
            const newIndex = imageIndex > 0 ? imageIndex - 1 : 0;
            const targetIndex = newIndex < refreshedImages.length ? newIndex : refreshedImages.length - 1;
            await loadImageByData(refreshedImages[targetIndex], targetIndex, refreshedImages);
          } else {
            // No images left, clear everything
            setCurrentImage(null);
            setCurrentImageIndex(0);
            setAnnotations([]);
            setImageObj(null);
            redrawCanvas();
          }
        } else if (imageIndex < currentImageIndex) {
          // Adjust current index if we deleted an image before the current one
          const newIndex = currentImageIndex - 1;
          if (newIndex >= 0 && newIndex < refreshedImages.length) {
            setCurrentImageIndex(newIndex);
          }
        }

        showToastMessage('✅ Image deleted successfully');
      } else {
        const data = await response.json();
        showToastMessage('❌ Error: ' + (data.error || 'Failed to delete image'));
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      showToastMessage('❌ Error deleting image');
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    if (!currentProject) {
      showToastMessage('⚠️ Please select a project first');
      return;
    }

    setShowUploadProgress(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = ((i + 1) / files.length) * 100;
      setUploadProgress(progress);
      setUploadStatus(`Uploading ${i + 1} of ${files.length}...`);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', currentProject.id);

      try {
        const token = authToken || localStorage.getItem('token');
        const response = await fetch('http://localhost:8000/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          if (data.frames) {
            // PDF or video frames - store them for display
            setUploadedPdfPages(prev => [...prev, {
              fileName: file.name,
              frames: data.frames,
              uploadedAt: new Date()
            }]);
            setImages(prev => [...prev, ...data.frames]);
            successCount += data.frames.length;
          } else {
            setImages(prev => [...prev, data]);
            successCount++;
          }
        } else {
          errorCount++;
          console.error('Upload failed for file:', file.name);
        }
      } catch (error) {
        errorCount++;
        console.error('Upload error:', error);
      }
    }

    // Reset upload progress
    setShowUploadProgress(false);
    setUploadProgress(0);
    setUploadStatus('');
    event.target.value = '';

    // Reload project images to get fresh data
    await loadProjectImages();

    // Close the modal first
    setShowUploadModal(false);

    // Show success/error message after modal closes
    setTimeout(() => {
      if (successCount > 0) {
        showToastMessage(`✅ ${successCount} file(s) uploaded successfully!`);
      }
      if (errorCount > 0) {
        showToastMessage(`❌ ${errorCount} file(s) failed to upload`);
      }
    }, 300);
  };

  // Load assigned files for current user
  const loadAssignedFiles = async () => {
    if (!user) return;
    
    try {
      const response = await fetch('http://localhost:8000/api/bulk-upload/files');
      if (response.ok) {
        const allFiles = await response.json();
        console.log('📁 Total files from API:', allFiles.length);
        
        // Filter files assigned to current user (by name, email, or username)
        const userFiles = allFiles.filter(file => 
          file.assigned_to === user.name || 
          file.assigned_to === user.email || 
          file.assigned_to === user.username
        );
        console.log('👤 Files assigned to user:', userFiles.length, 'User:', user.name, user.email, user.username);
        
        // Group files by project name
        const filesByProject = {};
        userFiles.forEach(file => {
          const projectName = file.project_name || 'Unassigned Project';
          if (!filesByProject[projectName]) {
            filesByProject[projectName] = [];
          }
          filesByProject[projectName].push(file);
        });
        
        // Log project grouping
        Object.entries(filesByProject).forEach(([projectName, files]) => {
          console.log(`📂 Project "${projectName}": ${files.length} files`);
        });
        
        setAssignedFilesByProject(filesByProject);
        setAssignedFiles(userFiles);
      }
    } catch (error) {
      console.error('Error loading assigned files:', error);
    }
  };

  // Handle assigned file selection
  const handleAssignedFileSelect = (fileId) => {
    setSelectedAssignedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Handle select all assigned files
  const handleSelectAllAssignedFiles = (e) => {
    if (e.target.checked) {
      setSelectedAssignedFiles(new Set(assignedFiles.map(f => f.id)));
    } else {
      setSelectedAssignedFiles(new Set());
    }
  };

  // Add selected assigned files directly to project
  const handleAddToProject = async () => {
    if (selectedAssignedFiles.size === 0 && selectedProjectFolders.size === 0) {
      showToastMessage('⚠️ Please select at least one file or folder');
      return;
    }

    // If folders are selected, load the project for the first folder
    if (selectedProjectFolders.size > 0) {
      const firstFolderName = Array.from(selectedProjectFolders)[0];
      const loadedProject = await loadProjectByName(firstFolderName);
      if (!loadedProject) {
        return; // Error message already shown in loadProjectByName
      }
      // Ensure mode stays as 'assigned-files' when loading project from assigned files
      setProjectMode('assigned-files');
    } else if (!currentProject) {
      // If only individual files are selected and no project is loaded, show error
      showToastMessage('⚠️ Please select a folder (which has a project) or create a project first');
      return;
    }

    // Collect files from selected folders
    let filesToAdd = [];
    selectedProjectFolders.forEach(projectName => {
      const folderFiles = assignedFilesByProject[projectName] || [];
      filesToAdd.push(...folderFiles);
    });

    // Add individually selected files
    const selectedFiles = assignedFiles.filter(f => selectedAssignedFiles.has(f.id));
    filesToAdd.push(...selectedFiles);

    // Close modal first
    setSelectedAssignedFiles(new Set());
    setSelectedProjectFolders(new Set());
    setShowAssignedFilesModal(false);

    // Check which files already exist in project and add only new ones
    const token = authToken || localStorage.getItem('token');
    try {
      const imagesResponse = await fetch(`http://localhost:8000/api/projects/${currentProject.id}/images`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      let existingFilenames = new Set();
      if (imagesResponse.ok) {
        const projectImages = await imagesResponse.json();
        existingFilenames = new Set(projectImages.map(img => img.filename));
      }

      // Filter out files that already exist
      const newFiles = filesToAdd.filter(f => !existingFilenames.has(f.file_name));
      
      if (newFiles.length === 0) {
        showToastMessage('ℹ️ All selected files are already in the project');
        // Reload images to ensure we have the latest data
        await loadProjectImages();
        return;
      }

      // Process files and add them to project
      let successCount = 0;
      let errorCount = 0;

      for (const file of newFiles) {
        try {
          // Check if file already exists
          if (existingFilenames.has(file.file_name)) {
            continue;
          }

          // Fetch and upload file
          const fileResponse = await fetch(`http://localhost:8000/api/bulk-upload/files/${file.id}/preview`, {
            credentials: 'include'
          });
          
          if (!fileResponse.ok) {
            errorCount++;
            continue;
          }

          const blob = await fileResponse.blob();
          const formData = new FormData();
          formData.append('file', blob, file.file_name);
          formData.append('project_id', currentProject.id);

          const uploadResponse = await fetch('http://localhost:8000/api/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          if (uploadResponse.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error('Error adding file:', error);
          errorCount++;
        }
      }

      // Reload project images to show newly added files in image-gallery
      await loadProjectImages();

      if (successCount > 0) {
        showToastMessage(`✅ ${successCount} file(s) added to project`);
      }
      if (errorCount > 0) {
        showToastMessage(`⚠️ ${errorCount} file(s) failed to add`);
      }
    } catch (error) {
      console.error('Error processing files:', error);
      showToastMessage('❌ Error adding files to project');
    }
  };

  // Load file from queue to canvas
  const loadFileFromQueue = async (file, queueIndex) => {
    // If file has a project_name and no current project, try to load it
    if (!currentProject && file.project_name) {
      const loadedProject = await loadProjectByName(file.project_name);
      if (!loadedProject) {
        showToastMessage('⚠️ Please select a folder to load its project first');
        return;
      }
    } else if (!currentProject) {
      showToastMessage('⚠️ Please select a folder to load its project first');
      return;
    }

    try {
      // Check if file already exists in the project
      const token = authToken || localStorage.getItem('token');
      const imagesResponse = await fetch(`http://localhost:8000/api/projects/${currentProject.id}/images`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      let fileAlreadyInProject = false;
      let existingImage = null;
      
      if (imagesResponse.ok) {
        const projectImages = await imagesResponse.json();
        // Check if file with same filename already exists
        existingImage = projectImages.find(img => img.filename === file.file_name);
        if (existingImage) {
          fileAlreadyInProject = true;
        }
      }

      if (!fileAlreadyInProject) {
        // File doesn't exist in project, upload it
        const fileResponse = await fetch(`http://localhost:8000/api/bulk-upload/files/${file.id}/preview`, {
          credentials: 'include'
        });
        if (!fileResponse.ok) {
          throw new Error('Failed to fetch file');
        }

        const blob = await fileResponse.blob();
        const formData = new FormData();
        formData.append('file', blob, file.file_name);
        formData.append('project_id', currentProject.id);

        const uploadResponse = await fetch('http://localhost:8000/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error('Upload failed');
        }
      }

        // Remove from queue
        setFilesQueue(prev => prev.filter((_, idx) => idx !== queueIndex));
      
      // Reload all project images to get fresh data (this will include the file if it was just uploaded, or show existing one)
      await loadProjectImages();
      
      // Find and load the image that matches this file
      const imagesResponse2 = await fetch(`http://localhost:8000/api/projects/${currentProject.id}/images`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (imagesResponse2.ok) {
        const allImages = await imagesResponse2.json();
        // Find image by filename (could be the one we just uploaded or the existing one)
        const imageToLoad = allImages.find(img => img.filename === file.file_name);
        if (imageToLoad) {
          const imageIndex = allImages.findIndex(img => img.id === imageToLoad.id);
          await loadImageByData(imageToLoad, imageIndex, allImages);
        }
      }
      
      showToastMessage(`✅ ${file.file_name} loaded successfully`);
    } catch (error) {
      console.error('Error loading file from queue:', error);
      showToastMessage(`❌ Failed to load ${file.file_name}`);
    }
  };

  // Remove file from queue
  const removeFromQueue = (index) => {
    setFilesQueue(prev => prev.filter((_, idx) => idx !== index));
  };

  const loadProjectImages = async (projectId = null) => {
    const idToUse = projectId || (currentProject ? currentProject.id : null);
    if (!idToUse) return;

    try {
      const token = authToken || localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/projects/${idToUse}/images`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const imagesData = await response.json();
      console.log('📦 loadProjectImages: Loaded images data:', {
        count: imagesData.length,
        images: imagesData.map(img => ({ id: img.id, filename: img.filename, filepath: img.filepath })),
        currentTool,
        currentImageIndex
      });
      
      setImages(imagesData);
      updateStats();
      if (imagesData.length > 0) {
        // If on AI/Docs Annotation tool, set currentImageIndex first to trigger useEffect
        if (currentTool === 'ai-annotation' || currentTool === 'docs-annotation') {
          console.log('🎯 On AI/Docs tool, setting currentImageIndex to 0');
          setCurrentImageIndex(0);
          // Also set the current image directly
          setCurrentImage(imagesData[0]);
        } else {
          // Load first image using the fetched data directly for manual tools
          await loadImageByData(imagesData[0], 0, imagesData);
        }
        
        // Ensure annotations are loaded after image loads (especially when switching from AI tools)
        setTimeout(async () => {
          if (currentImage && (currentTool !== 'ai-annotation' && currentTool !== 'docs-annotation')) {
            await loadAnnotations();
          }
        }, 200);
      } else {
        // No images, clear canvas
        setCurrentImage(null);
        setImageObj(null);
        setCurrentImageIndex(0);
        setAnnotations([]);
        redrawCanvas();
      }
    } catch (error) {
      console.error('Error loading images:', error);
    }
  };

  const loadImageByData = async (imageToLoad, index, imagesArray) => {
    setCurrentImageIndex(index);
    setCurrentImage(imageToLoad);
    setSelectedAnnotationIndex(-1);

    // Clear annotations first
    setAnnotations([]);

    // Load annotations immediately for this image
    if (imageToLoad && imageToLoad.id) {
      try {
        const token = authToken || localStorage.getItem('token');
        const response = await fetch(`http://localhost:8000/api/images/${imageToLoad.id}/annotations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();

        const loadedAnnotations = data.map(ann => {
          const coords = JSON.parse(ann.coordinates);
          return {
            id: ann.id,
            class: ann.class_name,
            type: ann.annotation_type,
            ...coords
          };
        });

        setAnnotations(loadedAnnotations);
        updateStats();
      } catch (error) {
        console.error('Error loading annotations:', error);
      }
    }

    const img = new Image();
    img.onload = function () {
      setImageObj(img);
      // Ensure canvas is initialized before fitting image
      initializeCanvas();
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        fitImageToCanvas();
        // Redraw canvas to show annotations after image is loaded
        setTimeout(() => {
          redrawCanvas();
        }, 100);
      }, 50);
    };
    img.onerror = function () {
      showToastMessage('❌ Error loading image');
      console.error('Failed to load image:', imageToLoad.filepath);
    };
    img.src = `http://localhost:8000/uploads/${normalizeFilePath(imageToLoad.filepath)}`;
  };

  const loadImage = async (index) => {
    if (index < 0 || index >= images.length) return;

    const imageToLoad = images[index];
    setCurrentImageIndex(index);
    setSelectedAnnotationIndex(-1);

    // Don't clear annotations immediately - wait until new image is ready to prevent flickering
    // setAnnotations([]); // Removed to prevent flickering

    // Load image and annotations in parallel for smoother transition
    const img = new Image();
    let annotationsLoaded = false;
    let imageLoaded = false;

    const checkAndRedraw = () => {
      if (annotationsLoaded && imageLoaded) {
        // Both are ready, now update state and redraw once
        setCurrentImage(imageToLoad);
        setImageObj(img);
        initializeCanvas();
        // Single redraw after everything is ready
        requestAnimationFrame(() => {
          fitImageToCanvas();
          requestAnimationFrame(() => {
            redrawCanvas();
            // Ensure canvas is ready for drawing
            const canvas = canvasRef.current;
            if (canvas && currentTool !== 'ai-annotation' && currentTool !== 'docs-annotation') {
              canvas.style.pointerEvents = 'auto';
            }
          });
        });
      }
    };

    // Load annotations
    if (imageToLoad && imageToLoad.id) {
      try {
        const token = authToken || localStorage.getItem('token');
        const response = await fetch(`http://localhost:8000/api/images/${imageToLoad.id}/annotations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();

        const loadedAnnotations = data.map(ann => {
          const coords = JSON.parse(ann.coordinates);
          return {
            id: ann.id,
            class: ann.class_name,
            type: ann.annotation_type,
            ...coords
          };
        });

        setAnnotations(loadedAnnotations);
        updateStats();
        annotationsLoaded = true;
        checkAndRedraw();
      } catch (error) {
        console.error('Error loading annotations:', error);
        // Even if annotations fail, mark as loaded to allow image to show
        setAnnotations([]);
        annotationsLoaded = true;
        checkAndRedraw();
      }
    } else {
      // No image ID, clear annotations and mark as loaded
      setAnnotations([]);
      annotationsLoaded = true;
      checkAndRedraw();
    }

    // Load image
    img.onload = function () {
      imageLoaded = true;
      checkAndRedraw();
    };
    img.onerror = function () {
      showToastMessage('❌ Error loading image');
      console.error('Failed to load image:', imageToLoad.filepath);
      // Even on error, mark as loaded to prevent hanging
      imageLoaded = true;
      checkAndRedraw();
    };
    img.src = `http://localhost:8000/uploads/${normalizeFilePath(imageToLoad.filepath)}`;
  };

  const fitImageToCanvas = () => {
    const canvas = canvasRef.current;
    const wrapper = canvasWrapperRef.current;
    if (!canvas || !imageObj || !wrapper) return;

    // Ensure canvas is properly sized
    if (canvas.width !== wrapper.clientWidth || canvas.height !== wrapper.clientHeight) {
      canvas.width = wrapper.clientWidth;
      canvas.height = wrapper.clientHeight;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imageWidth = imageObj.width;
    const imageHeight = imageObj.height;

    if (canvasWidth === 0 || canvasHeight === 0) {
      // Canvas not ready yet, retry after a short delay
      setTimeout(fitImageToCanvas, 100);
      return;
    }

    const scaleX = canvasWidth / imageWidth * 0.9;
    const scaleY = canvasHeight / imageHeight * 0.9;
    const newZoom = Math.min(scaleX, scaleY);
    setZoom(newZoom);

    setPanX((canvasWidth - imageWidth * newZoom) / 2);
    setPanY((canvasHeight - imageHeight * newZoom) / 2);

    updateZoomDisplay();
    redrawCanvas();
  };

  const nextImage = () => {
    if (currentImageIndex < images.length - 1) loadImage(currentImageIndex + 1);
  };

  const prevImage = () => {
    if (currentImageIndex > 0) loadImage(currentImageIndex - 1);
  };

  const saveAnnotation = async (annotation) => {
    if (!currentImage) return;
    try {
      const token = authToken || localStorage.getItem('token');
      const coords = annotation.type === 'bbox' ? {
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height
      } : { points: annotation.points, brushSize: annotation.brushSize || 10 };

      const response = await fetch('http://localhost:8000/api/annotations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          image_id: currentImage.id,
          class_name: annotation.class,
          annotation_type: annotation.type,
          coordinates: coords
        })
      });

      if (response.ok) {
        const savedAnnotation = await response.json();
        // Update the annotation ID in the local state with the database ID
        setAnnotations(prev => prev.map(ann =>
          ann.id === annotation.id ? { ...ann, id: savedAnnotation.id } : ann
        ));
      }
    } catch (error) {
      console.error('Error saving annotation:', error);
    }
  };

  const loadAnnotations = async () => {
    if (!currentImage) return;

    try {
      const token = authToken || localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/images/${currentImage.id}/annotations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      const loadedAnnotations = data.map(ann => {
        const coords = JSON.parse(ann.coordinates);
        return {
          id: ann.id,
          class: ann.class_name,
          type: ann.annotation_type,
          ...coords
        };
      });

      setAnnotations(loadedAnnotations);
      updateStats();
      // Force a redraw after a small delay to ensure state is updated
      setTimeout(() => {
        redrawCanvas();
      }, 50);
    } catch (error) {
      console.error('Error loading annotations:', error);
    }
  };

  const deleteAnnotation = async (index) => {
    const annotation = annotations[index];
    if (!annotation) return;
    if (!window.confirm('Delete this annotation?')) return;

    try {
      const token = authToken || localStorage.getItem('token');
      if (annotation.id) {
        await fetch(`http://localhost:8000/api/annotations/${annotation.id}`, { 
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
      setAnnotations(prev => prev.filter((_, i) => i !== index));
      setSelectedAnnotationIndex(-1);
      updateStats();
      redrawCanvas();
      showToastMessage('🗑️ Annotation deleted');
      
      // Trigger DocsAnnotation to reload if docs-annotation tool is active
      if (currentTool === 'docs-annotation') {
        setDocsAnnotationReloadTrigger(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error deleting annotation:', error);
    }
  };

  const undoAnnotation = async () => {
    if (annotations.length > 0) {
      const last = annotations[annotations.length - 1];
      if (last.id) {
        try {
          const token = authToken || localStorage.getItem('token');
          await fetch(`http://localhost:8000/api/annotations/${last.id}`, { 
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (error) {
          console.error('Error deleting annotation:', error);
        }
      }
      setAnnotations(prev => prev.slice(0, -1));
      updateStats();
      redrawCanvas();
      showToastMessage('↶ Annotation undone');
    }
  };

  const clearCanvas = async () => {
    if (!window.confirm('Clear all annotations on this image?')) return;

    // Delete all annotations from database
    const token = authToken || localStorage.getItem('token');
    const deletePromises = annotations
      .filter(ann => ann.id)
      .map(ann =>
        fetch(`http://localhost:8000/api/annotations/${ann.id}`, { 
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
          .catch(error => {
            console.error('Error deleting annotation:', error);
          })
      );

    // Wait for all deletions to complete
    await Promise.all(deletePromises);

    setAnnotations([]);
    setSelectedAnnotationIndex(-1);
    updateStats();
    redrawCanvas();
    showToastMessage('🗑️ All annotations cleared');
  };

  const zoomIn = () => {
    setZoom(prev => {
      const newZoom = prev * 1.2;
      updateZoomDisplay();
      setTimeout(redrawCanvas, 0);
      return newZoom;
    });
  };

  const zoomOut = () => {
    setZoom(prev => {
      const newZoom = prev / 1.2;
      updateZoomDisplay();
      setTimeout(redrawCanvas, 0);
      return newZoom;
    });
  };

  const resetZoom = () => {
    fitImageToCanvas();
  };

  const updateZoomDisplay = () => {
    // This will be handled by the zoom display element
  };

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Get the point in image coordinates before zoom
    const imageX = (canvasX - panX) / zoom;
    const imageY = (canvasY - panY) / zoom;

    // Calculate new zoom
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom * delta));

    // Adjust pan to keep the same image point under the cursor
    const newPanX = canvasX - imageX * newZoom;
    const newPanY = canvasY - imageY * newZoom;

    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);

    setTimeout(() => {
      updateZoomDisplay();
      redrawCanvas();
    }, 0);
  }, [imageObj, panX, panY, redrawCanvas, updateZoomDisplay, zoom]);

  const exportDataset = async (e) => {
    e.preventDefault();
    if (!currentProject || images.length === 0) {
      showToastMessage('⚠️ No data to export');
      return;
    }

    setShowLoading(true);

    // Small delay to ensure any pending database operations complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Double-check that we have the current project ID
    const projectIdToExport = currentProject.id;
    if (!projectIdToExport) {
      showToastMessage('❌ Error: No project selected');
      setShowLoading(false);
      return;
    }

    try {
      console.log('Exporting project ID:', projectIdToExport, 'Project name:', currentProject.name);
      const response = await fetch('http://localhost:8000/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectIdToExport,
          format: exportFormat,
          class_colors: classColors // Send custom colors to backend
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        a.download = `${currentProject.name}_${exportFormat}_${timestamp}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setShowExportModal(false);
        showToastMessage('✅ Dataset exported successfully!');
      } else {
        showToastMessage('❌ Export failed');
      }
    } catch (error) {
      showToastMessage('❌ Error: ' + error.message);
    }
    setShowLoading(false);
  };

  const updateStats = () => {
    // Stats will be calculated and displayed in the render
  };

  const getClassCounts = () => {
    const classCounts = {};
    classes.forEach(c => classCounts[c] = 0);
    annotations.forEach(ann => {
      if (classCounts[ann.class] !== undefined) {
        classCounts[ann.class]++;
      }
    });
    return classCounts;
  };

  const classCounts = getClassCounts();
  const annotatedImagesCount = new Set(annotations.map(a => currentImage?.id)).size;

  useEffect(() => {
    redrawCanvas();
  }, [annotations, currentAnnotation, pendingAnnotation, zoom, panX, panY, imageObj, selectedAnnotationIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Update cursor when zoom or tool changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      if (currentTool === 'select' && zoom > 0.1 && imageObj) {
        canvas.style.cursor = isPanning ? 'grabbing' : 'grab';
      } else if (currentTool === 'select') {
        canvas.style.cursor = 'default';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    }
  }, [zoom, currentTool, imageObj, isPanning]);

  // Reinitialize canvas when wrapper size changes or when project changes
  useEffect(() => {
    const handleResize = () => {
      initializeCanvas();
      if (imageObj) {
        fitImageToCanvas();
      }
    };

    window.addEventListener('resize', handleResize);

    // Also initialize when currentProject changes (new project loaded)
    if (currentProject) {
      setTimeout(() => {
        initializeCanvas();
        if (imageObj) {
          fitImageToCanvas();
        }
      }, 100);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [currentProject, imageObj]);

  return (
    <div className="resources-container">
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .resources-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f0f1e;
          color: #e0e0e0;
          overflow: hidden;
        }
        .top-nav {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 15px 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 100;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          color: white;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .project-info {
          display: flex;
          align-items: center;
          gap: 15px;
          color: white;
        }
        .current-project {
          font-size: 18px;
          font-weight: 600;
          padding: 8px 16px;
          background: rgba(255,255,255,0.2);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
        }
        .current-project:hover {
          background: rgba(255,255,255,0.3);
        }
        .nav-actions {
          display: flex;
          gap: 12px;
        }
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s;
          font-size: 14px;
        }
        .btn-primary {
          background: white;
          color: #667eea;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255,255,255,0.3);
        }
        .btn-secondary {
          background: rgba(255,255,255,0.1);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.2);
        }
        .main-container {
          display: flex;
          height: calc(100vh - 66px);
        }
        .sidebar {
          width: 240px;
          background: #1a1a2e;
          border-right: 1px solid #2a2a3e;
          overflow-y: auto;
          padding: 16px;
        }
        // .sidebar-section {
        //   margin-bottom: 30px;
        // }
        .sidebar-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          color: #888;
          margin-top: 15px;
          letter-spacing: 1px;
        }
        .statistics-title {
            margin-bottom: 15px;
        }
        .tool-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .tool-btn {
          background: #2a2a3e;
          border: 2px solid transparent;
          padding: 8px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: #e0e0e0;
        }
        .tool-btn:hover {
          background: #3a3a4e;
          transform: translateY(-2px);
        }
        .tool-btn.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-color: #667eea;
          color: white;
        }
        .tool-icon {
          font-size: 24px;
        }
        .tool-name {
          font-size: 11px;
          font-weight: 600;
        }
        .tool-btn-wrapper {
          position: relative;
        }
        .tooltip {
          position: absolute;
          top: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          color: #000;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 1000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          border: 1px solid #fff;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s;
          width: 100%;
          white-space: normal;
          line-height: 1.4;
        }
        .tooltip.show {
          opacity: 1;
        }
        .tooltip::after {
          content: '';
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-bottom-color: #fff;
        }
        .tooltip-title {
          font-weight: 400;
          color: #000;
          margin-bottom: 8px;
          font-size: 13px;
        }
        .tooltip-steps {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .tooltip-steps li {
          margin-bottom: 6px;
          padding-left: 20px;
          position: relative;
        }
        .tooltip-steps li:before {
          content: '•';
          position: absolute;
          left: 0;
          color: #667eea;
          font-weight: bold;
        }
        .tooltip-steps li:last-child {
          margin-bottom: 0;
        }
        .brush-controls {
          background: #2a2a3e;
          padding: 15px;
          border-radius: 10px;
          margin-top: 10px;
          display: ${currentTool === 'brush' ? 'block' : 'none'};
        }
        .brush-control-item {
          margin-bottom: 15px;
        }
        .brush-control-item:last-child {
          margin-bottom: 0;
        }
        .brush-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #888;
          margin-bottom: 8px;
        }
        .brush-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #1a1a2e;
          outline: none;
          -webkit-appearance: none;
        }
        .brush-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          cursor: pointer;
        }
        .brush-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          cursor: pointer;
          border: none;
        }
        .brush-value {
          display: inline-block;
          background: rgba(255,255,255,0.1);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          float: right;
        }
        .brush-preview {
          width: 100%;
          height: 60px;
          background: #1a1a2e;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .brush-preview-dot {
          background: #667eea;
          border-radius: 50%;
          transition: all 0.2s;
        }
        .class-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .class-item {
          background: #2a2a3e;
          padding: 12px;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s;
          border: 2px solid transparent;
        }
        .class-item:hover {
          background: #3a3a4e;
        }
        .class-item.active {
          border-color: #667eea;
          background: rgba(102,126,234,0.1);
        }
        .class-color {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          margin-right: 10px;
        }
        .class-info {
          display: flex;
          align-items: center;
          flex: 1;
        }
        .class-count {
          background: rgba(255,255,255,0.1);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }
        .canvas-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #16162a;
        }
        .canvas-toolbar {
          background: #1a1a2e;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #2a2a3e;
        }
        .toolbar-left, .toolbar-right {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .zoom-control {
          display: flex;
          align-items: center;
          background: #2a2a3e;
          padding: 2px 0;
          border-radius: 8px;
          border: 1px solid #ffffff4d;
        }
        .zoom-btn {
          background: transparent;
          border: none;
          color: #e0e0e0;
          cursor: pointer;
          font-size: 18px;
          padding: 5px 10px;
          border-radius: 4px;
          transition: all 0.2s;
        }
        .zoom-btn:hover {
          background: rgba(255,255,255,0.1);
        }
        .zoom-display {
          font-weight: 600;
          min-width: 60px;
          text-align: center;
        }
        .canvas-wrapper {
          flex: 1;
          position: relative;
          overflow: hidden;
          background: #16162a;
        }
        .annotationCanvas {
          position: absolute;
          top: 0;
          left: 0;
          cursor: crosshair;
          width: 100%;
          height: 100%;
          display: block;
          // pointer-events: ${currentProject || currentImage ? 'auto' : 'none'};
        }
        .right-panel {
          width: 240px;
          background: #1a1a2e;
          border-left: 1px solid #2a2a3e;
          overflow-y: auto;
          padding: 20px;
        }
        .annotation-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .annotation-item {
          background: #2a2a3e;
          padding: 15px;
          border-radius: 10px;
          border: 2px solid transparent;
          transition: all 0.3s;
          cursor: pointer;
        }
        .annotation-item:hover {
          background: #3a3a4e;
        }
        .annotation-item.selected {
          border-color: #667eea;
          background: rgba(102,126,234,0.1);
        }
        .annotation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .annotation-class {
          font-weight: 700;
          font-size: 14px;
        }
        .annotation-actions {
          display: flex;
          gap: 8px;
        }
        .icon-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          color: #e0e0e0;
          cursor: pointer;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          font-size: 16px;
        }
        .icon-btn:hover {
          background: rgba(255,255,255,0.2);
        }
        .icon-btn.delete:hover {
          background: #e53e3e;
        }
        .annotation-details {
          font-size: 12px;
          color: #888;
        }
        .modal {
          display: ${showProjectModal || showProjectListModal || showUploadModal || showAssignedFilesModal || showExportModal || showAddClassModal ? 'flex' : 'none'};
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          z-index: 1000;
          justify-content: center;
          align-items: center;
        }
        .modal-content {
          background: #1a1a2e;
          border-radius: 16px;
          padding: 30px;
          max-width: 600px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .modal-header {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 20px;
          color: white;
        }
        .form-group {
          margin-bottom: 20px;
        }
        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #e0e0e0;
        }
        .form-input, .form-select, .form-textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #2a2a3e;
          border-radius: 8px;
          background: #2a2a3e;
          color: #e0e0e0;
          font-size: 14px;
          transition: all 0.3s;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          outline: none;
          border-color: #667eea;
          background: #3a3a4e;
        }
        .form-textarea {
          resize: vertical;
          min-height: 100px;
        }
        .file-upload {
          border: 2px dashed #2a2a3e;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
        }
        .file-upload:hover {
          border-color: #667eea;
          background: rgba(102,126,234,0.05);
        }
        .file-upload-icon {
          font-size: 48px;
          margin-bottom: 15px;
          color: #667eea;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 30px;
        }
        .btn-cancel {
          background: #2a2a3e;
          color: #e0e0e0;
        }
        .btn-cancel:hover {
          background: #3a3a4e;
        }
        .btn-submit {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .image-gallery {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 10px;
          margin-top: 15px;
        }
        .image-thumb {
          aspect-ratio: 1;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          border: 3px solid transparent;
          transition: all 0.3s;
          position: relative;
        }
        .image-thumb:hover {
          transform: scale(1.05);
          border-color: #667eea;
        }
        .image-thumb.active {
          border-color: #667eea;
        }
        .image-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .image-thumb-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
          padding: 5px;
          font-size: 10px;
          color: white;
        }
        .loading {
          display: ${showLoading ? 'block' : 'none'};
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 2000;
        }
        .spinner {
          width: 60px;
          height: 60px;
          border: 4px solid rgba(255,255,255,0.1);
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .toast {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, ${showToast ? '-50%' : '-40%'});
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px 35px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          z-index: 3000;
          opacity: ${showToast ? 1 : 0};
          transition: all 0.3s;
          pointer-events: ${showToast ? 'auto' : 'none'};
          font-size: 16px;
          font-weight: 600;
          min-width: 250px;
          text-align: center;
        }
        .welcome-screen {
          display: ${currentProject || currentImage ? 'none' : 'flex'};
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100%;
          text-align: center;
          padding: 40px;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10;
          pointer-events: auto;
        }
        .welcome-icon {
          font-size: 80px;
        }
        .welcome-title {
          font-size: 36px;
          font-weight: 700;
          margin-bottom: 15px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .welcome-subtitle {
          font-size: 18px;
          color: #fff;
          margin-bottom: 40px;
        }
        .project-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 400px;
          overflow-y: auto;
        }
        .project-list-item {
          background: #2a2a3e;
          padding: 15px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s;
          border: 2px solid transparent;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .project-list-item:hover {
          background: #3a3a4e;
          border-color: #667eea;
        }
        .project-list-item.active {
          border-color: #667eea;
          background: rgba(102,126,234,0.1);
        }
        .project-list-item-content {
          flex: 1;
          cursor: pointer;
        }
        .project-list-name {
          color: white;
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 5px;
        }
        .project-list-meta {
          font-size: 12px;
          color: #888;
        }
        .project-list-item-actions {
          display: flex;
          gap: 5px;
        }
        .project-delete-btn {
          background: rgba(229, 62, 62, 0.2);
          border: none;
          color: #e53e3e;
          cursor: pointer;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          font-size: 16px;
          flex-shrink: 0;
        }
        .project-delete-btn:hover {
          background: #e53e3e;
          color: white;
          transform: scale(1.1);
        }
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        ::-webkit-scrollbar-track {
          background: #1a1a2e;
        }
        ::-webkit-scrollbar-thumb {
          background: #3a3a4e;
          border-radius: 5px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #4a4a5e;
        }
        .sidebar-main-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 15px;
          color: white;
        }
      `}</style>

      {/* <div className="top-nav">
        <div className="logo">
          <span>🎨</span>
          <span>Roboflow Clone Pro</span>
        </div> */}
      {/* <div className="project-info">
          <div className="current-project" onClick={() => { loadProjectList(); setShowProjectListModal(true); }}>
            {currentProject ? currentProject.name : 'No Project Selected'}
          </div>
        </div> */}
      {/* <div className="nav-actions">
          <button className="btn btn-secondary" onClick={() => { loadProjectList(); setShowProjectListModal(true); }}>📁 Projects</button>
          <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>📦 Export</button>
          <button className="btn btn-primary" onClick={() => setShowProjectModal(true)}>➕ New Project</button>
        </div> */}
      {/* </div> */}

    <div className="main-container">
        <div className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-main-title mb-3">{currentProject ? currentProject.name : 'No Project Selected'}</div>
            <div className="sidebar-title mb-2">Manual Annotation</div>
            <div className="tool-grid">
              <div className={`tool-btn ${currentTool === 'select' ? 'active' : ''}`} data-tool="select" onClick={() => selectTool('select')}>
                <div className="tool-icon">👆</div>
                <div className="tool-name">Select</div>
              </div>
              <div className={`tool-btn ${currentTool === 'bbox' ? 'active' : ''}`} data-tool="bbox" onClick={() => selectTool('bbox')}>
                <div className="tool-icon">⬜</div>
                <div className="tool-name">Box</div>
              </div>
              <div
                className="tool-btn-wrapper"
                onMouseEnter={() => setShowPolygonTooltip(true)}
                onMouseLeave={() => setShowPolygonTooltip(false)}
              >
                <div className={`tool-btn ${currentTool === 'polygon' ? 'active' : ''}`} data-tool="polygon" onClick={() => selectTool('polygon')}>
                  <div className="tool-icon">🔷</div>
                  <div className="tool-name">Polygon</div>
                </div>
                {showPolygonTooltip && (
                  <div className="tooltip show">
                    <div className="tooltip-title">Double-click to finish (minimum 3 points)</div>
                  </div>
                )}
              </div>
              <div className={`tool-btn ${currentTool === 'brush' ? 'active' : ''}`} data-tool="brush" onClick={() => selectTool('brush')}>
                <div className="tool-icon">🖌️</div>
                <div className="tool-name">Brush</div>
              </div>
            </div>
            <div className="sidebar-title mb-2">AI Annotation</div>
            <div className="tool-grid">
              <div className={`tool-btn ${currentTool === 'ai-annotation' ? 'active' : ''}`} data-tool="ai-annotation" onClick={() => selectTool('ai-annotation')}>
                <div className="tool-icon">🤖</div>
                <div className="tool-name text-center">Image Annotation</div>
              </div>
              <div className={`tool-btn ${currentTool === 'docs-annotation' ? 'active' : ''}`} data-tool="docs-annotation" onClick={() => selectTool('docs-annotation')}>
                <div className="tool-icon">📄</div>
                <div className="tool-name text-center">Docs Annotation</div>
              </div>
            </div>

            <div className="brush-controls">
              <div className="brush-control-item">
                <label className="brush-label">
                  Brush Size
                  <span className="brush-value">{brushSize}px</span>
                </label>
                <input type="range" className="brush-slider" min="1" max="50" value={brushSize} onChange={(e) => updateBrushSize(e.target.value)} />
              </div>
              <div className="brush-control-item">
                <label className="brush-label">Preview</label>
                <div className="brush-preview">
                  <div className="brush-preview-dot" style={{ width: `${brushSize}px`, height: `${brushSize}px` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title mb-2">Classes</div>
            <div style={{ position: 'relative' }}>
              {/* Dropdown Button */}
              <div
                className={`class-dropdown-btn ${showClassDropdown ? 'active' : ''}`}
                onClick={() => setShowClassDropdown(!showClassDropdown)}
                style={{
                  background: '#2a2a3e',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '2px solid',
                  borderColor: currentClass ? getClassColor(currentClass) : '#2a2a3e',
                  transition: 'all 0.3s'
                }}
              >
                <div className="class-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {currentClass ? (
                    <>
                      <div className="class-color" style={{
                        background: getClassColor(currentClass),
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px'
                      }}></div>
                      <span>{currentClass}</span>
                      <span className="class-count" style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px'
                      }}>{classCounts[currentClass] || 0}</span>
                    </>
                  ) : (
                    <span style={{ color: '#888' }}>Select a class...</span>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: '#888' }}>{showClassDropdown ? '▲' : '▼'}</span>
              </div>

              {/* Dropdown Menu */}
              {showClassDropdown && (
                <div className="class-dropdown-menu" style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#1a1a2e',
                  border: '1px solid #2a2a3e',
                  borderRadius: '8px',
                  marginTop: '5px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  zIndex: 1000,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                  {classes.length === 0 ? (
                    <div style={{ padding: '15px', textAlign: 'center', color: '#888' }}>No classes yet</div>
                  ) : (
                    classes.map((className, index) => (
                <div
                  key={index}
                        className={`class-item ${currentClass === className ? 'active' : ''}`}
                        onClick={() => {
                          selectClass(className);
                          setShowClassDropdown(false);
                        }}
                        style={{
                          background: currentClass === className ? 'rgba(102,126,234,0.1)' : '#2a2a3e',
                          padding: '12px',
                          borderBottom: index < classes.length - 1 ? '1px solid #2a2a3e' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onMouseEnter={(e) => {
                          if (currentClass !== className) {
                            e.currentTarget.style.background = '#3a3a4e';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentClass !== className) {
                            e.currentTarget.style.background = '#2a2a3e';
                          }
                        }}
                      >
                        <div className="class-info" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                          <div className="class-color" style={{
                            background: getClassColor(className),
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px'
                          }}></div>
                          <span style={{ flex: 1 }}>{className}</span>
                          <span className="class-count" style={{
                            background: 'rgba(255,255,255,0.1)',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px'
                          }}>{classCounts[className] || 0}</span>
                        </div>
                        <button
                          className="icon-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteClass(className, e);
                          }}
                          title="Delete class"
                          style={{
                            width: '24px',
                            height: '24px',
                            padding: '0',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'transparent',
                            border: 'none',
                            color: '#ff6b6b',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            marginLeft: '8px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,107,107,0.2)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '10px' }} onClick={handleAddClass}>➕ Add Class</button>
          </div>

          {(currentProject || currentImage) && (
          <div className="sidebar-section">
            <div className="sidebar-title mb-2">Images</div>
            {projectMode === 'create-project' && (
            <button className="btn btn-primary" style={{ width: '100%', marginBottom: '10px' }} onClick={() => {
              // Close other modals first
              setShowAssignedFilesModal(false);
              setShowProjectListModal(false);
              setShowProjectModal(false);
              setShowExportModal(false);
              setShowUploadModal(true);
            }}>📤 Upload</button>
            )}
            {projectMode === 'assigned-files' && (
              <div style={{ 
                padding: '10px', 
                background: 'rgba(78, 205, 196, 0.1)', 
                border: '1px solid rgba(78, 205, 196, 0.3)', 
                borderRadius: '8px', 
                marginBottom: '10px',
                color: '#4ECDC4',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                📋 Working with Assigned Files
              </div>
            )}
            
            {/* Uploaded PDF Pages Display */}
            {uploadedPdfPages.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ 
                  fontSize: '12px', 
                  color: '#888', 
                  marginBottom: '8px',
                  fontWeight: '600'
                }}>
                  📄 Converted PDF Pages
                </div>
                <div style={{ 
                  maxHeight: '300px', 
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {uploadedPdfPages.map((pdfData, pdfIndex) => (
                    <div key={pdfIndex} style={{
                      background: 'rgba(15, 22, 36, 0.6)',
                      borderRadius: '8px',
                      padding: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#aaa', 
                        marginBottom: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>{pdfData.fileName}</span>
            <button 
                          onClick={() => {
                            setUploadedPdfPages(prev => prev.filter((_, idx) => idx !== pdfIndex));
                          }}
              style={{ 
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: '2px 6px'
                          }}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                        gap: '6px'
                      }}>
                        {pdfData.frames.map((frame, frameIndex) => (
                          <div
                            key={frame.id || frameIndex}
                            style={{
                              position: 'relative',
                              aspectRatio: '1',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              background: '#1a1a2e',
                              border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}
              onClick={() => {
                              if (currentProject && frame.id) {
                                // Find the image in the images array and load it
                                const imageIndex = images.findIndex(img => img.id === frame.id);
                                if (imageIndex !== -1) {
                                  loadImage(imageIndex);
                                } else {
                                  // If not in images array yet, load project images first
                                  loadProjectImages().then(() => {
                                    setTimeout(() => {
                                      const newImageIndex = images.findIndex(img => img.id === frame.id);
                                      if (newImageIndex !== -1) {
                                        loadImage(newImageIndex);
                                      }
                                    }, 500);
                                  });
                                }
                              }
                            }}
                            title={`Page ${frameIndex + 1} - Click to load`}
                          >
                            <img
                              src={`http://localhost:8000/uploads/${frame.filepath.replace(/\\/g, '/')}`}
                              alt={`Page ${frameIndex + 1}`}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                const parent = e.target.parentElement;
                                if (parent && !parent.querySelector('.error-icon')) {
                                  const errorDiv = document.createElement('div');
                                  errorDiv.className = 'error-icon';
                                  errorDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #888; font-size: 20px;';
                                  errorDiv.textContent = '📄';
                                  parent.appendChild(errorDiv);
                                }
                              }}
                              loading="lazy"
                            />
                            <div style={{
                              position: 'absolute',
                              bottom: '2px',
                              right: '2px',
                              background: 'rgba(0, 0, 0, 0.7)',
                              color: '#fff',
                              fontSize: '9px',
                              padding: '2px 4px',
                              borderRadius: '3px'
                            }}>
                              {frameIndex + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="image-gallery-container">
              <div className="image-gallery">
                {images.map((img, index) => (
                  <div 
                    key={img.id || index} 
                    className={`image-thumb ${index === currentImageIndex ? 'active' : ''}`} 
                    onClick={(e) => {
                      loadImage(index);
                    }}
                    style={{ position: 'relative' }}
                  >
                    {projectMode === 'create-project' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteImage(img.id, index, e);
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          background: 'rgba(229, 62, 62, 0.9)',
                          border: 'none',
                          color: 'white',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          zIndex: 10,
                          padding: 0,
                          lineHeight: 1
                        }}
                        title="Delete image"
                        onMouseEnter={(e) => {
                          e.target.style.background = 'rgba(229, 62, 62, 1)';
                          e.target.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = 'rgba(229, 62, 62, 0.9)';
                          e.target.style.transform = 'scale(1)';
                        }}
                      >
                        ✕
                      </button>
                    )}
                    <img 
                      src={`http://localhost:8000/uploads/${normalizeFilePath(img.filepath)}`} 
                      alt={img.filename} 
                      onError={(e) => {
                      e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%232a2a3e" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23888">No Image</text></svg>';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        loadImage(index);
                      }}
                      style={{ pointerEvents: 'auto' }}
                    />
                    <div className="image-thumb-overlay">{index + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>

        <div className="canvas-container">
          {currentTool === 'ai-annotation' ? (
            <AIAnnotation
              currentProject={currentProject}
              images={images}
              currentImageIndex={currentImageIndex}
              onImageSelect={loadImage}
              onSaveAnnotations={async (annotations) => {
                // Save AI-generated annotations to the project
                if (!currentProject || !currentImage) {
                  showToastMessage('⚠️ Please select a project and image first');
                  return;
                }
                try {
                  // Load existing annotations first to check for duplicates
                  const token = authToken || localStorage.getItem('token');
                  const existingResponse = await fetch(`http://localhost:8000/api/images/${currentImage.id}/annotations`, {
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  const existingData = await existingResponse.json();

                  // Helper function to check if two bbox annotations are similar (within 5px tolerance)
                  const isSimilarBbox = (ann1, ann2) => {
                    const coords1 = typeof ann1.coordinates === 'string' ? JSON.parse(ann1.coordinates) : ann1.coordinates;
                    const coords2 = typeof ann2.coordinates === 'string' ? JSON.parse(ann2.coordinates) : ann2.coordinates;

                    if (coords1.x === undefined || coords2.x === undefined) return false;

                    const tolerance = 5;
                    return Math.abs(coords1.x - coords2.x) < tolerance &&
                      Math.abs(coords1.y - coords2.y) < tolerance &&
                      Math.abs(coords1.width - coords2.width) < tolerance &&
                      Math.abs(coords1.height - coords2.height) < tolerance;
                  };

                  // Filter out annotations that already exist
                  console.log(`📊 Docs Annotation Save: ${annotations.length} total detections, ${existingData.length} existing in DB`);
                  const newAnnotations = annotations.filter(newAnn => {
                    const isDuplicate = existingData.some(existingAnn => {
                      if (existingAnn.annotation_type !== 'bbox') return false;
                      return isSimilarBbox(newAnn, existingAnn);
                    });
                    if (isDuplicate) {
                      console.log(`⚠️ Skipping duplicate: ${newAnn.class} at (${newAnn.coordinates.x}, ${newAnn.coordinates.y})`);
                    }
                    return !isDuplicate;
                  });

                  console.log(`✅ ${newAnnotations.length} new annotations to save (${annotations.length - newAnnotations.length} duplicates skipped)`);

                  if (newAnnotations.length === 0) {
                    showToastMessage('⚠️ All annotations already exist. No new annotations to save.');
                    return;
                  }

                  // Save only new annotations
                  let savedCount = 0;
                  let failedCount = 0;
                  for (const ann of newAnnotations) {
                    console.log(`💾 Saving: ${ann.class} at (${ann.coordinates.x}, ${ann.coordinates.y}, ${ann.coordinates.width}x${ann.coordinates.height})`);
                    const response = await fetch('http://localhost:8000/api/annotations', {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({
                        image_id: currentImage.id,
                        class_name: ann.class || 'object',
                        annotation_type: 'bbox',
                        coordinates: ann.coordinates
                      })
                    });
                    if (response.ok) {
                      savedCount++;
                    } else {
                      failedCount++;
                      const errorText = await response.text();
                      console.error(`❌ Failed to save annotation: ${ann.class}`, errorText);
                    }
                  }

                  console.log(`📈 Save complete: ${savedCount} saved, ${failedCount} failed`);

                  if (savedCount > 0) {
                    showToastMessage(`✅ Saved ${savedCount} new annotation${savedCount !== 1 ? 's' : ''} successfully! Switch to Box/Polygon/Brush tools to add missing annotations.`);
                    // Reload annotations to show them in the list and make them available for manual tools
                    if (currentImage) {
                      await loadAnnotations();
                      // Force redraw to ensure annotations are visible
                      setTimeout(() => {
                        redrawCanvas();
                      }, 150);
                    }
                  } else {
                    showToastMessage(`⚠️ Failed to save annotations${failedCount > 0 ? ` (${failedCount} failed)` : ''}. Please try again.`);
                  }
                } catch (err) {
                  console.error('Error saving annotations:', err);
                  showToastMessage('❌ Error saving annotations');
                }
              }}
            />
          ) : currentTool === 'docs-annotation' ? (
            <DocsAnnotation
              currentProject={currentProject}
              images={images}
              currentImageIndex={currentImageIndex}
              onImageSelect={loadImage}
              onOpenProjectModal={() => setShowProjectModal(true)}
              reloadTrigger={docsAnnotationReloadTrigger}
              onAnnotationDeleted={async () => {
                // Reload annotations in Resources.jsx when deleted in DocsAnnotation
                if (currentImage) {
                  await loadAnnotations();
                }
              }}
              onSaveAnnotations={async (annotations) => {
                // Save docs-generated annotations to the project
                if (!currentProject || !currentImage) {
                  showToastMessage('⚠️ Please select a project and image first');
                  return;
                }
                try {
                  // Load existing annotations first to check for duplicates
                  const token = authToken || localStorage.getItem('token');
                  const existingResponse = await fetch(`http://localhost:8000/api/images/${currentImage.id}/annotations`, {
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  const existingData = await existingResponse.json();

                  // Helper function to check if two bbox annotations are similar (within 5px tolerance)
                  const isSimilarBbox = (ann1, ann2) => {
                    const coords1 = typeof ann1.coordinates === 'string' ? JSON.parse(ann1.coordinates) : ann1.coordinates;
                    const coords2 = typeof ann2.coordinates === 'string' ? JSON.parse(ann2.coordinates) : ann2.coordinates;

                    if (coords1.x === undefined || coords2.x === undefined) return false;

                    const tolerance = 5;
                    return Math.abs(coords1.x - coords2.x) < tolerance &&
                      Math.abs(coords1.y - coords2.y) < tolerance &&
                      Math.abs(coords1.width - coords2.width) < tolerance &&
                      Math.abs(coords1.height - coords2.height) < tolerance;
                  };

                  // Filter out annotations that already exist
                  const newAnnotations = annotations.filter(newAnn => {
                    return !existingData.some(existingAnn => {
                      return existingAnn.annotation_type === 'bbox' &&
                        isSimilarBbox(newAnn, existingAnn);
                    });
                  });

                  if (newAnnotations.length === 0) {
                    showToastMessage('⚠️ All annotations already exist. No new annotations to save.');
                    return;
                  }

                  // Save only new annotations
                  let savedCount = 0;
                  for (const ann of newAnnotations) {
                    const response = await fetch('http://localhost:8000/api/annotations', {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({
                        image_id: currentImage.id,
                        class_name: ann.class || 'object',
                        annotation_type: 'bbox',
                        coordinates: ann.coordinates
                      })
                    });
                    if (response.ok) {
                      savedCount++;
                    }
                  }

                  if (savedCount > 0) {
                    showToastMessage(`✅ Saved ${savedCount} new annotation${savedCount !== 1 ? 's' : ''} successfully!`);
                    // Reload annotations to show them in the list
                    if (currentImage) {
                      await loadAnnotations();
                    }
                  } else {
                    showToastMessage('⚠️ Failed to save annotations. Please try again.');
                  }
                } catch (err) {
                  console.error('Error saving annotations:', err);
                  showToastMessage('❌ Error saving annotations');
                }
              }}
            />
          ) : currentTool === 'docs-annotation' ? (
            <DocsAnnotation
              currentProject={currentProject}
              images={images}
              currentImageIndex={currentImageIndex}
              onImageSelect={loadImage}
              onSaveAnnotations={async (annotations) => {
                // Save docs-generated annotations to the project
                if (!currentProject || !currentImage) {
                  showToastMessage('⚠️ Please select a project and image first');
                  return;
                }
                try {
                  let updatedCount = 0;
                  let createdCount = 0;
                  let failedCount = 0;

                  // Process each annotation: update if it has an ID, create if it doesn't
                  for (const ann of annotations) {
                    if (ann.id) {
                      // Annotation has an ID - update existing annotation
                      console.log(`[SAVE] Updating annotation ID ${ann.id}`, ann);
                      try {
                        const token = authToken || localStorage.getItem('token');
                        const response = await fetch(`http://localhost:8000/api/annotations/${ann.id}`, {
                          method: 'PUT',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({
                            class_name: ann.class || 'object',
                            annotation_type: ann.type || ann.annotation_type || 'bbox',
                            coordinates: ann.coordinates
                          })
                        });
                        if (response.ok) {
                          updatedCount++;
                          console.log(`[SAVE] Successfully updated annotation ID ${ann.id}`);
                        } else {
                          failedCount++;
                          const errorText = await response.text();
                          console.error(`[SAVE] Failed to update annotation ${ann.id}:`, errorText);
                        }
                      } catch (err) {
                        failedCount++;
                        console.error(`[SAVE] Error updating annotation ${ann.id}:`, err);
                      }
                    } else {
                      // Annotation doesn't have an ID - create new annotation
                      console.log(`[SAVE] Creating new annotation`, ann);
                      try {
                        const response = await fetch('http://localhost:8000/api/annotations', {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({
                            image_id: currentImage.id,
                            class_name: ann.class || 'object',
                            annotation_type: ann.type || ann.annotation_type || 'bbox',
                            coordinates: ann.coordinates
                          })
                        });
                        if (response.ok) {
                          createdCount++;
                          const savedAnn = await response.json();
                          console.log(`[SAVE] Successfully created annotation with ID ${savedAnn.id}`);
                        } else {
                          failedCount++;
                          const errorText = await response.text();
                          console.error(`[SAVE] Failed to create annotation:`, errorText);
                        }
                      } catch (err) {
                        failedCount++;
                        console.error('[SAVE] Error creating annotation:', err);
                      }
                    }
                  }

                  // Show appropriate message based on what was done
                  if (updatedCount > 0 || createdCount > 0) {
                    let message = '';
                    if (updatedCount > 0 && createdCount > 0) {
                      message = `✅ Updated ${updatedCount} annotation${updatedCount !== 1 ? 's' : ''} and created ${createdCount} new annotation${createdCount !== 1 ? 's' : ''}.`;
                    } else if (updatedCount > 0) {
                      message = `✅ Updated ${updatedCount} annotation${updatedCount !== 1 ? 's' : ''}.`;
                    } else {
                      message = `✅ Created ${createdCount} new annotation${createdCount !== 1 ? 's' : ''}.`;
                    }
                    if (failedCount > 0) {
                      message += ` ${failedCount} failed.`;
                    }
                    showToastMessage(message);
                    
                    // Note: DocsAnnotation component handles its own annotation reloading
                    // Only reload for non-docs-annotation tools to avoid conflicts
                    if (currentTool !== 'docs-annotation' && currentImage) {
                      await loadAnnotations();
                      // Force redraw to ensure annotations are visible
                      setTimeout(() => {
                        redrawCanvas();
                      }, 150);
                    }
                  } else if (failedCount > 0) {
                    showToastMessage(`⚠️ Failed to save ${failedCount} annotation${failedCount !== 1 ? 's' : ''}. Please try again.`);
                  }
                } catch (err) {
                  console.error('Error saving annotations:', err);
                  showToastMessage('❌ Error saving annotations');
                }
              }}
            />
          ) : (
            <>
              {(currentProject || currentImage) && (
                <div className="canvas-toolbar">
                  <div className="toolbar-left">
                    <div className="zoom-control">
                      <button className="zoom-btn" onClick={zoomOut}>−</button>
                      <span className="zoom-display">{Math.round(zoom * 100)}%</span>
                      <button className="zoom-btn" onClick={zoomIn}>+</button>
                      <button className="zoom-btn" onClick={resetZoom}>⟲</button>
                    </div>
                    <button className="btn btn-secondary" onClick={undoAnnotation}>↶ Undo</button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        if (selectedAnnotationIndex >= 0) {
                          deleteAnnotation(selectedAnnotationIndex);
                        } else {
                          showToastMessage('⚠️ Please select an annotation to delete');
                        }
                      }}
                      disabled={selectedAnnotationIndex < 0}
                      title="Delete selected annotation (Ctrl+D or Delete)"
                      style={{ opacity: selectedAnnotationIndex < 0 ? 0.5 : 1, cursor: selectedAnnotationIndex < 0 ? 'not-allowed' : 'pointer' }}
                    >
                      🗑️ Delete
                    </button>
                    <button className="btn btn-secondary" onClick={clearCanvas}>🗑️ Clear All</button>
                  </div>
                  <div className="toolbar-right">
                    <button className="btn btn-secondary" onClick={prevImage}>← Prev</button>
                    <span>{currentImageIndex + 1} / {images.length}</span>
                    <button className="btn btn-secondary" onClick={nextImage}>Next →</button>
                  </div>
                </div>
              )}

              <div className="canvas-wrapper" ref={canvasWrapperRef}>
                <div className="welcome-screen">
                  <div className="welcome-screen-content">
                    <div className="welcome-icon"><img src={RoboSpectraLogo} alt="Product Logo" style={{ height: '100px', width: 'auto' }} /></div>
                    <div className="welcome-title">Welcome to RoboSpectra</div>
                    <div className="welcome-subtitle">Professional Image Annotation Platform</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '20px' }}>
                      <button className="btn btn-primary" onClick={() => setShowProjectModal(true)} style={{ fontSize: '16px', padding: '16px' }}>Create Your Project</button>
                      <button className="btn btn-secondary" onClick={() => {
                        setProjectMode('assigned-files');
                        setShowAssignedFilesModal(true);
                        loadAssignedFiles().catch(err => {
                          console.error('Error loading assigned files:', err);
                        });
                      }} style={{ fontSize: '16px', padding: '16px' }}>📋 Assigned Project</button>
                    </div>
                  </div>
                </div>
                <canvas
                  ref={canvasRef}
                  className="annotationCanvas"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => {
                    setShowCrosshair(false);
                    redrawCanvas();
                  }}
                  onDoubleClick={handleDoubleClick}
                ></canvas>
              </div>
            </>
          )}
        </div>

        <div className="right-panel">
          <div className="sidebar-section">
            <div className="nav-actions mb-3">
              {/* <div className="btn btn-secondary" style={{ position: 'relative' }} data-project-dropdown>
                <button 
                  className="btn text-white project-txt" 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                >
                  +
                  <span>Project</span>
                </button>
                {showProjectDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#2a2a3e',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    marginTop: '4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                  }}>
                    <button
                      className="btn"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: projectMode === 'create-project' ? '#4ECDC4' : 'transparent',
                        border: 'none',
                        color: '#fff',
                        padding: '10px 15px',
                        cursor: 'pointer',
                        borderRadius: '8px 8px 0 0'
                      }}
                      onClick={() => {
                        setProjectMode('create-project');
                        setShowProjectDropdown(false);
                        setShowProjectModal(true);
                      }}
                    >
                      ➕ Create Project
                    </button>
                    <button
                      className="btn"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: projectMode === 'assigned-files' ? '#4ECDC4' : 'transparent',
                        border: 'none',
                        color: '#fff',
                        padding: '10px 15px',
                        cursor: 'pointer',
                        borderRadius: '0 0 8px 8px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectMode('assigned-files');
                        setShowProjectDropdown(false);
                        // Open modal immediately
                        setShowAssignedFilesModal(true);
                        // Load files in the background (don't await to avoid blocking)
                        loadAssignedFiles().catch(err => {
                          console.error('Error loading assigned files:', err);
                        });
                      }}
                    >
                      📋 Assigned Files
                    </button>
                  </div>
                )}
              </div> */}
              {/* <button className="btn btn-secondary" onClick={() => { 
                setShowAssignedFilesModal(false); // Close assigned files modal if open
                loadProjectList(); 
                setShowProjectListModal(true); 
              }}>📁 History</button> */}
              <button className="btn btn-secondary texts" onClick={() => setShowExportModal(true)}>📦 Export</button>
            </div>
            <div className="sidebar-title">Annotations ({annotations.length})</div>
            <div className="annotation-list">
              {annotations.map((ann, index) => (
                <div key={index} className={`annotation-item ${index === selectedAnnotationIndex ? 'selected' : ''}`} onClick={(e) => {
                  if (!e.target.classList.contains('icon-btn') && !e.target.parentElement.classList.contains('icon-btn')) {
                    setSelectedAnnotationIndex(index);
                    redrawCanvas();
                  }
                }}>
                  <div className="annotation-header">
                    <span className="annotation-class" style={{ color: getClassColor(ann.class) }}>
                      {ann.class}
                    </span>
                    <div className="annotation-actions">
                      <button className="icon-btn delete" onClick={(e) => { e.stopPropagation(); deleteAnnotation(index); }} title="Delete">🗑️</button>
                    </div>
                  </div>
                  <div className="annotation-details">Type: {ann.type}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title statistics-title">Statistics</div>
            <div style={{ fontSize: '13px', color: '#e0e0e0' }}>
              <div style={{ marginBottom: '10px' }}>
                <strong>Total Images:</strong> {images.length}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Annotated:</strong> {annotatedImagesCount}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Total Objects:</strong> {annotations.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Project Modal */}
      {showProjectModal && (
        <div className="modal" onClick={(e) => { if (e.target.className === 'modal') setShowProjectModal(false); }}>
          <div className="modal-content">
            <div className="modal-header">Create New Project</div>
            <form onSubmit={createProject}>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input type="text" className="form-input" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="My Detection Project" required />
              </div>
              <div className="form-group">
                <label className="form-label">Project Type</label>
                <select className="form-select" value={projectType} onChange={(e) => setProjectType(e.target.value)} required>
                  <option value="object-detection">Object Detection</option>
                  <option value="segmentation">Instance Segmentation</option>
                  <option value="classification">Classification</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="Describe your project..."></textarea>
              </div>
              {/* <div className="form-group">
                <label className="form-label">Class Labels (comma-separated) <span style={{ color: '#888', fontSize: '12px', fontWeight: 'normal' }}>(Optional)</span></label>
                <input type="text" className="form-input" value={projectClasses} onChange={(e) => setProjectClasses(e.target.value)} placeholder="person, car, dog" />
              </div> */}
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setShowProjectModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-submit">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project List Modal */}
      {showProjectListModal && (
        <div className="modal" onClick={(e) => { 
          // Only close if clicking directly on the modal backdrop (not on child elements)
          if (e.target === e.currentTarget) {
            setShowProjectListModal(false);
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">Project History</div>
            <div className="project-list">
              {!Array.isArray(projectList) || projectList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No projects yet. Create your project!</div>
              ) : (
                projectList.map(project => (
                  <div key={project.id} className={`project-list-item ${currentProject && currentProject.id === project.id ? 'active' : ''}`}>
                    <div className="project-list-item-content" onClick={() => { loadProject(project); setShowProjectListModal(false); }}>
                      <div className="project-list-name">{project.name}</div>
                      <div className="project-list-meta">
                        {project.project_type} • Created {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="project-list-item-actions">
                      <button
                        className="project-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(project.id, project.name);
                        }}
                        title="Delete project"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
                      </div>
            <div className="modal-actions">
              {projectList.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  style={{ background: '#e53e3e', color: 'white' }}
                  onClick={deleteAllProjects}
                >
                  🗑️ Delete All Projects
                </button>
              )}
              <button type="button" className="btn btn-cancel" onClick={() => setShowProjectListModal(false)}>Close</button>
                  </div>
                </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal" onClick={(e) => { 
          // Only close if clicking directly on the modal backdrop (not on child elements)
          if (e.target === e.currentTarget) {
            setShowUploadModal(false);
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">Upload Images/Videos/PDFs</div>
            <div className="file-upload" onClick={() => document.getElementById('fileInput').click()}>
              <div className="file-upload-icon">📁</div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#fff' }}>Drop files or click to browse</div>
              <div style={{ fontSize: '13px', color: '#888' }}>JPG, PNG, MP4, AVI, PDF supported</div>
        </div>
            <input type="file" id="fileInput" multiple accept="image/*,video/*,.pdf" style={{ display: 'none' }} onChange={handleFileUpload} />
            {showUploadProgress && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ background: '#2a2a3e', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', height: '100%', width: `${uploadProgress}%`, transition: 'width 0.3s' }}></div>
      </div>
                <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '13px' }}>{uploadStatus}</div>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-cancel" onClick={() => setShowUploadModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Assigned Files Modal */}
      {showAssignedFilesModal && (
        <div className="modal" onClick={(e) => { 
          // Only close if clicking directly on the modal backdrop (not on child elements)
          if (e.target === e.currentTarget) {
            setShowAssignedFilesModal(false);
          }
        }}>
          <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '80vh' }}>
            <div className="modal-header">Assigned Files</div>
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {assignedFiles.length > 0 ? (
                <>
                  <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={assignedFiles.length > 0 && assignedFiles.every(f => selectedAssignedFiles.has(f.id))}
                        onChange={handleSelectAllAssignedFiles}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Select All ({selectedAssignedFiles.size} selected)</span>
                    </label>
                  </div>
                  {/* Project Folders */}
                  {Object.keys(assignedFilesByProject).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {Object.entries(assignedFilesByProject).map(([projectName, files]) => {
                        const isExpanded = expandedProjectFolders.has(projectName);
                        return (
                          <div key={projectName} style={{ border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', overflow: 'hidden' }}>
                            {/* Folder Header */}
                            <div
                              style={{
                                padding: '12px 15px',
                                background: selectedProjectFolders.has(projectName) ? '#4ECDC4' : (isExpanded ? '#3a3a5e' : '#2a2a3e'),
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background 0.2s',
                                border: selectedProjectFolders.has(projectName) ? '2px solid #fff' : '2px solid transparent'
                              }}
                              onClick={(e) => {
                                // Only handle folder selection if not clicking on checkbox or arrow
                                if (e.target.type === 'checkbox' || e.target.closest('.folder-arrow')) {
                                  return;
                                }
                                // Toggle folder selection (just track selection, don't add to queue)
                                const newSelected = new Set(selectedProjectFolders);
                                if (selectedProjectFolders.has(projectName)) {
                                  newSelected.delete(projectName);
                                } else {
                                  newSelected.add(projectName);
                                }
                                setSelectedProjectFolders(newSelected);
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedProjectFolders.has(projectName)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    // Toggle folder selection (just track selection, don't add to queue)
                                    const newSelected = new Set(selectedProjectFolders);
                                    if (selectedProjectFolders.has(projectName)) {
                                      newSelected.delete(projectName);
                                    } else {
                                      newSelected.add(projectName);
                                    }
                                    setSelectedProjectFolders(newSelected);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                />
                                <span style={{ fontSize: '18px' }}>{isExpanded ? '📂' : '📁'}</span>
                                <span style={{ fontWeight: '600', color: '#fff', flex: 1 }}>{projectName}</span>
                                <span style={{ fontSize: '12px', color: '#aaa' }}>
                                  ({files.length} {files.length === 1 ? 'file' : 'files'})
                                </span>
                              </div>
                              <span 
                                className="folder-arrow"
                                style={{ fontSize: '14px', color: '#fff', cursor: 'pointer', padding: '4px 8px', marginLeft: '8px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newExpanded = new Set(expandedProjectFolders);
                                  if (isExpanded) {
                                    newExpanded.delete(projectName);
                                  } else {
                                    newExpanded.add(projectName);
                                  }
                                  setExpandedProjectFolders(newExpanded);
                                }}
                              >
                                {isExpanded ? '▼' : '▶'}
                              </span>
                            </div>
                            
                            {/* Folder Content */}
                            {isExpanded && (
                              <div style={{ padding: '15px', background: '#1a1a2e' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                                  {files.map((file) => {
                                    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(file.file_type?.toLowerCase());
                                    const isPdf = file.file_type?.toLowerCase() === 'pdf';
                                    const previewUrl = isImage ? `http://localhost:8000/api/bulk-upload/files/${file.id}/preview` : null;
                                    
                                    return (
                      <div
                        key={file.id}
                        style={{
                          padding: '10px',
                          background: selectedAssignedFiles.has(file.id) ? '#4ECDC4' : '#2a2a3e',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          border: selectedAssignedFiles.has(file.id) ? '2px solid #fff' : '2px solid transparent',
                                          transition: 'all 0.2s',
                                          position: 'relative',
                                          overflow: 'hidden'
                        }}
                        onClick={() => handleAssignedFileSelect(file.id)}
                      >
                                        {isImage && previewUrl ? (
                                          <div style={{ 
                                            width: '100%', 
                                            height: '120px', 
                                            marginBottom: '8px',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            background: '#1a1a2e',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            position: 'relative'
                                          }}>
                                            <img 
                                              src={previewUrl} 
                                              alt={file.file_name}
                                              style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                display: 'block'
                                              }}
                                              onError={(e) => {
                                                e.target.style.display = 'none';
                                                const parent = e.target.parentElement;
                                                if (parent && !parent.querySelector('.error-icon')) {
                                                  const errorDiv = document.createElement('div');
                                                  errorDiv.className = 'error-icon';
                                                  errorDiv.style.cssText = 'color: #888; font-size: 48px; position: absolute;';
                                                  errorDiv.textContent = '🖼️';
                                                  parent.appendChild(errorDiv);
                                                }
                                              }}
                                              loading="lazy"
                                            />
                        </div>
                                        ) : isPdf ? (
                                          <div style={{ 
                                            width: '100%', 
                                            height: '120px', 
                                            marginBottom: '8px',
                                            borderRadius: '6px',
                                            background: '#1a1a2e',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '48px'
                                          }}>
                                            📄
                                          </div>
                                        ) : (
                                          <div style={{ 
                                            width: '100%', 
                                            height: '120px', 
                                            marginBottom: '8px',
                                            borderRadius: '6px',
                                            background: '#1a1a2e',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '48px'
                                          }}>
                                            📁
                                          </div>
                                        )}
                                        <div style={{ fontSize: '11px', color: '#fff', textAlign: 'center', wordBreak: 'break-word', fontWeight: '500' }}>
                          {file.file_name}
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '4px' }}>
                                          {file.file_type?.toUpperCase() || 'FILE'}
                        </div>
                      </div>
                                    );
                                  })}
                  </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                      {assignedFiles.map((file) => {
                        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(file.file_type?.toLowerCase());
                        const isPdf = file.file_type?.toLowerCase() === 'pdf';
                        const previewUrl = isImage ? `http://localhost:8000/api/bulk-upload/files/${file.id}/preview` : null;
                        
                        return (
                          <div
                            key={file.id}
                            style={{
                              padding: '10px',
                              background: selectedAssignedFiles.has(file.id) ? '#4ECDC4' : '#2a2a3e',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              border: selectedAssignedFiles.has(file.id) ? '2px solid #fff' : '2px solid transparent',
                              transition: 'all 0.2s',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                            onClick={() => handleAssignedFileSelect(file.id)}
                          >
                            {isImage && previewUrl ? (
                              <div style={{ 
                                width: '100%', 
                                height: '120px', 
                                marginBottom: '8px',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                background: '#1a1a2e',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative'
                              }}>
                                <img 
                                  src={previewUrl} 
                                  alt={file.file_name}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block'
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const parent = e.target.parentElement;
                                    if (parent && !parent.querySelector('.error-icon')) {
                                      const errorDiv = document.createElement('div');
                                      errorDiv.className = 'error-icon';
                                      errorDiv.style.cssText = 'color: #888; font-size: 48px; position: absolute;';
                                      errorDiv.textContent = '🖼️';
                                      parent.appendChild(errorDiv);
                                    }
                                  }}
                                  loading="lazy"
                                />
                              </div>
                            ) : isPdf ? (
                              <div style={{ 
                                width: '100%', 
                                height: '120px', 
                                marginBottom: '8px',
                                borderRadius: '6px',
                                background: '#1a1a2e',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '48px'
                              }}>
                                📄
                              </div>
                            ) : (
                              <div style={{ 
                                width: '100%', 
                                height: '120px', 
                                marginBottom: '8px',
                                borderRadius: '6px',
                                background: '#1a1a2e',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '48px'
                              }}>
                                📁
                              </div>
                            )}
                            <div style={{ fontSize: '11px', color: '#fff', textAlign: 'center', wordBreak: 'break-word', fontWeight: '500' }}>
                              {file.file_name}
                            </div>
                            <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '4px' }}>
                              {file.file_type?.toUpperCase() || 'FILE'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                  No files assigned to you yet.
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddToProject}
                disabled={(selectedAssignedFiles.size === 0 && selectedProjectFolders.size === 0)}
                style={{ marginRight: '10px' }}
                title={(selectedAssignedFiles.size === 0 && selectedProjectFolders.size === 0) ? 'Please select at least one file or folder' : selectedProjectFolders.size > 0 ? 'Load project and add files' : 'Add selected files to project'}
              >
                {selectedProjectFolders.size > 0 ? 'Load Project & Add Files' : 'Add to Project'} ({selectedAssignedFiles.size + Array.from(selectedProjectFolders).reduce((sum, folder) => sum + (assignedFilesByProject[folder]?.length || 0), 0)})
              </button>
              <button type="button" className="btn btn-cancel" onClick={() => setShowAssignedFilesModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Class Modal */}
      {showAddClassModal && (
        <div className="modal" onClick={(e) => { if (e.target.className === 'modal') setShowAddClassModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">Add New Class</div>
            <div style={{ padding: '20px' }}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Enter new class name:</label>
                <input
                  type="text"
                  className="form-input"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g., person, car, dog"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addClass();
                    } else if (e.key === 'Escape') {
                      setShowAddClassModal(false);
                    }
                  }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Choose the color:</label>
                <div style={{ marginBottom: '15px' }}>
                  {/* Color Palette Circles */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(8, 1fr)',
                    gap: '10px',
                    marginBottom: '15px'
                  }}>
                    {colorPalette.map((color, index) => (
                      <div
                        key={index}
                        onClick={() => setSelectedClassColor(color)}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: color,
                          cursor: 'pointer',
                          border: selectedClassColor === color ? '3px solid #fff' : '2px solid transparent',
                          boxShadow: selectedClassColor === color ? '0 0 0 2px #667eea' : 'none',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedClassColor !== color) {
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={color}
                      >
                        {selectedClassColor === color && (
                          <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>✓</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Color Code Input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(selectedClassColor) ? selectedClassColor : '#FF6B6B'}
                      onChange={(e) => setSelectedClassColor(e.target.value)}
                      style={{
                        width: '60px',
                        height: '40px',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    />
                    <input
                      type="text"
                      value={selectedClassColor}
                      onChange={(e) => {
                        const color = e.target.value;
                        // Allow partial input while typing, but validate format
                        if (color === '' || /^#[0-9A-Fa-f]{0,6}$/.test(color)) {
                          setSelectedClassColor(color);
                        }
                      }}
                      onBlur={(e) => {
                        // Validate and fix color on blur
                        const color = e.target.value;
                        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
                          // If invalid, try to fix it or use default
                          if (color.startsWith('#') && /^[0-9A-Fa-f]{1,5}$/.test(color.substring(1))) {
                            // Pad with zeros if partial
                            const hex = color.substring(1).padEnd(6, '0');
                            setSelectedClassColor('#' + hex);
                          } else {
                            // Reset to a valid color
                            setSelectedClassColor('#FF6B6B');
                          }
                        }
                      }}
                      placeholder="#FF6B6B"
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#2a2a3e',
                        border: '1px solid #3a3a4e',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  {/* Preview */}
                  <div style={{
                    marginTop: '15px',
                    padding: '12px',
                    background: '#2a2a3e',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '4px',
                      background: selectedClassColor
                    }}></div>
                    <span style={{ color: '#888', fontSize: '14px' }}>Preview: {newClassName || 'Class name'}</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-cancel"
                  onClick={() => {
                    setShowAddClassModal(false);
                    setNewClassName('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-submit"
                  onClick={addClass}
                  disabled={!newClassName.trim()}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal" onClick={(e) => { if (e.target.className === 'modal') setShowExportModal(false); }}>
          <div className="modal-content">
            <div className="modal-header">Export Dataset</div>
            <form onSubmit={exportDataset}>
              <div className="form-group">
                <label className="form-label">Export Format</label>
                <select className="form-select" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} required>
                  <option value="yolov8">YOLOv8</option>
                  <option value="yolov5">YOLOv5</option>
                  <option value="coco">COCO JSON</option>
                  <option value="voc">Pascal VOC</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setShowExportModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-submit">📦 Export & Download</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="loading">
        <div className="spinner"></div>
      </div>

      {/* Class Selection Panel for Pending Annotation - Draggable Panel */}
      {pendingAnnotation && (
        <div
          style={{
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
            left: `${classPanelPosition.x}px`,
            top: `${classPanelPosition.y}px`,
            cursor: isDraggingClassPanel ? 'grabbing' : 'default'
          }}
          onMouseDown={handleClassPanelMouseDown}
        >
          <div 
            className="class-panel-header" 
            style={{
              background: isDraggingClassPanel 
                ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(118, 75, 162, 0.25) 100%)'
                : 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: isDraggingClassPanel ? 'grabbing' : 'grab',
              userSelect: 'none',
              transition: 'all 0.3s ease',
              borderRadius: '16px 16px 0 0'
            }}
          >
            <span style={{
              color: '#fff',
              fontSize: '15px',
              fontWeight: '700',
              pointerEvents: 'none',
              letterSpacing: '0.3px',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
            }}>
              🏷️ Select Class
            </span>
            <span 
              className="class-panel-drag-handle"
              style={{
                color: isDraggingClassPanel ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '20px',
                cursor: 'grab',
                userSelect: 'none',
                lineHeight: '1',
                padding: '4px 8px',
                transition: 'all 0.2s ease',
                borderRadius: '6px'
              }}
              title="Drag to move"
            >
              ⋮⋮
            </span>
          </div>
          <div style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
            maxHeight: 'calc(85vh - 60px)',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent'
          }}>
            <p style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '13px',
              margin: 0,
              lineHeight: '1.5'
            }}>
              {pendingAnnotation.type === 'pre-draw' 
                ? `Select a class before drawing with ${pendingAnnotation.tool === 'bbox' ? 'Box' : pendingAnnotation.tool === 'polygon' ? 'Polygon' : 'Brush'} tool`
                : `Choose a class for your ${pendingAnnotation.type === 'bbox' ? 'bounding box' : pendingAnnotation.type === 'polygon' ? 'polygon' : 'brush'} annotation`
              }
            </p>
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.7)',
                marginBottom: '10px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '1.2px'
              }}>
                Class:
              </label>
              <select
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(15, 22, 36, 0.7)',
                  color: 'white',
                  border: '2px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '14px',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  fontWeight: '500'
                }}
                value={pendingClassSelection}
                onChange={(e) => setPendingClassSelection(e.target.value)}
                autoFocus
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(102, 126, 234, 0.5)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                {classes.length > 0 ? (
                  classes.map(c => <option key={c} value={c}>{c}</option>)
                ) : (
                  <option value="">No classes available</option>
                )}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                className="tool-btn"
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  cursor: pendingClassSelection ? 'pointer' : 'not-allowed',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
                  opacity: !pendingClassSelection ? 0.5 : 1
                }}
                onClick={confirmPendingAnnotation}
                disabled={!pendingClassSelection}
              >
                ✓ Confirm
              </button>
              <button
                className="tool-btn"
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'all 0.3s ease'
                }}
                onClick={cancelPendingAnnotation}
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && <div className="toast">{toastMessage}</div>}
    </div>
  );
};

export default Resources;
