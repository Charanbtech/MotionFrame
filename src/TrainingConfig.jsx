import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './TrainingConfig.css';

const Tooltip = ({ text }) => (
  <span className="tc-tooltip-container">
    <span className="tc-tooltip-icon">ℹ️</span>
    <span className="tc-tooltip-text">{text}</span>
  </span>
);

// ─── Model definitions ────────────────────────────────────────────────────────
const MODEL_CARDS = [
  {
    id: 'yolov8',
    label: 'YOLOv8',
    tag: 'Stable',
    tagColor: '#22c55e',
    bullets: [
      'Stable, production-ready',
      'Best ecosystem & community support',
      'Detection + Segmentation',
    ],
    sizes: ['Nano', 'Small', 'Medium', 'Large', 'XLarge'],
    supportsSegmentation: true,
  },
  {
    id: 'yolov11',
    label: 'YOLOv11',
    tag: 'Latest',
    tagColor: '#3b82f6',
    bullets: [
      'Latest Ultralytics release',
      'Faster inference than v8',
      'Detection + Segmentation',
    ],
    sizes: ['Nano', 'Small', 'Medium', 'Large', 'XLarge'],
    supportsSegmentation: true,
  },
  {
    id: 'yolov12',
    label: 'YOLOv12',
    tag: 'Experimental',
    tagColor: '#f59e0b',
    bullets: [
      'Experimental, attention-based',
      'Highest accuracy potential',
      'Detection only',
    ],
    sizes: ['Nano', 'Small', 'Medium', 'Large', 'XLarge'],
    supportsSegmentation: false,
  },
  {
    id: 'yoloworld',
    label: 'YOLO-World',
    tag: 'Zero-shot',
    tagColor: '#a78bfa',
    bullets: [
      'Open-vocabulary detection',
      'Zero-shot capability',
      'Detection only',
    ],
    sizes: ['Small', 'Medium', 'Large'],
    supportsSegmentation: false,
  },
];

// ─── Weight string resolver ───────────────────────────────────────────────────
const SIZE_CODE = { Nano: 'n', Small: 's', Medium: 'm', Large: 'l', XLarge: 'x' };

