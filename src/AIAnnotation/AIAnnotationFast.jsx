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
        <div className="ai-fast-upload-box">
          {/* Breadcrumbs for navigation */}
          <div style={{ marginBottom: '24px', textAlign: 'left', cursor: 'pointer', color: '#6B7280', fontSize: '14px', fontWeight: '500' }}>
            <span onClick={() => window.location.href = '/'} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-arrow-left"></i> Back Home
            </span>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div className="aw-label-pill" style={{ margin: '0 auto 20px auto' }}>AI Vision Tool</div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-1px', color: '#111827', marginBottom: '16px' }}>
              Automated Batch Segmentation
            </h1>
            <p style={{ fontSize: '16px', color: '#6B7280', margin: '0 auto 40px auto', maxWidth: '480px', lineHeight: '1.6' }}>
              Instantly generate precise masks for bulk images perfectly locally. Powered by our zero-shot AI models.
            </p>
          </div>

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
              <i className="fas fa-folder-open" style={{ marginRight: '8px' }}></i> Select Files
            </button>
            <p className="help-text">Select images (JPG, PNG, GIF) or PDFs</p>
          </div>

          {files.length > 0 && (
            <div className="selected-files">
              <h3>Selected Files ({files.length})</h3>
              <div className="files-list">
                {files.map((file, idx) => (
                  <div key={idx} className="file-item">
                    <span><i className="fas fa-file-image" style={{ marginRight: '8px', color: '#9CA3AF' }}></i> {file.name}</span>
                    <button
                      className="remove-btn"
                      onClick={() => removeFile(idx)}
                    >
                      <i className="fas fa-times"></i>
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
              {processing ? (
                <><i className="fas fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i> Processing...</>
              ) : (
                <><i className="fas fa-bolt" style={{ marginRight: '8px', color: '#FBBF24' }}></i> Run Analysis</>
              )}
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
        {/* Results Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
          <div>
            <div className="aw-label-pill" style={{ marginBottom: '12px' }}>Analysis Complete</div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', color: '#111827', margin: 0 }}>
              Segmentation Results
            </h1>
          </div>
          <div className="action-buttons" style={{ margin: 0 }}>
            <button className="new-batch-btn" onClick={() => { setResults(null); setFiles([]); setSelectedFileIndex(0); setSelectedMaskIndex(null); }}>
              <i className="fas fa-redo" style={{ marginRight: '8px' }}></i> New Batch
            </button>
            <button className="export-btn" onClick={exportResults}>
              <i className="fas fa-download" style={{ marginRight: '8px' }}></i> Export Results
            </button>
          </div>
        </div>

        <div className="results-grid">
          <div className="file-list-panel">
            <h3>Files ({results.length})</h3>
            <div className="files-results-list">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`file-result-item ${selectedFileIndex === idx ? 'active' : ''
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
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i> Error: {results[selectedFileIndex].error}
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
                      className={`mask-btn ${selectedMaskIndex === idx ? 'active' : ''
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

      </div>
    </div>
  );
}
