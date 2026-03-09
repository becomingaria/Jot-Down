import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';

export default function LoginPage() {
  const { login, handleNewPassword, error, pendingChallenge } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setLocalError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPasswordSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await handleNewPassword(newPassword);
    } catch (err) {
      setLocalError(err.message || 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  if (pendingChallenge) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>🧠 Jot-Down</h1>
            <p>Set your new password</p>
          </div>

          <form onSubmit={handleNewPasswordSubmit}>
            {(localError || error) && (
              <div className="login-error">{localError || error}</div>
            )}

            <div className="login-field">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                required
                autoFocus
              />
            </div>

            <div className="login-field">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Setting password...' : 'Set Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>🧠 Jot-Down</h1>
          <p>Sign in to your wiki</p>
        </div>

        <form onSubmit={handleSubmit}>
          {(localError || error) && (
            <div className="login-error">{localError || error}</div>
          )}

          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
