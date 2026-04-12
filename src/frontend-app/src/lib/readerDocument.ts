import type { Document, DocumentSegment, ReaderContentState } from '../store/useDocumentStore'

function joinTextBlocks(existing: string | undefined, incoming: string | undefined) {
  const left = (existing ?? '').trim()
  const right = (incoming ?? '').trim()
  if (!left) return right
  if (!right) return left
  return `${left}\n\n${right}`
}

function normalizeReaderContentState(value: any): ReaderContentState | undefined {
  if (!value || typeof value !== 'object') return undefined

  const nextOffsetRaw = value.next_offset ?? value.nextOffset
  return {
    offset: Number(value.offset ?? 0) || 0,
    limit: Number(value.limit ?? 0) || 0,
    returned: Number(value.returned ?? 0) || 0,
    loadedSegmentCount: Number(value.loaded_segment_count ?? value.loadedSegmentCount ?? 0) || 0,
    totalSegments: Number(value.total_segments ?? value.totalSegments ?? 0) || 0,
    nextOffset: typeof nextOffsetRaw === 'number' ? nextOffsetRaw : (nextOffsetRaw == null ? null : Number(nextOffsetRaw)),
    hasMore: Boolean(value.has_more ?? value.hasMore),
  }
}

export function normalizeDocumentSegments(segments: any[] | undefined): DocumentSegment[] | undefined {
  if (!Array.isArray(segments)) return undefined
  return segments.map((segment: any, index: number) => ({
    index: segment.index ?? index,
    title: segment.title ?? '',
    text: segment.text ?? '',
    excerpt: segment.excerpt ?? undefined,
    summary: segment.summary ?? undefined,
    charCount: segment.char_count ?? segment.charCount ?? undefined,
    lineCount: segment.line_count ?? segment.lineCount ?? undefined,
  }))
}

export function buildReaderDocument(data: any): Document {
  return {
    id: data.id,
    title: data.title,
    author: data.author ?? undefined,
    dynasty: data.dynasty ?? undefined,
    category: data.category ?? undefined,
    sourceName: data.source_name ?? data.sourceName ?? undefined,
    sourceUrl: data.source_url ?? data.sourceUrl ?? undefined,
    chapterTitles: data.chapter_titles ?? data.chapterTitles ?? undefined,
    chapterCount: data.chapter_count ?? data.chapterCount ?? undefined,
    featuredExcerpt: data.featured_excerpt ?? data.featuredExcerpt ?? undefined,
    difficulty: data.difficulty ?? undefined,
    guideSummary: data.guide_summary ?? data.guideSummary ?? undefined,
    readingTip: data.reading_tip ?? data.readingTip ?? undefined,
    recommendedChapters: data.recommended_chapters ?? data.recommendedChapters ?? undefined,
    segmentGuides: data.segment_guides ?? data.segmentGuides ?? undefined,
    segments: normalizeDocumentSegments(data.segments),
    translationCache: data.translation_cache ?? data.translationCache ?? undefined,
    translationStatus: data.translation_status ?? data.translationStatus ?? undefined,
    readerContent: normalizeReaderContentState(data.reader_content ?? data.readerContent),
    originalText: data.original_text ?? data.originalText ?? '',
    punctuatedText: data.punctuated_text ?? data.punctuatedText ?? '',
    translatedText: data.translated_text ?? data.translatedText ?? '',
    confidence: data.ocr_confidence ?? data.confidence,
    imageUrl: data.image_data ?? data.imageUrl ?? undefined,
    sourceType: data.source_type ?? data.sourceType ?? 'user',
  }
}

export function mergeReaderSegmentChunk(document: Document, payload: any): Partial<Document> {
  const incomingSegments = normalizeDocumentSegments(payload.segments) ?? []
  const mergedSegments = [...(document.segments ?? [])]

  incomingSegments.forEach((segment) => {
    const existingIndex = mergedSegments.findIndex((item) => item.index === segment.index)
    if (existingIndex >= 0) {
      mergedSegments[existingIndex] = { ...mergedSegments[existingIndex], ...segment }
      return
    }
    mergedSegments.push(segment)
  })

  mergedSegments.sort((left, right) => left.index - right.index)

  return {
    segments: mergedSegments,
    originalText: joinTextBlocks(document.originalText, payload.original_text ?? payload.originalText),
    punctuatedText: joinTextBlocks(document.punctuatedText, payload.punctuated_text ?? payload.punctuatedText),
    translatedText: joinTextBlocks(document.translatedText, payload.translated_text ?? payload.translatedText),
    readerContent: normalizeReaderContentState(payload.reader_content ?? payload.readerContent) ?? document.readerContent,
  }
}

export function countLoadedReaderParagraphs(segments: DocumentSegment[] | undefined) {
  if (!segments || segments.length === 0) return 0
  return segments.reduce((total, segment) => {
    if (!segment.text?.trim()) return total
    if (typeof segment.lineCount === 'number' && Number.isFinite(segment.lineCount)) {
      return total + Math.max(0, segment.lineCount)
    }
    return total + segment.text.split(/\n+/).map((line) => line.trim()).filter(Boolean).length
  }, 0)
}

export function countTotalReaderParagraphs(segments: DocumentSegment[] | undefined) {
  if (!segments || segments.length === 0) return 0
  return segments.reduce((total, segment) => {
    if (typeof segment.lineCount === 'number' && Number.isFinite(segment.lineCount)) {
      return total + Math.max(0, segment.lineCount)
    }
    if (!segment.text?.trim()) return total
    return total + segment.text.split(/\n+/).map((line) => line.trim()).filter(Boolean).length
  }, 0)
}
