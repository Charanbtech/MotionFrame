import { API_BASE_URL, WS_BASE_URL } from './config';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './TrainingLive.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
};

const TrainingLive = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { authToken } = useAuth();
  
  const jobId = searchParams.get('job_id');
  const projectId = searchParams.get('project_id');

  const [jobConfig, setJobConfig] = useState(null);
  const [status, setStatus] = useState('running'); // 'running' | 'done' | 'error' | 'stopped'
  const [errorMsg, setErrorMsg] = useState('');
  const [finalMetrics, setFinalMetrics] = useState(null);

  // Epochs & Time
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(100);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [eta, setEta] = useState(0);

  // Metrics Data
  const [metricsHistory, setMetricsHistory] = useState([]);
  
  // GPU Data
  const [gpuData, setGpuData] = useState(null);

  // Logs
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  // Dialog
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);

  const wsRef = useRef(null);

  const token = authToken || localStorage.getItem('token');

  // Fetch initial info to populate top bar
  const fetchJobInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/training/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setJobConfig(data.config);
        setTotalEpochs(data.config?.epochs || 100);
        if (data.start_time) {
          setStartTime(new Date(data.start_time).getTime());
        }
        if (data.status !== 'running' && data.status !== 'pending') {
          setStatus(data.status);
        }
        if (data.metrics_history && data.metrics_history.length > 0) {
          setMetricsHistory(data.metrics_history);
          const lastEpoch = data.metrics_history[data.metrics_history.length - 1];
          setCurrentEpoch(lastEpoch.epoch);
          if (lastEpoch.total_epochs) setTotalEpochs(lastEpoch.total_epochs);
          
          // Add some synthesized logs for the loaded history
          const loadedLogs = data.metrics_history.map(m => `Restored Epoch ${m.epoch}/${m.total_epochs} completed. Box: ${m.box_loss}, Cls: ${m.cls_loss}, mAP50: ${m.mAP50}`);
          setLogs(loadedLogs.slice(-200));
        }
      }
    } catch (e) {
      console.error("Failed to fetch job info", e);
    }
  }, [jobId, token]);

  useEffect(() => {
    fetchJobInfo();
  }, [fetchJobInfo]);

  // Elapsed Time interval
  useEffect(() => {
    if (status !== 'running' || !startTime) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const el = (now - startTime) / 1000;
      setElapsed(el);
      
      // Calculate ETA
      if (currentEpoch > 0) {
        const timePerEpoch = el / currentEpoch;
        const remainingEpochs = totalEpochs - currentEpoch;
        setEta(timePerEpoch * remainingEpochs);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, status, currentEpoch, totalEpochs]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // WebSocket Connection
  useEffect(() => {
    if (!jobId) return;

    let retryCount = 0;
    const connectWs = () => {
      if (status !== 'running' && status !== 'pending') return;

      const ws = new WebSocket(`${WS_BASE_URL}/ws/training/${jobId}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'metrics') {
            const data = msg.data;
            setCurrentEpoch(data.epoch);
            if (data.total_epochs) setTotalEpochs(data.total_epochs);
            setMetricsHistory(prev => [...prev, data]);
            
            // Log epoch summary
            setLogs(prev => {
              const newLogs = [...prev, `Epoch ${data.epoch}/${data.total_epochs} completed. Box: ${data.box_loss}, Cls: ${data.cls_loss}, mAP50: ${data.mAP50}`];
              return newLogs.slice(-200);
            });
          } 
          else if (msg.type === 'gpu') {
            setGpuData(msg.data);
          } 
          else if (msg.type === 'log') {
            setLogs(prev => {
              const newLogs = [...prev, msg.data];
              return newLogs.slice(-200);
            });
          }
          else if (msg.type === 'done') {
            setStatus('done');
            setFinalMetrics(msg.data?.final_metrics);
            setStopping(false);
            ws.close();
          }
          else if (msg.type === 'stopped') {
            setStatus('stopped');
            setStopping(false);
            ws.close();
          }
          else if (msg.type === 'error') {
            setStatus('error');
            setErrorMsg(msg.message || 'Unknown error');
            setStopping(false);
            ws.close();
          }
        } catch (e) {
          console.error("WS Parse error", e);
        }
      };

      ws.onerror = () => {
        if (retryCount < 3) {
          retryCount++;
          setTimeout(connectWs, 2000);
        } else {
          setStatus('error');
          setErrorMsg('WebSocket connection failed after 3 retries.');
        }
      };
      
      ws.onclose = () => {
        // Only reconnect if we didn't receive a terminal state
        if (status === 'running' || status === 'pending') {
            // Might have been closed by server prematurely
        }
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]); // Only run on mount or jobId change. We manage status closure inside.

  const handleStop = async () => {
    setStopping(true);
    setShowStopConfirm(false);
    try {
      await fetch(`${API_BASE_URL}/api/training/${jobId}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.error(e);
      setStopping(false);
    }
  };

  // ── Chart Data ────────────────────────────────────────────────────────────
  const labels = metricsHistory.map(m => `Ep ${m.epoch}`);
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#aaa', font: { size: 11 } } },
    },
    scales: {
      x: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: '#222' } },
      y: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: '#222' } }
    }
  };

  const lossData = {
    labels,
    datasets: [
      { label: 'Box Loss', data: metricsHistory.map(m => m.box_loss), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.1, pointRadius: 0 },
      { label: 'Cls Loss', data: metricsHistory.map(m => m.cls_loss), borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.1, pointRadius: 0 },
      { label: 'Dfl Loss', data: metricsHistory.map(m => m.dfl_loss), borderColor: '#eab308', backgroundColor: '#eab308', tension: 0.1, pointRadius: 0 },
    ]
  };

  const accData = {
    labels,
    datasets: [
      { label: 'mAP50', data: metricsHistory.map(m => m.mAP50), borderColor: '#22c55e', backgroundColor: '#22c55e', tension: 0.1, pointRadius: 0 },
      { label: 'mAP50-95', data: metricsHistory.map(m => m.mAP50_95), borderColor: '#a855f7', backgroundColor: '#a855f7', tension: 0.1, pointRadius: 0 },
    ]
  };

  // ── Render Helpers ────────────────────────────────────────────────────────
  const getTempColorClass = (temp) => {
    if (!temp) return '';
    if (temp < 75) return 'tl-color-safe';
    if (temp <= 85) return 'tl-color-warn';
    return 'tl-color-danger';
  };

  return (
    <div className="tl-root">
      {/* Top Bar */}
      <div className="tl-header">
        <div className="tl-header-left">
          <div className="tl-model-info">
            Live Training
            {jobConfig?.weights && <span className="tl-badge">{jobConfig.weights}</span>}
          </div>
          <div className="tl-job-id">ID: {jobId?.substring(0, 8)} • Dataset: {jobConfig?.dataset_version_id || 'Unknown'}</div>
        </div>

        <div className="tl-header-center">
          Epoch {currentEpoch} / {totalEpochs}
        </div>

        <div className="tl-header-right">
          <div className="tl-time-info">
            <div>Elapsed: <span className="tl-time-value">{formatTime(elapsed)}</span></div>
            <div>ETA: <span className="tl-time-value">{formatTime(eta)}</span></div>
          </div>
          <button 
            className="tl-stop-btn" 
            onClick={() => setShowStopConfirm(true)}
            disabled={status !== 'running' || stopping}
          >
            {stopping ? 'Stopping...' : 'Stop Training'}
          </button>
        </div>
      </div>

      {/* Banners */}
      {status === 'done' && (
        <div className="tl-banner done">
          <div>Training Complete!</div>
          {finalMetrics && (
            <div className="tl-banner-metrics">
              <span>mAP50: <strong>{finalMetrics.mAP50?.toFixed(3)}</strong></span>
              <span>mAP50-95: <strong>{finalMetrics.mAP50_95?.toFixed(3)}</strong></span>
              <span>Precision: <strong>{finalMetrics.precision?.toFixed(3)}</strong></span>
            </div>
          )}
          <button className="tl-view-results-btn" onClick={() => navigate(`/training/results?job_id=${jobId}&project_id=${projectId}`)}>
            View Results →
          </button>
        </div>
      )}
      {status === 'stopped' && (
        <div className="tl-banner stopped">
          <div>Training Stopped</div>
          <div className="tl-banner-metrics">Progress saved up to epoch {currentEpoch}.</div>
        </div>
      )}
      {status === 'error' && (
        <div className="tl-banner error">
          <div>Training Failed</div>
          <div className="tl-banner-metrics" style={{ color: '#fca5a5' }}>{errorMsg}</div>
        </div>
      )}

      {/* Main Layout */}
      <div className="tl-main">
        
        {/* Left Col: Charts */}
        <div className="tl-col">
          <div className="tl-chart-container">
            <div className="tl-section-title">Loss over epochs</div>
            <div className="tl-chart-wrapper">
              {metricsHistory.length > 0 ? <Line data={lossData} options={chartOptions} /> : <div style={{color:'#444', textAlign:'center', marginTop:'40px', fontSize:'12px'}}>Waiting for epoch 1...</div>}
            </div>
          </div>
          <div className="tl-chart-container">
            <div className="tl-section-title">Accuracy over epochs</div>
            <div className="tl-chart-wrapper">
              {metricsHistory.length > 0 ? <Line data={accData} options={{...chartOptions, scales:{...chartOptions.scales, y:{...chartOptions.scales.y, min:0, max:1}}}} /> : <div style={{color:'#444', textAlign:'center', marginTop:'40px', fontSize:'12px'}}>Waiting for epoch 1...</div>}
            </div>
          </div>
        </div>

        {/* Center Col: Logs */}
        <div className="tl-col">
          <div className="tl-logs-wrapper">
            <div className="tl-section-title">Log Stream</div>
            <div className="tl-logs">
              {logs.length === 0 ? <div style={{color:'#444'}}>Connecting to stream...</div> : null}
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Right Col: GPU */}
        <div className="tl-col" style={{ background: '#111' }}>
          <div className="tl-gpu-wrapper">
            <div className="tl-section-title">GPU Telemetry</div>
            
            {!gpuData ? (
              <div className="tl-gpu-unavailable">Waiting for telemetry...</div>
            ) : gpuData.vram_total_mb === 0 ? (
              <div className="tl-gpu-unavailable">GPU monitoring unavailable<br/>(No NVIDIA GPU detected)</div>
            ) : (
              <>
                {/* VRAM */}
                <div className="tl-gpu-stat">
                  <div className="tl-gpu-header">
                    <span className="tl-gpu-label">VRAM Usage</span>
                    <span className="tl-gpu-value">{(gpuData.vram_used_mb / 1024).toFixed(1)} GB / {(gpuData.vram_total_mb / 1024).toFixed(1)} GB</span>
                  </div>
                  <div className="tl-progress-bg">
                    <div 
                      className="tl-progress-fill" 
                      style={{ width: `${(gpuData.vram_used_mb / Math.max(1, gpuData.vram_total_mb)) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Utilization */}
                <div className="tl-gpu-stat">
                  <div className="tl-gpu-header">
                    <span className="tl-gpu-label">GPU Utilization</span>
                    <span className="tl-gpu-value">{gpuData.utilization}%</span>
                  </div>
                  <div className="tl-progress-bg">
                    <div 
                      className="tl-progress-fill" 
                      style={{ 
                        width: `${gpuData.utilization}%`,
                        backgroundColor: gpuData.utilization > 90 ? '#ef4444' : gpuData.utilization > 70 ? '#f59e0b' : '#3b82f6'
                      }}
                    />
                  </div>
                </div>

                {/* Temperature */}
                <div className="tl-gpu-stat">
                  <div className="tl-gpu-header">
                    <span className="tl-gpu-label">Temperature</span>
                    <span className={`tl-gpu-value ${getTempColorClass(gpuData.temperature)}`}>{gpuData.temperature}°C</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Stop Confirm Dialog */}
      {showStopConfirm && (
        <div className="tl-dialog-overlay" onClick={(e) => { if (e.target.className.includes('overlay')) setShowStopConfirm(false); }}>
          <div className="tl-dialog">
            <h3>Stop Training?</h3>
            <p>Are you sure you want to stop the training run early? Progress up to the last completed epoch is saved.</p>
            <div className="tl-dialog-actions">
              <button className="tl-dialog-btn cancel" onClick={() => setShowStopConfirm(false)}>Cancel</button>
              <button className="tl-dialog-btn confirm" onClick={handleStop}>Stop Training</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingLive;
