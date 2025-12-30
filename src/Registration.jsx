import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './style.scss';
import robotLogos from './assets/Robot1.png';

const Registration = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register, isAuthenticated } = useAuth();

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    const result = await register(formData.name, formData.email, formData.password);
    
    if (result.success) {
      // Registration successful, redirect to home
      navigate('/');
    } else {
      setError(result.error || 'Registration failed. Please try again.');
    }
    
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 25%, #4a2c5a 50%, #6b3a7a 75%, #8b4fa8 100%)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      {/* Blurred background effect */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.3) 0%, rgba(75, 0, 130, 0.3) 50%, rgba(72, 61, 139, 0.3) 100%)',
        filter: 'blur(40px)',
        zIndex: 0
      }}></div>

      <Container style={{ position: 'relative', zIndex: 1 }}>
        <Row className="justify-content-center">
          <Col md={6} lg={5} xl={4}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(75, 0, 130, 0.15) 50%, rgba(72, 61, 139, 0.2) 100%)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '30px',
              padding: '50px 40px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
              width: '100%',
              maxWidth: '450px',
              margin: '0 auto'
            }}>
              {/* Robot Logo */}
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <img
                  src={robotLogos}
                  alt="RoboSpectra Logo"
                  style={{
                    width: '200px',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))'
                  }}
                />
              </div>

              {error && (
                <div style={{
                  background: 'rgba(220, 53, 69, 0.2)',
                  color: '#ff6b6b',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  textAlign: 'center',
                  border: '1px solid rgba(220, 53, 69, 0.3)'
                }}>
                  {error}
                </div>
              )}

              <Form onSubmit={handleSubmit}>
                {/* Name Field */}
                <Form.Group style={{ marginBottom: '30px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                    paddingBottom: '10px',
                    marginBottom: '5px'
                  }}>
                    <i className="fas fa-user" style={{ 
                      fontSize: '18px', 
                      color: 'rgba(255, 255, 255, 0.9)',
                      marginRight: '15px',
                      width: '24px'
                    }}></i>
                    <Form.Control
                      type="text"
                      name="name"
                      placeholder="Full Name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '16px',
                        padding: '8px 0',
                        outline: 'none',
                        boxShadow: 'none'
                      }}
                      className="login-input"
                    />
                  </div>
                </Form.Group>

                {/* Email ID Field */}
                <Form.Group style={{ marginBottom: '30px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                    paddingBottom: '10px',
                    marginBottom: '5px'
                  }}>
                    <i className="far fa-envelope" style={{ 
                      fontSize: '20px', 
                      color: 'rgba(255, 255, 255, 0.9)',
                      marginRight: '15px',
                      width: '24px'
                    }}></i>
                    <Form.Control
                      type="email"
                      name="email"
                      placeholder="Email ID"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '16px',
                        padding: '8px 0',
                        outline: 'none',
                        boxShadow: 'none'
                      }}
                      className="login-input"
                    />
                  </div>
                </Form.Group>

                {/* Password Field */}
                <Form.Group style={{ marginBottom: '30px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                    paddingBottom: '10px',
                    marginBottom: '5px'
                  }}>
                    <i className="fas fa-lock" style={{ 
                      fontSize: '18px', 
                      color: 'rgba(255, 255, 255, 0.9)',
                      marginRight: '15px',
                      width: '24px'
                    }}></i>
                    <Form.Control
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '16px',
                        padding: '8px 0',
                        outline: 'none',
                        boxShadow: 'none',
                        flex: 1
                      }}
                      className="login-input"
                    />
                    <i 
                      className={showPassword ? "fas fa-eye-slash" : "fas fa-eye"}
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ 
                        fontSize: '18px', 
                        color: 'rgba(255, 255, 255, 0.7)',
                        cursor: 'pointer',
                        padding: '0 5px',
                        transition: 'color 0.3s'
                      }}
                      onMouseEnter={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.9)'}
                      onMouseLeave={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.7)'}
                    ></i>
                  </div>
                </Form.Group>

                {/* Confirm Password Field */}
                <Form.Group style={{ marginBottom: '30px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                    paddingBottom: '10px',
                    marginBottom: '5px'
                  }}>
                    <i className="fas fa-lock" style={{ 
                      fontSize: '18px', 
                      color: 'rgba(255, 255, 255, 0.9)',
                      marginRight: '15px',
                      width: '24px'
                    }}></i>
                    <Form.Control
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      placeholder="Confirm Password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '16px',
                        padding: '8px 0',
                        outline: 'none',
                        boxShadow: 'none',
                        flex: 1
                      }}
                      className="login-input"
                    />
                    <i 
                      className={showConfirmPassword ? "fas fa-eye-slash" : "fas fa-eye"}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{ 
                        fontSize: '18px', 
                        color: 'rgba(255, 255, 255, 0.7)',
                        cursor: 'pointer',
                        padding: '0 5px',
                        transition: 'color 0.3s'
                      }}
                      onMouseEnter={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.9)'}
                      onMouseLeave={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.7)'}
                    ></i>
                  </div>
                </Form.Group>

                {/* Register Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(to right, #8e44ad, #3498db)',
                    border: 'none',
                    borderRadius: '25px',
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: '600',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    boxShadow: '0 4px 15px rgba(142, 68, 173, 0.4)',
                    transition: 'all 0.3s ease',
                    marginBottom: '20px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 20px rgba(142, 68, 173, 0.6)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 15px rgba(142, 68, 173, 0.4)';
                  }}
                >
                  {loading ? 'Registering...' : 'REGISTER'}
                </Button>
              </Form>

              {/* Login Link */}
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', marginRight: '8px' }}>
                  Already have an account?
                </span>
                <Link 
                  to="/login"
                  style={{ 
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: '14px',
                    textDecoration: 'none',
                    fontWeight: '600',
                    transition: 'opacity 0.3s'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  Login
                </Link>
              </div>
            </div>
          </Col>
        </Row>
      </Container>

      <style>{`
        .login-input::placeholder {
          color: rgba(255, 255, 255, 0.6) !important;
        }
        .login-input:focus {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          color: #fff !important;
        }
      `}</style>
    </div>
  );
};

export default Registration;

