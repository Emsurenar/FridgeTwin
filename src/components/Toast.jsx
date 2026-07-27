export default function Toast({ message, type = 'success', action }) {
  return (
    <div className={`toast ${type === 'danger' ? 'toast-danger' : ''}`} role="status">
      <span className="truncate">{message}</span>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
