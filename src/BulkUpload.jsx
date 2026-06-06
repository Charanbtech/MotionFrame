import { API_BASE_URL } from './config';
import React, { useState, useRef, useEffect } from 'react';
import { Container, Button, Table, ProgressBar } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './BulkUpload.css';

const BulkUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const completedUploadsRef = useRef(new Set()); // Track completed uploads to prevent duplicates
  const uploadQueueRef = useRef([]);
  const activeUploadsRef = useRef(0);
  const MAX_CONCURRENT_UPLOADS = 5;
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const { user } = useAuth(); // Import useAuth to check user

  useEffect(() => {
    if (user && !user.is_owner) {
      navigate('/');
    }
  }, [user, navigate]);

  // Load uploaded files from backend on component mount
  useEffect(() => {
    const loadUploadedFiles = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/bulk-upload/files`);
        if (response.ok) {
          const files = await response.json();
          const transformedFiles = files.map(file => ({
            id: file.id,
            fileName: file.file_name,
            fileType: file.file_type,
            uploadedOn: file.uploaded_on || new Date(file.uploaded_at).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            }),
            uploadedAt: file.uploaded_at
          }));
          setUploadedFiles(transformedFiles);
          // Also save to localStorage for Dashboard
          try {
            localStorage.setItem('uploadedFiles', JSON.stringify(transformedFiles));
          } catch (error) {
            console.error('Error saving to localStorage:', error);
          }
        }
      } catch (error) {
        console.error('Error loading uploaded files:', error);
      }
    };
    
    loadUploadedFiles();
  }, []);

  const allowedFileTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf'];

  const validateFile = (file) => {
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    return allowedFileTypes.includes(file.type) || allowedExtensions.includes(fileExtension);
  };

  const handleFileSelect = (files) => {
    const validFiles = Array.from(files).filter(validateFile);
    
    if (validFiles.length === 0) {
      alert('Please select only PNG, JPG, JPEG, or PDF files.');
      return;
    }

    // Add files to uploading queue
    const newUploadingFiles = validFiles.map((file, index) => ({
      id: Date.now() + index,
      file: file,
      name: file.name,
      progress: 0,
      status: 'uploading'
    }));

    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    // Add to queue ref and start processing
    uploadQueueRef.current.push(...newUploadingFiles);
    processUploadQueue();
  };

  const processUploadQueue = () => {
    while (activeUploadsRef.current < MAX_CONCURRENT_UPLOADS && uploadQueueRef.current.length > 0) {
      const nextFile = uploadQueueRef.current.shift();
      activeUploadsRef.current++;
      simulateUpload(nextFile.id);
    }
  };

  const simulateUpload = (fileId) => {
    let progress = 0;
    let isCompleted = false; // Flag to prevent duplicate completion
    const uploadStartTime = new Date(); // Store actual upload start time
    
    const interval = setInterval(() => {
      if (isCompleted) {
        clearInterval(interval);
        return;
      }
      
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        isCompleted = true; // Mark as completed to prevent duplicate processing
        clearInterval(interval);
        
        // Check if this upload has already been processed
        if (completedUploadsRef.current.has(fileId)) {
          return;
        }
        
        // Actually upload the file to the backend
        setUploadingFiles(prev => {
          const file = prev.find(f => f.id === fileId);
          if (file && !completedUploadsRef.current.has(fileId)) {
            uploadFileToBackend(file.file, fileId);
          }
          return prev;
        });
      } else {
        setUploadingFiles(prev =>
          prev.map(f => f.id === fileId ? { ...f, progress: Math.min(progress, 100) } : f)
        );
      }
    }, 200);
  };

  const uploadFileToBackend = async (file, fileId) => {
    // Check if upload is already in progress for this file
    if (completedUploadsRef.current.has(fileId)) {
      return;
    }
    completedUploadsRef.current.add(fileId);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE_URL}/api/bulk-upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const data = await response.json();
      
      // Update uploading files state - remove from uploading
      setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      
      // If PDF was converted to frames, add them directly to uploadedFiles
      // Otherwise, reload all files from backend
      if (data.frames && data.frames.length > 0) {
        // PDF converted to images - add frames to uploadedFiles
        const transformedFrames = data.frames.map(frame => ({
          id: frame.id,
          fileName: frame.file_name,
          fileType: frame.file_type,
          uploadedOn: frame.uploaded_at ? new Date(frame.uploaded_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }) : new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }),
          uploadedAt: frame.uploaded_at || new Date().toISOString()
        }));
        
        setUploadedFiles(prev => [...transformedFrames, ...prev]);
        
        // Also save to localStorage for Dashboard
        try {
          const currentFiles = JSON.parse(localStorage.getItem('uploadedFiles') || '[]');
          localStorage.setItem('uploadedFiles', JSON.stringify([...transformedFrames, ...currentFiles]));
        } catch (error) {
          console.error('Error saving to localStorage:', error);
        }
      } else {
        // Regular file - use data directly from upload response to avoid overloading backend
        const newFile = {
          id: data.id,
          fileName: data.file_name,
          fileType: data.file_type,
          uploadedOn: data.uploaded_at ? new Date(data.uploaded_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }) : new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }),
          uploadedAt: data.uploaded_at || new Date().toISOString()
        };
        
        setUploadedFiles(prev => [newFile, ...prev]);
        
        // Also save to localStorage for Dashboard
        try {
          const currentFiles = JSON.parse(localStorage.getItem('uploadedFiles') || '[]');
          localStorage.setItem('uploadedFiles', JSON.stringify([newFile, ...currentFiles]));
        } catch (error) {
          console.error('Error saving to localStorage:', error);
        }
      }
      
    } catch (error) {
      console.error('Error uploading file:', error);
      // Remove from uploading files on error
      setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      // Remove from completed ref so it can be retried
      completedUploadsRef.current.delete(fileId);
      alert(`Failed to upload ${file.name}: ${error.message}`);
    } finally {
      activeUploadsRef.current--;
      processUploadQueue();
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  };

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
    // Reset input
    e.target.value = '';
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancelUpload = (fileId) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bulk-upload/files/${fileId}`, { method: 'DELETE' });
      if (res.ok) {
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
      } else {
        alert("Failed to delete file.");
      }
    } catch (err) {
      alert("Error deleting file.");
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete ALL uploaded files?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bulk-upload/files/clear_all`, { method: 'DELETE' });
      if (res.ok) {
        setUploadedFiles([]);
      } else {
        alert("Failed to clear files.");
      }
    } catch (err) {
      alert("Error clearing files.");
    }
  };

  const handleImport = () => {
    // Handle import logic here
    console.log('Importing files...');
    alert('Files imported successfully!');
  };

  const getFileIcon = (fileType) => {
    const type = fileType.toLowerCase();
    if (type === 'pdf') {
      return <i className="fas fa-file-pdf" style={{ color: '#EF4444' }}></i>;
    } else if (['png', 'jpg', 'jpeg'].includes(type)) {
      return <i className="fas fa-file-image" style={{ color: '#3B82F6' }}></i>;
    }
    return <i className="fas fa-file-alt" style={{ color: '#6B7280' }}></i>;
  };

  return (
    <div className="bulk-upload-container">
      <div className="bulk-upload-inner">
        <div style={{ marginBottom: '20px', display: 'flex' }}>
          <Button 
            variant="outline-primary" 
            onClick={() => navigate('/dashboard')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              backgroundColor: '#fff',
              border: '1px solid #dee2e6',
              color: '#495057'
            }}
          >
            <i className="fas fa-arrow-left"></i> Back to Dashboard
          </Button>
        </div>

        {/* ── Upload Grid ── */}
        <div className={`bu-upload-grid ${uploadingFiles.length > 0 ? 'has-queue' : ''}`}>

          {/* Drop Zone */}
          <div
            className={`bu-drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleBrowseClick}
          >
            <div className="bu-drop-icon">
              <i className="fas fa-cloud-upload-alt"></i>
            </div>
            <p className="bu-drop-title">
              {isDragging ? 'Drop files here' : 'Drag & drop files'}
            </p>
            <p className="bu-drop-subtitle">or click to browse your computer</p>
            <button className="bu-browse-btn" onClick={(e) => { e.stopPropagation(); handleBrowseClick(); }}>
              Select Files
            </button>
            <p className="bu-formats-note">Supports PNG, JPG, JPEG, PDF</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.pdf"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Upload Queue Panel — only visible when there are uploading files */}
          {uploadingFiles.length > 0 && (
            <div className="bu-queue-panel">
              <p className="bu-queue-title">Uploading ({uploadingFiles.length})</p>
              {uploadingFiles.map((file) => (
                <div key={file.id} className="bu-queue-item">
                  <div className="bu-queue-item-header">
                    <div className="bu-file-icon-wrap">
                      <i className="fas fa-file"></i>
                    </div>
                    <span className="bu-file-name">{file.name}</span>
                    <button className="bu-remove-btn" onClick={() => handleCancelUpload(file.id)} title="Remove">
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="bu-progress-row">
                    <div className="bu-progress-track">
                      <div className="bu-progress-fill" style={{ width: `${file.progress}%` }}></div>
                    </div>
                    <span className="bu-progress-pct">{Math.round(file.progress)}%</span>
                  </div>
                  <div className="bu-queue-actions">
                    <button className="bu-btn-cancel" onClick={() => handleCancelUpload(file.id)}>Cancel</button>
                    <button className="bu-btn-import" onClick={handleImport} disabled={file.progress < 100}>
                      {file.progress < 100 ? 'Uploading…' : 'Import'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Uploaded Files Table ── */}
        <div className="bu-files-section">
          <div className="bu-files-header">
            <h4 className="bu-files-title">Uploaded Files</h4>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span className="bu-files-count">{uploadedFiles.length} files</span>
              {uploadedFiles.length > 0 && (
                <Button variant="danger" size="sm" onClick={handleClearAll}>
                  <i className="fas fa-trash"></i> Clear All
                </Button>
              )}
            </div>
          </div>

          <div className="bu-table-wrap">
            {uploadedFiles.length > 0 ? (
              <table className="bu-table">
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Type</th>
                    <th>Uploaded On</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedFiles
                    .sort((a, b) => {
                      if (a.uploadedAt && b.uploadedAt) return b.uploadedAt - a.uploadedAt;
                      return 0;
                    })
                    .map((file) => (
                      <tr key={file.id}>
                        <td>
                          <div className="bu-file-cell">
                            {getFileIcon(file.fileType)}
                            <span>{file.fileName}</span>
                          </div>
                        </td>
                        <td>
                          <span className="bu-file-type-badge">{file.fileType}</span>
                        </td>
                        <td>{file.uploadedOn}</td>
                        <td>
                          <Button variant="outline-danger" size="sm" onClick={() => handleDeleteFile(file.id)}>
                            <i className="fas fa-trash"></i>
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="bu-empty-state">
                <i className="fas fa-inbox"></i>
                <p>No files uploaded yet. Start by uploading some files above.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default BulkUpload;
