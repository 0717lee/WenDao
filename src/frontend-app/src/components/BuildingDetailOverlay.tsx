import { useStore } from '../store/useStore';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../data/buildingCatalog';

export function BuildingDetailOverlay() {
  const activeBuilding = useStore((s) => s.activeBuilding);
  const leftDrawerOpen = useStore((s) => s.leftDrawerOpen);

  if (!activeBuilding || !activeBuilding.features || leftDrawerOpen) return null;

  const catColor = CATEGORY_COLORS[activeBuilding.category];

  return (
    <div className="absolute top-28 left-8 z-20 w-64 bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-500 animate-[fadeIn_0.5s_ease-out]">
      {/* 分类标签 */}
      <div className="px-5 pt-4 pb-2">
        <span
          className="inline-block text-[10px] px-2 py-0.5 rounded-full tracking-wider"
          style={{
            backgroundColor: catColor + '15',
            color: catColor,
            fontFamily: '"Noto Serif SC", serif',
          }}
        >
          {CATEGORY_LABELS[activeBuilding.category]}
        </span>
      </div>

      {/* 建筑名 */}
      <div className="px-5 pb-2">
        <h2
          className="text-2xl font-bold text-[#1a1e23] leading-tight"
          style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}
        >
          {activeBuilding.label}
        </h2>
        {activeBuilding.dynasty && (
          <p
            className="text-xs text-[#1a1e23]/40 mt-1 tracking-wider"
            style={{ fontFamily: '"Noto Serif SC", serif' }}
          >
            {activeBuilding.dynasty}
          </p>
        )}
        {activeBuilding.style && (
          <p
            className="text-xs text-[#ab1f22]/70 mt-0.5 tracking-wider"
            style={{ fontFamily: '"Noto Serif SC", serif' }}
          >
            {activeBuilding.style}
          </p>
        )}
      </div>

      {/* 特征列表 */}
      <div className="px-5 pb-4 pt-1">
        <div className="space-y-1">
          {activeBuilding.features.map((feat, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-[#1a1e23]/60"
              style={{ fontFamily: '"Noto Serif SC", serif' }}
            >
              <span className="w-1 h-1 rounded-full bg-[#ab1f22]/40 mt-1.5 flex-shrink-0" />
              {feat}
            </div>
          ))}
        </div>
      </div>

      {/* 底部描述 */}
      <div className="bg-white/40 px-5 py-3 text-[11px] text-[#1a1e23]/50 leading-relaxed" style={{ fontFamily: '"Noto Serif SC", serif' }}>
        {activeBuilding.description}
      </div>
    </div>
  );
}
