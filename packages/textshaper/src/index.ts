export * from './enableTextShaperGuards.ts';
export * from './textShaper.ts';
export {
  clearTextShaperCache,
  createTextShaperCache,
  disposeTextShaperCache,
  shapeTextRunCached,
} from './textShaperCache.ts';
export * from './textShaperCluster.ts';
export * from './textShaperItemize.ts';
export { acquireShapedRun, releaseShapedRun } from './textShaperPool.ts';
export {
  clearShapedRun,
  createShapedRun,
  getCodePointForGlyph,
  getFontMetrics,
  getFontMetricsInto,
  getFontUnitScale,
  getGlyphExtents,
  getGlyphExtentsBatch,
  getGlyphExtentsInto,
  getGlyphIndexForCodePoint,
  getGlyphName,
  shapeTextRun,
  shapeTextRunInto,
} from './textShaperRun.ts';
export { disposeTextShaperSignals, enableTextShaperSignals, getTextShaperSignals } from './textShaperSignals.ts';
