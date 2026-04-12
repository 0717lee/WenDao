import type { ReaderVirtualMetrics } from '../utils/readerSentences'

export function shouldLoadMoreReaderContent(options: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  hasMore: boolean
  isLoading: boolean
  threshold?: number
}) {
  const threshold = options.threshold ?? 240
  if (!options.hasMore || options.isLoading) return false
  return options.scrollHeight - (options.scrollTop + options.clientHeight) <= threshold
}

export function computeSyncedScrollTop(options: {
  sourceMetrics: ReaderVirtualMetrics
  targetMetrics: ReaderVirtualMetrics
  scrollTop: number
}) {
  const sourceOffsets = options.sourceMetrics.offsets
  if (sourceOffsets.length === 0 || options.targetMetrics.offsets.length === 0) return 0

  let blockIndex = 0
  for (let index = 0; index < sourceOffsets.length; index += 1) {
    const nextOffset = sourceOffsets[index + 1] ?? Number.POSITIVE_INFINITY
    if (options.scrollTop >= sourceOffsets[index] && options.scrollTop < nextOffset) {
      blockIndex = index
      break
    }
    if (options.scrollTop >= sourceOffsets[index]) {
      blockIndex = index
    }
  }

  const sourceBlockTop = options.sourceMetrics.offsets[blockIndex] ?? 0
  const sourceBlockHeight = Math.max(1, options.sourceMetrics.heights[blockIndex] ?? 1)
  const progressWithinBlock = Math.max(0, options.scrollTop - sourceBlockTop) / sourceBlockHeight

  const targetBlockTop = options.targetMetrics.offsets[blockIndex] ?? options.targetMetrics.totalHeight
  const targetBlockHeight = Math.max(1, options.targetMetrics.heights[blockIndex] ?? 1)
  return Math.max(0, targetBlockTop + progressWithinBlock * targetBlockHeight)
}
