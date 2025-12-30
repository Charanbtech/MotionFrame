import React, { useState, useEffect, useRef } from 'react';
import { Container, Button, Table, Form, InputGroup, Modal, Dropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './style.scss';
import './Dashboard.css';

const Dashboard = () => {
  const { user, authToken } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [modificationFilter, setModificationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Un assigned');

  // Check if user is owner - redirect if not
  useEffect(() => {
    if (user && !user.is_owner) {
      alert('Access denied. Only owners can access the Dashboard page.');
      navigate('/');
    }
  }, [user, navigate]);

  // Load uploaded files from localStorage (shared with BulkUpload)
  const [documents, setDocuments] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [users, setUsers] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [fileToRevert, setFileToRevert] = useState(null);
  const [filesToRevert, setFilesToRevert] = useState([]); // For bulk revert
  const [isReverting, setIsReverting] = useState(false);
  const [showBulkRevertModal, setShowBulkRevertModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [fileToExport, setFileToExport] = useState(null);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedUsersForProject, setSelectedUsersForProject] = useState(new Set());
  const [showAutoAssignConfirm, setShowAutoAssignConfirm] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectNameForAssign, setProjectNameForAssign] = useState('');
  const [createProjectOnAssign, setCreateProjectOnAssign] = useState(false);
  const dropdownRef = useRef(null);

  // Check if user is owner - redirect if not
  useEffect(() => {
    if (user && !user.is_owner) {
      alert('Access denied. Only owners can access the Dashboard page.');
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    // Load files from backend API
    const loadUploadedFiles = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/bulk-upload/files');
        if (response.ok) {
          const files = await response.json();
          // Transform uploaded files to document format
          const transformedFiles = files.map((file) => ({
            id: file.id,
            name: file.file_name,
            fileType: file.file_type,
            assignedTo: file.assigned_to || '--',
            assignedOn: file.assigned_on 
              ? new Date(file.assigned_on).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })
              : '--',
            modification: file.modification || (file.has_annotations ? 'Completed' : 'Pending'),
            status: file.status || 'Un assigned',
            uploadedAt: file.uploaded_at ? new Date(file.uploaded_at) : null,
            has_annotations: file.has_annotations || false,
            // Store the assigned_to value even if status is "Un assigned" to track who completed it
            previousAssignedTo: file.assigned_to || null
          }));
          setDocuments(transformedFiles);
        }
      } catch (error) {
        console.error('Error loading uploaded files:', error);
      }
    };

    // Load users
    const loadUsers = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/users');
        if (response.ok) {
          const usersData = await response.json();
          setUsers(usersData);
        }
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };

    loadUploadedFiles();
    loadUsers();

    // Refresh files periodically
    const interval = setInterval(loadUploadedFiles, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside the dropdown and not on a checkbox or its label
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        // Also check if it's not a checkbox or form check element
        if (!event.target.closest('input[type="checkbox"]') && 
            !event.target.closest('.form-check') &&
            !event.target.closest('.form-check-input') &&
            !event.target.closest('.form-check-label')) {
        setShowUserDropdown(false);
        }
      }
    };

    if (showUserDropdown) {
      // Use a small delay to avoid immediate closure
      setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      }, 100);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserDropdown]);

  // Summary statistics - calculated from real data
  const dashboardStats = {
    assigned: documents.filter(doc => doc.status === 'Assigned').length,
    unassigned: documents.filter(doc => doc.status === 'Un assigned').length,
    pendingValidation: documents.filter(doc => doc.modification === 'Pending').length,
    overdue: documents.filter(doc => doc.status === 'Over due').length,
    completed: documents.filter(doc => doc.modification === 'Completed').length
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Completed':
        return 'badge-success';
      case 'Un assigned':
        return 'badge-warning';
      case 'Over due':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  const getModificationBadgeClass = (modification) => {
    switch (modification) {
      case 'Completed':
        return 'badge-success';
      case 'Pending':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  };


  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.fileType && doc.fileType.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesModification = modificationFilter === 'All' || doc.modification === modificationFilter;
    const matchesStatus = statusFilter === 'All' || doc.status === statusFilter;
    return matchesSearch && matchesModification && matchesStatus;
  });

  const totalPages = Math.ceil(filteredDocuments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDocuments = filteredDocuments.slice(startIndex, startIndex + itemsPerPage);

  // Check if file is already assigned
  const isFileAssigned = (doc) => {
    return doc.assignedTo && doc.assignedTo !== '--' && doc.status && doc.status !== 'Un assigned';
  };

  // Handle file selection (now allows selecting both assigned and unassigned files)
  const handleSelectFile = (fileId) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Handle select all (now allows selecting all files, both assigned and unassigned)
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      // Select all files from current page and add to existing selections
      const allIds = paginatedDocuments.map(doc => doc.id);
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        allIds.forEach(id => newSet.add(id));
        return newSet;
      });
    } else {
      // Only deselect files from current page, keep selections from other pages
      const currentPageIds = paginatedDocuments.map(doc => doc.id);
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        currentPageIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  // Handle user selection from dropdown
  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setShowUserDropdown(false);
    if (selectedFiles.size > 0) {
      setShowConfirmModal(true);
    } else {
      alert('Please select at least one file to assign.');
    }
  };

  // Handle assign confirmation
  const handleConfirmAssign = async () => {
    if (!selectedUser || selectedFiles.size === 0) {
      return;
    }

    // Validate project name (required)
    if (!projectNameForAssign.trim()) {
      alert('Please enter a project name');
      return;
    }

    setIsAssigning(true);
    try {
      // Create project (required)
      const token = authToken || localStorage.getItem('token');
      if (!token) {
        alert('Authentication token not found. Please log in again.');
        navigate('/login');
        setIsAssigning(false);
        return;
      }

      const projectResponse = await fetch('http://localhost:8000/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: projectNameForAssign,
          project_type: 'object-detection',
          description: `Project created with file assignment to ${selectedUser.name}`,
          classes: []
        })
      });

      if (!projectResponse.ok) {
        // Get error details from response
        let errorMessage = 'Failed to create project';
        try {
          const errorData = await projectResponse.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = `HTTP ${projectResponse.status}: ${projectResponse.statusText}`;
        }
        
        // If unauthorized, suggest re-login
        if (projectResponse.status === 401) {
          errorMessage += '. Your session may have expired. Please try logging out and logging back in.';
        }
        
        throw new Error(errorMessage);
      }

      const projectData = await projectResponse.json();
      const projectId = projectData.id;

      const assignPromises = Array.from(selectedFiles).map(async (fileId) => {
        const response = await fetch(`http://localhost:8000/api/bulk-upload/files/${fileId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            assigned_to: selectedUser.name,
            assigned_on: new Date().toISOString(),
            status: 'Assigned',
            project_id: projectId  // Include project_id to create ProjectImage
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to assign file ${fileId}`);
        }

        return response.json();
      });

      await Promise.all(assignPromises);

      // Clear selections
      setSelectedFiles(new Set());
      setSelectedUser(null);
      setShowConfirmModal(false);
      setProjectNameForAssign('');

      // Reload files
      const response = await fetch('http://localhost:8000/api/bulk-upload/files');
      if (response.ok) {
        const files = await response.json();
        const transformedFiles = files.map((file) => ({
          id: file.id,
          name: file.file_name,
          fileType: file.file_type,
          assignedTo: file.assigned_to || '--',
          assignedOn: file.uploaded_on || new Date(file.uploaded_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }),
          modification: file.has_annotations ? 'Completed' : 'Pending',
          status: file.status || 'Un assigned',
          uploadedAt: file.uploaded_at ? new Date(file.uploaded_at) : null,
          has_annotations: file.has_annotations || false
        }));
        setDocuments(transformedFiles);
      }

      // Reload users to update file counts
      const usersResponse = await fetch('http://localhost:8000/api/users');
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData);
      }

      alert(`✅ Project "${projectNameForAssign}" created and ${selectedFiles.size} file(s) assigned to ${selectedUser.name} successfully!`);
    } catch (error) {
      console.error('Error assigning files:', error);
      alert(`Failed to create project and assign files. Please try again.`);
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle export file
  const handleExportFile = async (file) => {
    if (!file || !file.has_annotations) {
      alert('This file has no annotations to export.');
      return;
    }

    setIsExporting(true);
    setFileToExport(file);
    
    try {
      const response = await fetch(`http://localhost:8000/api/bulk-upload/files/${file.id}/export`);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name}_export.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert(`Successfully exported ${file.name}`);
    } catch (error) {
      console.error('Error exporting file:', error);
      alert(`Failed to export file: ${error.message}`);
    } finally {
      setIsExporting(false);
      setFileToExport(null);
    }
  };

  // Handle revert assignment (single file)
  const handleRevertAssignment = async () => {
    if (!fileToRevert) {
      return;
    }

    setIsReverting(true);
    try {
      // If file is completed, preserve assigned_to to track who completed it
      // Only clear assigned_to if file is not completed
      const updateData = {
        assigned_on: null,
        status: 'Un assigned'
      };
      
      // If file is not completed, clear assigned_to
      // If file is completed, keep assigned_to to track who completed it
      if (fileToRevert.modification !== 'Completed' && !fileToRevert.has_annotations) {
        updateData.assigned_to = null;
      }
      // Otherwise, keep assigned_to (it will show who completed it even when unassigned)
      
      const response = await fetch(`http://localhost:8000/api/bulk-upload/files/${fileToRevert.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`Failed to revert assignment for file ${fileToRevert.id}`);
      }

      // Reload files
      const reloadResponse = await fetch('http://localhost:8000/api/bulk-upload/files');
      if (reloadResponse.ok) {
        const files = await reloadResponse.json();
        const transformedFiles = files.map((file) => ({
          id: file.id,
          name: file.file_name,
          fileType: file.file_type,
          assignedTo: file.assigned_to || '--',
          assignedOn: file.uploaded_on || new Date(file.uploaded_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }),
            modification: file.has_annotations ? 'Completed' : 'Pending',
            status: file.status || 'Un assigned',
            uploadedAt: file.uploaded_at ? new Date(file.uploaded_at) : null,
            has_annotations: file.has_annotations || false,
            previousAssignedTo: file.assigned_to || null
          }));
          setDocuments(transformedFiles);
      }

      // Remove from selected files
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileToRevert.id);
        return newSet;
      });

      setShowRevertModal(false);
      setFileToRevert(null);
      alert(`Successfully reverted assignment for ${fileToRevert.name}`);
    } catch (error) {
      console.error('Error reverting assignment:', error);
      alert('Failed to revert assignment. Please try again.');
    } finally {
      setIsReverting(false);
    }
  };

  // Handle bulk revert assignment
  const handleBulkRevertAssignment = async () => {
    if (!filesToRevert || filesToRevert.length === 0) {
      return;
    }

    setIsReverting(true);
    try {
      const revertPromises = filesToRevert.map(async (file) => {
        const updateData = {
          assigned_on: null,
          status: 'Un assigned'
        };
        
        // If file is not completed, clear assigned_to
        if (file.modification !== 'Completed' && !file.has_annotations) {
          updateData.assigned_to = null;
        }
        
        const response = await fetch(`http://localhost:8000/api/bulk-upload/files/${file.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData)
        });

        if (!response.ok) {
          throw new Error(`Failed to revert assignment for file ${file.id}`);
        }

        return { success: true, fileId: file.id, fileName: file.name };
      });

      const results = await Promise.all(revertPromises);
      const successCount = results.filter(r => r.success).length;

      // Reload files
      const reloadResponse = await fetch('http://localhost:8000/api/bulk-upload/files');
      if (reloadResponse.ok) {
        const files = await reloadResponse.json();
        const transformedFiles = files.map((file) => ({
          id: file.id,
          name: file.file_name,
          fileType: file.file_type,
          assignedTo: file.assigned_to || '--',
          assignedOn: file.uploaded_on || new Date(file.uploaded_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }),
          modification: file.has_annotations ? 'Completed' : 'Pending',
          status: file.status || 'Un assigned',
          uploadedAt: file.uploaded_at ? new Date(file.uploaded_at) : null,
          has_annotations: file.has_annotations || false,
          previousAssignedTo: file.assigned_to || null
        }));
        setDocuments(transformedFiles);
      }

      // Remove reverted files from selected files
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        filesToRevert.forEach(file => newSet.delete(file.id));
        return newSet;
      });

      setShowBulkRevertModal(false);
      setFilesToRevert([]);
      alert(`✅ Successfully reverted assignment for ${successCount} file(s)!`);
    } catch (error) {
      console.error('Error reverting assignments:', error);
      alert(`❌ Failed to revert assignments: ${error.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  // Show access denied message if user is not owner
  if (user && !user.is_owner) {
    return (
      <div className="dashboard-container">
        <Container fluid className="py-4 px-3 px-md-4">
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <h2>Access Denied</h2>
            <p>Only owners can access the Dashboard page.</p>
            <Button onClick={() => navigate('/')}>Go to Home</Button>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <Container fluid className="py-4 px-3 px-md-4">
        {/* Summary Cards */}
        <div className="dashboard-stats-contain">
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-icon assigned">
                <i className="fas fa-file-arrow-up"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{dashboardStats.assigned}</p>
                <p className="stat-label">Assigned</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon unassigned">
                <i className="fas fa-file"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{dashboardStats.unassigned}</p>
                <p className="stat-label">Unassigned</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon pending">
                <i className="fas fa-clock"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{dashboardStats.pendingValidation}</p>
                <p className="stat-label">Pending</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon overdue">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{dashboardStats.overdue}</p>
                <p className="stat-label">Overdue</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon completed">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{dashboardStats.completed}</p>
                <p className="stat-label">Completed</p>
              </div>
            </div>

            <div className="dashboard-buttons">
              <button 
                className="btn-add-document"
                onClick={() => navigate('/bulk-upload/upload')}
              >
                <i className="fas fa-upload"></i>
                Bulk Upload
              </button>
              <button 
                className="btn-assign-document"
                onClick={() => navigate('/assigned-document')}
              >
                <i className="fas fa-user-plus"></i>
                Users Details
              </button>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="table-section">
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <h4 style={{ 
              margin: 0, 
              fontSize: '20px',
              fontWeight: '600',
              color: '#212529'
            }}>
              All Documents
            </h4>
            
            <div style={{ 
              display: 'flex', 
              gap: '12px', 
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              {/* Create Project Button */}
              <Button 
                variant="primary" 
                onClick={() => setShowCreateProjectModal(true)}
                style={{ 
                  height: '34px',
                  backgroundColor: '#0a4d8a',
                  borderColor: '#0a4d8a',
                  color: '#ffffff',
                  fontSize: '14px',
                  padding: '0 16px',
                  borderRadius: '6px',
                  fontWeight: '500',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span className='create-project-icon'>+</span> Create Project
              </Button>
              {/* Bulk Revert Button - Show when assigned files are selected */}
              {(() => {
                const selectedAssignedFiles = Array.from(selectedFiles)
                  .map(id => documents.find(d => d.id === id))
                  .filter(doc => doc && isFileAssigned(doc));
                
                if (selectedAssignedFiles.length > 0) {
                  return (
                    <Button
                      variant="warning"
                      onClick={() => {
                        setFilesToRevert(selectedAssignedFiles);
                        setShowBulkRevertModal(true);
                      }}
                      style={{
                        height: '34px',
                        backgroundColor: '#ffc107',
                        borderColor: '#ffc107',
                        color: '#000',
                        fontSize: '14px',
                        padding: '0 16px',
                        borderRadius: '6px',
                        fontWeight: '500',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginRight: '10px'
                      }}
                    >
                      <i className="fas fa-undo me-1"></i>
                      Bulk Revert ({selectedAssignedFiles.length})
                    </Button>
                  );
                }
                return null;
              })()}

              {/* Users Dropdown */}
              <div className='users-dropdown' ref={dropdownRef} style={{ position: 'relative' }}>
              <Dropdown show={showUserDropdown} onToggle={setShowUserDropdown}>
                <Dropdown.Toggle 
                  variant="outline-secondary" 
                    onMouseDown={(e) => e.preventDefault()}
                  disabled={(() => {
                    // Only enable if unassigned files are selected
                    const selectedUnassignedFiles = Array.from(selectedFiles)
                      .map(id => documents.find(d => d.id === id))
                      .filter(doc => doc && !isFileAssigned(doc));
                    return selectedUnassignedFiles.length === 0;
                  })()}
                    style={{
                      height: '34px',
                      backgroundColor: '#F4F4F4',
                      border: '1px solid #E0E0E0',
                      borderRadius: '6px',
                      color: '#676464',
                      fontSize: '14px',
                      padding: '0 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      minWidth: '140px',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>Users {(() => {
                      const selectedUnassignedFiles = Array.from(selectedFiles)
                        .map(id => documents.find(d => d.id === id))
                        .filter(doc => doc && !isFileAssigned(doc));
                      return selectedUnassignedFiles.length > 0 ? `(${selectedUnassignedFiles.length})` : '';
                    })()}</span>
                    <span style={{ color: '#ADADAD', fontSize: '10px' }}>▼</span>
                </Dropdown.Toggle>
                <Dropdown.Menu style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {users.length > 0 ? (
                    users.map((user) => (
                      <Dropdown.Item
                        key={user.id}
                        onClick={() => handleUserSelect(user)}
                      >
                        <div>
                          <strong>{user.name}</strong>
                          <br />
                          <small className="text-muted">{user.email}</small>
                        </div>
                      </Dropdown.Item>
                    ))
                  ) : (
                    <Dropdown.Item disabled>No users available</Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown>
              </div>
              

              {/* Modification Filter */}
              <Form.Select
                value={modificationFilter}
                onChange={(e) => setModificationFilter(e.target.value)}
                style={{ 
                  height: '34px',
                  backgroundColor: '#F4F4F4',
                  border: '1px solid #E0E0E0',
                  borderRadius: '6px',
                  color: '#676464',
                  fontSize: '14px',
                  padding: '0 12px',
                  width: '160px',
                  cursor: 'pointer'
                }}
              >
                <option value="All">All Modification</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
              </Form.Select>

              {/* Status Filter */}
              <Form.Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ 
                  height: '34px',
                  backgroundColor: '#F4F4F4',
                  border: '1px solid #E0E0E0',
                  borderRadius: '6px',
                  color: '#676464',
                  fontSize: '14px',
                  padding: '0 12px',
                  width: '140px',
                  cursor: 'pointer'
                }}
              >
                <option value="All">All Status</option>
                <option value="Un assigned">Un assigned</option>
                <option value="Assigned">Assigned</option>
              </Form.Select>

              {/* Search Input */}
              <div style={{ 
                position: 'relative',
                width: '200px'
              }}>
                <Form.Control
                  type="text"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    height: '34px',
                    backgroundColor: '#F4F4F4',
                    border: '1px solid #E0E0E0',
                    borderRadius: '6px',
                    paddingLeft: '36px',
                    fontSize: '14px',
                    color: '#676464'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#ADADAD',
                  fontSize: '14px',
                  pointerEvents: 'none'
                }}>
                  🔍
                </span>
              </div>
            </div>
          </div>

          <div className="table-responsive">
            <Table striped bordered hover className="documents-table">
              <thead>
                <tr>
                  <th>
                    <Form.Check 
                      type="checkbox" 
                      checked={paginatedDocuments.length > 0 && 
                        paginatedDocuments.length > 0 &&
                        paginatedDocuments.every(doc => selectedFiles.has(doc.id))}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>File Name</th>
                  <th>File Type</th>
                  <th>Assigned to</th>
                  <th>Assigned on</th>
                  <th>Modification</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDocuments.length > 0 ? (
                  paginatedDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <Form.Check 
                          type="checkbox" 
                          checked={selectedFiles.has(doc.id)}
                          onChange={() => handleSelectFile(doc.id)}
                        />
                      </td>
                      <td>
                        <a 
                          href={`http://localhost:8000/api/bulk-upload/files/${doc.id}/preview`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none', color: '#053096' }}
                        >
                          {doc.name}
                        </a>
                      </td>
                      <td>{doc.fileType || '--'}</td>
                      <td>{doc.assignedTo || '--'}</td>
                      <td>{doc.assignedOn || '--'}</td>
                      <td>
                        <span className={`badge ${getModificationBadgeClass(doc.modification)}`}>
                          {doc.modification || '--'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(doc.status)}`}>
                          {doc.status || 'Un assigned'}
                        </span>
                      </td>
                      <td>
                        <Dropdown>
                          <Dropdown.Toggle 
                            variant="link" 
                            className="action-menu-btn"
                            style={{ border: 'none', background: 'none', padding: '0', color: '#000' }}
                          >
                            ⋮
                          </Dropdown.Toggle>
                          <Dropdown.Menu
                            style={{ maxHeight: '300px', overflowY: 'auto', width: '100%' }}
                            onMouseDown={(e) => e.preventDefault()} 
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              // Check if file is completed but unassigned (completed by previous user)
                              const isCompletedButUnassigned = doc.modification === 'Completed' && 
                                                               doc.status === 'Un assigned';
                              
                              if (isCompletedButUnassigned) {
                                // Show Export option to download the file completed by previous user
                                return (
                                  <>
                                    {doc.has_annotations && (
                                      <Dropdown.Item 
                                        onClick={() => handleExportFile(doc)}
                                        disabled={isExporting && fileToExport?.id === doc.id}
                                      >
                                        {isExporting && fileToExport?.id === doc.id ? 'Exporting...' : 'Export'}
                                      </Dropdown.Item>
                                    )}
                                  </>
                                );
                              } else if (isFileAssigned(doc)) {
                                // File is assigned to current user - show Export if completed
                                return (
                                  <>
                                    {doc.has_annotations && doc.modification === 'Completed' && (
                                      <Dropdown.Item 
                                        onClick={() => handleExportFile(doc)}
                                        disabled={isExporting && fileToExport?.id === doc.id}
                                      >
                                        {isExporting && fileToExport?.id === doc.id ? 'Exporting...' : 'Export'}
                                      </Dropdown.Item>
                                    )}
                                    <Dropdown.Item 
                                      onClick={() => {
                                        setFileToRevert(doc);
                                        setShowRevertModal(true);
                                      }}
                                    >
                                      Revert Assignment
                                    </Dropdown.Item>
                                  </>
                                );
                              } else {
                                // File is not assigned and not completed
                                return (
                                  <Dropdown.Item disabled>No actions</Dropdown.Item>
                                );
                              }
                            })()}
                          </Dropdown.Menu>

                        </Dropdown>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="text-center text-muted">
                      No documents found. Upload files from the Bulk Upload page.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="d-flex justify-content-between align-items-center mt-3">
            <div className="d-flex align-items-center gap-2">
              <span>Go to</span>
              <Form.Control
                type="number"
                min="1"
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value);
                  if (page >= 1 && page <= totalPages) {
                    setCurrentPage(page);
                  }
                }}
                style={{ width: '60px' }}
              />
              <span>page</span>
            </div>
            <div className="pagination-buttons">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                &lt;
              </Button>
              {[...Array(totalPages)].map((_, index) => {
                const page = index + 1;
                if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'primary' : 'outline-primary'}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="mx-1"
                    >
                      {page}
                    </Button>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="mx-1">...</span>;
                }
                return null;
              })}
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                &gt;
              </Button>
            </div>
          </div>
        </div>
      </Container>

      {/* Confirmation Modal */}
      <Modal show={showConfirmModal} onHide={() => {
        setShowConfirmModal(false);
        setProjectNameForAssign('');
      }} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create Project & Confirm Assignment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Project Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter project name (required)"
              value={projectNameForAssign}
              onChange={(e) => setProjectNameForAssign(e.target.value)}
              required
            />
            <Form.Text className="text-muted">
              Project must be created before assigning files
            </Form.Text>
          </Form.Group>

          <div className="mb-3">
            <p>
              Assign <strong>{selectedFiles.size}</strong> file(s) to{' '}
            <strong>{selectedUser?.name}</strong>?
          </p>
          <p className="text-muted">
            Email: {selectedUser?.email}
          </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => {
            setShowConfirmModal(false);
            setProjectNameForAssign('');
          }} disabled={isAssigning}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirmAssign} disabled={isAssigning || !projectNameForAssign.trim()}>
            {isAssigning ? 'Creating Project & Assigning...' : 'Create Project & Assign'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Create Project Modal */}
      <Modal className='create-project-modal' show={showCreateProjectModal} onHide={() => {
        setShowCreateProjectModal(false);
        setProjectName('');
        setSelectedUsersForProject(new Set());
      }} size="lg" centered>
        <Modal.Header className='bg-light shadow-sm' closeButton style={{ 
          color: 'white',
          borderBottom: 'none'
        }}>
          <Modal.Title style={{ fontSize: '1.5rem', fontWeight: '600' }}>
            🚀 Create Project & Auto-Assign Files
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '24px' }}>
          <Form>
            {/* Project Name and Users Selection - Single Line */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px'
            }}>
              {/* Project Name Section */}
              <div style={{ 
                padding: '20px',
                background: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                <Form.Group className="mb-0">
                  <Form.Label style={{ 
                    fontWeight: '600', 
                    marginBottom: '8px',
                    color: '#495057',
                    fontSize: '14px'
                  }}>
                    Project Name <span style={{ color: '#dc3545' }}>*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter project name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                    style={{
                      padding: '12px',
                      fontSize: '15px',
                      border: '2px solid #dee2e6',
                      borderRadius: '6px'
                    }}
                  />
                </Form.Group>
              </div>

              {/* Users Selection Section */}
              <div className='users-selection-section' style={{ 
                padding: '20px',
                background: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
              <Form.Group className="mb-3">
                <Form.Label style={{ 
                  fontWeight: '600', 
                  marginBottom: '12px',
                  color: '#495057',
                  fontSize: '14px',
                  display: 'block'
                }}>
                  👥 Select Users <span style={{ color: '#dc3545' }}>*</span>
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: 'normal', 
                    color: '#6c757d',
                    marginLeft: '8px'
                  }}>
                    (Files will be distributed evenly)
                  </span>
                </Form.Label>
                <div ref={dropdownRef}>
                <Dropdown 
                  show={showUserDropdown} 
                  onToggle={(isOpen) => setShowUserDropdown(isOpen)}
                  autoClose={false}
                >
                  <Dropdown.Toggle 
                    variant="outline-secondary" 
                    style={{ 
                      width: '100%', 
                      textAlign: 'left', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px 16px',
                      fontSize: '15px',
                      border: '2px solid #dee2e6',
                      borderRadius: '6px',
                      background: 'white'
                    }}
                    id="user-dropdown"
                  >
                    <span>
                      {selectedUsersForProject.size > 0 
                        ? `${selectedUsersForProject.size} user(s) selected`
                        : 'Select users...'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '12px' }}>▼</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu 
                    style={{ maxHeight: '300px', overflowY: 'auto', width: '100%' }}
                  >
                    {users.length === 0 ? (
                      <Dropdown.Item disabled>No users available</Dropdown.Item>
                    ) : (
                      users.map((user) => {
                        const handleToggle = (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newSet = new Set(selectedUsersForProject);
                          if (selectedUsersForProject.has(user.id)) {
                            newSet.delete(user.id);
                          } else {
                            newSet.add(user.id);
                          }
                          setSelectedUsersForProject(newSet);
                        };
                        
                        return (
                          <div
                            key={user.id}
                            onClick={handleToggle}
                            style={{
                              backgroundColor: selectedUsersForProject.has(user.id) ? '#e7f3ff' : 'transparent',
                              cursor: 'pointer',
                              padding: '10px 16px',
                              borderBottom: '1px solid #f0f0f0'
                            }}
                          >
                            <Form.Check
                              type="checkbox"
                              checked={selectedUsersForProject.has(user.id)}
                              onChange={handleToggle}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              label={`${user.name}${user.is_owner ? ' [Owner]' : ''}`}
                              style={{ margin: 0, cursor: 'pointer' }}
                            />
                          </div>
                        );
                      })
                    )}
                  </Dropdown.Menu>
                </Dropdown>
                </div>
                
              </Form.Group>
              
              {/* Selected Users Preview - Show below the dropdown */}
              {selectedUsersForProject.size > 0 && (() => {
                const unassignedFiles = documents.filter(doc => doc.status === 'Un assigned');
                const filesPerUser = Math.floor(unassignedFiles.length / selectedUsersForProject.size);
                const remainder = unassignedFiles.length % selectedUsersForProject.size;
                const selectedUsersList = users.filter(u => selectedUsersForProject.has(u.id));
                
                return (
                  <div style={{ 
                    marginTop: '16px', 
                    padding: '12px',
                    background: 'white',
                    borderRadius: '6px',
                    border: '1px solid #dee2e6',
                    maxHeight: '150px',
                    overflowY: 'auto'
                  }}>
                    <div style={{ 
                      fontWeight: '600', 
                      marginBottom: '8px',
                      color: '#495057',
                      fontSize: '12px'
                    }}>
                      📊 Distribution
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {selectedUsersList.map((user, index) => {
                        const filesForThisUser = filesPerUser + (index < remainder ? 1 : 0);
                        return (
                          <div key={user.id} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            background: '#f8f9fa',
                            borderRadius: '4px'
                          }}>
                            <span style={{ color: '#6c757d', fontSize: '12px' }}>
                              {user.name}
                            </span>
                            <span style={{ 
                              fontWeight: '600', 
                              color: '#667eea',
                              fontSize: '12px'
                            }}>
                              {filesForThisUser} file{filesForThisUser !== 1 ? 's' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              </div>
            </div>

            {/* Files Summary Section */}
            <div style={{ 
              padding: '20px',
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <Form.Label style={{ 
                fontWeight: '600', 
                marginBottom: '16px',
                color: '#495057',
                fontSize: '14px',
                display: 'block'
              }}>
                📁 Files Summary
              </Form.Label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px'
              }}>
                <div style={{ 
                  padding: '16px',
                  background: 'white',
                  borderRadius: '6px',
                  textAlign: 'center',
                  border: '1px solid #dee2e6'
                }}>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: '700',
                    color: '#667eea',
                    marginBottom: '4px'
                  }}>
                    {documents.length}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#6c757d',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Total Files
                  </div>
                </div>
                <div style={{ 
                  padding: '16px',
                  background: 'white',
                  borderRadius: '6px',
                  textAlign: 'center',
                  border: '1px solid #dee2e6'
                }}>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: '700',
                    color: '#28a745',
                    marginBottom: '4px'
                  }}>
                    {documents.filter(doc => doc.status === 'Un assigned').length}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#6c757d',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Unassigned
                  </div>
                </div>
                <div style={{ 
                  padding: '16px',
                  background: 'white',
                  borderRadius: '6px',
                  textAlign: 'center',
                  border: '1px solid #dee2e6'
                }}>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: '700',
                    color: '#6c757d',
                    marginBottom: '4px'
                  }}>
                    {documents.filter(doc => doc.status !== 'Un assigned').length}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#6c757d',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Assigned
                  </div>
                </div>
              </div>
              {documents.filter(doc => doc.status === 'Un assigned').length === 0 && (
                <div style={{ 
                  marginTop: '16px',
                  padding: '12px',
                  background: '#fff3cd',
                  borderRadius: '6px',
                  textAlign: 'center',
                  color: '#856404',
                  fontSize: '14px',
                  border: '1px solid #ffeaa7'
                }}>
                  ⚠️ No unassigned files available
                </div>
              )}
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ 
          borderTop: '1px solid #dee2e6',
          padding: '16px 24px',
          background: '#f8f9fa'
        }}>
          <Button 
            variant="secondary" 
            onClick={() => {
              setShowCreateProjectModal(false);
              setProjectName('');
              setSelectedUsersForProject(new Set());
            }}
            style={{
              padding: '10px 24px',
              borderRadius: '6px',
              fontWeight: '500',
              border: 'none'
            }}
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={() => {
              if (!projectName.trim()) {
                alert('Please enter a project name');
                return;
              }
              if (selectedUsersForProject.size === 0) {
                alert('Please select at least one user');
                return;
              }
              const unassignedFiles = documents.filter(doc => doc.status === 'Un assigned');
              if (unassignedFiles.length === 0) {
                alert('No unassigned files available');
                return;
              }
              setShowAutoAssignConfirm(true);
            }}
            disabled={isCreatingProject}
            style={{
              padding: '10px 24px',
              borderRadius: '6px',
              fontWeight: '500',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              boxShadow: '0 4px 6px rgba(102, 126, 234, 0.3)'
            }}
          >
            {isCreatingProject ? '⏳ Creating...' : '✨ Create & Auto-Assign'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Auto-Assign Confirmation Modal */}
      <Modal 
        show={showAutoAssignConfirm} 
        onHide={() => setShowAutoAssignConfirm(false)} 
        centered
        size="lg"
      >
        <Modal.Header 
          closeButton 
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            borderBottom: 'none'
          }}
        >
          <Modal.Title style={{ color: '#fff', fontWeight: '600', fontSize: '20px' }}>
            <i className="fas fa-check-circle me-2"></i>
            Confirm Auto-Assignment
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '30px' }}>
          {/* Project Info Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '25px',
            border: '1px solid rgba(102, 126, 234, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '15px',
                color: '#fff',
                fontSize: '18px'
              }}>
                <i className="fas fa-folder-plus"></i>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>Creating Project</div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#333' }}>"{projectName}"</div>
              </div>
            </div>
            <div style={{
              marginTop: '15px',
              paddingTop: '15px',
              borderTop: '1px solid rgba(102, 126, 234, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-file" style={{ color: '#667eea', fontSize: '16px' }}></i>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <strong style={{ color: '#333', fontSize: '16px' }}>
                    {documents.filter(doc => doc.status === 'Un assigned').length}
                  </strong> files to assign
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-users" style={{ color: '#764ba2', fontSize: '16px' }}></i>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <strong style={{ color: '#333', fontSize: '16px' }}>
                    {selectedUsersForProject.size}
                  </strong> user{selectedUsersForProject.size !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Selected Users Section */}
          <div style={{ marginBottom: '25px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '15px',
              paddingBottom: '10px',
              borderBottom: '2px solid #f0f0f0'
            }}>
              <i className="fas fa-user-check" style={{ color: '#667eea', marginRight: '10px', fontSize: '18px' }}></i>
              <h6 style={{ margin: 0, fontWeight: '600', color: '#333', fontSize: '16px' }}>
                Selected Users ({selectedUsersForProject.size})
              </h6>
            </div>
            <div style={{
              background: '#f8f9fa',
              borderRadius: '8px',
              padding: '15px',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {users.filter(u => selectedUsersForProject.has(u.id)).map((user, index) => (
                <div 
                  key={user.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px',
                    marginBottom: index < selectedUsersForProject.size - 1 ? '8px' : '0',
                    background: '#fff',
                    borderRadius: '6px',
                    border: '1px solid #e9ecef'
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    marginRight: '12px'
                  }}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>{user.name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{user.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Distribution Section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '15px',
              paddingBottom: '10px',
              borderBottom: '2px solid #f0f0f0'
            }}>
              <i className="fas fa-chart-pie" style={{ color: '#764ba2', marginRight: '10px', fontSize: '18px' }}></i>
              <h6 style={{ margin: 0, fontWeight: '600', color: '#333', fontSize: '16px' }}>
                File Distribution
              </h6>
            </div>
            {(() => {
              const unassignedFiles = documents.filter(doc => doc.status === 'Un assigned');
              const filesPerUser = Math.floor(unassignedFiles.length / selectedUsersForProject.size);
              const remainder = unassignedFiles.length % selectedUsersForProject.size;
              const selectedUsersList = users.filter(u => selectedUsersForProject.has(u.id));
              
              return (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px'
                }}>
                  {selectedUsersList.map((user, index) => {
                    const filesForThisUser = filesPerUser + (index < remainder ? 1 : 0);
                    return (
                      <div 
                        key={user.id}
                        style={{
                          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
                          borderRadius: '8px',
                          padding: '15px',
                          border: '1px solid rgba(102, 126, 234, 0.15)',
                          textAlign: 'center'
                        }}
                      >
                        <div style={{
                          fontSize: '24px',
                          fontWeight: '700',
                          color: '#667eea',
                          marginBottom: '5px'
                        }}>
                          {filesForThisUser}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#666',
                          marginBottom: '8px'
                        }}>
                          file{filesForThisUser !== 1 ? 's' : ''}
                        </div>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#333',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {user.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </Modal.Body>
        <Modal.Footer style={{
          borderTop: '1px solid #e9ecef',
          padding: '20px 30px',
          background: '#f8f9fa'
        }}>
          <Button 
            variant="secondary" 
            onClick={() => setShowAutoAssignConfirm(false)} 
            disabled={isCreatingProject}
            style={{
              padding: '10px 25px',
              borderRadius: '8px',
              fontWeight: '500',
              border: 'none'
            }}
          >
            <i className="fas fa-times me-2"></i>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={async () => {
              setIsCreatingProject(true);
              try {
                // Get token from AuthContext or localStorage as fallback
                const token = authToken || localStorage.getItem('token');
                if (!token) {
                  alert('Authentication token not found. Please log in again.');
                  navigate('/login');
                  return;
                }

                // Debug: Log token status (without exposing full token)
                console.log('Creating project with token:', token ? `${token.substring(0, 20)}...` : 'No token');

                // Create project
                const projectResponse = await fetch('http://localhost:8000/api/projects', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    name: projectName,
                    project_type: 'object-detection',
                    description: `Auto-assigned project created from Dashboard`,
                    classes: []
                  })
                });

                console.log('Project creation response status:', projectResponse.status);

                if (!projectResponse.ok) {
                  // Get error details from response
                  let errorMessage = 'Failed to create project';
                  try {
                    const errorData = await projectResponse.json();
                    if (errorData.detail) {
                      errorMessage = errorData.detail;
                    } else if (errorData.message) {
                      errorMessage = errorData.message;
                    }
                  } catch (e) {
                    // If response is not JSON, use status text
                    errorMessage = `HTTP ${projectResponse.status}: ${projectResponse.statusText}`;
                  }
                  
                  // If unauthorized, suggest re-login
                  if (projectResponse.status === 401) {
                    errorMessage += '. Your session may have expired. Please try logging out and logging back in.';
                  }
                  
                  throw new Error(errorMessage);
                }

                const projectData = await projectResponse.json();
                const projectId = projectData.id;

                // Get unassigned files
                const unassignedFiles = documents.filter(doc => doc.status === 'Un assigned');
                
                // Distribute files evenly among selected users
                const selectedUsersList = users.filter(u => selectedUsersForProject.has(u.id));
                const filesPerUser = Math.floor(unassignedFiles.length / selectedUsersList.length);
                const remainder = unassignedFiles.length % selectedUsersList.length;

                let fileIndex = 0;
                const assignPromises = [];

                for (let i = 0; i < selectedUsersList.length; i++) {
                  const user = selectedUsersList[i];
                  // Calculate how many files this user gets
                  const filesForThisUser = filesPerUser + (i < remainder ? 1 : 0);
                  
                  // Assign files to this user
                  for (let j = 0; j < filesForThisUser && fileIndex < unassignedFiles.length; j++) {
                    const file = unassignedFiles[fileIndex];
                    assignPromises.push(
                      fetch(`http://localhost:8000/api/bulk-upload/files/${file.id}`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          assigned_to: user.name,
                          assigned_on: new Date().toISOString(),
                          status: 'Assigned',
                          project_id: projectId  // Include project_id to create ProjectImage
                        })
                      })
                    );
                    fileIndex++;
                  }
                }

                // Wait for all assignments to complete
                const assignResults = await Promise.all(assignPromises);
                
                // Check if all assignments were successful
                const failedAssignments = assignResults.filter(r => !r.ok);
                if (failedAssignments.length > 0) {
                  throw new Error(`${failedAssignments.length} file assignment(s) failed`);
                }

                // Reload files to reflect changes
                const reloadResponse = await fetch('http://localhost:8000/api/bulk-upload/files');
                if (reloadResponse.ok) {
                  const files = await reloadResponse.json();
                  const transformedFiles = files.map((file) => ({
                    id: file.id,
                    name: file.file_name,
                    fileType: file.file_type,
                    assignedTo: file.assigned_to || '--',
                    assignedOn: file.uploaded_on || new Date(file.uploaded_at).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }),
                    modification: file.has_annotations ? 'Completed' : 'Pending',
                    status: file.status || 'Un assigned',
                    uploadedAt: file.uploaded_at ? new Date(file.uploaded_at) : null,
                    has_annotations: file.has_annotations || false
                  }));
                  setDocuments(transformedFiles);
                }

                // Reload users to update their file counts (for Assign Document popup)
                const usersResponse = await fetch('http://localhost:8000/api/users');
                if (usersResponse.ok) {
                  const usersData = await usersResponse.json();
                  setUsers(usersData);
                }

                setShowAutoAssignConfirm(false);
                setShowCreateProjectModal(false);
                setProjectName('');
                setSelectedUsersForProject(new Set());
                alert(`✅ Project "${projectName}" created and ${unassignedFiles.length} files assigned to ${selectedUsersList.length} user(s) successfully!`);
              } catch (error) {
                console.error('Error creating project and assigning files:', error);
                const errorMessage = error.message || 'Failed to create project and assign files';
                
                // If it's an authentication error, offer to redirect to login
                if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('expired')) {
                  if (window.confirm(`${errorMessage}\n\nWould you like to log in again?`)) {
                    navigate('/login');
                  }
                } else {
                  alert(`❌ Error: ${errorMessage}`);
                }
              } finally {
                setIsCreatingProject(false);
              }
            }}
            disabled={isCreatingProject}
            style={{
              padding: '10px 25px',
              borderRadius: '8px',
              fontWeight: '500',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              if (!isCreatingProject) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
            }}
          >
            {isCreatingProject ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Creating & Assigning...
              </>
            ) : (
              <>
                <i className="fas fa-check-circle me-2"></i>
                Confirm & Create
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Revert Assignment Modal (Single File) */}
      <Modal show={showRevertModal} onHide={() => setShowRevertModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Revert Assignment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to revert the assignment for <strong>{fileToRevert?.name}</strong>?
          </p>
          <p className="text-muted">
            This will unassign the file from <strong>{fileToRevert?.assignedTo}</strong> and make it available for assignment again.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRevertModal(false)} disabled={isReverting}>
            Cancel
          </Button>
          <Button variant="warning" onClick={handleRevertAssignment} disabled={isReverting}>
            {isReverting ? 'Reverting...' : 'Confirm Revert'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Bulk Revert Assignment Modal */}
      <Modal 
        show={showBulkRevertModal} 
        onHide={() => setShowBulkRevertModal(false)} 
        centered
        size="lg"
      >
        <Modal.Header 
          closeButton 
          style={{
            background: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)',
            color: '#000',
            borderBottom: 'none'
          }}
        >
          <Modal.Title style={{ color: '#000', fontWeight: '600', fontSize: '20px' }}>
            <i className="fas fa-undo me-2"></i>
            Bulk Revert Assignment
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '30px' }}>
          {/* Summary Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.1) 0%, rgba(255, 152, 0, 0.1) 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '25px',
            border: '1px solid rgba(255, 193, 7, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '15px',
                color: '#000',
                fontSize: '18px'
              }}>
                <i className="fas fa-undo"></i>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>Reverting Assignment</div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#333' }}>
                  {filesToRevert.length} file{filesToRevert.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <div style={{
              marginTop: '15px',
              paddingTop: '15px',
              borderTop: '1px solid rgba(255, 193, 7, 0.2)',
              fontSize: '14px',
              color: '#666'
            }}>
              These files will be unassigned and made available for assignment again.
            </div>
          </div>

          {/* Files List */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '15px',
              paddingBottom: '10px',
              borderBottom: '2px solid #f0f0f0'
            }}>
              <i className="fas fa-list" style={{ color: '#ff9800', marginRight: '10px', fontSize: '18px' }}></i>
              <h6 style={{ margin: 0, fontWeight: '600', color: '#333', fontSize: '16px' }}>
                Files to Revert ({filesToRevert.length})
              </h6>
            </div>
            <div style={{
              background: '#f8f9fa',
              borderRadius: '8px',
              padding: '15px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {filesToRevert.map((file, index) => (
                <div 
                  key={file.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    marginBottom: index < filesToRevert.length - 1 ? '8px' : '0',
                    background: '#fff',
                    borderRadius: '6px',
                    border: '1px solid #e9ecef'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#000',
                      fontSize: '14px',
                      fontWeight: '600',
                      marginRight: '12px'
                    }}>
                      {index + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>{file.name}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Assigned to: <strong>{file.assignedTo}</strong>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    background: file.modification === 'Completed' ? '#d4edda' : '#fff3cd',
                    color: file.modification === 'Completed' ? '#155724' : '#856404',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {file.modification}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer style={{
          borderTop: '1px solid #e9ecef',
          padding: '20px 30px',
          background: '#f8f9fa'
        }}>
          <Button 
            variant="secondary" 
            onClick={() => setShowBulkRevertModal(false)} 
            disabled={isReverting}
            style={{
              padding: '10px 25px',
              borderRadius: '8px',
              fontWeight: '500',
              border: 'none'
            }}
          >
            <i className="fas fa-times me-2"></i>
            Cancel
          </Button>
          <Button 
            variant="warning" 
            onClick={handleBulkRevertAssignment} 
            disabled={isReverting}
            style={{
              padding: '10px 25px',
              borderRadius: '8px',
              fontWeight: '500',
              background: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)',
              border: 'none',
              color: '#000',
              boxShadow: '0 4px 15px rgba(255, 193, 7, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              if (!isReverting) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(255, 193, 7, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 15px rgba(255, 193, 7, 0.3)';
            }}
          >
            {isReverting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Reverting...
              </>
            ) : (
              <>
                <i className="fas fa-undo me-2"></i>
                Confirm Revert ({filesToRevert.length})
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Dashboard;

