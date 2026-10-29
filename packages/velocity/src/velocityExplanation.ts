// Generated from crates/flight-velocity/src/velocity_explanation.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * The reason for a velocity explanation result.
 */
export type VelocityReason = 'no-sample' | 'stale' | 'explicit-zero' | 'derived-zero' | 'ok';

/**
 * Diagnostic result from `explainVelocity`, describing why a source has
 * its current velocity value.
 */
export interface VelocityExplanation {
  currentFrameId: number;
  explicit: boolean;
  lastFrameId: number;
  reason: VelocityReason;
  x: number;
  y: number;
}

export function getVelocityReasonString(value: VelocityReason): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'no-sample':
        return 'no-sample';
      case 'stale':
        return 'stale';
      case 'explicit-zero':
        return 'explicit-zero';
      case 'derived-zero':
        return 'derived-zero';
      case 'ok':
        return 'ok';
    }
  })();
}

export function parseVelocityReason(value: string): VelocityReason | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'no-sample':
        return 'no-sample';
      case 'stale':
        return 'stale';
      case 'explicit-zero':
        return 'explicit-zero';
      case 'derived-zero':
        return 'derived-zero';
      case 'ok':
        return 'ok';
      default:
        return undefined;
    }
  })();
}
