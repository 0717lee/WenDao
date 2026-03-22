import { BookOpen } from 'lucide-react'

interface CitationCardProps {
    title: string
    source: string
}

export function CitationCard({ title, source }: CitationCardProps) {
    return (
        <div
            className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 mt-2"
            style={{ backgroundColor: 'rgba(244,241,225,0.6)', color: 'rgba(26,30,35,0.6)', border: '1px solid rgba(26,30,35,0.06)' }}
        >
            <BookOpen className="w-4 h-4 flex-shrink-0" />
            <span>{title} / {source}</span>
        </div>
    )
}
