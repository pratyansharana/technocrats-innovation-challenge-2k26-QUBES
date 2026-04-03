import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Auth.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login:', { email, password });
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p>Sign in to your account</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="submit-btn">
            Continue <span className="arrow-icon">→</span>
          </button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <button className="social-btn">
          <span className="social-icon">🔵</span>
          Continue with Google
          <span className="arrow-icon">→</span>
        </button>
        <button className="social-btn">
          <span className="social-icon">🍎</span>
          Continue with Apple
          <span className="arrow-icon">→</span>
        </button>

        <div className="auth-footer">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
