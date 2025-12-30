import { Container, Button } from 'react-bootstrap';
import { useState, useEffect, useRef } from 'react';
import './style.scss';

function Hero() {
  const [activeVideo, setActiveVideo] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRefs = useRef([]);
  const progressIntervalRef = useRef(null);

  const videos = [
    {
      src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-traffic.webm',
      poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0c9c8c8333d07fb3b4_hero-homepage-traffic.avif',
      label: 'Detection'
    },
    {
      src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-people-walking.webm',
      poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0bf19a2951ede9f084_hero-homepage-walking-people.avif',
      label: 'Tracking'
    },
    {
      src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-candy.webm',
      poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0c234650f16c8404c5_hero-homepage-candy.avif',
      label: 'Counting'
    },
    {
      src: 'https://storage.googleapis.com/com-roboflow-marketing/webflow/video/hero-homepage-bike.webm',
      poster: 'https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/6866cc0ba2f0a8e0f5ed68e8_hero-homepage-bike.avif',
      label: 'Analysis'
    }
  ];

  useEffect(() => {
    // Reset progress when video changes
    setProgress(0);
    
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // Function to play video when ready
    const playVideoWhenReady = (videoElement) => {
      if (!videoElement) return;
      
      const tryPlay = () => {
        if (videoElement.readyState >= 2) { // HAVE_CURRENT_DATA or higher
          videoElement.play().catch((error) => {
            console.error('Error playing video:', error);
          });
        } else {
          // Wait for video to load
          videoElement.addEventListener('loadeddata', () => {
            videoElement.play().catch((error) => {
              console.error('Error playing video:', error);
            });
          }, { once: true });
          videoElement.load(); // Force load if not already loading
        }
      };

      tryPlay();
    };

    // Pause other videos first
    videoRefs.current.forEach((video, index) => {
      if (video && index !== activeVideo) {
        video.pause();
        video.currentTime = 0;
      }
    });

    // Play the active video
    const activeVideoElement = videoRefs.current[activeVideo];
    if (activeVideoElement) {
      playVideoWhenReady(activeVideoElement);
    }

    // Start progress animation (7 seconds)
    const duration = 7000;
    const interval = 100;
    const increment = (100 / duration) * interval;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          // Move to next video
          setActiveVideo((prevVideo) => (prevVideo + 1) % videos.length);
          return 0;
        }
        return prev + increment;
      });
    }, interval);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [activeVideo, videos.length]);

  const handleButtonClick = (index) => {
    setActiveVideo(index);
    setProgress(0);
  };

  return (
    <>
    <Container className="hero-container">
      <h2 className="mb-4 mt-4 text-center">Welcome to RoboSpectra</h2>
      <div className="mb-4 text-center text-white hero-description">
        Professional Image Annotation Platform
      </div>
      
      <div id="videoCarousel" className="v2-video-carousel v2-hero-video-carousel">
        <div className="v2-carousel-video-wrap v2-hero-video" style={{ height: '450px' }}>
          {videos.map((video, index) => (
            <div 
              key={index}
              className="v2-carousel-video v2-hero-video w-embed"
              style={{
                zIndex: index === activeVideo ? 1 : 0,
                opacity: index === activeVideo ? 1 : 0,
                transition: 'opacity 0.5s ease-in'
              }}
            >
              <video
                ref={(el) => {
                  videoRefs.current[index] = el;
                  // Ensure video loads when ref is set
                  if (el && index === activeVideo) {
                    el.load();
                  }
                }}
                muted
                playsInline
                preload="auto"
                poster={video.poster}
                loop
              >
                <source src={video.src} type="video/webm" />
              </video>
            </div>
          ))}
        </div>
        <div className="v2-btn-carousel-video-wrap-copy v2-hero-carousel-button">
          {videos.map((video, index) => (
            <button
              key={index}
              className={`v2-btn-carousel-video ${index === activeVideo ? 'active' : ''}`}
              onClick={() => handleButtonClick(index)}
            >
              <div>{video.label}</div>
              <div className="v2-btn-carousel-video-progress-wrap">
                <div
                  className="v2-btn-carousel-video-progress"
                  style={{
                    transition: index === activeVideo ? 'width 7s linear' : 'none',
                    width: index === activeVideo ? `${progress}%` : '0%'
                  }}
                ></div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <div className="py-5" style={{ 
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.05) 0%, rgba(75, 0, 130, 0.05) 100%)',
        borderRadius: '20px',
        padding: '60px 40px'
      }}>
        <h1 className="text-center mb-3" style={{ 
          fontSize: '36px', 
          fontWeight: '700',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '40px'
        }}>RoboSpectra Platform</h1>
        <p className="text-center mb-4" style={{ 
          color: '#000', 
          fontSize: '18px',
          maxWidth: '800px',
          margin: '0 auto 50px'
        }}>
          Complete document annotation platform with user management, bulk upload, assignment workflow, and powerful annotation tools
        </p>
        <div className="row g-4">
          <div className="col-md-6 col-lg-3">
            <div className="text-center p-4" style={{
              background: '#fff',
              boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '100%',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>⬜</div>
              <h4 style={{ color: '#000', marginBottom: '15px', fontSize: '20px', fontWeight: '600' }}>Bounding Box</h4>
              <p style={{ color: '#000', fontSize: '14px', lineHeight: '1.6' }}>
                Draw rectangular bounding boxes for object detection. Click and drag to create precise annotations with class labels.
              </p>
            </div>
          </div>
          
          <div className="col-md-6 col-lg-3">
            <div className="text-center p-4" style={{
              background: '#fff',
              boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '100%',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔷</div>
              <h4 style={{ color: '#000', marginBottom: '15px', fontSize: '20px', fontWeight: '600' }}>Polygon</h4>
              <p style={{ color: '#000', fontSize: '14px', lineHeight: '1.6' }}>
                Create custom polygon annotations by clicking points. Double-click to complete the shape for precise boundary marking.
              </p>
            </div>
          </div>
          
          <div className="col-md-6 col-lg-3">
            <div className="text-center p-4" style={{
              background: '#fff',
              boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '100%',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🖌️</div>
              <h4 style={{ color: '#000', marginBottom: '15px', fontSize: '20px', fontWeight: '600' }}>Brush Tool</h4>
              <p style={{ color: '#000', fontSize: '14px', lineHeight: '1.6' }}>
                Paint segmentation masks with adjustable brush size. Ideal for pixel-level annotations and detailed object segmentation.
              </p>
            </div>
          </div>
          
          <div className="col-md-6 col-lg-3">
            <div className="text-center p-4" style={{
              background: '#fff',
              boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '100%',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📦</div>
              <h4 style={{ color: '#000', marginBottom: '15px', fontSize: '20px', fontWeight: '600' }}>Export & Deploy</h4>
              <p style={{ color: '#000', fontSize: '14px', lineHeight: '1.6' }}>
                Export annotations in COCO format. Download completed annotations as ZIP files for model training and deployment.
              </p>
            </div>
          </div>
        </div>

        <div className="row g-4 mt-3">
          <div className="col-md-4">
            <div className="text-center p-4" style={{
              background: '#fff',
              boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '100%',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ fontSize: '40px', marginBottom: '15px' }}>📁</div>
              <h5 style={{ color: '#000', marginBottom: '10px', fontSize: '18px', fontWeight: '600' }}>Project Management</h5>
              <p style={{ color: '#000', fontSize: '14px', lineHeight: '1.6' }}>
                Create and manage annotation projects. Organize images, define classes, and track annotation progress across projects.
              </p>
            </div>
          </div>
          
          <div className="col-md-4">
            <div className="text-center p-4" style={{
              background: '#fff',
              boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '100%',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ fontSize: '40px', marginBottom: '15px' }}>👥</div>
              <h5 style={{ color: '#000', marginBottom: '10px', fontSize: '18px', fontWeight: '600' }}>User & Document Management</h5>
              <p style={{ color: '#000', fontSize: '14px', lineHeight: '1.6' }}>
                Manage users, assign documents, track completion status. Bulk upload documents and monitor annotation progress per user.
              </p>
            </div>
          </div>
          
          <div className="col-md-4">
            <div className="text-center p-4" style={{
              background: '#fff',
              boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '100%',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ fontSize: '40px', marginBottom: '15px' }}>📸</div>
              <h5 style={{ color: '#000', marginBottom: '10px', fontSize: '18px', fontWeight: '600' }}>Multi-Format Support</h5>
              <p style={{ color: '#000', fontSize: '14px', lineHeight: '1.6' }}>
                Upload images (PNG, JPG, JPEG) and PDF files. PDFs are automatically converted to images for annotation. Bulk upload multiple files at once.
              </p>
            </div>
          </div>
        </div>
      </div>
  
    </Container>
      {/* Footer Section */}
      {/* <Container> */}
        <footer className="mt-5" style={{
          background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
          padding: '60px 40px 30px',
          marginTop: '80px'
        }}>
        <div className="row g-4 mb-4">
          {/* Product Section */}
          <div className="col-md-3 col-sm-6">
            <h5 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Product</h5>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Annotation Tools
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Project Management
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Export & Deploy
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  API Access
                </a>
              </li>
            </ul>
          </div>

          {/* Industries Section */}
          <div className="col-md-3 col-sm-6">
            <h5 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Industries</h5>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Healthcare
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Retail & E-commerce
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Manufacturing
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Automotive
                </a>
              </li>
            </ul>
          </div>

          {/* Models Section */}
          <div className="col-md-3 col-sm-6">
            <h5 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Models</h5>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  YOLOv8
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  YOLOv5
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  COCO Format
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Custom Models
                </a>
              </li>
            </ul>
          </div>

          {/* Company Section */}
          <div className="col-md-3 col-sm-6">
            <h5 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Company</h5>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  About Us
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Careers
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Blog
                </a>
              </li>
              <li style={{ marginBottom: '12px' }}>
                <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = '#fff'}
                   onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Links and Copyright */}
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          paddingTop: '30px',
          marginTop: '40px'
        }}>
          <div className="d-flex flex-wrap justify-content-between align-items-center" style={{ gap: '20px' }}>
            <div className="d-flex flex-wrap" style={{ gap: '20px' }}>
              <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                 onMouseEnter={(e) => e.target.style.color = '#fff'}
                 onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                Terms of Service
              </a>
              <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                 onMouseEnter={(e) => e.target.style.color = '#fff'}
                 onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                Enterprise Terms
              </a>
              <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                 onMouseEnter={(e) => e.target.style.color = '#fff'}
                 onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                Privacy Policy
              </a>
              <a href="#" style={{ color: '#b8b8b8', textDecoration: 'none', fontSize: '14px', transition: 'color 0.3s' }}
                 onMouseEnter={(e) => e.target.style.color = '#fff'}
                 onMouseLeave={(e) => e.target.style.color = '#b8b8b8'}>
                Sitemap
              </a>
            </div>
            <div style={{ color: '#b8b8b8', fontSize: '14px' }}>
              © 2025 Robospectro, Inc. All rights reserved.
            </div>
          </div>
        </div>
        </footer>
      {/* </Container> */}
    </>
  )
}

export default Hero;

