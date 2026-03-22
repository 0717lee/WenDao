/** Shared API base URL — reads from Vite env, falls back to localhost for dev. */
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
