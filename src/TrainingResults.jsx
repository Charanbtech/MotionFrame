import { API_BASE_URL } from './config';
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './TrainingResults.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const TrainingResults = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { authToken } = useAuth();
  
  const jobId = searchParams.get('job_id');
  const projectId = searchParams.get('project_id');

  const [jobSummary, setJobSummary] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [expandedImg, setExpandedImg] = useState(null);
  const [registering, setRegistering] = useState(false);

  const token = authToken || localStorage.getItem('token');

  useEffect(() => {
    if (!jobId) return;

    // Fetch Job Summary
    fetch(`${API_BASE_URL}/api/training/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => setJobSummary(data))
    .catch(console.error);

    // Fetch CSV Data
    fetch(`${API_BASE_URL}/api/training/${jobId}/results/csv`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.ok ? r.json() : [])
    .then(data => setCsvData(data))
    .catch(console.error);
  }, [jobId, token]);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/models/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ job_id: jobId })
      });
      if (res.ok) {
        navigate(`/models?projectId=${projectId}`);
      } else {
        const err = await res.json();
        alert(`Failed to register: ${err.detail}`);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
    setRegistering(false);
  };

  const downloadWeights = () => {
    // Basic download trigger (in reality, would need auth headers via blob if protected)
    // For local dev, we can just fetch and create blob url
    fetch(`${API_BASE_URL}/api/training/${jobId}/weights/best.pt`, {
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

  // ── Parsed Metrics ───────────────────────────────────────────────────────
  const lastRow = csvData.length > 0 ? csvData[csvData.length - 1] : {};
  const mAP50 = parseFloat(lastRow['metrics/mAP50(B)'] || 0).toFixed(3);
  const mAP50_95 = parseFloat(lastRow['metrics/mAP50-95(B)'] || 0).toFixed(3);
  const precision = parseFloat(lastRow['metrics/precision(B)'] || 0).toFixed(3);
  const recall = parseFloat(lastRow['metrics/recall(B)'] || 0).toFixed(3);
  const epochsCompleted = csvData.length;

  // ── Charts ───────────────────────────────────────────────────────────────
  const labels = csvData.map(r => `Ep ${r.epoch}`);
  
  const lossData = {
    labels,
    datasets: [
      { label: 'Train Box Loss', data: csvData.map(r => r['train/box_loss']), borderColor: '#3b82f6', tension: 0.1, pointRadius: 0 },
      { label: 'Val Box Loss', data: csvData.map(r => r['val/box_loss']), borderColor: '#93c5fd', borderDash: [5,5], tension: 0.1, pointRadius: 0 },
      { label: 'Train Cls Loss', data: csvData.map(r => r['train/cls_loss']), borderColor: '#ef4444', tension: 0.1, pointRadius: 0 },
      { label: 'Val Cls Loss', data: csvData.map(r => r['val/cls_loss']), borderColor: '#fca5a5', borderDash: [5,5], tension: 0.1, pointRadius: 0 },
    ]
  };

  const accData = {
    labels,
    datasets: [
      { label: 'mAP50', data: csvData.map(r => r['metrics/mAP50(B)']), borderColor: '#22c55e', backgroundColor: '#22c55e', tension: 0.1, pointRadius: 0 },
      { label: 'mAP50-95', data: csvData.map(r => r['metrics/mAP50-95(B)']), borderColor: '#a855f7', backgroundColor: '#a855f7', tension: 0.1, pointRadius: 0 },
    ]
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#aaa', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#666' }, grid: { color: '#222' } },
      y: { ticks: { color: '#666' }, grid: { color: '#222' } }
    }
  };

  const images = [
    { id: 'confusion_matrix.png', label: 'Confusion Matrix' },
    { id: 'val_batch0_pred.jpg', label: 'Validation Predictions (Batch 0)' },
    { id: 'val_batch1_pred.jpg', label: 'Validation Predictions (Batch 1)' },
  ];

  return (
    <div className="tr-root">
      <div className="tr-container">
        {/* Header */}
        <div className="tr-header">
          <div>
            <h1 className="tr-title">Training Results</h1>
            <div className="tr-subtitle">
              Job ID: {jobId} • Model: {jobSummary?.config?.weights || 'YOLO'} • {epochsCompleted} Epochs
            </div>
          </div>
          <div className="tr-actions">
            <button className="tr-btn tr-btn-secondary" onClick={() => navigate(`/training/config?projectId=${projectId}`)}>
              Train Again
            </button>
            <button className="tr-btn tr-btn-secondary" onClick={downloadWeights}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download best.pt
            </button>
            <button className="tr-btn tr-btn-primary" onClick={handleRegister} disabled={registering}>
              {registering ? 'Saving...' : 'Save to Model Registry'}
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="tr-metrics-grid">
          <div className="tr-metric-card">
            <div className="tr-metric-label">mAP50</div>
            <div className="tr-metric-value">{mAP50}</div>
          </div>
          <div className="tr-metric-card">
            <div className="tr-metric-label">mAP50-95</div>
            <div className="tr-metric-value">{mAP50_95}</div>
          </div>
          <div className="tr-metric-card">
            <div className="tr-metric-label">Precision</div>
            <div className="tr-metric-value">{precision}</div>
          </div>
          <div className="tr-metric-card">
            <div className="tr-metric-label">Recall</div>
            <div className="tr-metric-value">{recall}</div>
          </div>
        </div>

        {/* Charts */}
        <div className="tr-charts-grid">
          <div className="tr-chart-card">
            <div className="tr-section-title">Training vs Validation Loss</div>
            <div className="tr-chart-wrapper">
              <Line data={lossData} options={chartOptions} />
            </div>
          </div>
          <div className="tr-chart-card">
            <div className="tr-section-title">Accuracy Progress</div>
            <div className="tr-chart-wrapper">
              <Line data={accData} options={{...chartOptions, scales: {...chartOptions.scales, y: {...chartOptions.scales.y, min:0, max:1}}}} />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="tr-section-title">Validation Outputs</div>
        <div className="tr-images-grid">
          {images.map(img => (
            <div key={img.id} className="tr-image-card">
              <div className="tr-image-label">{img.label}</div>
              <div className="tr-img-wrapper" onClick={() => setExpandedImg(img.id)}>
                <img 
                  src={`${API_BASE_URL}/api/training/${jobId}/results/image/${img.id}?token=${token}`} 
                  alt={img.label}
                  onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div style="color:#666;font-size:12px;">Not generated</div>'; }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Image Modal */}
      {expandedImg && (
        <div className="tr-modal-overlay" onClick={() => setExpandedImg(null)}>
          <img 
            src={`${API_BASE_URL}/api/training/${jobId}/results/image/${expandedImg}?token=${token}`} 
            alt="Expanded"
            className="tr-modal-img"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default TrainingResults;
