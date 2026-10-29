// Generated from crates/flight-clip/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  acquireClipRegion,
  clipRegionContainsClipRegion,
  clipRegionContainsPoint,
  clipRegionContainsRectangle,
  clipRegionIntersectsClipRegion,
  clipRegionIntersectsRectangle,
  cloneClipRegion,
  copyClipRegion,
  createClipRegionFromContours,
  createClipRegionFromRectangle,
  equalsClipRegion,
  explainClipRegion,
  explainClipRegionContours,
  getClipRegionBounds,
  initializeClipRegionFromContours,
  initializeClipRegionFromRectangle,
  intersectClipRegions,
  invalidateClipRegion,
  isClipRegionEmpty,
  isClipRegionRectangular,
  normalizeClipRegion,
  releaseClipRegion,
  setClipRegionContoursGuard,
  setClipRegionReleaseGuard,
  setClipRegionToContours,
  setClipRegionToRectangle,
  setClipRegionUseGuard,
  transformClipRegion,
  unionClipRegions,
} from './clipRegion.ts';
export {
  createClipRegionFromCircle,
  createClipRegionFromEllipse,
  createClipRegionFromPath,
  createClipRegionFromRoundedRectangle,
  initializeClipRegionFromPath,
} from './clipRegionShapes.ts';
export { disableClipGuards, enableClipGuards } from './enableClipGuards.ts';
