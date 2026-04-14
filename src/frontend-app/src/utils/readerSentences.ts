import type { Document } from '../store/useDocumentStore'

const SENTENCE_ENDERS = new Set(['。', '！', '？', '；'])
const READER_PUNCTUATION = /[，。！？；：“”‘’「」『』（）()《》〈〉【】〔〕—…·,.!?:;"'\-\s]/g
const BLOCK_TARGET_CHARS = 360
const BLOCK_MAX_PARAGRAPHS = 12
const ESTIMATED_LINE_HEIGHT = 34
const ESTIMATED_BLOCK_PADDING = 28

export type ReaderColumn = 'original' | 'punctuated' | 'translated'

export interface ReaderSentence {
  id: string
  paragraphIndex: number
  sentenceIndex: number
  original: string
  punctuated: string
  context: string
}

export interface ReaderParagraph {
  id: string
  paragraphIndex: number
  original: string
  punctuated: string
  translated: string
}

export interface ReaderBlock {
  id: string
  startParagraphIndex: number
  endParagraphIndex: number
  original: string
  punctuated: string
  translated: string
}

export interface ReaderVirtualMetrics {
  heights: number[]
  offsets: number[]
  totalHeight: number
}

function splitParagraphs(text: string | undefined) {
  return (text ?? '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function stripReaderPunctuation(text: string) {
  return text.replace(READER_PUNCTUATION, '')
}

function splitSentencePair(
  punctuatedParagraph: string,
  originalParagraph: string,
  paragraphIndex: number,
  context: string,
): ReaderSentence[] {
  const sentences: ReaderSentence[] = []
  let punctuatedBuffer = ''
  let originalBuffer = ''
  let originalCursor = 0

  for (const char of punctuatedParagraph) {
    punctuatedBuffer += char
    if (!READER_PUNCTUATION.test(char)) {
      const nextOriginalChar = originalParagraph[originalCursor] ?? char
      originalBuffer += nextOriginalChar
      originalCursor += 1
    }
    READER_PUNCTUATION.lastIndex = 0

    if (SENTENCE_ENDERS.has(char)) {
      const punctuated = punctuatedBuffer.trim()
      const original = originalBuffer.trim()
      if (punctuated || original) {
        sentences.push({
          id: `paragraph-${paragraphIndex}-sentence-${sentences.length}`,
          paragraphIndex,
          sentenceIndex: sentences.length,
          original,
          punctuated,
          context,
        })
      }
      punctuatedBuffer = ''
      originalBuffer = ''
    }
  }

  const punctuated = punctuatedBuffer.trim()
  const original = originalBuffer.trim()
  if (punctuated || original) {
    sentences.push({
      id: `paragraph-${paragraphIndex}-sentence-${sentences.length}`,
      paragraphIndex,
      sentenceIndex: sentences.length,
      original,
      punctuated,
      context,
    })
  }

  if (sentences.length > 0) {
    return sentences
  }

  return [
    {
      id: `paragraph-${paragraphIndex}-sentence-0`,
      paragraphIndex,
      sentenceIndex: 0,
      original: originalParagraph.trim(),
      punctuated: punctuatedParagraph.trim(),
      context,
    },
  ]
}

export function buildReaderParagraphs(document: Document): ReaderParagraph[] {
  const punctuatedParagraphs = splitParagraphs(document.punctuatedText || document.originalText)
  const originalParagraphs = splitParagraphs(document.originalText)
  const translatedParagraphs = splitParagraphs(document.translatedText)
  const usePunctuatedAsSource = document.sourceType === 'corpus'

  return punctuatedParagraphs.map((punctuatedParagraph, paragraphIndex) => {
    const originalParagraph =
      usePunctuatedAsSource
        ? stripReaderPunctuation(punctuatedParagraph)
        : (originalParagraphs[paragraphIndex] ?? stripReaderPunctuation(punctuatedParagraph))
    const translatedParagraph = translatedParagraphs[paragraphIndex] ?? ''

    return {
      id: `paragraph-${paragraphIndex}`,
      paragraphIndex,
      original: originalParagraph,
      punctuated: punctuatedParagraph,
      translated: translatedParagraph,
    }
  })
}

export function buildReaderBlocks(paragraphs: ReaderParagraph[]): ReaderBlock[] {
  if (paragraphs.length === 0) return []

  const blocks: ReaderBlock[] = []
  let currentBlock: ReaderParagraph[] = []
  let currentCharCount = 0

  const pushBlock = () => {
    if (currentBlock.length === 0) return
    blocks.push({
      id: `block-${blocks.length}`,
      startParagraphIndex: currentBlock[0].paragraphIndex,
      endParagraphIndex: currentBlock[currentBlock.length - 1].paragraphIndex,
      original: currentBlock.map((item) => item.original).join('\n'),
      punctuated: currentBlock.map((item) => item.punctuated).join('\n'),
      translated: currentBlock.map((item) => item.translated).filter(Boolean).join('\n'),
    })
    currentBlock = []
    currentCharCount = 0
  }

  paragraphs.forEach((paragraph) => {
    currentBlock.push(paragraph)
    currentCharCount += Math.max(paragraph.punctuated.length, paragraph.original.length, paragraph.translated.length)
    if (currentCharCount >= BLOCK_TARGET_CHARS || currentBlock.length >= BLOCK_MAX_PARAGRAPHS) {
      pushBlock()
    }
  })

  pushBlock()
  return blocks
}

export function splitReaderBlockSentences(block: ReaderBlock): ReaderSentence[] {
  return splitSentencePair(
    block.punctuated,
    block.original,
    block.startParagraphIndex,
    block.punctuated,
  )
}

function estimateTextLines(text: string, charsPerLine: number) {
  return (text || '')
    .split('\n')
    .filter(Boolean)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

function estimateBlockHeight(block: ReaderBlock, column: ReaderColumn) {
  const text =
    column === 'original'
      ? block.original
      : column === 'punctuated'
        ? block.punctuated
        : block.translated

  if (!text.trim()) {
    return ESTIMATED_BLOCK_PADDING + ESTIMATED_LINE_HEIGHT
  }

  const charsPerLine = column === 'translated' ? 30 : 24
  const lines = estimateTextLines(text, charsPerLine)
  return ESTIMATED_BLOCK_PADDING + lines * ESTIMATED_LINE_HEIGHT
}

export function buildReaderVirtualMetrics(blocks: ReaderBlock[], column: ReaderColumn): ReaderVirtualMetrics {
  const heights = blocks.map((block) => estimateBlockHeight(block, column))
  const offsets: number[] = []
  let totalHeight = 0

  heights.forEach((height) => {
    offsets.push(totalHeight)
    totalHeight += height
  })

  return { heights, offsets, totalHeight }
}

function upperBound(offsets: number[], value: number) {
  let low = 0
  let high = offsets.length

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (offsets[mid] <= value) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

export function getReaderVisibleRange(
  metrics: ReaderVirtualMetrics,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
) {
  if (metrics.offsets.length === 0) {
    return { start: 0, end: 0 }
  }

  const topIndex = Math.max(0, upperBound(metrics.offsets, scrollTop) - 1)
  const bottomOffset = scrollTop + viewportHeight
  const bottomIndex = Math.min(metrics.offsets.length - 1, Math.max(0, upperBound(metrics.offsets, bottomOffset) - 1))

  return {
    start: Math.max(0, topIndex - overscan),
    end: Math.min(metrics.offsets.length, bottomIndex + overscan + 1),
  }
}

export function findReaderBlockIndexForParagraph(blocks: ReaderBlock[], paragraphIndex: number | null | undefined) {
  if (paragraphIndex == null || paragraphIndex < 0) return -1
  return blocks.findIndex(
    (block) => paragraphIndex >= block.startParagraphIndex && paragraphIndex <= block.endParagraphIndex,
  )
}

export function findReaderBlockIndexForAnchor(blocks: ReaderBlock[], anchorText: string) {
  if (!anchorText.trim()) return -1
  return blocks.findIndex(
    (block) => block.punctuated.includes(anchorText) || block.original.includes(anchorText),
  )
}
