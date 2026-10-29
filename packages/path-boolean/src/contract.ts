// Generated from crates/flight-path-boolean/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  booleanPaths,
  differencePaths,
  getPathBooleanFillRuleForWinding,
  intersectPaths,
  unionPaths,
  xorPaths,
} from './booleanPaths.ts';
export type { PathBooleanOptions } from './booleanPaths.ts';
export {
  explainOffsetPath,
  explainSimplifyPath,
  getPathBooleanExplanationOperationString,
  getPathBooleanExplanationReasonString,
  parsePathBooleanExplanationOperation,
  parsePathBooleanExplanationReason,
} from './explainPathBoolean.ts';
export type {
  PathBooleanExplanation,
  PathBooleanExplanationOperation,
  PathBooleanExplanationReason,
} from './explainPathBoolean.ts';
export {
  createMartinezPathBooleanKernel,
  getPathBooleanFillRuleString,
  getPathBooleanOperationString,
  initializeMartinezPathBooleanKernel,
  martinezPathBooleanKernel,
  parsePathBooleanFillRule,
  parsePathBooleanOperation,
} from './martinezKernel.ts';
export type {
  ComputePathBooleanFunction,
  PathBooleanContour,
  PathBooleanFillRule,
  PathBooleanKernelRaw,
  PathBooleanOperation,
} from './martinezKernel.ts';
export {
  getPathOffsetEndString,
  getPathOffsetJoinString,
  offsetPath,
  parsePathOffsetEnd,
  parsePathOffsetJoin,
} from './offsetPath.ts';
export type { PathOffsetEnd, PathOffsetJoin, PathOffsetOptions } from './offsetPath.ts';
export { resolvePathRegions } from './resolvePathRegions.ts';
export { simplifyPath } from './simplifyPath.ts';
export { unionAllPaths } from './unionAllPaths.ts';
export { writePathBooleanContours } from './writePathBooleanContours.ts';
