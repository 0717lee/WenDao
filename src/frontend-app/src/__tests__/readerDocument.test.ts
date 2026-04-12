import { describe, expect, it } from 'vitest'

import { buildReaderDocument, countLoadedReaderParagraphs, mergeReaderSegmentChunk } from '../lib/readerDocument'
import { computeSyncedScrollTop, shouldLoadMoreReaderContent } from '../lib/readerScroll'
import type { Document } from '../store/useDocumentStore'

describe('readerDocument helpers', () => {
  it('builds reader content state from API payload', () => {
    const document = buildReaderDocument({
      id: 'doc-1',
      title: '论语',
      original_text: '学而时习之',
      punctuated_text: '学而时习之。',
      source_type: 'corpus',
      segments: [
        { index: 0, title: '学而', text: '学而时习之。', line_count: 1, char_count: 6 },
        { index: 1, title: '为政', text: '', line_count: 1, char_count: 6 },
      ],
      reader_content: {
        offset: 0,
        limit: 1,
        returned: 1,
        loaded_segment_count: 1,
        total_segments: 2,
        next_offset: 1,
        has_more: true,
      },
    })

    expect(document.readerContent?.loadedSegmentCount).toBe(1)
    expect(document.segments?.[1].text).toBe('')
  })

  it('merges a lazy-loaded reader chunk into the current document', () => {
    const currentDocument: Document = {
      id: 'doc-1',
      title: '论语',
      originalText: '学而时习之',
      punctuatedText: '学而时习之。',
      translatedText: '',
      sourceType: 'corpus',
      segments: [
        { index: 0, title: '学而', text: '学而时习之。', lineCount: 1, charCount: 6 },
        { index: 1, title: '为政', text: '', lineCount: 1, charCount: 6 },
      ],
      readerContent: {
        offset: 0,
        limit: 1,
        returned: 1,
        loadedSegmentCount: 1,
        totalSegments: 2,
        nextOffset: 1,
        hasMore: true,
      },
    }

    const merged = mergeReaderSegmentChunk(currentDocument, {
      segments: [{ index: 1, title: '为政', text: '为政以德。', line_count: 1, char_count: 5 }],
      original_text: '为政以德',
      punctuated_text: '为政以德。',
      translated_text: '',
      reader_content: {
        offset: 1,
        limit: 1,
        returned: 1,
        loaded_segment_count: 2,
        total_segments: 2,
        next_offset: null,
        has_more: false,
      },
    })

    expect(merged.punctuatedText).toContain('为政以德。')
    expect(merged.segments?.[1].text).toBe('为政以德。')
    expect(merged.readerContent?.hasMore).toBe(false)
  })

  it('counts only paragraphs from loaded segments', () => {
    expect(
      countLoadedReaderParagraphs([
        { index: 0, title: '学而', text: '甲。\n乙。', lineCount: 2 },
        { index: 1, title: '为政', text: '', lineCount: 4 },
        { index: 2, title: '里仁', text: '丙。', lineCount: 1 },
      ]),
    ).toBe(3)
  })
})

describe('readerScroll helpers', () => {
  it('computes a positive synced scrollTop when source has scrolled into later blocks', () => {
    const nextScrollTop = computeSyncedScrollTop({
      sourceMetrics: {
        heights: [120, 160, 180],
        offsets: [0, 120, 280],
        totalHeight: 460,
      },
      targetMetrics: {
        heights: [100, 140, 220],
        offsets: [0, 100, 240],
        totalHeight: 460,
      },
      scrollTop: 320,
    })

    expect(nextScrollTop).toBeGreaterThan(240)
  })

  it('detects when reader content should load more near the bottom', () => {
    expect(
      shouldLoadMoreReaderContent({
        scrollTop: 760,
        clientHeight: 240,
        scrollHeight: 1000,
        hasMore: true,
        isLoading: false,
      }),
    ).toBe(true)
  })
})
