// Independent frontend configuration; point at the same registry/privacy gateway.
export const API_BASE = globalThis.location ? `${location.protocol}//${location.hostname}:5000` : 'http://127.0.0.1:5000';
