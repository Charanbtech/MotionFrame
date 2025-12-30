  import { Navbar, Nav, Container, Button } from 'react-bootstrap'
  import { Link, useNavigate, useLocation } from 'react-router-dom'
  import { useAuth } from './AuthContext'
  import './style.scss'
  import aiRobotLogo from './assets/Robot.png';

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
        // Dashboard should be active for /dashboard, /bulk-upload, and /assigned-document routes
        return location.pathname === '/dashboard' || 
               location.pathname.startsWith('/bulk-upload') || 
               location.pathname === '/assigned-document'
      }
      return location.pathname === path
    }

    return (
      <Navbar bg="light" expand="lg" className="shadow-sm w-100">
        <Container>
          <Navbar.Brand as={Link} to="/" className="d-flex align-items-center">
            <img src={aiRobotLogo} alt="Product Logo" style={{ width: '150px' }} />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
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
              {/* <Nav.Link
                as={Link}
                to="/AIAnnotation"
                active={false}
                className={isActive('/AIAnnotation') ? 'active' : ''}
              >
                AI Annotation
              </Nav.Link> */}
              {/* <Nav.Link
                as={Link}
                to="/AIAnnotationFast"
                active={false}
                className={isActive('/AIAnnotationFast') ? 'active' : ''}
              >
                🚀 Fast Batch
              </Nav.Link> */}
            </Nav>
            <Nav className="ms-auto d-flex align-items-center gap-2">
              {isAuthenticated ? (
                <>
                  <span style={{ color: '#333', marginRight: '10px' }}>
                    Welcome, {user?.name || user?.email}
                  </span>
                  <Button className="sign-btn" onClick={handleLogout}>
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button className="sign-btn" onClick={handleSignIn}>
                    Sign In
                  </Button>
                  <Button className="started-btn" onClick={() => navigate('/register')}>
                    Get Started
                  </Button>
                </>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    )
  }

  export default Topnavbar

