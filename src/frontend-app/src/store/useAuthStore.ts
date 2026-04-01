import { create } from 'zustand'
import { API_BASE } from '../lib/api'

interface AuthState {
    token: string | null
    username: string | null
    login: (username: string, password: string) => Promise<void>
    register: (username: string, email: string, password: string) => Promise<void>
    validateStoredAuth: () => Promise<boolean>
    logout: () => void
}

function persistAuth(token: string, username: string) {
    localStorage.setItem('wendao_token', token)
    localStorage.setItem('wendao_username', username)
}

function clearPersistedAuth() {
    localStorage.removeItem('wendao_token')
    localStorage.removeItem('wendao_username')
}

export const useAuthStore = create<AuthState>((set) => ({
    token: localStorage.getItem('wendao_token'),
    username: localStorage.getItem('wendao_username'),

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
        persistAuth(data.token, data.username)
        set({ token: data.token, username: data.username })
    },

    register: async (username: string, email: string, password: string) => {
        const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
        })
        if (!res.ok) {
            const err = await res.json()
            throw new Error(err.detail || '注册失败')
        }
        const data = await res.json()
        persistAuth(data.token, data.username)
        set({ token: data.token, username: data.username })
    },

    validateStoredAuth: async () => {
        const { token, username } = useAuthStore.getState()
        if (!token || !username) return false

        try {
            const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!res.ok) {
                clearPersistedAuth()
                set({ token: null, username: null })
                return false
            }

            const data = await res.json().catch(() => null)
            if (data?.username && data.username !== username) {
                persistAuth(token, data.username)
                set({ username: data.username })
            }
            return true
        } catch {
            // Keep the local session on transient network failures.
            return true
        }
    },

    logout: () => {
        clearPersistedAuth()
        set({ token: null, username: null })
    },
}))

/** Helper: get auth headers for protected API calls */
export function authHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token
    return token ? { Authorization: `Bearer ${token}` } : {}
}
