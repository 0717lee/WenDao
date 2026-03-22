import { useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  BUILDING_CATALOG,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type BuildingCategory,
  type BuildingEntry,
} from '../data/buildingCatalog';

const ALL_CATEGORIES: Array<'all' | BuildingCategory> = [
  'all', 'palace', 'tower', 'bridge', 'courtyard', 'garden', 'temple', 'component',
];

export function BuildingGallery() {
  const activeBuilding = useStore((s) => s.activeBuilding);
  const setActiveBuilding = useStore((s) => s.setActiveBuilding);
  const galleryFilter = useStore((s) => s.galleryFilter);
  const setGalleryFilter = useStore((s) => s.setGalleryFilter);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 初始化：设置第一个建筑为默认选中
  useEffect(() => {
    if (!activeBuilding && BUILDING_CATALOG.length > 0) {
      setActiveBuilding(BUILDING_CATALOG[0]);
    }
  }, [activeBuilding, setActiveBuilding]);

  const filtered = galleryFilter === 'all'
    ? BUILDING_CATALOG
    : BUILDING_CATALOG.filter((b) => b.category === galleryFilter);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      {/* 底部渐变遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-white/20 to-transparent pointer-events-none" />

      <div className="relative px-6 pb-5 pt-3">
        {/* 分类筛选 */}
        <div className="flex gap-2 mb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {ALL_CATEGORIES.map((cat) => {
            const isActive = galleryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setGalleryFilter(cat)}
                className={`
                  flex-shrink-0 px-3 py-1.5 rounded-lg text-xs tracking-wider transition-all duration-300
                  backdrop-blur-md border
                  ${isActive
                    ? 'bg-[#ab1f22]/90 text-white border-[#ab1f22]/50 shadow-md'
                    : 'bg-white/50 text-[#1a1e23]/60 border-white/60 hover:bg-white/80'
                  }
                `}
                style={{ fontFamily: '"Noto Serif SC", serif' }}
              >
                {cat === 'all' ? '全部' : CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>

        {/* 建筑卡片横向滚动 */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-1 cursor-grab active:cursor-grabbing"
          style={{
            scrollbarWidth: 'none',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
          onMouseDown={(e) => {
            // 只在滚动容器本身（非子元素）上触发拖动
            if (e.target !== e.currentTarget) return;

            // 阻止事件冒泡，避免触发 OrbitControls
            e.stopPropagation();

            const ele = e.currentTarget;
            const startX = e.pageX - ele.offsetLeft;
            const scrollLeft = ele.scrollLeft;

            const handleMouseMove = (e: MouseEvent) => {
              e.stopPropagation();
              const x = e.pageX - ele.offsetLeft;
              const walk = (x - startX) * 2;
              ele.scrollLeft = scrollLeft - walk;
            };

            const handleMouseUp = (e: MouseEvent) => {
              e.stopPropagation();
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          {filtered.map((building) => (
            <BuildingCard
              key={building.id}
              building={building}
              isActive={activeBuilding?.id === building.id}
              onClick={() => setActiveBuilding(building)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildingCard({
  building,
  isActive,
  onClick,
}: {
  building: BuildingEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  const catColor = CATEGORY_COLORS[building.category];

  return (
    <button
      onClick={(e) => {
        onClick();
      }}
      className={`
        flex-shrink-0 w-40 rounded-xl text-left transition-all duration-300
        backdrop-blur-md border overflow-hidden
        ${isActive
          ? 'bg-white/70 border-[#ab1f22]/30 shadow-lg shadow-[#ab1f22]/10 scale-[1.02]'
          : 'bg-white/40 border-white/60 hover:bg-white/60 hover:shadow-md'
        }
      `}
      style={{ scrollSnapAlign: 'start' }}
    >
      {/* 顶部分类色条 */}
      <div className="h-1 w-full" style={{ backgroundColor: catColor }} />

      <div className="px-3 py-2.5">
        {/* 分类标签 */}
        <span
          className="inline-block text-[9px] px-1.5 py-0.5 rounded tracking-wider mb-1.5"
          style={{
            backgroundColor: catColor + '15',
            color: catColor,
            fontFamily: '"Noto Serif SC", serif',
          }}
        >
          {CATEGORY_LABELS[building.category]}
        </span>

        {/* 建筑名 */}
        <div
          className="text-base font-bold text-[#1a1e23] leading-tight mb-0.5"
          style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}
        >
          {building.label}
        </div>

        {/* 副标题 */}
        <div
          className="text-[10px] text-[#1a1e23]/40 leading-tight truncate"
          style={{ fontFamily: '"Noto Serif SC", serif' }}
        >
          {building.subtitle}
        </div>
      </div>
    </button>
  );
}
