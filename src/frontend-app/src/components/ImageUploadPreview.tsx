import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface ImageUploadPreviewProps {
    file: File
    onCancel: () => void
}

export function ImageUploadPreview({ file, onCancel }: ImageUploadPreviewProps) {
    const [preview, setPreview] = useState<string>('')

    useEffect(() => {
        const reader = new FileReader()
        reader.onloadend = () => {
            setPreview(reader.result as string)
        }
        reader.readAsDataURL(file)
        return () => reader.abort()
    }, [file])

    return (
        <div
            className="flex items-center gap-3 mx-4 mt-2 px-3 py-2 rounded-lg"
            style={{
                backgroundColor: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(26,30,35,0.1)',
            }}
        >
            {preview && (
                <img
                    src={preview}
                    alt="预览"
                    className="w-12 h-12 rounded-md object-cover"
                    style={{ border: '1px solid rgba(26,30,35,0.08)' }}
                />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-xs truncate" style={{ color: 'var(--gf-text)' }}>
                    {file.name}
                </p>
                <p className="text-[10px]" style={{ color: 'rgba(26,30,35,0.4)' }}>
                    {(file.size / 1024).toFixed(0)} KB
                </p>
            </div>
            <button
                onClick={onCancel}
                className="flex items-center justify-center w-6 h-6 rounded-full transition-colors hover:bg-black/5"
                style={{ color: 'rgba(26,30,35,0.4)' }}
                title="取消"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
