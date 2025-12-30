import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Form, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getApiUrl } from './utils/api';
import './style.scss';
import robotLogos from './assets/Robot1.png';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const otpInputRef = useRef(null);

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'Invalid email or password');
    }
    
    setLoading(false);
  };

  const handleForgotPasswordClick = (e) => {
    e.preventDefault();
    setShowForgotPassword(true);
    setError('');
    setSuccessMessage('');
    setOtpSent(false);
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setResetToken('');
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setSendingOtp(true);

    if (!email) {
      setError('Please enter your email address');
      setSendingOtp(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setSendingOtp(false);
      return;
    }

    try {
      const response = await fetch(getApiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send OTP');
      }

      setOtpSent(true);
      setSuccessMessage('OTP sent to your email. Please check your inbox.');
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtpAndReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setResettingPassword(true);

    if (!otp || otp.length !== 5) {
      setError('Please enter the complete 5-digit OTP');
      setResettingPassword(false);
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all password fields');
      setResettingPassword(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setResettingPassword(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      setResettingPassword(false);
      return;
    }

    try {
      // First verify OTP to get reset token
      const verifyResponse = await fetch(getApiUrl('/api/auth/verify-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          otp: otp
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyData.detail || 'Invalid or expired OTP');
      }

      // Now reset password with the token
      const resetResponse = await fetch(getApiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          token: verifyData.reset_token,
          new_password: newPassword
        }),
      });

      const resetData = await resetResponse.json();

      if (!resetResponse.ok) {
        throw new Error(resetData.detail || 'Failed to reset password');
      }

      setSuccessMessage('Password reset successfully! You can now login with your new password.');
      setError('');
      
      // Reset form after 2 seconds and go back to login
      setTimeout(() => {
        setShowForgotPassword(false);
        setOtpSent(false);
        setOtp('');
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
        setSuccessMessage('');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setOtpSent(false);
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccessMessage('');
    setResetToken('');
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

              {successMessage && (
                <div style={{
                  background: 'rgba(40, 167, 69, 0.2)',
                  color: '#51cf66',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  textAlign: 'center',
                  border: '1px solid rgba(40, 167, 69, 0.3)'
                }}>
                  {successMessage}
                </div>
              )}

              {!showForgotPassword ? (
                <Form onSubmit={handleSubmit}>
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
                      placeholder="Email ID"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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

                {/* Remember Me and Forgot Password */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '30px',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  <Form.Group style={{ marginBottom: 0 }}>
                    <Form.Check
                      type="checkbox"
                      label="Remember me"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      style={{
                        color: '#fff',
                        fontSize: '14px'
                      }}
                      className="login-checkbox"
                    />
                  </Form.Group>
                  <a 
                    href="#" 
                    onClick={handleForgotPasswordClick}
                    style={{ 
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '14px',
                      textDecoration: 'none',
                      transition: 'opacity 0.3s'
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Forgot Password?
                  </a>
                </div>

                {/* Login Button */}
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
                  {loading ? 'Logging in...' : 'LOGIN'}
                </Button>
              </Form>
              ) : (
                <Form onSubmit={otpSent ? handleVerifyOtpAndReset : handleSendOtp}>
                  {/* Email Field */}
                  <Form.Group style={{ marginBottom: '20px' }}>
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
                        placeholder="Email ID"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={otpSent}
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

                  {/* Send OTP Link */}
                  {!otpSent && (
                    <div style={{ marginBottom: '20px', textAlign: 'right' }}>
                      <a 
                        href="#" 
                        onClick={handleSendOtp}
                        style={{ 
                          color: 'rgba(255, 255, 255, 0.9)',
                          fontSize: '14px',
                          textDecoration: 'none',
                          transition: 'opacity 0.3s',
                          cursor: sendingOtp ? 'not-allowed' : 'pointer',
                          opacity: sendingOtp ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => !sendingOtp && (e.target.style.opacity = '0.7')}
                        onMouseLeave={(e) => !sendingOtp && (e.target.style.opacity = '1')}
                      >
                        {sendingOtp ? 'Sending OTP...' : 'Send OTP'}
                      </a>
                    </div>
                  )}

                  {/* OTP Field */}
                  {otpSent && (
                    <Form.Group style={{ marginBottom: '20px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                        paddingBottom: '10px',
                        marginBottom: '5px'
                      }}>
                        <i className="fas fa-key" style={{ 
                          fontSize: '18px', 
                          color: 'rgba(255, 255, 255, 0.9)',
                          marginRight: '15px',
                          width: '24px'
                        }}></i>
                        <Form.Control
                          type="text"
                          placeholder="Enter OTP (5 digits)"
                          value={otp}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                            setOtp(value);
                            setError('');
                          }}
                          ref={otpInputRef}
                          required
                          maxLength={5}
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
                  )}

                  {/* New Password Field */}
                  {otpSent && (
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
                  )}

                  {/* Confirm Password Field */}
                  {otpSent && (
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
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={sendingOtp || resettingPassword || (otpSent && (!otp || otp.length !== 5 || !newPassword || !confirmPassword))}
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
                      opacity: (sendingOtp || resettingPassword || (otpSent && (!otp || otp.length !== 5 || !newPassword || !confirmPassword))) ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!sendingOtp && !resettingPassword && !(otpSent && (!otp || otp.length !== 5 || !newPassword || !confirmPassword))) {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 6px 20px rgba(142, 68, 173, 0.6)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 15px rgba(142, 68, 173, 0.4)';
                    }}
                  >
                    {sendingOtp ? 'Sending OTP...' : resettingPassword ? 'Resetting Password...' : otpSent ? 'Reset Password' : 'Send OTP'}
                  </Button>

                  {/* Back to Login Link */}
                  <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        handleBackToLogin();
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
                </Form>
              )}

              {/* Register Link */}
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', marginRight: '8px' }}>
                  Don't have an account?
                </span>
                <a 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/register');
                  }}
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
                  Register
                </a>
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
        .login-checkbox .form-check-input {
          background-color: transparent;
          border: 2px solid rgba(255, 255, 255, 0.5);
          border-radius: 4px;
        }
        .login-checkbox .form-check-input:checked {
          background-color: rgba(142, 68, 173, 0.8);
          border-color: rgba(142, 68, 173, 0.8);
        }
        .login-checkbox .form-check-label {
          color: rgba(255, 255, 255, 0.9);
          margin-left: 8px;
        }
        .login-checkbox .form-check-input:focus {
          box-shadow: 0 0 0 0.2rem rgba(142, 68, 173, 0.25);
        }
      `}</style>
    </div>
  );
};

export default LoginForm;
