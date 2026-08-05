import { createPortal } from 'react-dom';

export default function Modal({ title, requestXml, responseXml, onClose }) {
  return createPortal(
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="ghost-btn" onClick={onClose}>✕ Close</button>
        </div>
        <div className="modal-body">
          <h4>Request (XML sent to Tally)</h4>
          <pre>{requestXml}</pre>
          <h4>Response (from Tally)</h4>
          <pre>{responseXml}</pre>
        </div>
      </div>
    </div>,
    document.body
  );
}
