import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

interface RegisterPageProps {
    onSwitchToLogin: () => void
}

export function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { register } = useAuthStore()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致')
            return
        }

        setLoading(true)
        try {
            await register(username, password)
            setUsername('')
            setPassword('')
            setConfirmPassword('')
        } catch (err: any) {
            setError(err.message || '注册失败')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full h-screen flex items-center justify-center relative overflow-hidden" style={{ backgroundColor: 'var(--gf-bg-paper)' }}>
            {/* 背景装饰 */}
            <div className="absolute inset-0 bg-xuan-paper opacity-40" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ab1f22] to-transparent opacity-30" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ab1f22] to-transparent opacity-30" />

            {/* 主内容 */}
            <div className="relative z-10 w-full max-w-md px-6">
                {/* Logo 和标题 */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center relative" style={{ backgroundColor: 'rgba(171,31,34,0.08)' }}>
                        <svg className="w-10 h-10" style={{ color: '#ab1f22' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <div className="absolute inset-0 rounded-full border-2 opacity-20" style={{ borderColor: '#ab1f22' }} />
                    </div>
                    <h1
                        className="text-4xl mb-3 tracking-wider"
                        style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: '#1a1e23' }}
                    >
                        古籍智解
                    </h1>
                    <p className="text-sm tracking-wide mb-2" style={{ color: 'rgba(26,30,35,0.5)', fontFamily: '"Noto Serif SC", serif' }}>
                        注册账号
                    </p>
                </div>

                {/* 注册表单 */}
                <div
                    className="rounded-2xl shadow-xl p-8 backdrop-blur-sm"
                    style={{ backgroundColor: 'rgba(247,246,243,0.9)', border: '1px solid rgba(26,30,35,0.08)' }}
                >
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                用户名
                            </label>
                            <input
                                type="text"
                                placeholder="请输入用户名（2-20个字符）"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg text-sm border outline-none focus:ring-2 transition-all"
                                style={{
                                    borderColor: 'rgba(26,30,35,0.12)',
                                    backgroundColor: '#fff',
                                    fontFamily: '"Noto Serif SC", serif',
                                }}
                                required
                                minLength={2}
                                maxLength={20}
                            />
                        </div>
                        <div>
                            <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                密码
                            </label>
                            <input
                                type="password"
                                placeholder="请输入密码（至少6个字符）"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg text-sm border outline-none focus:ring-2 transition-all"
                                style={{
                                    borderColor: 'rgba(26,30,35,0.12)',
                                    backgroundColor: '#fff',
                                    fontFamily: '"Noto Serif SC", serif',
                                }}
                                required
                                minLength={6}
                                maxLength={64}
                            />
                        </div>
                        <div>
                            <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                确认密码
                            </label>
                            <input
                                type="password"
                                placeholder="请再次输入密码"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg text-sm border outline-none focus:ring-2 transition-all"
                                style={{
                                    borderColor: 'rgba(26,30,35,0.12)',
                                    backgroundColor: '#fff',
                                    fontFamily: '"Noto Serif SC", serif',
                                }}
                                required
                                minLength={6}
                                maxLength={64}
                            />
                        </div>

                        {error && (
                            <div className="px-4 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(171,31,34,0.08)', color: '#ab1f22' }}>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded-lg text-sm text-white transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                backgroundColor: '#ab1f22',
                                fontFamily: '"Noto Serif SC", serif',
                                fontWeight: 500,
                            }}
                        >
                            {loading ? '注册中...' : '注册'}
                        </button>
                    </form>

                    {/* 底部链接 */}
                    <div className="mt-6 text-center space-y-2">
                        <button
                            onClick={onSwitchToLogin}
                            className="text-xs hover:underline transition-colors"
                            style={{ color: '#ab1f22' }}
                        >
                            已有账号？立即登录
                        </button>
                    </div>
                </div>

                {/* 底部装饰 */}
                <div className="mt-8 text-center">
                    <p className="text-xs tracking-widest" style={{ color: 'rgba(26,30,35,0.3)', fontFamily: '"Noto Serif SC", serif' }}>
                        以AI之力 · 穿越时空对话先贤
                    </p>
                </div>
            </div>
        </div>
    )
}
