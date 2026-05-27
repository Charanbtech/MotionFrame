import React, { useState, useEffect, useRef } from 'react';
import { Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getApiUrl } from './utils/api';
import { useGoogleLogin } from '@react-oauth/google';
import './style.scss';
import robotLogos from './assets/MotionFrame.svg';
import SplashScreen from './SplashScreen';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUsedMethod, setLastUsedMethod] = useState('');
  
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
  const { login, googleLogin, isAuthenticated } = useAuth();
  const otpInputRef = useRef(null);

  const handleGoogleSuccess = async (tokenResponse) => {
    setLoading(true);
    setError('');
    const credential = tokenResponse.credential || tokenResponse.access_token;
    const result = await googleLogin(credential);
    
    if (result.success) {
      localStorage.setItem('lastUsedLoginMethod', 'google');
      navigate('/');
    } else {
      setError(result.error || 'Google login failed');
    }
    setLoading(false);
  };

  const loginWithGoogle = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setError('Google login popup closed or failed'),
  });

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate('/');
    }
    
    // Check localStorage for the last used login method
    const savedMethod = localStorage.getItem('lastUsedLoginMethod');
    if (savedMethod) {
      setLastUsedMethod(savedMethod);
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      localStorage.setItem('lastUsedLoginMethod', 'email');
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
      setSuccessMessage('Security code sent to your email.');
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
      setError('Please enter the complete 5-digit security code');
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
        throw new Error(verifyData.detail || 'Invalid or expired code');
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

      setSuccessMessage('Password reset successfully! You can now login.');
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

  const getLoadingText = () => {
    if (loading) return "Signing in...";
    if (sendingOtp) return "Sending...";
    if (resettingPassword) return "Verifying...";
    return "Loading...";
  };

  if (loading || sendingOtp || resettingPassword) {
    return <SplashScreen text={getLoadingText()} />;
  }

  return (
    <div className="rf-theme-bg">
      <div className="rf-card">
        {/* Header */}
        <div className="rf-header">
          <img src={robotLogos} alt="MotionFrame Logo" className="rf-logo" />
          <h2 className="rf-heading">
            {!showForgotPassword ? 'Welcome back' : 'Reset password'}
          </h2>
          <p className="rf-subtext">
            {!showForgotPassword ? 'Sign in to access your dashboard' : 'Follow the steps to regain access'}
          </p>
        </div>

        {error && (
          <div className="rf-alert rf-alert-error">
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="rf-alert rf-alert-success">
            <span>{successMessage}</span>
          </div>
        )}

        {!showForgotPassword ? (
          <>
            <div className="rf-social-group">
              <button 
                className="rf-btn rf-btn-google" 
                type="button" 
                style={{ position: 'relative' }}
                onClick={() => {
                  setLastUsedMethod('google');
                  loginWithGoogle();
                }}
              >
                <svg width="20" height="20" viewBox="0 0 48 48" style={{ marginRight: '4px' }}>
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                </svg>
                Continue with Google
                {lastUsedMethod === 'google' && (
                  <span className="rf-badge-last-used">Last Used</span>
                )}
              </button>
              <button 
                className="rf-btn rf-btn-github" 
                type="button"
                style={{ position: 'relative' }}
                onClick={() => {
                  localStorage.setItem('lastUsedLoginMethod', 'github');
                  setLastUsedMethod('github');
                  alert('GitHub authentication requires an active OAuth App configured in your GitHub Developer Settings.');
                }}
              >
                <i className="fab fa-github" style={{ fontSize: '18px', marginRight: '4px' }}></i>
                Continue with GitHub
                {lastUsedMethod === 'github' && (
                  <span className="rf-badge-last-used" style={{ background: '#374151' }}>Last Used</span>
                )}
              </button>
            </div>

            <div className="rf-divider">
              <div className="rf-divider-line"></div>
              <span className="rf-divider-text">or continue with email</span>
              <div className="rf-divider-line"></div>
            </div>

            <Form onSubmit={handleSubmit} className="rf-form">
              <Form.Group className="rf-form-group">
                <Form.Label className="rf-label">Email address</Form.Label>
                <div className="rf-input-wrapper">
                  <Form.Control
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="rf-input"
                  />
                  <i className="far fa-envelope rf-input-icon"></i>
                </div>
              </Form.Group>

              <Form.Group className="rf-form-group">
                <div className="rf-label-row">
                  <Form.Label className="rf-label" style={{ marginBottom: 0 }}>Password</Form.Label>
                  <a href="#" onClick={handleForgotPasswordClick} className="rf-forgot-link">
                    Forgot password?
                  </a>
                </div>
                <div className="rf-input-wrapper">
                  <Form.Control
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="rf-input"
                  />
                  <i className="fas fa-lock rf-input-icon"></i>
                  <div className={`rf-eye-btn ${password.length > 0 ? 'visible' : ''}`} onClick={() => setShowPassword(!showPassword)}>
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </div>
                </div>
              </Form.Group>

              <div style={{ marginBottom: '24px' }}></div>

              <button type="submit" disabled={loading} className="rf-btn rf-btn-primary">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </Form>
          </>
        ) : (
          <Form onSubmit={otpSent ? handleVerifyOtpAndReset : handleSendOtp} className="rf-form">
            <Form.Group className="rf-form-group">
              <Form.Label className="rf-label">Email address</Form.Label>
              <div className="rf-input-wrapper">
                <Form.Control
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={otpSent}
                  className="rf-input"
                  style={{ opacity: otpSent ? 0.6 : 1, backgroundColor: otpSent ? '#F3F4F6' : '#FFFFFF' }}
                />
                <i className="far fa-envelope rf-input-icon"></i>
              </div>
            </Form.Group>

            {!otpSent && (
              <div style={{ textAlign: 'right', marginBottom: '24px' }}>
                <button type="button" onClick={handleSendOtp} disabled={sendingOtp} className="rf-btn rf-btn-google" style={{ width: 'auto', padding: '8px 16px', fontSize: '13px' }}>
                  {sendingOtp ? 'Sending...' : 'Send Security Code'}
                </button>
              </div>
            )}

            {otpSent && (
              <Form.Group className="rf-form-group">
                <Form.Label className="rf-label">Security Code</Form.Label>
                <div className="rf-input-wrapper">
                  <Form.Control
                    type="text"
                    placeholder="5-digit code"
                    value={otp}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                      setOtp(value);
                      setError('');
                    }}
                    ref={otpInputRef}
                    required
                    maxLength={5}
                    className="rf-input rf-tracking-wide"
                  />
                  <i className="fas fa-key rf-input-icon"></i>
                </div>
              </Form.Group>
            )}

            {otpSent && (
              <Form.Group className="rf-form-group">
                <Form.Label className="rf-label">New Password</Form.Label>
                <div className="rf-input-wrapper">
                  <Form.Control
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                    required
                    className="rf-input"
                  />
                  <i className="fas fa-lock rf-input-icon"></i>
                  <div className={`rf-eye-btn ${newPassword.length > 0 ? 'visible' : ''}`} onClick={() => setShowNewPassword(!showNewPassword)}>
                    <i className={`fas ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </div>
                </div>
              </Form.Group>
            )}

            {otpSent && (
              <Form.Group className="rf-form-group" style={{ marginBottom: '24px' }}>
                <Form.Label className="rf-label">Confirm Password</Form.Label>
                <div className="rf-input-wrapper">
                  <Form.Control
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                    required
                    className="rf-input"
                  />
                  <i className="fas fa-lock rf-input-icon"></i>
                  <div className={`rf-eye-btn ${confirmPassword.length > 0 ? 'visible' : ''}`} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </div>
                </div>
              </Form.Group>
            )}

            <button
              type="submit"
              disabled={sendingOtp || resettingPassword || (otpSent && (!otp || otp.length !== 5 || !newPassword || !confirmPassword))}
              className="rf-btn rf-btn-primary"
            >
              {sendingOtp ? 'Sending...' : resettingPassword ? 'Verifying...' : otpSent ? 'Update Password' : 'Submit'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '24px' }}>
              <a href="#" onClick={(e) => { e.preventDefault(); handleBackToLogin(); }} className="rf-back-link">
                Back to sign in
              </a>
            </div>
          </Form>
        )}

        {!showForgotPassword && (
          <div className="rf-footer">
            <span>Don't have an account?</span>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/register'); }}>
              Sign up
            </a>
          </div>
        )}
      </div>

      <style>{`
        /* Premium Solid Theme Design System */
        .rf-theme-bg {
          min-height: 100vh;
          background: linear-gradient(135deg, #F9FAFB, #E5E7EB, #F9FAFB);
          background-size: 200% 200%;
          animation: gradientShift 15s ease infinite;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .rf-card {
          background: #FFFFFF;
          border-radius: 20px;
          padding: 40px;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        }

        /* --- Header --- */
        .rf-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .rf-logo {
          width: 140px;
          object-fit: contain;
          margin-bottom: 24px;
        }
        .rf-heading {
          color: #111827;
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }
        .rf-subtext {
          color: #6B7280;
          font-size: 15px;
        }

        /* --- Alerts --- */
        .rf-alert {
          padding: 12px 16px;
          border-radius: 10px;
          margin-bottom: 24px;
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        }
        .rf-alert-error {
          background: #FEF2F2;
          color: #DC2626;
        }
        .rf-alert-success {
          background: #F0FDF4;
          color: #16A34A;
        }

        /* --- Button System --- */
        .rf-social-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .rf-btn {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          width: 100%;
          border-radius: 12px;
          padding: 12px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 200ms ease;
        }
        .rf-btn-google {
          background: #FFFFFF;
          color: #374151;
          border: 1px solid #D1D5DB;
        }
        .rf-btn-google:hover {
          background: #F9FAFB;
        }
        .rf-badge-last-used {
          position: absolute;
          right: -10px;
          top: -14px;
          background: #111827;
          color: #FFFFFF;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          box-shadow: 0 2px 4px rgba(17, 24, 39, 0.2);
          letter-spacing: 0.2px;
        }
        .rf-btn-github {
          background: #1F2937;
          color: #FFFFFF;
          border: 1px solid #1F2937;
        }
        .rf-btn-github:hover {
          background: #374151;
          transform: translateY(-1px);
        }
        .rf-btn-primary {
          background: #111827;
          color: #FFFFFF;
          border: none;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(17, 24, 39, 0.15);
        }
        .rf-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(17, 24, 39, 0.25);
          background: #000000;
        }
        .rf-btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        /* --- Divider --- */
        .rf-divider {
          display: flex;
          align-items: center;
          margin: 24px 0;
        }
        .rf-divider-line {
          flex: 1;
          height: 1px;
          background: #E5E7EB;
        }
        .rf-divider-text {
          padding: 0 16px;
          color: #9CA3AF;
          font-size: 13px;
          font-weight: 500;
        }

        /* --- Form Elements --- */
        .rf-form-group {
          margin-bottom: 20px;
        }
        .rf-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .rf-label {
          color: #374151;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 6px;
          display: block;
        }

        .rf-input-wrapper {
          position: relative;
        }
        .rf-input {
          background: #FFFFFF !important;
          border: 1px solid #D1D5DB !important;
          color: #111827 !important;
          padding: 12px 16px 12px 42px !important;
          border-radius: 10px !important;
          font-size: 15px !important;
          transition: all 200ms ease !important;
          outline: none !important;
          width: 100%;
          box-shadow: none !important;
        }
        .rf-input::placeholder {
          color: #9CA3AF !important;
        }
        .rf-input:focus {
          border-color: #111827 !important;
          box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.1) !important;
        }
        .rf-tracking-wide {
          letter-spacing: 4px;
          font-weight: 700;
        }

        .rf-input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
          font-size: 16px;
          transition: color 200ms ease;
          pointer-events: none;
        }
        .rf-input:focus + .rf-input-icon {
          color: #111827;
        }

        .rf-eye-btn {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
          cursor: pointer;
          transition: all 200ms ease;
          opacity: 0;
          font-size: 16px;
        }
        .rf-input-wrapper:hover .rf-eye-btn,
        .rf-input:focus ~ .rf-eye-btn,
        .rf-eye-btn.visible {
          opacity: 1;
        }
        .rf-eye-btn:hover {
          color: #4B5563;
        }

        /* --- Checkbox & Links --- */
        .rf-checkbox-wrapper {
          display: flex;
          align-items: center;
          cursor: pointer;
        }
        .rf-checkbox {
          width: 16px;
          height: 16px;
          border: 1px solid #D1D5DB;
          border-radius: 4px;
          appearance: none;
          background: #FFFFFF;
          cursor: pointer;
          transition: all 150ms ease;
          position: relative;
        }
        .rf-checkbox:checked {
          background: #111827;
          border-color: #111827;
        }
        .rf-checkbox:checked::after {
          content: '';
          position: absolute;
          left: 4px;
          top: 1px;
          width: 5px;
          height: 10px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .rf-checkbox-label {
          color: #4B5563;
          font-size: 14px;
          font-weight: 500;
          margin-left: 8px;
        }

        .rf-forgot-link, .rf-back-link {
          color: #6B7280;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          transition: all 150ms ease;
        }
        .rf-forgot-link:hover, .rf-back-link:hover {
          color: #111827;
        }

        /* --- Footer --- */
        .rf-footer {
          margin-top: 32px;
          text-align: center;
          color: #6B7280;
          font-size: 14px;
        }
        .rf-footer a {
          color: #111827;
          font-weight: 600;
          text-decoration: none;
          margin-left: 6px;
          transition: all 150ms ease;
        }
        .rf-footer a:hover {
          color: #4B5563;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default LoginForm;
