// Generated from crates/flight-path-boolean/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { booleanPaths, differencePaths, intersectPaths, unionPaths, xorPaths } from './booleanPaths.ts';
export { explainOffsetPath, explainSimplifyPath } from './explainPathBoolean.ts';
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
export { offsetPath } from './offsetPath.ts';
export {
  getPathBooleanExplanationOperationString,
  getPathBooleanExplanationReasonString,
  getPathOffsetEndString,
  getPathOffsetJoinString,
  parsePathBooleanExplanationOperation,
  parsePathBooleanExplanationReason,
  parsePathOffsetEnd,
  parsePathOffsetJoin,
} from './pathBoolean.ts';
export type {
  PathBooleanExplanation,
  PathBooleanExplanationOperation,
  PathBooleanExplanationReason,
  PathBooleanOptions,
  PathOffsetEnd,
  PathOffsetJoin,
  PathOffsetOptions,
} from './pathBoolean.ts';
export type { PathBooleanKernel } from './pathBooleanCompat.ts';
export { resolvePathRegions } from './resolvePathRegions.ts';
export { simplifyPath } from './simplifyPath.ts';
export { unionAllPaths } from './unionAllPaths.ts';
export { writePathBooleanContours } from './writePathBooleanContours.ts';
