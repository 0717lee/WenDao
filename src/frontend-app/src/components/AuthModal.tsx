import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

interface AuthModalProps {
    open: boolean
    onClose: () => void
}

export function AuthModal({ open, onClose }: AuthModalProps) {
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login, register } = useAuthStore()

    if (!open) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            if (mode === 'login') {
                await login(username, password)
            } else {
                await register(username, password)
            }
            onClose()
            setUsername('')
            setPassword('')
        } catch (err: any) {
            setError(err.message || '操作失败')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <div
                className="w-80 rounded-lg shadow-xl p-6 relative"
                style={{ backgroundColor: 'var(--gf-bg)', border: '1px solid rgba(26,30,35,0.1)' }}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-sm opacity-40 hover:opacity-80"
                >
                    &times;
                </button>

                <h2
                    className="text-center text-lg mb-4 tracking-wider"
                    style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: 'var(--gf-text)' }}
                >
                    {mode === 'login' ? '登录' : '注册'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <input
                        type="text"
                        placeholder="用户名"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className="w-full px-3 py-2 rounded text-sm border outline-none focus:ring-1"
                        style={{ borderColor: 'rgba(26,30,35,0.15)', backgroundColor: 'var(--gf-bg-paper)' }}
                        required
                        minLength={2}
                        maxLength={20}
                    />
                    <input
                        type="password"
                        placeholder="密码"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded text-sm border outline-none focus:ring-1"
                        style={{ borderColor: 'rgba(26,30,35,0.15)', backgroundColor: 'var(--gf-bg-paper)' }}
                        required
                        minLength={6}
                        maxLength={64}
                    />

                    {error && (
                        <p className="text-xs" style={{ color: 'var(--gf-red)' }}>{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 rounded text-sm text-white transition-opacity"
                        style={{ backgroundColor: 'var(--gf-gugong-red)', opacity: loading ? 0.6 : 1 }}
                    >
                        {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
                    </button>
                </form>

                <p className="text-center text-xs mt-3 opacity-50">
                    {mode === 'login' ? (
                        <>还没有账号？<button onClick={() => { setMode('register'); setError('') }} className="underline">注册</button></>
                    ) : (
                        <>已有账号？<button onClick={() => { setMode('login'); setError('') }} className="underline">登录</button></>
                    )}
                </p>
            </div>
        </div>
    )
}
