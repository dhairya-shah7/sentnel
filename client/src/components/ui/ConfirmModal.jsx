import { useState } from 'react';

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, dangerous = true }) {
  const [input, setInput] = useState('');
  const requireTyping = dangerous;
  const canConfirm = !requireTyping || input === 'CONFIRM';

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-shell w-full max-w-md animate-fade-in p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          {dangerous && <span className="text-alert text-lg">⚠</span>}
          <h3 className="text-sm font-display font-semibold text-text-primary uppercase tracking-wider">
            {title || 'Confirm Action'}
          </h3>
        </div>
        <p className="text-sm text-text-secondary mb-4">{message}</p>

        {requireTyping && (
          <div className="mb-4">
            <label className="input-label">Type <span className="text-alert font-bold">CONFIRM</span> to proceed</label>
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="CONFIRM"
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>
          <button
            onClick={() => { onConfirm(); setInput(''); }}
            disabled={!canConfirm}
            className={`btn btn-sm ${dangerous ? 'btn-danger' : 'btn-primary'}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
