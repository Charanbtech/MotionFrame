import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getApiUrl } from './utils/api';
import './style.scss';
import robotLogos from './assets/MotionFrame.svg';
import SplashScreen from './SplashScreen';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState('');
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    // If no token, show error
    if (!token) {
      setError('Invalid or missing reset token. Please request a new password reset.');
    } else {
      // Try to decode token to get email
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const tokenEmail = payload.email || '';
        if (tokenEmail) {
          setEmail(tokenEmail);
        } else {
          setError('Invalid token format. Please request a new password reset.');
        }
      } catch (e) {
        setError('Invalid token format. Please request a new password reset.');
      }
    }
  }, [token]);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all password fields');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    if (!token || !email) {
      setError('Invalid reset token or email. Please request a new password reset.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(getApiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          token: token,
          new_password: newPassword
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to reset password');
      }

      setIsSuccess(true);
      setError('');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may have expired. Please request a new password reset.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
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
                margin: '0 auto',
                textAlign: 'center'
              }}>
                <div style={{ color: '#ff6b6b', marginBottom: '20px' }}>
                  <i className="fas fa-exclamation-triangle" style={{ fontSize: '48px' }}></i>
                </div>
                <h2 style={{ color: '#fff', marginBottom: '20px' }}>Invalid Reset Link</h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '30px' }}>
                  {error || 'This password reset link is invalid or has expired. Please request a new password reset.'}
                </p>
                <Button
                  onClick={() => navigate('/login')}
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
                  }}
                >
                  Back to Login
                </Button>
              </div>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  if (loading) {
    return <SplashScreen text="Resetting..." />;
  }

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
                  alt="MotionFrame Logo"
                  style={{
                    width: '200px',
                    objectFit: 'contain',
                    filter: 'invert(1) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))'
                  }}
                />
              </div>

              {isSuccess ? (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <div style={{
                      width: '80px',
                      height: '80px',
                      backgroundColor: '#28a745',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px auto'
                    }}>
                      <span style={{
                        color: 'white',
                        fontSize: '40px',
                        fontWeight: 'bold'
                      }}>✓</span>
                    </div>
                    <h2 style={{ color: '#fff', marginBottom: '10px' }}>Password Reset Successful!</h2>
                    <p style={{
                      color: 'rgba(255, 255, 255, 0.8)',
                      fontSize: '16px',
                    }}>
                      Your password has been updated successfully. Redirecting to login...
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <h2 style={{ color: '#fff', textAlign: 'center', marginBottom: '20px' }}>Reset Password</h2>
                  <p style={{ color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', marginBottom: '30px', fontSize: '14px' }}>
                    Enter your new password below
                  </p>

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

                  <Form onSubmit={handleResetPassword}>
                    {/* New Password Field */}
                    <Form.Group style={{ marginBottom: '20px' }}>
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
                          type={showNewPassword ? "text" : "password"}
                          placeholder="New Password"
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            setError('');
                          }}
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
                          className={showNewPassword ? "fas fa-eye-slash" : "fas fa-eye"}
                          onClick={() => setShowNewPassword(!showNewPassword)}
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
                          placeholder="Confirm New Password"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setError('');
                          }}
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

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={loading || !newPassword || !confirmPassword}
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
                        marginBottom: '20px',
                        opacity: (loading || !newPassword || !confirmPassword) ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!loading && newPassword && confirmPassword) {
                          e.target.style.transform = 'translateY(-2px)';
                          e.target.style.boxShadow = '0 6px 20px rgba(142, 68, 173, 0.6)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 4px 15px rgba(142, 68, 173, 0.4)';
                      }}
                    >
                      {loading ? 'Resetting Password...' : 'Reset Password'}
                    </Button>
                  </Form>

                  {/* Back to Login Link */}
                  <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/login');
                      }}
                      style={{ 
                        color: 'rgba(255, 255, 255, 0.9)',
                        fontSize: '14px',
                        textDecoration: 'none',
                        transition: 'opacity 0.3s'
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                      Back to Login
                    </a>
                  </div>
                </>
              )}
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

export default ResetPassword;

