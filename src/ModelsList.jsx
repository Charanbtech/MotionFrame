import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './ModelsList.css';

const ModelsList = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { authToken } = useAuth();
  const projectId = searchParams.get('projectId');
  const token = authToken || localStorage.getItem('token');

  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    fetchModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const fetchModels = async () => {
    try {
      const res = await fetch(`/api/models/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setModels(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleDeploy = async (modelId) => {
    if (!window.confirm("Deploy this model? It will become the active model for inference.")) return;
    try {
      const res = await fetch(`/api/models/${modelId}/deploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Model deployed successfully!");
        fetchModels();
      } else {
        alert("Failed to deploy model.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (modelId) => {
    if (!window.confirm("Are you sure you want to delete this model?")) return;
    try {
      const res = await fetch(`/api/models/${modelId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchModels();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = (jobId) => {
    fetch(`/api/training/${jobId}/weights/best.pt`, {
        headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `best_${jobId.substring(0,6)}.pt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    });
  };

  return (
    <div className="ml-root">
      <div className="ml-container">
        <div className="ml-header">
          <h1 className="ml-title">Model Registry</h1>
          <div className="ml-subtitle">Manage trained models for Project ID: {projectId}</div>
        </div>

        <div className="ml-table-container">
          {loading ? (
            <div className="ml-empty">Loading models...</div>
          ) : models.length === 0 ? (
            <div className="ml-empty">No models registered yet. Train a model to see it here.</div>
          ) : (
            <table className="ml-table">
              <thead>
                <tr>
                  <th>Architecture</th>
                  <th>Dataset Version</th>
                  <th>Epochs</th>
                  <th>mAP50</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {models.map(m => {
                  const isActive = m.status === 'deployed';
                  return (
                    <tr key={m.model_id} className={isActive ? 'ml-row-active' : ''}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{m.architecture}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{m.task}</div>
                      </td>
                      <td>{m.dataset_version_id}</td>
                      <td className="ml-metric-col">{m.epochs_trained}</td>
                      <td className="ml-metric-col">{m.mAP50?.toFixed(3) || '0.000'}</td>
                      <td className="ml-metric-col">{m.precision?.toFixed(3) || '0.000'}</td>
                      <td className="ml-metric-col">{m.recall?.toFixed(3) || '0.000'}</td>
                      <td>
                        <span className={`ml-status-badge ${m.status}`}>
                          {m.status}
                        </span>
                      </td>
                      <td>
                        <div className="ml-actions">
                          <button 
                            className="ml-btn ml-btn-deploy" 
                            disabled={isActive}
                            onClick={() => handleDeploy(m.model_id)}
                          >
                            {isActive ? 'Active' : 'Deploy'}
                          </button>
                          <button className="ml-btn" onClick={() => navigate(`/training/results?job_id=${m.job_id}&project_id=${projectId}`)}>
                            Results
                          </button>
                          <button className="ml-btn" onClick={() => handleDownload(m.job_id)}>
                            Weights
                          </button>
                          <button className="ml-btn ml-btn-danger" onClick={() => handleDelete(m.model_id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelsList;
