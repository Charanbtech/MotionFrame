import React, { useState, useRef, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import './AIAnnotationFast.css';

export default function AIAnnotationFast() {
  const { authToken } = useContext(AuthContext);
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [selectedMaskIndex, setSelectedMaskIndex] = useState(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFileSelect = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles([...files, ...newFiles]);
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setResults(null);
    setSelectedFileIndex(0);
    setSelectedMaskIndex(null);
  };

  const processBatch = async () => {
    if (files.length === 0) {
      alert('Please select at least one file');
      return;
    }

    setProcessing(true);
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/sam/batch?export=false', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'X-Requested-From': 'ai-annotation'
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.results || []);
      setSelectedFileIndex(0);
      setSelectedMaskIndex(0);
    } catch (error) {
      console.error('Batch processing error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const exportResults = async () => {
    if (!results || results.length === 0) {
      alert('No results to export');
      return;
    }

    try {
      // Use the same files as before to re-process and export
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/sam/batch?export=true', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'X-Requested-From': 'ai-annotation'
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Download zip file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sam_annotations.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}`);
    }
  };

  const displayCurrentMask = () => {
    if (!results || results.length === 0) return;

    const currentResult = results[selectedFileIndex];
    if (!currentResult || !currentResult.masks) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw selected mask if available
    if (selectedMaskIndex !== null && currentResult.masks[selectedMaskIndex]) {
      const maskDataUrl = currentResult.masks[selectedMaskIndex];
      const img = new Image();
      img.onload = () => {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;

        // Draw polygon outline if available
        if (currentResult.polygons && currentResult.polygons[selectedMaskIndex]) {
          const polygon = currentResult.polygons[selectedMaskIndex];
          if (polygon.length > 0) {
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(polygon[0][0], polygon[0][1]);
            for (let i = 1; i < polygon.length; i++) {
              ctx.lineTo(polygon[i][0], polygon[i][1]);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
      };
      img.src = maskDataUrl;
    }
  };

  React.useEffect(() => {
    displayCurrentMask();
  }, [results, selectedFileIndex, selectedMaskIndex]);

  if (!results) {
    return (
      <div className="ai-annotation-fast-container">
        <div className="upload-section">
          <h1>🚀 Fast AI Annotation</h1>
          <p>Batch process images and PDFs with AI-powered segmentation</p>

          <div className="file-upload-area">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              className="select-files-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📁 Select Files
            </button>
            <p className="help-text">Select images (JPG, PNG, GIF) or PDFs</p>
          </div>

          {files.length > 0 && (
            <div className="selected-files">
              <h3>Selected Files ({files.length})</h3>
              <div className="files-list">
                {files.map((file, idx) => (
                  <div key={idx} className="file-item">
                    <span>📄 {file.name}</span>
                    <button
                      className="remove-btn"
                      onClick={() => removeFile(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button className="clear-all-btn" onClick={clearAllFiles}>
                Clear All
              </button>
            </div>
          )}

          <div className="action-buttons">
            <button
              className="process-btn"
              onClick={processBatch}
              disabled={files.length === 0 || processing}
            >
              {processing ? '⏳ Processing...' : '⚡ Run SAM'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results view
  return (
    <div className="ai-annotation-fast-container">
      <div className="results-section">
        <h1>📊 Results</h1>

        <div className="results-grid">
          <div className="file-list-panel">
            <h3>Files ({results.length})</h3>
            <div className="files-results-list">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`file-result-item ${
                    selectedFileIndex === idx ? 'active' : ''
                  }`}
                  onClick={() => {
                    setSelectedFileIndex(idx);
                    setSelectedMaskIndex(0);
                  }}
                >
                  <span className="filename">
                    {result.filename || `File ${idx + 1}`}
                  </span>
                  <span className="mask-count">
                    {result.masks?.length || 0} masks
                  </span>
                  {result.error && (
                    <span className="error-badge">Error</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="preview-panel">
            <h3>Preview</h3>
            {results[selectedFileIndex]?.error ? (
              <div className="error-message">
                ⚠️ Error: {results[selectedFileIndex].error}
              </div>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  className="preview-canvas"
                  width={640}
                  height={480}
                />
                <div className="mask-selector">
                  {results[selectedFileIndex]?.masks?.map((_, idx) => (
                    <button
                      key={idx}
                      className={`mask-btn ${
                        selectedMaskIndex === idx ? 'active' : ''
                      }`}
                      onClick={() => setSelectedMaskIndex(idx)}
                    >
                      Mask {idx + 1}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="result-stats">
          <div className="stat">
            <span className="stat-label">Total Files:</span>
            <span className="stat-value">{results.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Masks:</span>
            <span className="stat-value">
              {results.reduce((sum, r) => sum + (r.masks?.length || 0), 0)}
            </span>
          </div>
        </div>

        <div className="action-buttons">
          <button className="export-btn" onClick={exportResults}>
            📦 Export Results
          </button>
          <button
            className="new-batch-btn"
            onClick={() => {
              setResults(null);
              setFiles([]);
              setSelectedFileIndex(0);
              setSelectedMaskIndex(null);
            }}
          >
            🔄 New Batch
          </button>
        </div>
      </div>
    </div>
  );
}
