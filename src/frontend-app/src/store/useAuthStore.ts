import { create } from 'zustand'
import { API_BASE } from '../lib/api'

interface AuthState {
    token: string | null
    username: string | null
    login: (username: string, password: string) => Promise<void>
    register: (username: string, password: string) => Promise<void>
    logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
    token: localStorage.getItem('texttwin_token'),
    username: localStorage.getItem('texttwin_username'),

    login: async (username: string, password: string) => {
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        })
        if (!res.ok) {
            const err = await res.json()
            throw new Error(err.detail || '登录失败')
        }
        const data = await res.json()
        localStorage.setItem('texttwin_token', data.token)
        localStorage.setItem('texttwin_username', data.username)
        set({ token: data.token, username: data.username })
    },

    register: async (username: string, password: string) => {
        const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        })
        if (!res.ok) {
            const err = await res.json()
            throw new Error(err.detail || '注册失败')
        }
        const data = await res.json()
        localStorage.setItem('texttwin_token', data.token)
        localStorage.setItem('texttwin_username', data.username)
        set({ token: data.token, username: data.username })
    },

    logout: () => {
        localStorage.removeItem('texttwin_token')
        localStorage.removeItem('texttwin_username')
        set({ token: null, username: null })
    },
}))

/** Helper: get auth headers for protected API calls */
export function authHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token
    return token ? { Authorization: `Bearer ${token}` } : {}
}
