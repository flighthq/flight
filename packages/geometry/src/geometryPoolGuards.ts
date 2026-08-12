type GeometryPoolReleaseFunction =
  | 'releaseMatrix'
  | 'releaseMatrix3'
  | 'releaseMatrix4'
  | 'releaseQuaternion'
  | 'releaseRectangle'
  | 'releaseVector2'
  | 'releaseVector3'
  | 'releaseVector4';

type GeometryPoolReleaseGuard = (releaseFunction: GeometryPoolReleaseFunction) => void;

// Internal callback slot shared by the pool modules. Warning prose and @flighthq/log stay in the
// separately importable enableGeometryPoolGuards module.
export let geometryPoolReleaseGuard: GeometryPoolReleaseGuard | null = null;

export function setGeometryPoolReleaseGuard(guard: GeometryPoolReleaseGuard | null): void {
  geometryPoolReleaseGuard = guard;
}
