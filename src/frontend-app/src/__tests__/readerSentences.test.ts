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
})
