import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import '../styles/Auth.css';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('User logged in:', result.user);
      navigate('/chat');
    } catch (err: any) {
      setError(err.message || 'Failed to login with Google');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="model-container">
          <iframe
            title="Quantum Computer"
            frameBorder="0"
            allowFullScreen
            allow="autoplay; fullscreen; xr-spatial-tracking"
            src="https://sketchfab.com/models/82006aac41744663a161ab844264ac2a/embed?autospin=1&autostart=1&preload=1"
          />
        </div>
        {error && <p style={{ color: '#ff6b6b', textAlign: 'center', fontSize: '0.9rem' }}>{error}</p>}
        <button
          className="social-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <span className="social-icon">🔵</span>
          {loading ? 'Signing in...' : 'Continue with Google'}
          <span className="arrow-icon">→</span>
        </button>
      </div>
    </div>
  );
};

export default Login;
