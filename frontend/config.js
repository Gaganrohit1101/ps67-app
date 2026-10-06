// Change only this URL when hosting the privacy gateway separately.
export const API_BASE = (typeof process !== 'undefined' && process.env?.VITE_API_BASE) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ||
  globalThis.__API_BASE__ ||
  (globalThis.location ? `${location.protocol}//${location.hostname}:5000` : 'http://127.0.0.1:5000');