function resolveWeights(modelId, size, task, pretrained) {
  if (pretrained === 'scratch') return null;

  const s = SIZE_CODE[size] || 's';
  const seg = task === 'segment' ? '-seg' : '';

  switch (modelId) {
    case 'yolov8':    return `yolov8${s}${seg}.pt`;
    case 'yolov11':   return `yolo11${s}.pt`;       // v11 doesn't have -seg variants publicly
    case 'yolov12':   return `yolov12${s}.pt`;
    case 'yoloworld': {
      const wSize = { Small: 's', Medium: 'm', Large: 'l' }[size] || 's';
      return `yolov8${wSize}-worldv2.pt`;
    }
    default: return `yolov8${s}.pt`;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
const TrainingConfig = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authToken } = useAuth();

  const projectId   = parseInt(searchParams.get('projectId') || '0', 10);
  const projectType = searchParams.get('projectType') || 'object-detection';   // 'object-detection' | 'segmentation'
  const task        = projectType === 'segmentation' ? 'segment' : 'detect';

  // ── model selection state ─────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState('yolov8');
  const [selectedSize,  setSelectedSize]  = useState('Nano');

  // ── dataset versions ──────────────────────────────────────────────────────
  const [versions,       setVersions]       = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');

  // ── hyperparameters ───────────────────────────────────────────────────────
  const [epochs,    setEpochs]    = useState(100);
  const [imgsz,     setImgsz]     = useState(640);
  const [batch,     setBatch]     = useState(-1);
  const [patience,  setPatience]  = useState(50);
  const [pretrained, setPretrained] = useState('coco');

  // ── submit state ──────────────────────────────────────────────────────────
  const [submitting,    setSubmitting]    = useState(false);
  const [anotherRunning, setAnotherRunning] = useState(false);
  const [statusChecked, setStatusChecked]  = useState(false);
  const [error,  setError]  = useState('');

  // ── dataset stats & advisory ──────────────────────────────────────────────
  const [advisoryInfo, setAdvisoryInfo] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const token = authToken || localStorage.getItem('token');

  // ── load versions for this project ───────────────────────────────────────
  const loadVersions = useCallback(async () => {
    if (!projectId) return;
    setVersionsLoading(true);
    try {
      const res = await fetch(
        `/api/dataset/versions/${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
        if (data.length > 0) setSelectedVersion(data[0].version_id);
      }
    } catch { /* ignore */ }
    setVersionsLoading(false);
  }, [projectId, token]);

  // ── check for an already-running training job ─────────────────────────────
  const checkTrainingStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/training/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnotherRunning(data.is_running === true);
      }
    } catch { /* ignore — treat as not running */ }
    setStatusChecked(true);
  }, [token]);

  useEffect(() => { loadVersions(); checkTrainingStatus(); }, [loadVersions, checkTrainingStatus]);

  // ── fetch dataset stats and apply smart defaults ──────────────────────────
  useEffect(() => {
    if (!selectedVersion || !projectId) {
      setAdvisoryInfo(null);
      return;
    }
    setStatsLoading(true);
    fetch(`/api/dataset/versions/${projectId}/${selectedVersion}/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => {
      const total = data.total_images || 0;
      let model = 'yolov8';
      let size = 'Nano';
      let ep = 100;
      let sz = 640;
      let bsz = -1;
      let pat = 50;
      let msg = '';
      let color = 'tc-advisory-green';
      
      if (total < 30) {
        size = 'Nano'; ep = 300; sz = 416; bsz = 8; pat = 100; color = 'tc-advisory-amber';
        msg = "You have fewer than 30 images. Training is possible but results will be limited. For better accuracy, annotate at least 100 images per class. COCO pretrained weights are required for small datasets.";
      } else if (total >= 30 && total < 100) {
        size = 'Small'; ep = 200; sz = 640; bsz = 8; pat = 75; color = 'tc-advisory-amber';
        msg = "Small dataset detected (< 100 images). We have selected conservative settings. Results will improve significantly with more annotated data.";
      } else if (total >= 100 && total < 500) {
        size = 'Small'; ep = 150; sz = 640; bsz = -1; pat = 50; color = 'tc-advisory-green';
        msg = "Good dataset size. Default settings are optimized for your data.";
      } else {
        model = 'yolov11'; size = 'Small'; ep = 100; sz = 640; bsz = -1; pat = 50; color = 'tc-advisory-green';
        msg = "Strong dataset. You can experiment with Medium or Large model sizes for higher accuracy.";
      }
      
      setSelectedModel(model);
      setSelectedSize(size);
      setEpochs(ep);
      setImgsz(sz);
      setBatch(bsz);
      setPatience(pat);
      setPretrained('coco');
      
      setAdvisoryInfo({ total, msg, color });
      setStatsLoading(false);
    })
    .catch(() => setStatsLoading(false));
  }, [selectedVersion, projectId, token]);

  // Reset size when model changes (YOLO-World doesn't have Nano/XLarge)
  useEffect(() => {
    const card = MODEL_CARDS.find(c => c.id === selectedModel);
    if (card && !card.sizes.includes(selectedSize)) {
      setSelectedSize(card.sizes[0]);
    }
  }, [selectedModel]);

  // ── submit handler ────────────────────────────────────────────────────────
  const handleStart = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedVersion) {
      setError('Please select a dataset version first. Generate one from the annotation screen.');
      return;
    }
    if (epochs < 1) {
      setError('Epochs must be at least 1.');
      return;
    }

    const versionMeta = versions.find(v => v.version_id === selectedVersion);
    const dataYamlPath = versionMeta?.data_yaml_path || '';

    // Determine effective task (YOLO-World / v12 force detect)
    const card = MODEL_CARDS.find(c => c.id === selectedModel);
    const effectiveTask = card?.supportsSegmentation ? task : 'detect';

    const weights = resolveWeights(selectedModel, selectedSize, effectiveTask, pretrained);

    const body = {
      project_id:         projectId,
      dataset_version_id: selectedVersion,
      data_yaml_path:     dataYamlPath,
      weights,
      epochs:   parseInt(epochs, 10),
      imgsz:    parseInt(imgsz, 10),
      batch:    parseInt(batch, 10),
      patience: parseInt(patience, 10),
      task:     effectiveTask,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/training/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const jobId = data.job_id || data.id || 'unknown';
      navigate(`/training/live?job_id=${jobId}&project_id=${projectId}`);
    } catch (err) {
      setError(err.message || 'Failed to start training. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── derived display ───────────────────────────────────────────────────────
  const currentCard   = MODEL_CARDS.find(c => c.id === selectedModel);
  const effectiveTask = currentCard?.supportsSegmentation ? task : 'detect';
  const previewWeight = resolveWeights(selectedModel, selectedSize, effectiveTask, pretrained);

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="tc-root">

      {/* ── page header ── */}
      <div className="tc-header">
        <button className="tc-back-btn" onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <div className="tc-header-text">
          <h1 className="tc-title">Train Model</h1>
          <p className="tc-subtitle">
            Configure a YOLO training run for project&nbsp;
            <span className="tc-project-badge">#{projectId}</span>
          </p>
        </div>
      </div>

      <form className="tc-body" onSubmit={handleStart}>

        {/* ══ SECTION 1: Model Architecture ════════════════════════════════ */}
        <section className="tc-section">
          <div className="tc-section-label">Model Architecture</div>

          <div className="tc-cards-grid">
            {MODEL_CARDS.map(card => {
              const isSelected = selectedModel === card.id;
              return (
                <div
                  key={card.id}
                  className={`tc-card ${isSelected ? 'tc-card--selected' : ''}`}
                  onClick={() => setSelectedModel(card.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelectedModel(card.id)}
                >
                  {/* card header */}
                  <div className="tc-card-head">
                    <span className="tc-card-name">{card.label}</span>
                    <span className="tc-card-tag" style={{ background: card.tagColor + '22', color: card.tagColor, borderColor: card.tagColor + '44' }}>
                      {card.tag}
                    </span>
                    <div className={`tc-radio ${isSelected ? 'tc-radio--on' : ''}`}/>
                  </div>

                  {/* bullets */}
                  <ul className="tc-card-bullets">
                    {card.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>

                  {/* size selector — only inside the selected card */}
                  {isSelected && (
                    <div className="tc-size-row" onClick={e => e.stopPropagation()}>
                      {card.sizes.map(sz => (
                        <button
                          key={sz}
                          type="button"
                          className={`tc-size-btn ${selectedSize === sz ? 'tc-size-btn--on' : ''}`}
                          onClick={() => setSelectedSize(sz)}
                        >
                          {sz.slice(0, sz === 'XLarge' ? 2 : 1).toUpperCase()}
                          <span className="tc-size-label">{sz}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* weight preview pill */}
          <div className="tc-weight-preview">
            <span className="tc-weight-icon">⚙</span>
            <span>
              Weights:&nbsp;
              <code className="tc-weight-code">
                {previewWeight ?? 'From scratch (random init)'}
              </code>
            </span>
            {effectiveTask === 'segment' && (
              <span className="tc-seg-badge">Segmentation</span>
            )}
          </div>
        </section>

        {/* ══ SECTION 2: Training Parameters ═══════════════════════════════ */}
        <section className="tc-section">
          <div className="tc-section-label">Training Parameters</div>

          <div className="tc-params-grid">

            {/* Dataset Version */}
            <div className="tc-field tc-field--full">
              <label className="tc-label" htmlFor="tc-version">Dataset Version</label>
              {versionsLoading ? (
                <div className="tc-skeleton"/>
              ) : versions.length === 0 ? (
                <div className="tc-no-version">
                  No versions found.&nbsp;
                  <button type="button" className="tc-link-btn" onClick={() => navigate(-1)}>
                    Generate one from the annotation screen
                  </button>
                </div>
              ) : (
                <>
                  <select
                    id="tc-version"
                    className="tc-select"
                    value={selectedVersion}
                    onChange={e => setSelectedVersion(e.target.value)}
                    required
                  >
                    {versions.map(v => (
                      <option key={v.version_id} value={v.version_id}>
                        {v.version_id}&nbsp;—&nbsp;{v.train_count}tr / {v.val_count}val / {v.test_count}test
                        &nbsp;({v.total_images} images)
                      </option>
                    ))}
                  </select>

                  {/* Advisory Box */}
                  {statsLoading ? (
                    <div className="tc-advisory-panel" style={{ opacity: 0.5 }}>Loading dataset stats...</div>
                  ) : advisoryInfo ? (
                    <div className={`tc-advisory-panel ${advisoryInfo.color}`}>
                      <span style={{ fontSize: '18px' }}>{advisoryInfo.color.includes('amber') ? '⚠️' : '✅'}</span>
                      <div>{advisoryInfo.msg}</div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* Epochs */}
            <div className="tc-field">
              <label className="tc-label" htmlFor="tc-epochs">
                Epochs
                <Tooltip text="Number of times the model sees your entire dataset. More epochs = more learning, but too many = overfitting." />
              </label>
              <input
                id="tc-epochs"
                type="number"
                className="tc-input"
                value={epochs}
                min={1} max={500}
                onChange={e => setEpochs(e.target.value)}
                required
              />
            </div>

            {/* Image Size */}
            <div className="tc-field">
              <label className="tc-label" htmlFor="tc-imgsz">
                Image Size
                <Tooltip text="Resolution used during training. Larger = sees more detail, but slower and needs more VRAM." />
              </label>
              <select id="tc-imgsz" className="tc-select" value={imgsz} onChange={e => setImgsz(e.target.value)}>
                <option value={416}>416</option>
                <option value={640}>640 (recommended)</option>
                <option value={1280}>1280</option>
              </select>
            </div>

            {/* Batch Size */}
            <div className="tc-field">
              <label className="tc-label" htmlFor="tc-batch">
                Batch Size
                <Tooltip text="Images processed at once. Auto lets YOLO choose the largest safe value for your GPU." />
              </label>
              <select id="tc-batch" className="tc-select" value={batch} onChange={e => setBatch(e.target.value)}>
                <option value={-1}>Auto (−1)</option>
                <option value={8}>8</option>
                <option value={16}>16</option>
                <option value={32}>32</option>
              </select>
            </div>

            {/* Patience */}
            <div className="tc-field">
              <label className="tc-label" htmlFor="tc-patience">
                Early Stop Patience
                <Tooltip text="Training stops automatically if accuracy doesn't improve for this many epochs. Saves time." />
              </label>
              <input
                id="tc-patience"
                type="number"
                className="tc-input"
                value={patience}
                min={5} max={200}
                onChange={e => setPatience(e.target.value)}
              />
            </div>

            {/* Pretrained */}
            <div className="tc-field">
              <label className="tc-label">
                Pretrained Weights
                <Tooltip text="Start from a model already trained on 80 common objects. Almost always better than starting from zero." />
              </label>
              <div className="tc-radio-group">
                <label className={`tc-radio-option ${pretrained === 'coco' ? 'tc-radio-option--on' : ''}`}>
                  <input
                    type="radio"
                    name="pretrained"
                    value="coco"
                    checked={pretrained === 'coco'}
                    onChange={() => setPretrained('coco')}
                  />
                  <span className="tc-radio-dot"/>
                  <span>COCO pretrained <span className="tc-recommended">(recommended)</span></span>
                </label>
                <label className={`tc-radio-option ${pretrained === 'scratch' ? 'tc-radio-option--on' : ''}`}>
                  <input
                    type="radio"
                    name="pretrained"
                    value="scratch"
                    checked={pretrained === 'scratch'}
                    onChange={() => setPretrained('scratch')}
                  />
                  <span className="tc-radio-dot"/>
                  <span>From scratch <span className="tc-advanced">(advanced)</span></span>
                </label>
              </div>
            </div>

          </div>
        </section>

        {/* ══ Error banner ══════════════════════════════════════════════════ */}
        {error && (
          <div className="tc-error" role="alert">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* ══ Already-running warning ════════════════════════════════════════ */}
        {statusChecked && anotherRunning && (
          <div className="tc-warning" role="alert">
            A training job is already running. Wait for it to complete before starting a new one.
          </div>
        )}

        {/* ══ Start Button ══════════════════════════════════════════════════ */}
        <button
          id="btn-start-training"
          type="submit"
          className="tc-start-btn"
          disabled={submitting || anotherRunning || !statusChecked || versions.length === 0}
        >
          {submitting ? (
            <><span className="tc-spinner"/>&nbsp; Starting…</>
          ) : anotherRunning ? (
            'Training already in progress…'
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Start Training
            </>
          )}
        </button>

      </form>
    </div>
  );
};

export default TrainingConfig;
