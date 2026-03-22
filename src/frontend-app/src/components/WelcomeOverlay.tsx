import { useState } from 'react';

/**
 * Welcome overlay — 文化叙事风格入口
 */
export function WelcomeOverlay() {
    const [visible, setVisible] = useState(true);
    const [fading, setFading] = useState(false);

    const handleEnter = () => {
        setFading(true);
        setTimeout(() => setVisible(false), 800);
    };

    if (!visible) return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-700 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            style={{ background: 'radial-gradient(ellipse at center, rgba(255,252,245,0.98) 0%, rgba(240,232,218,0.99) 100%)' }}
        >
            {/* Decorative top line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#ab1f22] to-transparent opacity-60" />

            {/* Main content */}
            <div className="flex flex-col items-center gap-6 animate-[fadeInUp_1s_ease-out]">
                {/* Logo mark */}
                <div className="w-16 h-16 rounded-full border-2 border-[#ab1f22]/30 flex items-center justify-center mb-2">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ab1f22" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
                        <path d="M9 9h.01M15 9h.01" />
                    </svg>
                </div>

                {/* Title */}
                <h1
                    className="text-5xl md:text-7xl tracking-[0.15em]"
                    style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: '#1a1e23' }}
                >
                    <span className="text-[#ab1f22]">Arch</span>Twin
                </h1>

                {/* Subtitle */}
                <p
                    className="text-base md:text-lg tracking-[0.5em] text-[#1a1e23]/50"
                    style={{ fontFamily: '"Noto Serif SC", serif' }}
                >
                    {"观 木 知 微".split("").map((ch, i) => (
                        <span
                            key={i}
                            className="inline-block animate-[fadeIn_0.5s_ease-out_forwards] opacity-0"
                            style={{ animationDelay: `${0.8 + i * 0.1}s` }}
                        >
                            {ch}
                        </span>
                    ))}
                </p>

                {/* Divider */}
                <div className="flex items-center gap-3 my-2">
                    <div className="w-12 h-px bg-[#ab1f22]/30" />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#ab1f22]/40" />
                    <div className="w-12 h-px bg-[#ab1f22]/30" />
                </div>

                {/* Cultural tagline */}
                <p
                    className="text-sm tracking-[0.4em] text-[#1a1e23]/50 animate-[fadeIn_1s_ease-out_1.5s_forwards] opacity-0"
                    style={{ fontFamily: '"Noto Serif SC", serif' }}
                >
                    千 年 营 造 · 寸 木 见 微
                </p>

                {/* Poetic description */}
                <p
                    className="text-xs text-[#1a1e23]/35 tracking-[0.2em] max-w-sm text-center leading-relaxed animate-[fadeIn_1s_ease-out_2s_forwards] opacity-0"
                    style={{ fontFamily: '"Noto Serif SC", serif' }}
                >
                    以数字孪生之法，重现华夏营造之美
                </p>

                {/* Enter button */}
                <button
                    onClick={handleEnter}
                    className="mt-8 group flex items-center gap-2 px-8 py-3 rounded-full bg-[#1a1e23] text-white text-sm tracking-[0.2em] transition-all duration-500 hover:bg-[#ab1f22] hover:shadow-lg hover:shadow-[#ab1f22]/20 hover:-translate-y-0.5 animate-[fadeIn_1s_ease-out_2.5s_forwards] opacity-0"
                    style={{ fontFamily: '"Noto Serif SC", serif' }}
                >
                    <span>步入殿堂</span>
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </button>
            </div>


            {/* Decorative bottom line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#ab1f22] to-transparent opacity-60" />
        </div>
    );
}
