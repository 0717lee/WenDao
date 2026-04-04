import type { Document } from '../store/useDocumentStore'

const SENTENCE_ENDERS = new Set(['。', '！', '？', '；'])
const READER_PUNCTUATION = /[，。！？；：“”‘’「」『』（）()《》〈〉【】〔〕—…·,.!?:;"'\-\s]/g

export interface ReaderSentence {
  id: string
  paragraphIndex: number
  sentenceIndex: number
  original: string
  punctuated: string
}

export interface ReaderParagraph {
  id: string
  paragraphIndex: number
  original: string
  punctuated: string
  translated: string
  sentences: ReaderSentence[]
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

function splitSentencePair(punctuatedParagraph: string, originalParagraph: string, paragraphIndex: number): ReaderSentence[] {
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
    },
  ]
}

export function buildReaderParagraphs(document: Document): ReaderParagraph[] {
  const punctuatedParagraphs = splitParagraphs(document.punctuatedText || document.originalText)
  const originalParagraphs = splitParagraphs(document.originalText)
  const translatedParagraphs = splitParagraphs(document.translatedText)

  return punctuatedParagraphs.map((punctuatedParagraph, paragraphIndex) => {
    const originalParagraph =
      originalParagraphs[paragraphIndex] ??
      stripReaderPunctuation(punctuatedParagraph)
    const translatedParagraph = translatedParagraphs[paragraphIndex] ?? ''

    return {
      id: `paragraph-${paragraphIndex}`,
      paragraphIndex,
      original: originalParagraph,
      punctuated: punctuatedParagraph,
      translated: translatedParagraph,
      sentences: splitSentencePair(punctuatedParagraph, originalParagraph, paragraphIndex),
    }
  })
}
