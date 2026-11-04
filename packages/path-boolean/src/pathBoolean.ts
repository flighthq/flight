// Generated from crates/flight-path-boolean/src/path_boolean.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { PathWinding } from '@flighthq/path/contract';

/**
 * The kind of boolean operation that was attempted.
 */
export type PathBooleanExplanationOperation = 'offset' | 'simplify';

/**
 * The reason the operation produced a degenerate or empty result.
 */
export type PathBooleanExplanationReason = 'collapsed-or-degenerate' | 'empty-input' | 'non-finite-delta';

/**
 * Join style for the convex side of offset path corners.
 */
export type PathOffsetJoin = 'bevel' | 'miter' | 'round' | 'square';

/**
 * End cap style for open path terminals.
 */
export type PathOffsetEnd = 'butt' | 'round' | 'square';

/**
 * Options controlling the boolean path operations (TS `PathBooleanOptions`). `fillRule` is a
 * `PathWinding`, exactly TS (`fillRule?: PathWinding`): only even-odd and non-zero are public
 * options. The positive/negative rules of `PathBooleanFillRule` stay kernel/offset conventions.
 */
export interface PathBooleanOptions {
  fillRule?: PathWinding;
  tolerance?: number;
}

/**
 * Explains why a boolean path operation (offset or simplify) produced a
 * degenerate or empty result. `undefined` means the operation succeeded normally.
 */
export interface PathBooleanExplanation {
  readonly operation: PathBooleanExplanationOperation;
  readonly reason: PathBooleanExplanationReason;
}

/**
 * Options controlling the offset path operation.
 */
export interface PathOffsetOptions {
  join?: PathOffsetJoin;
  end?: PathOffsetEnd;
  miterLimit?: number;
  tolerance?: number;
  arcTolerance?: number;
}

export function getPathBooleanExplanationOperationString(value: PathBooleanExplanationOperation): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'offset':
        return 'offset';
      case 'simplify':
        return 'simplify';
    }
  })();
}

export function getPathBooleanExplanationReasonString(value: PathBooleanExplanationReason): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'collapsed-or-degenerate':
        return 'collapsed-or-degenerate';
      case 'empty-input':
        return 'empty-input';
      case 'non-finite-delta':
        return 'non-finite-delta';
    }
  })();
}

export function getPathOffsetEndString(value: PathOffsetEnd): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'butt':
        return 'butt';
      case 'round':
        return 'round';
      case 'square':
        return 'square';
    }
  })();
}

export function getPathOffsetJoinString(value: PathOffsetJoin): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'bevel':
        return 'bevel';
      case 'miter':
        return 'miter';
      case 'round':
        return 'round';
      case 'square':
        return 'square';
    }
  })();
}

export function parsePathBooleanExplanationOperation(value: string): PathBooleanExplanationOperation | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'offset':
        return 'offset';
      case 'simplify':
        return 'simplify';
      default:
        return undefined;
    }
  })();
}

export function parsePathBooleanExplanationReason(value: string): PathBooleanExplanationReason | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'collapsed-or-degenerate':
        return 'collapsed-or-degenerate';
      case 'empty-input':
        return 'empty-input';
      case 'non-finite-delta':
        return 'non-finite-delta';
      default:
        return undefined;
    }
  })();
}

export function parsePathOffsetEnd(value: string): PathOffsetEnd | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'butt':
        return 'butt';
      case 'round':
        return 'round';
      case 'square':
        return 'square';
      default:
        return undefined;
    }
  })();
}

export function parsePathOffsetJoin(value: string): PathOffsetJoin | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'bevel':
        return 'bevel';
      case 'miter':
        return 'miter';
      case 'round':
        return 'round';
      case 'square':
        return 'square';
      default:
        return undefined;
    }
  })();
}
