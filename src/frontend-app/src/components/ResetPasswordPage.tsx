import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

interface ResetPasswordPageProps {
    token: string
    onSwitchToLogin: () => void
}

export function ResetPasswordPage({ token, onSwitchToLogin }: ResetPasswordPageProps) {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const { resetPassword } = useAuthStore()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致')
            return
        }

        setLoading(true)
        try {
            const message = await resetPassword(token, password)
            setSuccessMessage(message)
        } catch (err: any) {
            setError(err.message || '重置失败，请重新申请链接')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full h-screen flex items-center justify-center relative overflow-hidden" style={{ backgroundColor: 'var(--gf-bg-paper)' }}>
            <div className="absolute inset-0 bg-xuan-paper opacity-40" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ab1f22] to-transparent opacity-30" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ab1f22] to-transparent opacity-30" />

            <div className="relative z-10 w-full max-w-md px-6">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center relative" style={{ backgroundColor: 'rgba(171,31,34,0.08)' }}>
                        <svg className="w-10 h-10" style={{ color: '#ab1f22' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m6-8a6 6 0 10-12 0v3a2 2 0 01-.586 1.414l-.707.707A1 1 0 005.414 16H18.586a1 1 0 00.707-1.707l-.707-.707A2 2 0 0118 12V9z" />
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
                        重置密码
                    </p>
                </div>

                <div
                    className="rounded-2xl shadow-xl p-8 backdrop-blur-sm"
                    style={{ backgroundColor: 'rgba(247,246,243,0.9)', border: '1px solid rgba(26,30,35,0.08)' }}
                >
                    {successMessage ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}>
                                <svg className="w-8 h-8" style={{ color: '#22c55e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg mb-2" style={{ fontFamily: '"Noto Serif SC", serif', color: '#1a1e23' }}>
                                    修改成功
                                </h3>
                                <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                    {successMessage}
                                </p>
                            </div>
                            <button
                                onClick={onSwitchToLogin}
                                className="w-full py-3 rounded-lg text-sm text-white transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                                style={{ backgroundColor: '#ab1f22', fontFamily: '"Noto Serif SC", serif', fontWeight: 500 }}
                            >
                                返回登录
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                    新密码
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="请输入新密码（至少6个字符）"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 pr-12 rounded-lg text-sm border outline-none focus:ring-2 transition-all"
                                        style={{ borderColor: 'rgba(26,30,35,0.12)', backgroundColor: '#fff', fontFamily: '"Noto Serif SC", serif' }}
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
                                        {showPassword ? '藏' : '显'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                    确认新密码
                                </label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        placeholder="请再次输入新密码"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        className="w-full px-4 py-3 pr-12 rounded-lg text-sm border outline-none focus:ring-2 transition-all"
                                        style={{ borderColor: 'rgba(26,30,35,0.12)', backgroundColor: '#fff', fontFamily: '"Noto Serif SC", serif' }}
                                        required
                                        minLength={6}
                                        maxLength={64}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5 transition-colors"
                                        style={{ color: 'rgba(26,30,35,0.4)' }}
                                    >
                                        {showConfirmPassword ? '藏' : '显'}
                                    </button>
                                </div>
                            </div>

                            <div className="px-4 py-3 rounded-lg text-xs leading-relaxed" style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'rgba(26,30,35,0.6)' }}>
                                <p className="mb-1">提示：</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>重置链接默认 30 分钟内有效</li>
                                    <li>新密码建议同时包含字母和数字</li>
                                </ul>
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
                                style={{ backgroundColor: '#ab1f22', fontFamily: '"Noto Serif SC", serif', fontWeight: 500 }}
                            >
                                {loading ? '提交中...' : '确认重置密码'}
                            </button>
                        </form>
                    )}

                    {!successMessage && (
                        <div className="mt-6 text-center space-y-2">
                            <button
                                onClick={onSwitchToLogin}
                                className="text-xs hover:underline transition-colors"
                                style={{ color: '#ab1f22' }}
                            >
                                返回登录
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-8 text-center">
                    <p className="text-xs tracking-widest" style={{ color: 'rgba(26,30,35,0.3)', fontFamily: '"Noto Serif SC", serif' }}>
                        探索古籍智慧 · 传承千年文化
                    </p>
                </div>
            </div>
        </div>
    )
}
