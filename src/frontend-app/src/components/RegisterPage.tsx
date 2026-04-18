import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'

interface RegisterPageProps {
    onSwitchToLogin: () => void
}

type PasswordStrength = { score: 0 | 1 | 2 | 3; label: string; color: string }

function evaluatePassword(pw: string): PasswordStrength {
    if (!pw) return { score: 0, label: '', color: 'transparent' }
    let score = 0
    if (pw.length >= 6) score += 1
    if (pw.length >= 10) score += 1
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1
    if (/\d/.test(pw) && /[^\w]/.test(pw)) score += 1
    const final = Math.min(3, score) as 0 | 1 | 2 | 3
    if (final <= 1) return { score: final, label: '偏弱', color: 'var(--gf-gugong-red)' }
    if (final === 2) return { score: final, label: '可用', color: 'var(--gf-gold)' }
    return { score: final, label: '稳妥', color: '#5a8a5a' }
}

export function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { register } = useAuthStore()

    const strength = evaluatePassword(password)
    const confirmMismatch = confirmPassword.length > 0 && password !== confirmPassword
    const canSubmit =
        username.length >= 2 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        password.length >= 6 &&
        password === confirmPassword &&
        !loading

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致，请再检查一遍')
            return
        }

        setLoading(true)
        try {
            await register(username, email, password)
            setUsername('')
            setEmail('')
            setPassword('')
            setConfirmPassword('')
        } catch (err: any) {
            setError(err.message || '注册没有成功，请稍后再试一次')
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
            <div className="ink-wash-blob absolute right-[12%] top-20 h-64 w-64" style={{ backgroundColor: 'rgba(201,160,99,0.16)' }} />
            <div className="ink-wash-blob absolute left-[10%] bottom-12 h-72 w-72" style={{ backgroundColor: 'rgba(140,26,17,0.10)', animationDelay: '-5s' }} />
            <div className="ink-wash-blob absolute right-[45%] top-[45%] h-48 w-48" style={{ backgroundColor: 'rgba(201,160,99,0.08)', animationDelay: '-9s' }} />

            {/* 主内容 */}
            <div className="relative z-10 w-full max-w-md px-6">
                {/* Logo 和标题 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] tracking-[0.28em] mb-4" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: '#ab1f22' }}>
                        注册新账号
                    </div>
                    <div className="float-up w-20 h-20 mx-auto mb-6 rounded-[26px] flex items-center justify-center relative" style={{ '--float-delay': '0.1s', background: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(250,239,236,0.96) 100%)', border: '1px solid rgba(171,31,34,0.12)', boxShadow: '0 18px 32px rgba(26,30,35,0.05)' } as React.CSSProperties}>
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
                        注册后就能保存阅读进度、文章收藏和字词记录
                    </p>
                </div>

                {/* 注册表单 */}
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
                                placeholder="2–20 个字符"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                autoComplete="username"
                                className="gf-input w-full px-4 py-3 rounded-lg text-sm"
                                style={{
                                    fontFamily: '"Noto Serif SC", serif',
                                }}
                                required
                                minLength={2}
                                maxLength={20}
                            />
                        </div>
                        <div>
                            <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                邮箱
                            </label>
                            <input
                                type="email"
                                placeholder="用于找回账号"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoComplete="email"
                                className="gf-input w-full px-4 py-3 rounded-lg text-sm"
                                style={{
                                    fontFamily: '"Noto Serif SC", serif',
                                }}
                                required
                                maxLength={120}
                            />
                        </div>
                        <div>
                            <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                密码
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="至少 6 个字符"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                    className="gf-input w-full px-4 py-3 pr-12 rounded-lg text-sm"
                                    style={{
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
                                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                                    aria-pressed={showPassword}
                                >
                                    {showPassword ? (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            {password.length > 0 && (
                                <div className="mt-2" aria-live="polite">
                                    <div className="flex h-1 gap-1">
                                        {[0, 1, 2].map((i) => (
                                            <div
                                                key={i}
                                                className="flex-1 rounded-full transition-colors"
                                                style={{ backgroundColor: i < strength.score ? strength.color : 'rgba(26,30,35,0.08)' }}
                                            />
                                        ))}
                                    </div>
                                    {strength.label && (
                                        <p className="mt-1 text-[11px]" style={{ color: strength.color }}>
                                            密码强度：{strength.label}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                确认密码
                            </label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    placeholder="再输入一次密码"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    autoComplete="new-password"
                                    className="gf-input w-full px-4 py-3 pr-12 rounded-lg text-sm"
                                    style={{
                                        fontFamily: '"Noto Serif SC", serif',
                                    }}
                                    required
                                    minLength={6}
                                    maxLength={64}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5 transition-colors"
                                    style={{ color: 'rgba(26,30,35,0.4)' }}
                                    aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                                    aria-pressed={showConfirmPassword}
                                >
                                    {showConfirmPassword ? (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            {confirmMismatch && (
                                <p className="mt-1.5 text-[11px]" style={{ color: 'var(--gf-gugong-red)' }}>两次输入的密码不一致</p>
                            )}
                        </div>

                        {error && (
                            <div className="px-4 py-2 rounded-lg text-xs" role="alert" style={{ backgroundColor: 'rgba(171,31,34,0.08)', color: '#ab1f22' }}>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            aria-busy={loading}
                            className="w-full py-3 rounded-lg text-sm text-white transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                            style={{
                                backgroundColor: '#ab1f22',
                                fontFamily: '"Noto Serif SC", serif',
                                fontWeight: 500,
                            }}
                        >
                            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {loading ? '正在注册...' : '注册'}
                        </button>
                    </form>

                    {/* 底部链接 */}
                    <div className="mt-6 text-center space-y-2">
                        <button
                            onClick={onSwitchToLogin}
                            className="text-xs hover:underline transition-colors"
                            style={{ color: '#ab1f22' }}
                        >
                            已有账号？直接登录
                        </button>
                    </div>
                </div>

                {/* 底部装饰 */}
                <div className="mt-8 text-center float-up" style={{ '--float-delay': '0.5s' } as React.CSSProperties}>
                    <p className="text-xs tracking-widest" style={{ color: 'rgba(26,30,35,0.3)', fontFamily: '"Noto Serif SC", serif' }}>
                        从一句古文开始，把阅读慢慢积累下来
                    </p>
                </div>
            </div>
        </div>
    )
}
