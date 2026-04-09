interface TocEntry {
  title: string
  displayTitle?: string
  excerpt?: string
  summary?: string
}

interface ReaderTocPanelProps {
  entries: TocEntry[]
  selectedTitle: string | null
  onSelect: (entry: TocEntry) => void
}

export function ReaderTocPanel({ entries, selectedTitle, onSelect }: ReaderTocPanelProps) {
  return (
    <div className="p-4 space-y-3">
      <div>
        <div className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
          目录导航
        </div>
        <p className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.48)' }}>
          按章节快速跳读，适合查找原段落或课堂演示时使用。
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl px-4 py-4 text-sm" style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'rgba(26,30,35,0.45)' }}>
          这篇内容暂时还没有可用目录。
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => {
            const active = selectedTitle === (entry.displayTitle ?? entry.title)
            return (
              <button
                key={`${entry.title}-${index}`}
                onClick={() => onSelect(entry)}
                className="w-full rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  backgroundColor: active ? 'rgba(140,26,17,0.08)' : 'rgba(255,255,255,0.76)',
                  color: active ? 'var(--gf-gugong-red)' : 'var(--gf-text)',
                  border: '1px solid rgba(26,30,35,0.06)',
                }}
              >
                <div className="text-sm font-medium">{entry.displayTitle ?? entry.title}</div>
                {entry.excerpt && (
                  <div className="mt-1 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    {entry.excerpt}
                  </div>
                )}
                {entry.summary && (
                  <div className="mt-1 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    {entry.summary}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
