import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';

const ModalContext = createContext(null);

/**
 * Provides showAlert, showConfirm, and showPrompt as awaitable functions.
 * Each resolves to:
 *   alert   → true when OK is clicked
 *   confirm → true (OK) or false (Cancel)
 *   prompt  → string value (OK) or null (Cancel)
 */
export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);
  const resolveRef = useRef(null);

  const showAlert = useCallback((title, message) =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ type: 'alert', title, message });
    }), []);

  const showConfirm = useCallback((title, message) =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ type: 'confirm', title, message });
    }), []);

  const showPrompt = useCallback((title, message, defaultValue = '') =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ type: 'prompt', title, message, defaultValue });
    }), []);

  const close = useCallback((value) => {
    setModal(null);
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
  }, []);

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {modal && <Win95Modal modal={modal} onClose={close} />}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  return ctx;
}

// ──────────────────────────────────────────────
// Win95 modal renderer
// ──────────────────────────────────────────────

const ICONS = {
  alert: 'ℹ️',
  confirm: '❓',
  prompt: '✏️',
};

function Win95Modal({ modal, onClose }) {
  const [value, setValue] = useState(modal.defaultValue ?? '');
  const inputRef = useRef(null);

  // Focus the input (prompt) or the first button (alert/confirm) on mount
  useEffect(() => {
    if (modal.type === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [modal.type]);

  const handleOk = () => onClose(modal.type === 'prompt' ? value : true);
  const handleCancel = () => onClose(modal.type === 'prompt' ? null : false);

  return (
    <div className="win95-overlay">
      <div className="win95-dialog" role="dialog" aria-modal="true">
        {/* Title bar */}
        <div className="win95-titlebar">
          <span className="win95-titlebar-text">
            {modal.title}
          </span>
          <button
            className="win95-titlebar-close"
            onClick={handleCancel}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="win95-dialog-body">
          <div className="win95-dialog-icon">{ICONS[modal.type]}</div>
          <div className="win95-dialog-content">
            <p className="win95-dialog-message">{modal.message}</p>
            {modal.type === 'prompt' && (
              <input
                ref={inputRef}
                className="win95-dialog-input"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleOk();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="win95-dialog-actions">
          {modal.type === 'alert' && (
            <button className="win95-btn" onClick={handleOk}>OK</button>
          )}
          {(modal.type === 'confirm' || modal.type === 'prompt') && (
            <>
              <button className="win95-btn" onClick={handleOk}>OK</button>
              <button className="win95-btn" onClick={handleCancel}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
