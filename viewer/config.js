// Independent frontend configuration; point at the same registry/privacy gateway.
const rawApi = (typeof process !== 'undefined' && process.env?.VITE_API_BASE) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ||
  globalThis.__API_BASE__;
export const API_BASE = rawApi
  ? (rawApi.startsWith('http') ? rawApi : `https://${rawApi}`)
  : (globalThis.location ? `${location.protocol}//${location.hostname}:5000` : 'http://127.0.0.1:5000');

