import React, { useState } from 'react';

export default function ShareDialog({ wikiId, wikiName, onShare, onClose }) {
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState('view');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await onShare(wikiId, email, accessLevel);
      setSuccess(`Shared with ${email} (${accessLevel})`);
      setEmail('');
    } catch (err) {
      setError(err.message || 'Failed to share');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Share "{wikiName}"</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
          {error && <div className="dialog-error">{error}</div>}
          {success && <div className="dialog-success">{success}</div>}

          <div className="dialog-field">
            <label>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="dialog-field">
            <label>Access level</label>
            <select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)}>
              <option value="view">Can View (read-only)</option>
              <option value="edit">Can Edit (read + write)</option>
            </select>
          </div>

          <div className="dialog-actions">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Sharing...' : 'Share'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
