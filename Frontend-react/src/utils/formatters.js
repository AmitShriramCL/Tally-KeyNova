export function normBackend(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

export function money(n) {
  return Number(n || 0).toFixed(2);
}

export function toTallyDate(d) {
  return String(d || '').replace(/-/g, '');
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
