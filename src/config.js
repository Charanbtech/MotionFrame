// Environment variables from Vite
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || (API_BASE_URL ? API_BASE_URL.replace(/^http/, 'ws') : 'ws://localhost:8000');
