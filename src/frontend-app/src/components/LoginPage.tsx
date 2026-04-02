import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

interface LoginPageProps {
    onSwitchToRegister: () => void
}

export function LoginPage({ onSwitchToRegister }: LoginPageProps) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login } = useAuthStore()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await login(username, password)
            setUsername('')
            setPassword('')
        } catch (err: any) {
            setError(err.message || '登录失败')
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
            <div className="ink-wash-blob absolute left-[12%] top-20 h-64 w-64" style={{ backgroundColor: 'rgba(201,160,99,0.16)' }} />
            <div className="ink-wash-blob absolute right-[10%] bottom-12 h-72 w-72" style={{ backgroundColor: 'rgba(140,26,17,0.10)', animationDelay: '-5s' }} />
            <div className="ink-wash-blob absolute left-[50%] top-[40%] h-48 w-48" style={{ backgroundColor: 'rgba(201,160,99,0.08)', animationDelay: '-9s' }} />

            {/* 主内容 */}
            <div className="relative z-10 w-full max-w-md px-6">
                {/* Logo 和标题 */}
                <div className="text-center mb-8">
                    <div className="float-up w-24 h-24 mx-auto mb-6" style={{ '--float-delay': '0.1s' } as React.CSSProperties}>
                        <img src="/logo.svg" alt="古籍智解" className="w-full h-full rounded-[26px]" style={{ boxShadow: '0 18px 32px rgba(26,30,35,0.08)' }} />
                    </div>
                    <h1
                        className="text-4xl mb-3 tracking-wider"
                        style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: '#1a1e23' }}
                    >
                        古籍智解
                    </h1>
                    <p className="text-sm tracking-wide" style={{ color: 'rgba(26,30,35,0.5)', fontFamily: '"Noto Serif SC", serif' }}>
                        登录后可同步阅读进度与个人收藏
                    </p>
                </div>

                {/* 登录表单 */}
                <div
                    className="float-up glass-card rounded-[30px] shadow-xl p-8"
                    style={{ '--float-delay': '0.25s' } as React.CSSProperties}
                >
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                用户名
                            </label>
                            <input
                                type="text"
                                placeholder="请输入用户名"
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
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="请输入密码"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 rounded-lg text-sm border outline-none focus:ring-2 transition-all"
                                    style={{
                                        borderColor: 'rgba(26,30,35,0.12)',
                                        backgroundColor: '#fff',
                                        fontFamily: '"Noto Serif SC", serif',
                                    }}
                                    required
                                    minLength={6}
                                    maxLength={64}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5 transition-colors"
                                    style={{ color: 'rgba(26,30,35,0.4)' }}
                                >
                                    {showPassword ? (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
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
                            {loading ? '登录中...' : '登录'}
                        </button>
                    </form>

                    {/* 底部链接 */}
                    <div className="mt-6 text-center">
                        <button
                            onClick={onSwitchToRegister}
                            className="text-xs hover:underline transition-colors"
                            style={{ color: '#ab1f22' }}
                        >
                            还没有账号？立即注册
                        </button>
                    </div>
                </div>

                {/* 底部装饰 */}
                <div className="mt-8 text-center float-up" style={{ '--float-delay': '0.5s' } as React.CSSProperties}>
                    <p className="text-xs tracking-widest" style={{ color: 'rgba(26,30,35,0.3)', fontFamily: '"Noto Serif SC", serif' }}>
                        一页古籍，一段新知
                    </p>
                </div>
            </div>
        </div>
    )
}
