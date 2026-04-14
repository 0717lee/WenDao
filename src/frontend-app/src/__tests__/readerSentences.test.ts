import { describe, expect, it } from 'vitest'
import { buildReaderBlocks, buildReaderParagraphs, getReaderVisibleRange, buildReaderVirtualMetrics } from '../utils/readerSentences'
import type { Document } from '../store/useDocumentStore'

function makeDocument(paragraphCount: number): Document {
  const lines = Array.from({ length: paragraphCount }, (_, index) => `第${index + 1}段内容`);
  return {
    id: 'doc-perf',
    title: '性能测试文档',
    originalText: lines.join('\n'),
    punctuatedText: lines.map((line) => `${line}。`).join('\n'),
    translatedText: lines.map((line) => `${line} 的解释`).join('\n'),
  }
}

describe('readerSentences performance helpers', () => {
  it('groups large paragraph lists into fewer reader blocks', () => {
    const paragraphs = buildReaderParagraphs(makeDocument(120))
    const blocks = buildReaderBlocks(paragraphs)

    expect(paragraphs).toHaveLength(120)
    expect(blocks.length).toBeLessThan(120)
    expect(blocks[0].startParagraphIndex).toBe(0)
    expect(blocks.at(-1)?.endParagraphIndex).toBe(119)
  })

  it('calculates a bounded visible range for virtual rendering', () => {
    const blocks = buildReaderBlocks(buildReaderParagraphs(makeDocument(240)))
    const metrics = buildReaderVirtualMetrics(blocks, 'punctuated')
    const range = getReaderVisibleRange(metrics, 0, 900, 4)

    expect(range.start).toBe(0)
    expect(range.end).toBeGreaterThan(0)
    expect(range.end).toBeLessThan(blocks.length)
  })

  it('derives corpus original paragraphs from punctuated text to keep script and line breaks aligned', () => {
    const paragraphs = buildReaderParagraphs({
      id: 'doc-corpus',
      title: '论语',
      sourceType: 'corpus',
      originalText: '學而時習之\n舊底稿',
      punctuatedText: '学而时习之。\n人不知而不愠。',
      translatedText: '',
    })

    expect(paragraphs[0].original).toBe('学而时习之')
    expect(paragraphs[1].original).toBe('人不知而不愠')
  })
})
