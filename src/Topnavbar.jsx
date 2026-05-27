import { Navbar, Nav, Container, Button } from 'react-bootstrap'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import './style.scss'

function Topnavbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, user, logout } = useAuth()

  const handleSignIn = () => {
    navigate('/login')
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Helper function to check if a nav link should be active
  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' ||
        location.pathname.startsWith('/bulk-upload') ||
        location.pathname === '/assigned-document'
    }
    return location.pathname === path
  }

  return (
    <>
      <style>{`
        .aw-premium-nav {
          background-color: rgba(255, 255, 255, 0.92) !important;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(229, 231, 235, 0.8);
          padding: 0 !important;
          min-height: 0 !important;
          transition: all 0.3s ease;
          z-index: 1040;
        }
        .aw-premium-nav .navbar-brand {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .aw-premium-nav .navbar-brand img {
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .aw-premium-nav .navbar-brand:hover img {
          transform: scale(1.04);
        }
        .aw-nav-links {
          gap: 3rem;
          margin: 0 auto;
        }
        @media (max-width: 991px) {
          .aw-nav-links {
            gap: 1rem;
            margin: 1.5rem 0;
            text-align: center;
          }
          .aw-nav-actions {
            justify-content: center;
          }
        }
        .aw-nav-links .nav-link {
          color: #4B5563 !important;
          font-weight: 500;
          font-size: 16px;
          letter-spacing: -0.01em;
          padding: 8px 4px !important;
          position: relative;
          transition: color 0.2s ease;
        }
        .aw-nav-links .nav-link:hover {
          color: #111827 !important;
        }
        .aw-nav-links .nav-link.active {
          color: #111827 !important;
          font-weight: 600;
        }
        .aw-nav-links .nav-link::after {
          content: '';
          position: absolute;
          width: 0;
          height: 2px;
          bottom: 0;
          left: 50%;
          background-color: #111827;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          transform: translateX(-50%);
          border-radius: 2px;
        }
        .aw-nav-links .nav-link:hover::after,
        .aw-nav-links .nav-link.active::after {
          width: 100%;
        }
        
        .aw-nav-actions {
          gap: 1.5rem;
        }
        .aw-btn-ghost {
          background: transparent !important;
          border: none !important;
          color: #4B5563 !important;
          font-weight: 500;
          padding: 10px 16px !important;
          font-size: 16px;
          transition: color 0.2s ease;
          box-shadow: none !important;
        }
        .aw-btn-ghost:hover {
          color: #111827 !important;
          background: transparent !important;
        }
        .aw-btn-solid {
          background-color: #111827 !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 8px !important;
          padding: 10px 24px !important;
          font-weight: 500;
          font-size: 16px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .aw-btn-solid:hover {
          background-color: #000000 !important;
          transform: translateY(-1px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        .aw-user-greet {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          display: flex;
          align-items: center;
          gap: 10px;
          background: transparent;
          border: none;
          padding: 8px 4px;
        }
        .aw-user-greet i {
          color: #6B7280;
          font-size: 18px;
        }
      `}</style>
      <Navbar expand="lg" className="aw-premium-nav w-100">
        <Container>
          <Navbar.Brand as={Link} to="/" className="d-flex align-items-center" style={{ marginRight: '4rem' }}>
            <img src="/MotionFrame.svg" alt="MotionFrame" style={{ height: '56px', width: 'auto' }} />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" style={{ border: 'none', boxShadow: 'none' }} />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="aw-nav-links">
              <Nav.Link
                as={Link}
                to="/"
                active={false}
                className={isActive('/') ? 'active' : ''}
              >
                Home
              </Nav.Link>
              <Nav.Link
                as={Link}
                to="/resources"
                active={false}
                className={isActive('/resources') ? 'active' : ''}
              >
                Annotation
              </Nav.Link>
              <Nav.Link
                as={Link}
                to="/dashboard"
                active={false}
                className={isActive('/dashboard') ? 'active' : ''}
              >
                Dashboard
              </Nav.Link>
            </Nav>

            <Nav className="ms-auto d-flex align-items-center aw-nav-actions">
              {isAuthenticated ? (
                <>
                  <span className="aw-user-greet d-none d-lg-flex">
                    <i className="fas fa-user-circle"></i>
                    {user?.name || user?.email}
                  </span>
                  <Button className="aw-btn-ghost" onClick={handleLogout}>
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button className="aw-btn-ghost" onClick={handleSignIn}>
                    Sign In
                  </Button>
                  <Button className="aw-btn-solid" onClick={() => navigate('/register')}>
                    Get Started
                  </Button>
                </>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </>
  )
}

export default Topnavbar

