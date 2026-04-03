import { create } from 'zustand'
import { API_BASE } from '../lib/api'
import { useDocumentStore } from './useDocumentStore'
import { useStore } from './useStore'

interface AuthState {
    token: string | null
    username: string | null
    login: (username: string, password: string) => Promise<void>
    register: (username: string, email: string, password: string) => Promise<void>
    validateStoredAuth: () => Promise<boolean>
    logout: () => Promise<void>
}

const COOKIE_SESSION_TOKEN = '__cookie_session__'

function persistAuth(username: string) {
    localStorage.setItem('wendao_username', username)
}

function clearPersistedAuth() {
    localStorage.removeItem('wendao_username')
}

export const useAuthStore = create<AuthState>((set, get) => ({
    token: null,
    username: localStorage.getItem('wendao_username'),

    login: async (username: string, password: string) => {
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password }),
        })
        if (!res.ok) {
            const err = await res.json()
            throw new Error(err.detail || '登录失败')
        }
        const data = await res.json()
        persistAuth(data.username)
        set({ token: COOKIE_SESSION_TOKEN, username: data.username })
    },

    register: async (username: string, email: string, password: string) => {
        const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, email, password }),
        })
        if (!res.ok) {
            const err = await res.json()
            throw new Error(err.detail || '注册失败')
        }
        const data = await res.json()
        persistAuth(data.username)
        set({ token: COOKIE_SESSION_TOKEN, username: data.username })
    },

    validateStoredAuth: async (): Promise<boolean> => {
        const { token, username } = get()

        try {
            const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
                headers: token && token !== COOKIE_SESSION_TOKEN ? { Authorization: `Bearer ${token}` } : undefined,
                credentials: 'include',
            })

            if (!res.ok) {
                clearPersistedAuth()
                set({ token: null, username: null })
                return false
            }

            const data = await res.json().catch(() => null)
            if (data?.username) {
                persistAuth(data.username)
                set({ token: token || COOKIE_SESSION_TOKEN, username: data.username })
                return true
            }
            return Boolean(username)
        } catch {
            // Keep the local session on transient network failures.
            return Boolean(username)
        }
    },

    logout: async () => {
        try {
            await fetch(`${API_BASE}/api/v1/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            })
        } catch {
            // Best-effort logout; still clear local state.
        }
        clearPersistedAuth()
        set({ token: null, username: null })
        useDocumentStore.getState().reset()
        useStore.getState().clearMessages()
    },
}))

/** Helper: get auth headers for protected API calls */
export function authHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token
    return token && token !== COOKIE_SESSION_TOKEN ? { Authorization: `Bearer ${token}` } : {}
}

export function authFetchOptions(init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers ?? {})
    const auth = authHeaders()
    for (const [key, value] of Object.entries(auth)) {
        headers.set(key, value)
    }

    return {
        ...init,
        headers,
        credentials: 'include',
    }
}
