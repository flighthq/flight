// Generated from crates/flight-textsegment/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  TextSegmentGranularity,
  TextSegmenterKind,
  disableTextSegmentGuards,
  enableTextSegmentGuards,
  explainTextSegmenterBackend,
  getNextGraphemeBoundary,
  getNextSentenceBoundary,
  getNextWordBoundary,
  getPreviousGraphemeBoundary,
  getPreviousSentenceBoundary,
  getPreviousWordBoundary,
  getWordRangeAt,
  segmentGraphemes,
  segmentSentences,
  segmentWords,
  webTextSegmenterBackend,
} from './contract.ts';

export type {
  HostTextSegmentCapabilities,
  HostTextSegmenterCapability,
  TextSegment,
  TextSegmentRange,
  TextSegmenterExplanation,
} from './contract.ts';
