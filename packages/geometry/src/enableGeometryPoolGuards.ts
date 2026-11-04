// Generated from crates/flight-geometry/src/enable_geometry_pool_guards.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { logOnce } from '@flighthq/log/contract';
import type { LogStateRef } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import type { GeometryPoolReleaseFunction, GeometryPoolReleaseGuard } from './geometryPoolGuards.ts';
import { getGeometryPoolReleaseGuard, setGeometryPoolReleaseGuard } from './geometryPoolGuards.ts';

export function areGeometryPoolGuardsEnabled(): boolean {
  return (getGeometryPoolReleaseGuard() ?? undefined) !== undefined;
}

export function disableGeometryPoolGuards(): void {
  setGeometryPoolReleaseGuard(null);
}

/**
 * Installs opt-in diagnostics for unbalanced geometry-pool brackets.
 *
 * Safe Rust ownership makes the TypeScript source's double-release path
 * unreachable through the typed release functions. The installed callback
 * nevertheless preserves the source diagnostic contract for lowerings that
 * can establish that condition.
 */
export function enableGeometryPoolGuards(logState: Readonly<LogStateRef>, clock: () => number): void {
  const guard: GeometryPoolReleaseGuard = (releaseFunction) => {
    warnOnDoubleRelease(logState, clock(), releaseFunction);
  };
  setGeometryPoolReleaseGuard(guard);
}

function warnOnDoubleRelease(
  logState: Readonly<LogStateRef>,
  nowMs: number,
  releaseFunction: GeometryPoolReleaseFunction,
): void {
  const __dt0 = (() => {
    const matchValue = releaseFunction;
    switch (matchValue) {
      case 'releaseMatrix':
        return (() => {
          return ['releaseMatrix', 'acquireMatrix or acquireIdentityMatrix'];
        })();
      case 'releaseMatrix3':
        return (() => {
          return ['releaseMatrix3', 'acquireMatrix3 or acquireIdentityMatrix3'];
        })();
      case 'releaseMatrix4':
        return (() => {
          return ['releaseMatrix4', 'acquireMatrix4 or acquireIdentityMatrix4'];
        })();
      case 'releaseQuaternion':
        return ['releaseQuaternion', 'acquireQuaternion or acquireIdentityQuaternion'];
      case 'releaseRectangle':
        return ['releaseRectangle', 'acquireRectangle or acquireEmptyRectangle'];
      case 'releaseVector2':
        return (() => {
          return ['releaseVector2', 'acquireVector2 or acquireEmptyVector2'];
        })();
      case 'releaseVector3':
        return (() => {
          return ['releaseVector3', 'acquireVector3 or acquireEmptyVector3'];
        })();
      case 'releaseVector4':
        return (() => {
          return ['releaseVector4', 'acquireVector4 or acquireEmptyVector4'];
        })();
    }
  })();
  const releaseFunction_1 = __dt0[0];
  const acquireFunctions = __dt0[1];
  const key = `geometry:double-release:${releaseFunction_1}`;
  const message = `${releaseFunction_1}: this value is already in its pool, so it is being released twice. Two later matching acquire calls will hand back the same object and unrelated owners will alias each other. Every ${acquireFunctions} call pairs with exactly one ${releaseFunction_1} call, and the value must not be used after release.`;
  logOnce(logState, nowMs, key, LogLevel.Warn, message, 'geometry');
}
