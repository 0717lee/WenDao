import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

interface ForgotPasswordPageProps {
    onSwitchToLogin: () => void
}

export function ForgotPasswordPage({ onSwitchToLogin }: ForgotPasswordPageProps) {
    const [email, setEmail] = useState('')
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)
    const { forgotPassword } = useAuthStore()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const message = await forgotPassword(email)
            setSuccessMessage(message)
            setSuccess(true)
        } catch (err: any) {
            setError(err.message || '发送失败，请稍后重试')
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
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
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
                        找回密码
                    </p>
                </div>

                {/* 表单 */}
                <div
                    className="rounded-2xl shadow-xl p-8 backdrop-blur-sm"
                    style={{ backgroundColor: 'rgba(247,246,243,0.9)', border: '1px solid rgba(26,30,35,0.08)' }}
                >
                    {success ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}>
                                <svg className="w-8 h-8" style={{ color: '#22c55e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg mb-2" style={{ fontFamily: '"Noto Serif SC", serif', color: '#1a1e23' }}>
                                    请求已提交
                                </h3>
                                <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                    {successMessage || '如果该邮箱已注册，我们会向您发送重置密码指引。'}
                                </p>
                            </div>
                            <button
                                onClick={onSwitchToLogin}
                                className="w-full py-3 rounded-lg text-sm text-white transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                                style={{
                                    backgroundColor: '#ab1f22',
                                    fontFamily: '"Noto Serif SC", serif',
                                    fontWeight: 500,
                                }}
                            >
                                返回登录
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs mb-2 tracking-wide" style={{ color: 'rgba(26,30,35,0.6)', fontFamily: '"Noto Serif SC", serif' }}>
                                    邮箱地址
                                </label>
                                <input
                                    type="email"
                                    placeholder="请输入注册时使用的邮箱"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg text-sm border outline-none focus:ring-2 transition-all"
                                    style={{
                                        borderColor: 'rgba(26,30,35,0.12)',
                                        backgroundColor: '#fff',
                                        fontFamily: '"Noto Serif SC", serif',
                                    }}
                                    required
                                />
                            </div>

                            <div className="px-4 py-3 rounded-lg text-xs leading-relaxed" style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'rgba(26,30,35,0.6)' }}>
                                <p className="mb-1">提示：</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>请确保邮箱地址正确</li>
                                    <li>邮件可能需要几分钟才能送达</li>
                                    <li>请检查垃圾邮件文件夹</li>
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
                                style={{
                                    backgroundColor: '#ab1f22',
                                    fontFamily: '"Noto Serif SC", serif',
                                    fontWeight: 500,
                                }}
                            >
                                {loading ? '发送中...' : '发送重置链接'}
                            </button>
                        </form>
                    )}

                    {/* 底部链接 */}
                    {!success && (
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

                {/* 底部装饰 */}
                <div className="mt-8 text-center">
                    <p className="text-xs tracking-widest" style={{ color: 'rgba(26,30,35,0.3)', fontFamily: '"Noto Serif SC", serif' }}>
                        探索古籍智慧 · 传承千年文化
                    </p>
                </div>
            </div>
        </div>
    )
}
