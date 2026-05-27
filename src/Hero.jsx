import { API_BASE_URL } from './config';
import { Container, Button, Row, Col } from 'react-bootstrap';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './style.scss';

function ActionWorkspace() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  // Auto-rotating preview state
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [allProjects, setAllProjects] = useState([]);
  const [loadingAllProjects, setLoadingAllProjects] = useState(false);
  const videoRefs = useRef([]);

  const videos = [
    { src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-traffic.webm', poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0c9c8c8333d07fb3b4_hero-homepage-traffic.avif', label: 'Detection' },
    { src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-people-walking.webm', poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0bf19a2951ede9f084_hero-homepage-walking-people.avif', label: 'Tracking' },
    { src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-candy.webm', poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0c234650f16c8404c5_hero-homepage-candy.avif', label: 'Counting' },
    { src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-bike.webm', poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0ba2f0a8e0f5ed68e8_hero-homepage-bike.avif', label: 'Analysis' }
  ];

  useEffect(() => {
    // Play active video
    videoRefs.current.forEach((video, index) => {
      if (video) {
        if (index === activeVideoIndex) {
          const tryPlay = () => {
            if (video.readyState >= 2) {
              video.play().catch(e => console.log('Auto-play prevented', e));
            } else {
              video.addEventListener('loadeddata', () => video.play().catch(e=>console.log(e)), { once: true });
              video.load();
            }
          };
          tryPlay();
        } else {
          video.pause();
        }
      }
    });

    if (isHovering) return;
    const interval = setInterval(() => {
      setActiveVideoIndex((prev) => (prev + 1) % videos.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [activeVideoIndex, isHovering, videos.length]);

  // Scroll animations removed

  useEffect(() => {
    if (isAuthenticated) {
      const fetchProjects = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_BASE_URL}/api/projects', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            // Get last 3 real projects and format
            setRecentProjects(data.slice(0, 3).map(p => ({
              id: p.id,
              name: p.name,
              status: p.project_type || 'Active',
              updated: p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Recently'
            })));
          }
        } catch (error) {
          console.error('Error fetching real-time projects:', error);
        } finally {
          setLoadingProjects(false);
        }
      };
      fetchProjects();
    } else {
      setLoadingProjects(false);
    }
  }, [isAuthenticated]);

  const handleAction = () => {
    if (!isAuthenticated) return navigate('/login');
    // Clear active project so the annotation page shows the welcome/create-project screen
    sessionStorage.removeItem('activeProjectId');
    navigate('/resources');
  };

  const handleViewAllProjects = async () => {
    if (!isAuthenticated) return navigate('/login');
    setShowAllProjects(true);
    setLoadingAllProjects(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/projects', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAllProjects(data.map(p => ({
          id: p.id,
          name: p.name,
          status: p.project_type || 'Active',
          updated: p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Recently'
        })));
      }
    } catch (error) {
      console.error('Error fetching all projects:', error);
    } finally {
      setLoadingAllProjects(false);
    }
  };

  const quickActions = [
    {
      title: 'Start Annotation',
      desc: 'Jump into an active labeling queue',
      icon: 'fas fa-pen-nib',
      path: '/resources'
    },
    {
      title: 'Upload Data',
      desc: 'Import images, videos, or PDFs',
      icon: 'fas fa-cloud-upload-alt',
      path: '/resources'
    },
    {
      title: 'Run Analysis',
      desc: 'Test custom models on new data',
      icon: 'fas fa-microchip',
      path: '/AIAnnotationFast'
    },
    {
      title: 'Manage Projects',
      desc: 'View datasets and team progress',
      icon: 'fas fa-folder-open',
      path: '/resources',
      onClick: handleViewAllProjects
    }
  ];

  const handleCardClick = (path) => {
    if (!isAuthenticated) return navigate('/login');
    navigate(path);
  };

  return (
    <div className="aw-page-wrapper">
      
      {/* 2. ACTION HUB (HERO) */}
      <section className="aw-hero-section">
        <div className="aw-hero-bg-glow"></div>
        <Container>
          <Row className="align-items-center">
            
            {/* Left Content */}
            <Col lg={5} className="aw-hero-text">
              <div className="aw-label-pill">AI Vision Workspace</div>
              <h1 className="aw-headline">
                Build and manage intelligent vision systems
              </h1>
              <p className="aw-subtext">
                End-to-end tooling to quickly curate datasets, annotate with high precision, and deploy state-of-the-art computer vision models.
              </p>
              <div className="aw-cta-group">
                <Button className="aw-btn-primary" onClick={handleAction}>
                  Create Project
                </Button>
                <Button className="aw-btn-secondary" onClick={() => navigate('/resources')}>
                  Explore Capabilities
                </Button>
              </div>
            </Col>

            {/* Right Preview Card */}
            <Col lg={7} className="aw-hero-visual">
              <div className="aw-glow-orb"></div>
              <div className="aw-preview-card" style={{ padding: 0, overflow: 'hidden', background: 'transparent', boxShadow: '0 24px 50px rgba(0,0,0,0.15)' }}>
                <iframe 
                  src="/hero_preview.html" 
                  title="MotionFrame Pipeline Preview"
                  style={{ width: '100%', height: '625px', border: 'none', display: 'block' }}
                />
              </div>
            </Col>

          </Row>
        </Container>
      </section>

      {/* 3. QUICK START PANEL */}
      <section className="aw-quick-start">
        <Container>
          <Row className="g-4">
            {quickActions.map((action, idx) => (
              <Col md={6} lg={3} key={idx}>
                <div className="aw-action-card" onClick={() => action.onClick ? action.onClick() : handleCardClick(action.path)}>
                  <div className="aw-action-icon">
                    <i className={action.icon}></i>
                  </div>
                  <div className="aw-action-text">
                    <h5>{action.title}</h5>
                    <p>{action.desc}</p>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      {/* 4. WORKFLOW PREVIEW SECTION */}
      <section className="aw-workflow-section">
        <Container>
          <div className="text-center mb-5">
            <h3 className="aw-section-title">Streamlined AI Workflow</h3>
            <p className="aw-subtext mx-auto mt-2" style={{ maxWidth: '600px', fontSize: '15px' }}>
              From raw data to deployed model in four simple steps.
            </p>
          </div>
          <div className="aw-workflow-container">
            
            {/* Step 1 */}
            <div className="aw-step">
              <div className="aw-step-icon">
                <i className="fas fa-file-upload"></i>
              </div>
              <span className="aw-step-label">1. Upload Data</span>
            </div>
            
            <div className="aw-step-connector"></div>

            {/* Step 2 */}
            <div className="aw-step">
              <div className="aw-step-icon">
                <i className="fas fa-pen-fancy"></i>
              </div>
              <span className="aw-step-label">2. Annotate</span>
            </div>

            <div className="aw-step-connector"></div>

            {/* Step 3 */}
            <div className="aw-step">
              <div className="aw-step-icon">
                <i className="fas fa-brain"></i>
              </div>
              <span className="aw-step-label">3. Train / Process</span>
            </div>

            <div className="aw-step-connector"></div>

            {/* Step 4 */}
            <div className="aw-step">
              <div className="aw-step-icon">
                <i className="fas fa-download"></i>
              </div>
              <span className="aw-step-label">4. Export Results</span>
            </div>

          </div>
        </Container>
      </section>

      {/* 5. ACTIVE WORK AREA (YOUR WORKSPACE) */}
      <section className="aw-workspace-section" style={{ minHeight: '350px', display: 'flex', alignItems: 'center' }}>
        <Container>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h3 className="aw-section-title mb-0">Your Workspace</h3>
            {isAuthenticated && recentProjects.length > 0 && (
              <Button variant="link" className="aw-btn-ghost-sm" onClick={handleViewAllProjects}>View All Projects →</Button>
            )}
          </div>
          
          {!isAuthenticated ? (
            // State: Not logged in (Curious and Excited)
            <div className="text-center py-5 px-4" style={{ background: 'linear-gradient(145deg, #ffffff 0%, #f4f6fc 100%)', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '48px', margin: '0 0 16px' }}>
                <span role="img" aria-label="sparkles">✨</span>
              </div>
              <h4 style={{ fontWeight: '700', color: '#1e293b', marginBottom: '12px', fontSize: '24px' }}>Ready to build something amazing?</h4>
              <p style={{ color: '#64748b', maxWidth: '600px', margin: '0 auto 30px', fontSize: '16px', lineHeight: '1.6' }}>
                Join thousands of teams using MotionFrame to train precise computer vision models. Start building your dataset today and experience the future of AI annotations.
              </p>
              <Button className="aw-btn-primary" onClick={() => navigate('/registration')} style={{ padding: '12px 32px', fontSize: '16px' }}>
                Create Your First Project
              </Button>
            </div>
          ) : loadingProjects ? (
            // State: Loading DB
            <div className="text-center py-5"><div className="spinner-border text-primary" role="status"></div></div>
          ) : recentProjects.length > 0 ? (
            // State: Logged in, has projects (Real Time Projects)
            <Row className="g-3">
              {recentProjects.map((project, idx) => (
                <Col lg={4} key={idx}>
                  <div className="aw-project-card" onClick={() => { sessionStorage.setItem('activeProjectId', project.id); navigate('/resources'); }}>
                    <div className="aw-project-header">
                      <h5 className="aw-project-name">{project.name}</h5>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '600',
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase'
                        }}>Resume →</span>
                      </div>
                    </div>
                    <div className="aw-project-footer">
                      <span className={`aw-status-badge ${project.status === 'Completed' ? 'status-complete' : 'status-active'}`}>
                        {project.status}
                      </span>
                      <span className="aw-project-time">Updated {project.updated}</span>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          ) : (
            // State: Logged in, 0 projects (Why still waiting?)
            <div className="text-center py-5 px-4" style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '2px dashed #cbd5e1' }}>
              <div style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '16px' }}>
                <i className="fas fa-rocket"></i>
              </div>
              <h4 style={{ fontWeight: '700', color: '#334155', marginBottom: '12px', fontSize: '24px' }}>Why are you still waiting?</h4>
              <p style={{ color: '#64748b', maxWidth: '500px', margin: '0 auto 28px', fontSize: '16px', lineHeight: '1.6' }}>
                Your workspace is empty! Let's hit the ground running. Create your first project, upload some documents, and start annotating right away!
              </p>
              <Button className="aw-btn-primary" onClick={() => navigate('/resources')} style={{ padding: '12px 32px', fontSize: '16px' }}>
                Let's Create Now <i className="fas fa-arrow-right ms-2"></i>
              </Button>
            </div>
          )}
        </Container>
      </section>

      <section className="aw-features-section" style={{ padding: '100px 0', background: '#FFFFFF' }}>
        <Container>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <h2 style={{ fontSize: '36px', fontWeight: '800', color: '#111827', marginBottom: '16px', letterSpacing: '-0.02em' }}>
              Everything you need to build vision models
            </h2>
            <p style={{ fontSize: '18px', color: '#6B7280', maxWidth: '700px', margin: '0 auto', lineHeight: '1.6' }}>
              A complete annotation platform with user management, bulk uploads, automated workflows, and powerful segmentation tools.
            </p>
          </div>
          
          <Row className="g-4 justify-content-center">
            <Col lg={3} md={6}>
              <div className="aw-feature-card h-100">
                <div className="aw-feature-icon" style={{ color: '#C084FC' }}>
                  <i className="fas fa-stop"></i>
                </div>
                <h5>Bounding Box</h5>
                <p>Draw rectangular bounding boxes for object detection. Click and drag to create precise annotations with class labels.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="aw-feature-card h-100">
                <div className="aw-feature-icon" style={{ color: '#3B82F6' }}>
                  <i className="fas fa-draw-polygon"></i>
                </div>
                <h5>Polygon</h5>
                <p>Create custom polygon annotations by clicking points. Double-click to complete the shape for precise boundary marking.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="aw-feature-card h-100">
                <div className="aw-feature-icon" style={{ color: '#EC4899' }}>
                  <i className="fas fa-paint-brush"></i>
                </div>
                <h5>Brush Tool</h5>
                <p>Paint segmentation masks with adjustable brush size. Ideal for pixel-level annotations and detailed object segmentation.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="aw-feature-card h-100">
                <div className="aw-feature-icon" style={{ color: '#B45309' }}>
                  <i className="fas fa-box"></i>
                </div>
                <h5>Export & Deploy</h5>
                <p>Export annotations in COCO format. Download completed annotations as ZIP files for model training and deployment.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="aw-feature-card h-100">
                <div className="aw-feature-icon" style={{ color: '#FCD34D' }}>
                  <i className="fas fa-folder"></i>
                </div>
                <h5>Project Management</h5>
                <p>Create and manage annotation projects. Organize images, define classes, and track annotation progress across projects.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="aw-feature-card h-100">
                <div className="aw-feature-icon" style={{ color: '#4C1D95' }}>
                  <i className="fas fa-users"></i>
                </div>
                <h5>User & Document Management</h5>
                <p>Manage users, assign documents, track completion status. Bulk upload documents and monitor annotation progress per user.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="aw-feature-card h-100">
                <div className="aw-feature-icon" style={{ color: '#6B7280' }}>
                  <i className="fas fa-camera"></i>
                </div>
                <h5>Multi-Format Support</h5>
                <p>Upload images (PNG, JPG, JPEG) and PDF files. PDFs are automatically converted to images for annotation. Bulk upload multiple files at once.</p>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      {/* 7. ENHANCED FOOTER */}
      <footer className="aw-dark-footer">
        <Container>
          <Row className="g-5 mb-5">
            <Col lg={4} md={12} className="pe-lg-5">
              <div className="d-flex align-items-center mb-4">
                 <img src="/MotionFrame.svg" alt="MotionFrame" style={{ height: '36px', filter: 'brightness(0) invert(1)' }} />
              </div>
              <p style={{ color: '#A1A1AA', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
                End-to-end tooling to quickly curate datasets, annotate with high precision, and deploy state-of-the-art computer vision models.
              </p>
              <div className="aw-social-links">
                <a href="#"><i className="fab fa-twitter"></i></a>
                <a href="#"><i className="fab fa-github"></i></a>
                <a href="#"><i className="fab fa-linkedin"></i></a>
                <a href="#"><i className="fab fa-discord"></i></a>
              </div>
            </Col>
            <Col lg={2} md={4} className="aw-footer-col offset-lg-1">
              <h6>Product</h6>
              <ul>
                <li><a href="#">Annotation</a></li>
                <li><a href="#">Workflows</a></li>
                <li><a href="#">Datasets</a></li>
                <li><a href="#">Export Formats</a></li>
              </ul>
            </Col>
            <Col lg={2} md={4} className="aw-footer-col">
              <h6>Resources</h6>
              <ul>
                <li><a href="#">Documentation</a></li>
                <li><a href="#">API Reference</a></li>
                <li><a href="#">Community</a></li>
                <li><a href="#">Blog</a></li>
              </ul>
            </Col>
            <Col lg={2} md={4} className="aw-footer-col">
              <h6>Company</h6>
              <ul>
                <li><a href="#">About Us</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Privacy</a></li>
                <li><a href="#">Terms</a></li>
              </ul>
            </Col>
          </Row>
          
          <div className="aw-footer-bottom">
            <div className="aw-footer-links">
              <a href="#">Terms of Service</a>
              <a href="#">Enterprise Terms</a>
              <a href="#">Privacy Policy</a>
              <a href="#">Sitemap</a>
            </div>
            <div className="aw-footer-copyright">
              © 2025 MotionFrame, Inc. All rights reserved.
            </div>
          </div>
        </Container>
      </footer>

      {showAllProjects && (
        <div className="aw-modal-overlay d-flex align-items-center justify-content-center" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 1050, backdropFilter: 'blur(4px)' }}>
          <div className="aw-modal-content" style={{ background: '#fff', width: '90%', maxWidth: '800px', borderRadius: '16px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div className="aw-modal-header border-bottom p-4 d-flex justify-content-between align-items-center">
              <h4 className="m-0" style={{ fontWeight: 700, color: '#0f172a' }}>All Projects</h4>
              <button className="btn-close" onClick={() => setShowAllProjects(false)}></button>
            </div>
            <div className="aw-modal-body p-4" style={{ overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
              {loadingAllProjects ? (
                <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
              ) : allProjects.length > 0 ? (
                <div className="d-flex flex-column gap-3">
                  {allProjects.map((project, idx) => (
                    <div key={idx} className="aw-project-row p-3 bg-white" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }} onClick={() => { sessionStorage.setItem('activeProjectId', project.id); navigate('/resources'); }}>
                      <div>
                        <h5 className="m-0 mb-1" style={{ color: '#1e293b', fontWeight: 600 }}>{project.name}</h5>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>Updated {project.updated}</div>
                      </div>
                      <div className="d-flex align-items-center gap-3">
                        <span className={`aw-status-badge ${project.status === 'Completed' ? 'status-complete' : 'status-active'}`}>{project.status}</span>
                        <i className="fas fa-chevron-right text-muted"></i>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-5 text-muted">No projects found. Create one to get started!</div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ================================
           AI Action Hub / Product System
           ================================ */

        /* GLOBAL RESET & BASE */
        .aw-page-wrapper {
          background-color: #FAFAFB;
          font-family: 'Inter', -apple-system, sans-serif;
          min-height: 100vh;
        }

        /* 2. ACTION HUB (HERO) */
        .aw-hero-section {
          position: relative;
          padding: 80px 0 60px;
          background: linear-gradient(180deg, #F3F4F6 0%, #FAFAFB 100%);
          border-bottom: 1px solid rgba(0,0,0,0.03);
          overflow: hidden;
        }

        .aw-hero-bg-glow {
          position: absolute;
          top: -30%; left: -10%;
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(124, 58, 237, 0.05) 0%, rgba(255,255,255,0) 70%);
          z-index: 0;
          pointer-events: none;
        }

        .aw-hero-text {
          z-index: 2;
          padding-right: 40px;
        }

        .aw-label-pill {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          color: #4B5563;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          padding: 6px 14px;
          border-radius: 99px;
          margin-bottom: 24px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.02);
        }

        .aw-headline {
          font-size: 48px;
          font-weight: 800;
          line-height: 1.15;
          color: #111827;
          margin-bottom: 20px;
          letter-spacing: -1px;
        }

        .aw-subtext {
          font-size: 18px;
          color: #6B7280;
          line-height: 1.5;
          margin-bottom: 40px;
          max-width: 480px;
        }

        .aw-cta-group {
          display: flex;
          gap: 16px;
        }

        .aw-btn-primary {
          background: linear-gradient(135deg, #7C3AED 0%, #4338CA 100%);
          color: #FFFFFF;
          border: none;
          padding: 12px 28px;
          font-size: 15px;
          font-weight: 600;
          border-radius: 8px;
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.25);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .aw-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(124, 58, 237, 0.35);
          color: #FFFFFF;
        }

        .aw-btn-secondary {
          background: transparent;
          color: #374151;
          border: 1px solid #D1D5DB;
          padding: 12px 28px;
          font-size: 15px;
          font-weight: 600;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .aw-btn-secondary:hover {
          background: #F3F4F6;
          border-color: #9CA3AF;
          color: #111827;
        }

        /* Right Preview Card */
        .aw-hero-visual {
          position: relative;
          z-index: 2;
        }

        .aw-glow-orb {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 80%; height: 80%;
          background: rgba(124, 58, 237, 0.15);
          filter: blur(80px);
          z-index: 0;
        }

        .aw-preview-card {
          position: relative;
          background: #FFFFFF;
          border-radius: 16px;
          box-shadow: 0 24px 50px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
          overflow: hidden;
          z-index: 1;
        }

        .aw-preview-header {
          display: flex;
          align-items: center;
          padding: 12px 20px;
          background: #F9FAFB;
          border-bottom: 1px solid #E5E7EB;
        }

        .aw-preview-dots {
          display: flex;
          gap: 6px;
          margin-right: auto;
        }
        .aw-preview-dots span {
          width: 10px; height: 10px; border-radius: 50%; background: #D1D5DB;
        }
        .aw-preview-dots span:nth-child(1) { background: #E5E7EB; }
        .aw-preview-dots span:nth-child(2) { background: #E5E7EB; }
        .aw-preview-dots span:nth-child(3) { background: #E5E7EB; }

        .aw-preview-tabs {
          display: flex;
          gap: 16px;
        }
        .aw-preview-tabs span {
          font-size: 13px;
          font-weight: 600;
          color: #9CA3AF;
          cursor: pointer;
          transition: color 0.2s;
        }
        .aw-preview-tabs span:hover {
          color: #6B7280;
        }
        .aw-preview-tabs span.active {
          color: #111827;
        }

        .aw-preview-body {
          position: relative;
          background: #000;
          aspect-ratio: 16/9;
          overflow: hidden;
        }

        .aw-mock-image-wrapper {
          position: relative;
          width: 100%; height: 100%;
        }

        .aw-soft-gradient-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 25%);
          z-index: 10;
          pointer-events: none;
        }

        .aw-video-layer {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0;
          transform: scale(1);
          transition: opacity 0.5s ease-in-out, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1;
        }

        .aw-video-layer.active {
          opacity: 1;
          transform: scale(1.02);
          z-index: 5;
        }

        /* 3. QUICK START PANEL */
        .aw-quick-start {
          position: relative;
          margin-top: -30px; /* Overlap the hero section slightly */
          z-index: 5;
          padding-bottom: 60px;
        }

        .aw-action-card {
          display: flex;
          align-items: center;
          background: #FFFFFF;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          border: 1px solid #F3F4F6;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .aw-action-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0,0,0,0.06), 0 0 0 1px rgba(124, 58, 237, 0.1);
        }

        .aw-action-card:hover .aw-action-icon {
          color: #7C3AED;
          background: rgba(124, 58, 237, 0.08);
        }

        .aw-action-icon {
          width: 48px;
          height: 48px;
          background: #F8FAFC;
          color: #6B7280;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          margin-right: 16px;
          transition: all 0.2s ease;
        }

        .aw-action-text h5 {
          font-size: 15px;
          font-weight: 600;
          color: #111827;
          margin: 0 0 4px 0;
        }

        .aw-action-text p {
          font-size: 13px;
          color: #6B7280;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* 4. WORKFLOW PREVIEW SECTION */
        .aw-workflow-section {
          padding: 80px 0;
          background: #FFFFFF;
          border-top: 1px solid #E5E7EB;
        }

        .aw-workflow-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: transparent;
          max-width: 800px;
          margin: 0 auto;
        }

        .aw-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          z-index: 2;
        }

        .aw-step-icon {
          width: 44px;
          height: 44px;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          color: #4B5563;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          margin-bottom: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }

        .aw-step-label {
          font-size: 14px;
          font-weight: 500;
          color: #4B5563;
        }

        .aw-step-connector {
          flex: 1;
          height: 2px;
          background: #E5E7EB;
          margin: 0 16px;
          transform: translateY(-16px);
          position: relative;
          z-index: 1;
        }

        /* 5. ACTIVE WORK AREA (YOUR WORKSPACE) */
        .aw-workspace-section {
          padding: 80px 0;
          background: #FFFFFF;
          border-top: 1px solid #E5E7EB;
          border-bottom: 1px solid #E5E7EB;
        }

        .aw-section-title {
          font-size: 20px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .aw-btn-ghost-sm {
          color: #6B7280;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          padding: 0;
          transition: color 0.2s;
        }

        .aw-btn-ghost-sm:hover {
          color: #7C3AED;
        }

        .aw-project-card {
          background: #FFFFFF;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 2px 6px rgba(0,0,0,0.02);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .aw-project-card:hover {
          background: #F9FAFB;
          border-color: #D1D5DB;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.04);
        }

        .aw-project-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .aw-project-name {
          font-size: 15px;
          font-weight: 600;
          color: #111827;
          margin: 0;
          padding-right: 12px;
        }

        .aw-project-menu {
          color: #9CA3AF;
          background: transparent;
          border: none;
          padding: 4px;
          cursor: pointer;
        }
        
        .aw-project-menu:hover {
          color: #4B5563;
        }

        .aw-project-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .aw-status-badge {
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
        }

        .status-active {
          background: #ECFDF5;
          color: #10B981;
        }

        .status-complete {
          background: #EEF2FF;
          color: #6366F1;
        }

        .aw-project-time {
          font-size: 12px;
          color: #6B7280;
        }

        @media (max-width: 991px) {
          .aw-hero-text { margin-bottom: 40px; text-align: center; }
          .aw-cta-group { justify-content: center; }
          .aw-workflow-container { flex-direction: column; align-items: flex-start; gap: 24px; padding-left: 20px; }
          .aw-step { flex-direction: row; gap: 16px; }
          .aw-step-icon { margin-bottom: 0; }
          .aw-step-connector { display: none; }
        }

        /* 6. FEATURES ROW SECTION */
        .aw-feature-card {
          background: #FAFAFB;
          border-radius: 16px;
          padding: 32px 28px;
          height: 100%;
          text-align: left;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(229, 231, 235, 0.6);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aw-feature-card:hover {
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
          transform: translateY(-4px);
          border-color: rgba(209, 213, 219, 1);
          background: #FFFFFF;
        }
        .aw-feature-icon {
          font-size: 24px;
          margin-bottom: 24px;
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.8);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .aw-feature-card h5 {
          font-size: 17px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 12px;
        }
        .aw-feature-card p {
          font-size: 14px;
          color: #6B7280;
          line-height: 1.6;
          margin: 0;
        }

        /* 7. DARK FOOTER */
        .aw-dark-footer {
          background-color: #0A0A0B;
          padding: 80px 0 32px;
          color: #FFFFFF;
        }
        .aw-social-links {
          display: flex;
          gap: 16px;
        }
        .aw-social-links a {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          color: #A1A1AA;
          transition: all 0.2s;
          text-decoration: none;
        }
        .aw-social-links a:hover {
          background: rgba(255,255,255,0.1);
          color: #FFFFFF;
        }
        .aw-footer-col h6 {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 24px;
          color: #FFFFFF;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .aw-footer-col ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .aw-footer-col ul li {
          margin-bottom: 16px;
        }
        .aw-footer-col ul li a {
          color: #A1A1AA;
          text-decoration: none;
          font-size: 14px;
          transition: color 0.15s;
        }
        .aw-footer-col ul li a:hover {
          color: #FFFFFF;
        }
        .aw-footer-bottom {
          border-top: 1px solid #27272A;
          padding-top: 32px;
          margin-top: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .aw-footer-links a {
          color: #A1A1AA;
          text-decoration: none;
          font-size: 13px;
          margin-right: 24px;
          transition: color 0.15s;
        }
        .aw-footer-links a:hover {
          color: #FFFFFF;
        }
        .aw-footer-copyright {
          color: #71717A;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

export default ActionWorkspace;
