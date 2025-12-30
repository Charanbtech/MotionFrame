import React, { useState, useRef, useEffect } from 'react';
import { Container, Button, Table, ProgressBar } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import './BulkUpload.css';

const BulkUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const completedUploadsRef = useRef(new Set()); // Track completed uploads to prevent duplicates
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Load uploaded files from backend on component mount
  useEffect(() => {
    const loadUploadedFiles = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/bulk-upload/files');
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

    // Simulate file upload progress
    newUploadingFiles.forEach((uploadingFile) => {
      simulateUpload(uploadingFile.id);
    });
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
      
      const response = await fetch('http://localhost:8000/api/bulk-upload', {
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
        // Regular file - reload all files from backend
        const filesResponse = await fetch('http://localhost:8000/api/bulk-upload/files');
        if (filesResponse.ok) {
          const files = await filesResponse.json();
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
      }
      
    } catch (error) {
      console.error('Error uploading file:', error);
      // Remove from uploading files on error
      setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      // Remove from completed ref so it can be retried
      completedUploadsRef.current.delete(fileId);
      alert(`Failed to upload ${file.name}: ${error.message}`);
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

  const handleImport = () => {
    // Handle import logic here
    console.log('Importing files...');
    alert('Files imported successfully!');
  };

  const getFileIcon = (fileType) => {
    const type = fileType.toLowerCase();
    if (type === 'pdf') {
      return '📄';
    } else if (['png', 'jpg', 'jpeg'].includes(type)) {
      return '🖼️';
    }
    return '📁';
  };

  return (
    <div className="bulk-upload-container">
      <Container fluid className="py-4 px-4">
        {/* Breadcrumbs */}
        <div className="breadcrumbs mb-3">
          <span 
            className="breadcrumb-item" 
            onClick={() => navigate('/dashboard')}
            style={{ 
              cursor: 'pointer', 
              color: '#007bff',
              textDecoration: 'none'
            }}
            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
          >
            Dashboard
          </span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-item active">Add bulk users</span>
        </div>

        {/* Main Title */}
        <h2 className="page-title mb-4">Bulk Upload Document</h2>

        <div className="upload-section">
          {/* Drag and Drop Zone */}
          <div className="upload-left">
            <div
              className={`drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="drop-zone-content">
                <div className="file-icon">📁</div>
                <p className="drop-zone-text">Drag files here</p>
                <button 
                  className="browse-link"
                  onClick={handleBrowseClick}
                >
                  or browse your computer
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.pdf"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Files Uploading Section */}
          {uploadingFiles.length > 0 && (
            <div className="upload-right table-scrollable">
              <h4 className="upload-section-title">Files uploading</h4>
              {uploadingFiles.map((file) => (
                <div key={file.id} className="uploading-file-item">
                  <div className="file-info-row">
                    <div className="file-icon-small">📄</div>
                    <div className="file-progress-info">
                      <div className="progress-container">
                        <ProgressBar 
                          now={file.progress} 
                          className="custom-progress-bar"
                        />
                        <span className="progress-percentage">{Math.round(file.progress)}%</span>
                      </div>
                      <button
                        className="delete-file-btn"
                        onClick={() => handleCancelUpload(file.id)}
                        title="Remove file"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className="upload-actions">
                    <Button
                      variant="outline-secondary"
                      className="cancel-btn"
                      onClick={() => handleCancelUpload(file.id)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      className="import-btn"
                      onClick={handleImport}
                      disabled={file.progress < 100}
                    >
                      Import
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Uploaded Files Table */}
        <div className="uploaded-files-section mt-4">
          <h4 className="table-title">Uploaded Files</h4>
          <div className="table-responsive table-scrollable" style={{ height: 'calc(100vh - 31rem)', overflowY: 'auto' }}>
            <Table className="uploaded-files-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>File Type</th>
                  <th>Uploaded On</th>
                </tr>
              </thead>
              <tbody>
                {uploadedFiles.length > 0 ? (
                  uploadedFiles
                    .sort((a, b) => {
                      // Sort by upload time, newest first
                      if (a.uploadedAt && b.uploadedAt) {
                        return b.uploadedAt - a.uploadedAt;
                      }
                      return 0;
                    })
                    .map((file) => (
                      <tr key={file.id}>
                        <td>
                          <span className="file-icon-inline">{getFileIcon(file.fileType)}</span>
                          {file.fileName}
                        </td>
                        <td>{file.fileType}</td>
                        <td>{file.uploadedOn}</td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center text-muted">
                      No files uploaded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default BulkUpload;

