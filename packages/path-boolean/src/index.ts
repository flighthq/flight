// Generated from crates/flight-path-boolean/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  booleanPaths,
  createMartinezPathBooleanKernel,
  differencePaths,
  explainOffsetPath,
  explainSimplifyPath,
  getPathBooleanExplanationOperationString,
  getPathBooleanExplanationReasonString,
  getPathBooleanFillRuleString,
  getPathBooleanOperationString,
  getPathOffsetEndString,
  getPathOffsetJoinString,
  intersectPaths,
  martinezPathBooleanKernel,
  offsetPath,
  parsePathBooleanExplanationOperation,
  parsePathBooleanExplanationReason,
  parsePathBooleanFillRule,
  parsePathBooleanOperation,
  parsePathOffsetEnd,
  parsePathOffsetJoin,
  resolvePathRegions,
  simplifyPath,
  unionAllPaths,
  unionPaths,
  writePathBooleanContours,
  xorPaths,
} from './contract.ts';

export type {
  ComputePathBooleanFunction,
  PathBooleanContour,
  PathBooleanExplanation,
  PathBooleanExplanationOperation,
  PathBooleanExplanationReason,
  PathBooleanFillRule,
  PathBooleanOperation,
  PathBooleanOptions,
  PathOffsetEnd,
  PathOffsetJoin,
  PathOffsetOptions,
} from './contract.ts';

export type { PathBooleanKernel } from './pathBooleanCompat.ts';
