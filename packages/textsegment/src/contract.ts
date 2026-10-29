// Generated from crates/flight-textsegment/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { disableTextSegmentGuards, enableTextSegmentGuards } from './enableTextSegmentGuards.ts';
export { segmentGraphemes, segmentSentences, segmentWords } from './textSegment.ts';
export {
  getNextGraphemeBoundary,
  getNextSentenceBoundary,
  getNextWordBoundary,
  getPreviousGraphemeBoundary,
  getPreviousSentenceBoundary,
  getPreviousWordBoundary,
  getWordRangeAt,
} from './textSegmentBoundary.ts';
export { reportTextSegmenterUnavailable, setTextSegmentGuard } from './textSegmentGuards.ts';
export { explainTextSegmenterBackend, webTextSegmenterBackend } from './textSegmenterBackend.ts';
export {
  TextSegmentGranularity,
  TextSegmenterKind,
  getTextSegmentGranularityString,
  getTextSegmenterKindString,
  parseTextSegmentGranularity,
  parseTextSegmenterKind,
} from './types.ts';
export type {
  HostTextSegmentCapabilities,
  HostTextSegmenterCapability,
  TextSegment,
  TextSegmentGuard,
  TextSegmentRange,
  TextSegmenterExplanation,
} from './types.ts';
