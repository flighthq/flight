import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard, setGeometryPoolReleaseGuard } from './geometryPoolGuards';

type GeometryPoolReleaseFunction = Parameters<NonNullable<typeof geometryPoolReleaseGuard>>[0];

export function areGeometryPoolGuardsEnabled(): boolean {
  return geometryPoolReleaseGuard !== null;
}

export function disableGeometryPoolGuards(): void {
  setGeometryPoolReleaseGuard(null);
}

// Installs opt-in diagnostics for unbalanced geometry-pool brackets. The ordinary release path keeps a
// null callback and performs no membership scan; importing neither this module nor @flighthq/log keeps
// the warning prose and logging dependency outside production bundles.
export function enableGeometryPoolGuards(): void {
  setGeometryPoolReleaseGuard(warnOnDoubleRelease);
}

function warnOnDoubleRelease(releaseFunction: GeometryPoolReleaseFunction): void {
  const acquireFunctions = acquireFunctionsByReleaseFunction[releaseFunction];
  logOnce(
    `geometry:double-release:${releaseFunction}`,
    LogLevel.Warn,
    {
      message: `${releaseFunction}: this value is already in its pool, so it is being released twice. Two later matching acquire calls will hand back the same object and unrelated owners will alias each other. Every ${acquireFunctions} call pairs with exactly one ${releaseFunction} call, and the value must not be used after release.`,
    },
    'geometry',
  );
}

const acquireFunctionsByReleaseFunction: Readonly<Record<GeometryPoolReleaseFunction, string>> = {
  releaseMatrix: 'acquireMatrix or acquireIdentityMatrix',
  releaseMatrix3: 'acquireMatrix3 or acquireIdentityMatrix3',
  releaseMatrix4: 'acquireMatrix4 or acquireIdentityMatrix4',
  releaseQuaternion: 'acquireQuaternion or acquireIdentityQuaternion',
  releaseRectangle: 'acquireRectangle or acquireEmptyRectangle',
  releaseVector2: 'acquireVector2 or acquireEmptyVector2',
  releaseVector3: 'acquireVector3 or acquireEmptyVector3',
  releaseVector4: 'acquireVector4 or acquireEmptyVector4',
};
