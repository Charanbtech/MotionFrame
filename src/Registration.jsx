import React, { useState, useEffect } from 'react';
import { Form, Button } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './style.scss';
import robotLogos from './assets/MotionFrame.svg';
import SplashScreen from './SplashScreen';

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

  if (loading) {
    return <SplashScreen text="Registering..." />;
  }

  return (
    <div className="rf-theme-bg">
      <div className="rf-card">
        {/* Header */}
        <div className="rf-header">
          <img src={robotLogos} alt="MotionFrame Logo" className="rf-logo" />
          <h2 className="rf-heading">Create an account</h2>
          <p className="rf-subtext">Join MotionFrame to start annotating</p>
        </div>

        {error && (
          <div className="rf-alert rf-alert-error">
            <span>{error}</span>
          </div>
        )}

        <Form onSubmit={handleSubmit} className="rf-form">
          {/* Name Field */}
          <Form.Group className="rf-form-group">
            <Form.Label className="rf-label">Full Name</Form.Label>
            <div className="rf-input-wrapper">
              <Form.Control
                type="text"
                name="name"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                required
                className="rf-input"
              />
              <i className="far fa-user rf-input-icon"></i>
            </div>
          </Form.Group>

          {/* Email Field */}
          <Form.Group className="rf-form-group">
            <Form.Label className="rf-label">Email address</Form.Label>
            <div className="rf-input-wrapper">
              <Form.Control
                type="email"
                name="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={handleChange}
                required
                className="rf-input"
              />
              <i className="far fa-envelope rf-input-icon"></i>
            </div>
          </Form.Group>

          {/* Password Field */}
          <Form.Group className="rf-form-group">
            <Form.Label className="rf-label">Password</Form.Label>
            <div className="rf-input-wrapper">
              <Form.Control
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
                className="rf-input"
              />
              <i className="fas fa-lock rf-input-icon"></i>
              <div className={`rf-eye-btn ${formData.password.length > 0 ? 'visible' : ''}`} onClick={() => setShowPassword(!showPassword)}>
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </div>
            </div>
          </Form.Group>

          {/* Confirm Password Field */}
          <Form.Group className="rf-form-group" style={{ marginBottom: '24px' }}>
            <Form.Label className="rf-label">Confirm Password</Form.Label>
            <div className="rf-input-wrapper">
              <Form.Control
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="rf-input"
              />
              <i className="fas fa-lock rf-input-icon"></i>
              <div className={`rf-eye-btn ${formData.confirmPassword.length > 0 ? 'visible' : ''}`} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </div>
            </div>
          </Form.Group>

          <button type="submit" disabled={loading} className="rf-btn rf-btn-primary">
            {loading ? 'Registering...' : 'Create Account'}
          </button>
        </Form>

        <div className="rf-footer">
          <span>Already have an account?</span>
          <Link to="/login" style={{ marginLeft: '6px', color: '#111827', fontWeight: '600', textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
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

        /* --- Button System --- */
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

        /* --- Form Elements --- */
        .rf-form-group {
          margin-bottom: 20px;
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

export default Registration;
