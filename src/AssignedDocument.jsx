import React, { useState, useEffect } from 'react';
import { Container, Button, Table, Form, InputGroup, Modal, Dropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './style.scss';
import './Dashboard.css';

const AssignedDocument = () => {
  const { user, authToken } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [users, setUsers] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [userToUpdate, setUserToUpdate] = useState(null);
  const [isUpdatingOwner, setIsUpdatingOwner] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [userToExport, setUserToExport] = useState(null);

  useEffect(() => {
    // Load all users
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

    // Load uploaded files to calculate stats
    const loadUploadedFiles = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/bulk-upload/files');
        if (response.ok) {
          const files = await response.json();
          setUploadedFiles(files);
        }
      } catch (error) {
        console.error('Error loading uploaded files:', error);
      }
    };

    loadUsers();
    loadUploadedFiles();

    // Refresh periodically
    const interval = setInterval(() => {
      loadUsers();
      loadUploadedFiles();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Calculate statistics based on users and files - matching table logic
  const calculateStats = () => {
    const totalUsers = users.length;
    
    // Assigned Users: Count unique users who have at least one file assigned to them
    const assignedUsers = new Set(
      uploadedFiles
        .filter(f => f.assigned_to && f.assigned_to !== '--')
        .map(f => f.assigned_to)
    ).size;
    
    // Active Users: Users who have at least one file assigned to them
    const activeUsers = users.filter(u => {
      const userFiles = uploadedFiles.filter(f => 
        f.assigned_to === u.name || f.assigned_to === u.email || f.assigned_to === u.username
      );
      return userFiles.length > 0;
    }).length;
    
    // Pending Users: Users who have files with status 'Un assigned' or 'Assigned' (matching table logic)
    const pendingUsers = users.filter(u => {
      const userFiles = uploadedFiles.filter(f => 
        (f.assigned_to === u.name || f.assigned_to === u.email || f.assigned_to === u.username) && 
        (f.status === 'Un assigned' || f.status === 'Assigned')
      );
      return userFiles.length > 0;
    }).length;
    
    // Completed Users: Users who have at least one completed file (has_annotations === true, matching table logic)
    const completedUsers = users.filter(u => {
      const userFiles = uploadedFiles.filter(f => 
        (f.assigned_to === u.name || f.assigned_to === u.email || f.assigned_to === u.username) && 
        f.has_annotations === true
      );
      return userFiles.length > 0;
    }).length;

    return {
      totalUsers,
      assignedUsers,
      activeUsers,
      pendingUsers,
      completedUsers
    };
  };

  const stats = calculateStats();

  // Transform users to table format
  const userDocuments = users.map(user => {
    const userFiles = uploadedFiles.filter(f => 
      f.assigned_to === user.name || f.assigned_to === user.email || f.assigned_to === user.username
    );
    // Check for files with annotations (has_annotations field) instead of status
    const completedFiles = userFiles.filter(f => f.has_annotations === true).length;
    const pendingFiles = userFiles.filter(f => f.status === 'Un assigned' || f.status === 'Assigned').length;
    const totalFiles = userFiles.length;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      is_owner: user.is_owner || false,
      totalFiles: totalFiles || '--',
      completedFiles: completedFiles || 0,
      pendingFiles: pendingFiles || '--',
      registeredOn: user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) : '--',
      status: totalFiles > 0 ? 'Active' : 'Inactive'
    };
  });

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Active':
        return 'badge-success';
      case 'Inactive':
        return 'badge-secondary';
      default:
        return 'badge-secondary';
    }
  };

  const filteredUsers = userDocuments.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  // Check if current user is owner
  const isCurrentUserOwner = user && user.is_owner;

  // Handle export user completed files
  const handleExportUserFiles = async (user) => {
    if (!user) {
      alert('Invalid user.');
      return;
    }

    setIsExporting(true);
    setUserToExport(user);
    
    try {
      const response = await fetch(`http://localhost:8000/api/users/${user.id}/export`);
      
      if (!response.ok) {
        if (response.status === 404) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'No completed files found for this user');
        }
        throw new Error(`Export failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${user.name}_completed_files_export.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert(`Successfully exported ${user.completedFiles} completed file(s) for ${user.name}`);
    } catch (error) {
      console.error('Error exporting user files:', error);
      alert(`Failed to export files: ${error.message}`);
    } finally {
      setIsExporting(false);
      setUserToExport(null);
    }
  };

  // Handle owner status update
  const handleUpdateOwnerStatus = async (isOwner) => {
    if (!userToUpdate) return;

    setIsUpdatingOwner(true);
    try {
      // Get token from AuthContext or localStorage as fallback
      const token = authToken || localStorage.getItem('token');
      
      if (!token) {
        alert('Authentication token not found. Please log in again.');
        navigate('/login');
        return;
      }

      // Verify current user is owner before making the request
      if (!user || !user.is_owner) {
        alert('Only owners can manage owner status. You do not have permission to perform this action.');
        setIsUpdatingOwner(false);
        return;
      }

      const response = await fetch(`http://localhost:8000/api/users/${userToUpdate.id}/owner`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          is_owner: isOwner
        })
      });

      if (response.ok) {
        // Reload users
        const usersResponse = await fetch('http://localhost:8000/api/users');
        if (usersResponse.ok) {
          const usersData = await usersResponse.json();
          setUsers(usersData);
        }
        setShowOwnerModal(false);
        setUserToUpdate(null);
        alert(`Successfully ${isOwner ? 'added' : 'removed'} owner status for ${userToUpdate.name}`);
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || 'Unknown error';
          
          // If unauthorized, suggest re-login
          if (response.status === 401) {
            errorMessage += '. Please try logging out and logging back in.';
          }
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        alert(`Failed to update owner status: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error updating owner status:', error);
      alert('Failed to update owner status. Please try again.');
    } finally {
      setIsUpdatingOwner(false);
    }
  };

  return (
    <div className="dashboard-container">
      <Container fluid className="py-4 px-3 px-md-4">
        {/* Summary Cards */}
        <div className="dashboard-stats-contain">
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-icon assigned">
                <i className="fas fa-users"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{stats.totalUsers}</p>
                <p className="stat-label">Total Users</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon unassigned">
                <i className="fas fa-user-check"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{stats.assignedUsers}</p>
                <p className="stat-label">Assigned Users</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon pending">
                <i className="fas fa-user-clock"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{stats.activeUsers}</p>
                <p className="stat-label">Active Users</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon overdue">
                <i className="fas fa-user-times"></i>
              </div>
              <div className="stat-content">
                <p className="stat-count">{stats.pendingUsers}</p>
                <p className="stat-label">Pending Users</p>
              </div>
            </div>

            <div className="stat-card" style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}>
            </div>

            <div className="dashboard-buttons">
              <button 
                className="btn-add-document"
                onClick={() => navigate('/bulk-upload/upload')}
              >
                <i className="fas fa-upload"></i>
                Add Document
              </button>
              <button 
                className="btn-assign-document"
                onClick={() => navigate('/dashboard')}
              >
                <i className="fas fa-arrow-left"></i>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="table-section">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4 className="table-title">All Users</h4>
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" className="filter-btn">
                <span>🔽</span> Filters
              </Button>
              <InputGroup style={{ width: '300px' }}>
                <InputGroup.Text>
                  🔍
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </InputGroup>
            </div>
          </div>

          <div className="table-responsive">
            <Table striped bordered hover className="documents-table">
              <thead>
                <tr>
                  <th>
                    <Form.Check type="checkbox" />
                  </th>
                  <th>User Name</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Total Files</th>
                  <th>Completed</th>
                  <th>Pending</th>
                  <th>Registered On</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.length > 0 ? (
                  paginatedUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Form.Check type="checkbox" />
                      </td>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.username}</td>
                      <td>{user.totalFiles}</td>
                      <td>{user.completedFiles}</td>
                      <td>{user.pendingFiles}</td>
                      <td>{user.registeredOn}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(user.status)}`}>
                          {user.status}
                        </span>
                      </td>
                      <td>
                        {isCurrentUserOwner ? (
                          <Dropdown>
                            <Dropdown.Toggle 
                              variant="link" 
                              className="action-menu-btn"
                              style={{ border: 'none', background: 'none', padding: '0', color: '#000' }}
                            >
                              ⋮
                            </Dropdown.Toggle>
                            <Dropdown.Menu>
                              <Dropdown.Item 
                                onClick={() => handleExportUserFiles(user)}
                                disabled={isExporting && userToExport?.id === user.id}
                              >
                                {isExporting && userToExport?.id === user.id ? 'Exporting...' : 'Export'}
                              </Dropdown.Item>
                              {user.is_owner ? (
                                <Dropdown.Item 
                                  onClick={() => {
                                    setUserToUpdate(user);
                                    setShowOwnerModal(true);
                                  }}
                                >
                                  Remove Owner
                                </Dropdown.Item>
                              ) : (
                                <Dropdown.Item 
                                  onClick={() => {
                                    setUserToUpdate(user);
                                    setShowOwnerModal(true);
                                  }}
                                >
                                  Add Owner
                                </Dropdown.Item>
                              )}
                            </Dropdown.Menu>
                          </Dropdown>
                        ) : (
                          <Button variant="link" className="action-menu-btn" disabled>
                            ⋮
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="10" className="text-center text-muted">
                      No users found.
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

      {/* Owner Status Update Modal */}
      <Modal show={showOwnerModal} onHide={() => setShowOwnerModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {userToUpdate?.is_owner ? 'Remove Owner Status' : 'Add Owner Status'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to {userToUpdate?.is_owner ? 'remove' : 'add'} owner status for{' '}
            <strong>{userToUpdate?.name}</strong>?
          </p>
          <p className="text-muted">
            {userToUpdate?.is_owner 
              ? 'This user will lose access to the Dashboard page and owner management features.'
              : 'This user will gain access to the Dashboard page and can manage other users\' owner status.'}
          </p>
          <p className="text-muted">
            Email: {userToUpdate?.email}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOwnerModal(false)} disabled={isUpdatingOwner}>
            Cancel
          </Button>
          <Button 
            variant={userToUpdate?.is_owner ? 'warning' : 'primary'} 
            onClick={() => handleUpdateOwnerStatus(!userToUpdate?.is_owner)} 
            disabled={isUpdatingOwner}
          >
            {isUpdatingOwner 
              ? 'Updating...' 
              : userToUpdate?.is_owner 
                ? 'Remove Owner' 
                : 'Add Owner'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AssignedDocument;


