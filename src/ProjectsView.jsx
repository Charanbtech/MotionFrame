import React, { useState, useEffect } from 'react';
import { Container, Table, Button, Modal, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from './config';
import './style.scss';
import './Dashboard.css';

const ProjectsView = () => {
  const { authToken } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showViewModal, setShowViewModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [selectedUserForReassign, setSelectedUserForReassign] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchUsers();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/assignments/summary`);
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = authToken || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchAssignments = async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/assignments`);
      if (response.ok) {
        const data = await response.json();
        setProjectAssignments(data);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const handleViewAssignments = async (project) => {
    setSelectedProject(project);
    await fetchAssignments(project.project_id);
    setShowViewModal(true);
  };

  const handleRevokeClick = async (project) => {
    setSelectedProject(project);
    await fetchAssignments(project.project_id);
    setShowRevokeModal(true);
  };

  const handleReassignClick = async (project) => {
    setSelectedProject(project);
    await fetchAssignments(project.project_id);
    setShowReassignModal(true);
  };

  const confirmRevoke = async () => {
    setActionLoading(true);
    try {
      const fileIds = projectAssignments.map(a => a.file_id);
      const response = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.project_id}/assignments/revoke`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: fileIds })
      });
      
      if (response.ok) {
        alert('Assignments revoked successfully.');
        setShowRevokeModal(false);
        fetchProjects();
      } else {
        alert('Failed to revoke assignments.');
      }
    } catch (error) {
      console.error('Error revoking:', error);
      alert('Error revoking assignments.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmReassign = async () => {
    if (!selectedUserForReassign) {
      alert('Please select a user');
      return;
    }
    
    setActionLoading(true);
    try {
      const fileIds = projectAssignments.map(a => a.file_id);
      const response = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.project_id}/assignments/reassign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: fileIds, user_id: selectedUserForReassign })
      });
      
      if (response.ok) {
        alert('Assignments reassigned successfully.');
        setShowReassignModal(false);
        setSelectedUserForReassign('');
        fetchProjects();
      } else {
        alert('Failed to reassign.');
      }
    } catch (error) {
      console.error('Error reassigning:', error);
      alert('Error reassigning assignments.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <Container fluid className="py-4 px-3 px-md-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              onClick={() => navigate('/dashboard')}
              style={{
                background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer',
                color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f5f5f5'
              }}
            >
              <i className="fas fa-arrow-left"></i>
            </button>
            <h4 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>Projects Assignment Management</h4>
          </div>
        </div>

        <div className="table-section">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Loading projects...</div>
          ) : (
            <div className="table-responsive">
              <Table striped bordered hover className="documents-table">
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th>Assigned Users</th>
                    <th>Total Assigned Files</th>
                    <th style={{ width: '300px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length > 0 ? (
                    projects.map((p) => (
                      <tr key={p.project_id}>
                        <td style={{ fontWeight: '500' }}>{p.project_name}</td>
                        <td>
                          {p.assigned_users.map(u => u.name).join(', ')}
                        </td>
                        <td>{p.file_count}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="info" size="sm" onClick={() => handleViewAssignments(p)}>
                              View
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => handleReassignClick(p)}>
                              Reassign
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => handleRevokeClick(p)}>
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-muted">
                        No projects with active assignments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      </Container>

      {/* View Modal */}
      <Modal show={showViewModal} onHide={() => setShowViewModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Assignments for {selectedProject?.project_name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table striped bordered size="sm">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Assigned To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {projectAssignments.map(a => (
                <tr key={a.assignment_id}>
                  <td>{a.file_name}</td>
                  <td>{a.user_name}</td>
                  <td>{a.file_status}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowViewModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Reassign Modal */}
      <Modal show={showReassignModal} onHide={() => setShowReassignModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Reassign Project</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Reassign all {projectAssignments.length} files in <strong>{selectedProject?.project_name}</strong>.</p>
          <Form.Group>
            <Form.Label>Select New User</Form.Label>
            <Form.Select 
              value={selectedUserForReassign} 
              onChange={e => setSelectedUserForReassign(e.target.value)}
            >
              <option value="">-- Select a User --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowReassignModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={confirmReassign} disabled={actionLoading || !selectedUserForReassign}>
            {actionLoading ? 'Reassigning...' : 'Confirm Reassign'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Revoke Modal */}
      <Modal show={showRevokeModal} onHide={() => setShowRevokeModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Revoke Assignments</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="alert alert-warning">
            <i className="fas fa-exclamation-triangle me-2"></i>
            This will revoke assignment but preserve annotations.
          </div>
          <p>Are you sure you want to revoke {projectAssignments.length} file assignments from <strong>{selectedProject?.project_name}</strong>?</p>
          <p className="text-muted" style={{ fontSize: '14px' }}>
            Users will lose access to these files, and they will return to the Unassigned pool.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRevokeModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmRevoke} disabled={actionLoading}>
            {actionLoading ? 'Revoking...' : 'Revoke Assignments'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ProjectsView;
