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
const AUTH_STORAGE_KEY = 'wendao_auth_state'

interface PersistedAuthState {
    token: string | null
    username: string | null
}

function canUseStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readPersistedAuth(): PersistedAuthState {
    if (!canUseStorage()) {
        return { token: null, username: null }
    }

    try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
        if (!raw) return { token: null, username: null }
        const parsed = JSON.parse(raw) as PersistedAuthState
        return {
            token: parsed.token ?? null,
            username: parsed.username ?? null,
        }
    } catch {
        return { token: null, username: null }
    }
}

function persistAuthState(state: PersistedAuthState) {
    if (!canUseStorage()) return
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
}

function clearPersistedAuthState() {
    if (!canUseStorage()) return
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

const initialAuthState = readPersistedAuth()

export const useAuthStore = create<AuthState>((set, get) => ({
    token: initialAuthState.token,
    username: initialAuthState.username,

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
        const nextState = {
            token: data.token || COOKIE_SESSION_TOKEN,
            username: data.username ?? username,
        }
        persistAuthState(nextState)
        set(nextState)
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
        const nextState = {
            token: data.token || COOKIE_SESSION_TOKEN,
            username: data.username ?? username,
        }
        persistAuthState(nextState)
        set(nextState)
    },

    validateStoredAuth: async (): Promise<boolean> => {
        const { token, username } = get()

        try {
            const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
                headers: token && token !== COOKIE_SESSION_TOKEN ? { Authorization: `Bearer ${token}` } : undefined,
                credentials: 'include',
            })

            if (!res.ok) {
                clearPersistedAuthState()
                set({ token: null, username: null })
                return false
            }

            const data = await res.json().catch(() => null)
            if (data?.username) {
                const nextState = {
                    token: token || COOKIE_SESSION_TOKEN,
                    username: data.username,
                }
                persistAuthState(nextState)
                set(nextState)
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
        clearPersistedAuthState()
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
