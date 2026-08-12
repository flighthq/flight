import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryTangents,
  createMeshGeometry,
  getVertexAttributeFloatOffset,
} from '@flighthq/mesh/contract';
import { getNodeChildren } from '@flighthq/node/contract';
import { createScene3DFromMd5Mesh } from '@flighthq/scene3d-formats/contract';
import { isMesh } from '@flighthq/scene3d/contract';
import type { MeshGeometry, Scene3D } from '@flighthq/types/contract';

import {
  FIXTURE_RELEASE_TAG,
  getFixtureTreePath,
  readFixtureTreeStamp,
  resolveFixtureCacheDirectory,
} from '../../scripts/fixtures';
import { probeMd5Sections } from './md5-section-probe';

export const MD5_TANGENT_ORTHOGONALITY_ORACLE_ID = 'md5.tangent-orthogonality';
export const MD5_TANGENT_HANDEDNESS_ORACLE_ID = 'md5.tangent-handedness';
export const MD5_TANGENT_SPLIT_DIFFERENCE_ORACLE_ID = 'md5.tangent-split-difference';
export const MD5_TANGENT_CODE_PATH_CROSS_CHECK_ORACLE_ID = 'md5.tangent-code-path-cross-check';

export type Md5TangentOracleState = 'failed' | 'not-run' | 'passed';
export type Md5TangentFrameOracleSelection = 'all' | 'handedness' | 'split-difference';
type Md5TangentFrameOracleCliSelection = Md5TangentFrameOracleSelection | 'handedness-control';
export type Md5TangentHandednessXCorrelation =
  | 'indeterminate'
  | 'split-opposite-sign-to-x'
  | 'split-same-sign-as-x'
  | 'uniform-negative'
  | 'uniform-positive';

export interface Md5TangentCodePathCrossCheckOracle {
  calculation: 'per-triangle-uv-jacobian-solve-and-generalized-gram-schmidt';
  comparedComponents: number;
  comparison: 'absolute-component-residual-vs-observed-float32-rounding-cell';
  coordinateBasis: 'flight-right-handed-y-up-after-import';
  differingComponents: number;
  differingVertices: number;
  id: typeof MD5_TANGENT_CODE_PATH_CROSS_CHECK_ORACLE_ID;
  independence: 'same-author-code-path-only';
  inputPreparation: 'imported-float32-position-normal-uv-and-index-streams';
  maximumPrecisionExcess: number;
  maximumPrecisionBound: number;
  maximumResidual: number;
  maximumResidualToPrecisionRatio: number;
  notRunReason?: 'mesh-geometry-missing' | 'tangent-input-unreadable' | 'uv-gradient-indeterminate';
  role: 'diagnostic';
  state: Md5TangentOracleState;
  tool: 'conformance/md5/md5-tangent-frame-oracle';
}

export interface Md5TangentOrthogonalityOracle {
  exactVertices: number;
  id: typeof MD5_TANGENT_ORTHOGONALITY_ORACLE_ID;
  infiniteTangentVertices: number;
  invalidVertices: number;
  maximumPrecisionExcess: number;
  maximumPrecisionBound: number;
  maximumResidual: number;
  maximumResidualToPrecisionRatio: number;
  minimumNonzeroTangentLength: number | null;
  nanTangentVertices: number;
  notRunReason?: 'mesh-geometry-missing' | 'tangent-frame-unreadable';
  outsidePrecisionVertices: number;
  state: Md5TangentOracleState;
  vertexCount: number;
  withinPrecisionVertices: number;
  zeroLengthTangentVertices: number;
}

export interface Md5TangentHandednessOracle {
  id: typeof MD5_TANGENT_HANDEDNESS_ORACLE_ID;
  indeterminateTriangles: number;
  invalidTriangles: number;
  matchingTriangles: number;
  minimumCertainDeterminantMagnitude: number | null;
  mismatchingTriangles: number;
  notRunReason?: 'mesh-geometry-missing' | 'source-topology-unreadable' | 'uv-winding-indeterminate';
  sections: readonly Md5TangentHandednessSectionOracle[];
  state: Md5TangentOracleState;
  triangleCount: number;
  xCorrelationRule: 'majority-direction-with-tie-indeterminate';
  xSideComparison: 'triangle-centroid-sign-vs-observed-float32-rounding-cell';
}

export interface TangentXCorrelationOracle {
  invalidTriangles: number;
  mixedTangentHandednessTriangles: number;
  negativeTangentHandednessTriangles: number;
  negativeXNegativeHandednessTriangles: number;
  negativeXPositiveHandednessTriangles: number;
  oppositeSignToXTriangles: number;
  positiveTangentHandednessTriangles: number;
  positiveXNegativeHandednessTriangles: number;
  positiveXPositiveHandednessTriangles: number;
  sameSignAsXTriangles: number;
  triangleCount: number;
  xCorrelation: Md5TangentHandednessXCorrelation;
  xSideIndeterminateTriangles: number;
}

export interface Md5TangentHandednessSectionOracle extends TangentXCorrelationOracle {
  indeterminateUvWindingTriangles: number;
  matchingTriangles: number;
  mismatchingTriangles: number;
  negativeUvWindingTriangles: number;
  positiveUvWindingTriangles: number;
  section: number;
}

export interface Md5TangentSplitPairMeasurement {
  directionChanged: boolean;
  directionResidual: number;
  originalVertex: number;
  originalHandedness: number;
  section: number;
  splitVertex: number;
  splitHandedness: number;
  state: 'direction-only' | 'handedness-different' | 'handedness-indeterminate' | 'identical-frame';
}

export interface Md5TangentSplitDifferenceOracle {
  candidateSplitVertices: number;
  directionOnlyPairs: number;
  emittedVertices: number;
  handednessDifferentPairs: number;
  handednessIndeterminatePairs: number;
  handednessSamePairs: number;
  id: typeof MD5_TANGENT_SPLIT_DIFFERENCE_ORACLE_ID;
  identicalFramePairs: number;
  mappedSplitPairs: number;
  notRunReason?:
    | 'source-topology-unreadable'
    | 'split-handedness-indeterminate'
    | 'split-vertices-absent'
    | 'split-vertices-unmappable';
  pairs: readonly Md5TangentSplitPairMeasurement[];
  sourceVertices: number;
  state: Md5TangentOracleState;
}

export interface Md5TangentFrameOracles {
  orthogonality: Md5TangentOrthogonalityOracle;
  handedness: Md5TangentHandednessOracle;
  splitDifference: Md5TangentSplitDifferenceOracle;
  codePathCrossCheck: Md5TangentCodePathCrossCheckOracle;
}

export interface Md5TangentFrameOracleCorpusCaseMeasured {
  oracles: Partial<Md5TangentFrameOracles>;
  reference: string;
  state: 'measured';
}

export interface Md5TangentFrameOracleCorpusCaseNotRun {
  notRunReason: 'mesh-source-or-import-unreadable';
  reference: string;
  state: 'not-run';
}

export type Md5TangentFrameOracleCorpusCase =
  | Md5TangentFrameOracleCorpusCaseMeasured
  | Md5TangentFrameOracleCorpusCaseNotRun;

export interface Md5TangentFrameOracleCorpusReport {
  acquisition: {
    pack: typeof MD5_TANGENT_FIXTURE_PACK;
    release: string;
    variant: typeof MD5_TANGENT_FIXTURE_VARIANT;
    verifiedFixtureFiles: number;
  };
  cases: readonly Md5TangentFrameOracleCorpusCase[];
  discoveredMeshFiles: number;
  importNotRunMeshFiles: number;
  measuredMeshFiles: number;
  notRunReason?: 'md5-mesh-fixtures-absent' | 'md5-mesh-imports-failed';
  selection: Md5TangentFrameOracleSelection;
  state: 'measured' | 'not-run';
}

interface DecimalToken {
  precision: number;
  value: number;
}

interface GeometrySection {
  geometry: Readonly<MeshGeometry>;
  normalOffset: number;
  outputToSource: readonly number[];
  positionOffset: number;
  source: SourceSection;
  tangentOffset: number;
  uvOffset: number;
}

interface NumericInterval {
  max: number;
  min: number;
}

interface SourceSection {
  triangleCount: number;
  uvs: readonly { u: DecimalToken; v: DecimalToken }[];
  vertexCount: number;
}

export function runMd5TangentFrameOracles(scene: Readonly<Scene3D>, meshSource: string): Md5TangentFrameOracles {
  return {
    orthogonality: measureMd5TangentOrthogonality(scene),
    handedness: measureMd5TangentHandedness(scene, meshSource),
    splitDifference: measureMd5SplitTangentDifference(scene, meshSource),
    codePathCrossCheck: measureMd5TangentCodePathCrossCheck(scene),
  };
}

export function runMd5TangentFrameOracleCorpus(
  treeDirectory: string,
  verifiedFixtureFiles: number,
  selection: Md5TangentFrameOracleSelection = 'all',
): Md5TangentFrameOracleCorpusReport {
  const references = collectMd5MeshReferences(treeDirectory);
  const cases: Md5TangentFrameOracleCorpusCase[] = references.map((reference) => {
    try {
      const source = readFileSync(join(treeDirectory, reference), 'utf8');
      const scene = createScene3DFromMd5Mesh(source);
      const oracles =
        selection === 'handedness'
          ? { handedness: measureMd5TangentHandedness(scene, source) }
          : selection === 'split-difference'
            ? { splitDifference: measureMd5SplitTangentDifference(scene, source) }
            : runMd5TangentFrameOracles(scene, source);
      return { oracles, reference, state: 'measured' };
    } catch {
      return { notRunReason: 'mesh-source-or-import-unreadable', reference, state: 'not-run' };
    }
  });
  const measuredMeshFiles = cases.filter((item) => item.state === 'measured').length;
  const importNotRunMeshFiles = cases.length - measuredMeshFiles;
  const acquisition: Md5TangentFrameOracleCorpusReport['acquisition'] = {
    pack: MD5_TANGENT_FIXTURE_PACK,
    release: FIXTURE_RELEASE_TAG,
    variant: MD5_TANGENT_FIXTURE_VARIANT,
    verifiedFixtureFiles,
  };
  if (references.length === 0) {
    return {
      acquisition,
      cases,
      discoveredMeshFiles: 0,
      importNotRunMeshFiles,
      measuredMeshFiles,
      notRunReason: 'md5-mesh-fixtures-absent',
      selection,
      state: 'not-run',
    };
  }
  if (measuredMeshFiles === 0) {
    return {
      acquisition,
      cases,
      discoveredMeshFiles: references.length,
      importNotRunMeshFiles,
      measuredMeshFiles,
      notRunReason: 'md5-mesh-imports-failed',
      selection,
      state: 'not-run',
    };
  }
  return {
    acquisition,
    cases,
    discoveredMeshFiles: references.length,
    importNotRunMeshFiles,
    measuredMeshFiles,
    selection,
    state: 'measured',
  };
}

export function formatMd5TangentFrameOracleCorpusReport(report: Md5TangentFrameOracleCorpusReport): string {
  const lines = [
    `acquisition pack=${report.acquisition.pack} variant=${report.acquisition.variant} release=${report.acquisition.release} verified-fixtures=${report.acquisition.verifiedFixtureFiles} discovered-md5mesh=${report.discoveredMeshFiles}`,
    `comparison selection=${report.selection} corpus-state=${report.state} measured-md5mesh=${report.measuredMeshFiles} import-not-run-md5mesh=${report.importNotRunMeshFiles}${formatNotRunReason(report)}`,
  ];
  for (const item of report.cases) {
    if (item.state === 'not-run') {
      lines.push(`case ${item.reference} state=not-run reason=${item.notRunReason}`);
      continue;
    }
    lines.push(`case ${item.reference} state=measured`);
    const { codePathCrossCheck, handedness, orthogonality, splitDifference } = item.oracles;
    if (orthogonality !== undefined) {
      lines.push(
        `  ${orthogonality.id} state=${orthogonality.state} vertices=${orthogonality.vertexCount} exact=${orthogonality.exactVertices} within-precision=${orthogonality.withinPrecisionVertices} outside-precision=${orthogonality.outsidePrecisionVertices} invalid=${orthogonality.invalidVertices} tangent-nan=${orthogonality.nanTangentVertices} tangent-infinite=${orthogonality.infiniteTangentVertices} tangent-zero-length=${orthogonality.zeroLengthTangentVertices} tangent-minimum-nonzero-length=${orthogonality.minimumNonzeroTangentLength ?? 'none'}${formatNotRunReason(orthogonality)}`,
      );
    }
    if (handedness !== undefined) {
      lines.push(
        `  ${handedness.id} state=${handedness.state} triangles=${handedness.triangleCount} matching=${handedness.matchingTriangles} mismatching=${handedness.mismatchingTriangles} indeterminate=${handedness.indeterminateTriangles} invalid=${handedness.invalidTriangles}${formatNotRunReason(handedness)}`,
      );
      for (const section of handedness.sections) {
        lines.push(
          `    handedness-section section=${section.section} triangles=${section.triangleCount} uv-positive=${section.positiveUvWindingTriangles} uv-negative=${section.negativeUvWindingTriangles} tangent-positive=${section.positiveTangentHandednessTriangles} tangent-negative=${section.negativeTangentHandednessTriangles} tangent-mixed=${section.mixedTangentHandednessTriangles} x-correlation=${section.xCorrelation} same-sign-as-x=${section.sameSignAsXTriangles} opposite-sign-to-x=${section.oppositeSignToXTriangles} negative-x-negative=${section.negativeXNegativeHandednessTriangles} negative-x-positive=${section.negativeXPositiveHandednessTriangles} positive-x-negative=${section.positiveXNegativeHandednessTriangles} positive-x-positive=${section.positiveXPositiveHandednessTriangles} x-side-indeterminate=${section.xSideIndeterminateTriangles}`,
        );
      }
    }
    if (splitDifference !== undefined) {
      lines.push(
        `  ${splitDifference.id} state=${splitDifference.state} source-vertices=${splitDifference.sourceVertices} emitted-vertices=${splitDifference.emittedVertices} candidate-splits=${splitDifference.candidateSplitVertices} mapped-splits=${splitDifference.mappedSplitPairs} handedness-different=${splitDifference.handednessDifferentPairs} handedness-same=${splitDifference.handednessSamePairs} direction-only=${splitDifference.directionOnlyPairs} identical-frame=${splitDifference.identicalFramePairs} handedness-indeterminate=${splitDifference.handednessIndeterminatePairs}${formatNotRunReason(splitDifference)}`,
      );
      for (const pair of splitDifference.pairs) {
        lines.push(
          `    split-pair section=${pair.section} original=${pair.originalVertex} split=${pair.splitVertex} state=${pair.state} reason=${splitPairReason(pair)} original-handedness=${pair.originalHandedness} split-handedness=${pair.splitHandedness} direction-changed=${pair.directionChanged} direction-residual=${pair.directionResidual}`,
        );
      }
    }
    if (codePathCrossCheck !== undefined) {
      lines.push(
        `  ${codePathCrossCheck.id} role=${codePathCrossCheck.role} independence=${codePathCrossCheck.independence} state=${codePathCrossCheck.state} compared-components=${codePathCrossCheck.comparedComponents} differing-components=${codePathCrossCheck.differingComponents} differing-vertices=${codePathCrossCheck.differingVertices}${formatNotRunReason(codePathCrossCheck)}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function measureMd5TangentCodePathCrossCheck(scene: Readonly<Scene3D>): Md5TangentCodePathCrossCheckOracle {
  const geometries = collectMeshGeometries(scene);
  const base = {
    calculation: 'per-triangle-uv-jacobian-solve-and-generalized-gram-schmidt' as const,
    comparedComponents: 0,
    comparison: 'absolute-component-residual-vs-observed-float32-rounding-cell' as const,
    coordinateBasis: 'flight-right-handed-y-up-after-import' as const,
    differingComponents: 0,
    differingVertices: 0,
    id: MD5_TANGENT_CODE_PATH_CROSS_CHECK_ORACLE_ID as typeof MD5_TANGENT_CODE_PATH_CROSS_CHECK_ORACLE_ID,
    independence: 'same-author-code-path-only' as const,
    inputPreparation: 'imported-float32-position-normal-uv-and-index-streams' as const,
    maximumPrecisionExcess: 0,
    maximumPrecisionBound: 0,
    maximumResidual: 0,
    maximumResidualToPrecisionRatio: 0,
    role: 'diagnostic' as const,
    tool: 'conformance/md5/md5-tangent-frame-oracle' as const,
  };
  if (geometries.length === 0) {
    return { ...base, notRunReason: 'mesh-geometry-missing', state: 'not-run' };
  }

  let comparedComponents = 0;
  let differingComponents = 0;
  let differingVertices = 0;
  let maximumPrecisionExcess = 0;
  let maximumPrecisionBound = 0;
  let maximumResidual = 0;
  let maximumResidualToPrecisionRatio = 0;
  for (const geometry of geometries) {
    const positionOffset = getVertexAttributeFloatOffset(geometry.layout, 'position');
    const normalOffset = getVertexAttributeFloatOffset(geometry.layout, 'normal');
    const tangentOffset = tangentFloatOffset(geometry);
    const uvOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
    const floatsPerVertex = geometry.layout.stride / 4;
    const vertexCount = vertexCountOf(geometry);
    if (
      positionOffset < 0 ||
      normalOffset < 0 ||
      tangentOffset < 0 ||
      uvOffset < 0 ||
      geometry.indices === null ||
      geometry.topology !== 'triangle-list'
    ) {
      return { ...base, notRunReason: 'tangent-input-unreadable', state: 'not-run' };
    }

    const expected = computeCodePathCrossCheckTangentFrames(
      geometry,
      positionOffset,
      normalOffset,
      uvOffset,
      floatsPerVertex,
      vertexCount,
    );
    if (expected === null) return { ...base, notRunReason: 'uv-gradient-indeterminate', state: 'not-run' };
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const observedBase = vertex * floatsPerVertex + tangentOffset;
      const expectedBase = vertex * 4;
      let vertexDiffers = false;
      for (let component = 0; component < 4; component++) {
        const observed = geometry.vertices[observedBase + component]!;
        const expectedValue = expected[expectedBase + component]!;
        if (!Number.isFinite(observed) || !Number.isFinite(expectedValue)) {
          return { ...base, notRunReason: 'tangent-input-unreadable', state: 'not-run' };
        }
        const residual = Math.abs(observed - expectedValue);
        const precisionBound = float32RoundingRadius(observed);
        comparedComponents++;
        if (residual > precisionBound) {
          differingComponents++;
          vertexDiffers = true;
        }
        const precisionExcess = residual - precisionBound;
        const residualToPrecisionRatio = precisionBound > 0 ? residual / precisionBound : Number.POSITIVE_INFINITY;
        if (precisionExcess > maximumPrecisionExcess) maximumPrecisionExcess = precisionExcess;
        if (residual > maximumResidual) maximumResidual = residual;
        if (residualToPrecisionRatio > maximumResidualToPrecisionRatio)
          maximumResidualToPrecisionRatio = residualToPrecisionRatio;
        if (precisionBound > maximumPrecisionBound) maximumPrecisionBound = precisionBound;
      }
      if (vertexDiffers) differingVertices++;
    }
  }

  return {
    calculation: 'per-triangle-uv-jacobian-solve-and-generalized-gram-schmidt',
    comparedComponents,
    comparison: 'absolute-component-residual-vs-observed-float32-rounding-cell',
    coordinateBasis: 'flight-right-handed-y-up-after-import',
    differingComponents,
    differingVertices,
    id: MD5_TANGENT_CODE_PATH_CROSS_CHECK_ORACLE_ID as typeof MD5_TANGENT_CODE_PATH_CROSS_CHECK_ORACLE_ID,
    independence: 'same-author-code-path-only',
    inputPreparation: 'imported-float32-position-normal-uv-and-index-streams',
    maximumPrecisionExcess,
    maximumPrecisionBound,
    maximumResidual,
    maximumResidualToPrecisionRatio,
    role: 'diagnostic',
    state: differingComponents === 0 ? 'passed' : 'failed',
    tool: 'conformance/md5/md5-tangent-frame-oracle',
  };
}

export function measureMd5TangentOrthogonality(scene: Readonly<Scene3D>): Md5TangentOrthogonalityOracle {
  const geometries = collectMeshGeometries(scene);
  const base = {
    exactVertices: 0,
    id: MD5_TANGENT_ORTHOGONALITY_ORACLE_ID as typeof MD5_TANGENT_ORTHOGONALITY_ORACLE_ID,
    infiniteTangentVertices: 0,
    invalidVertices: 0,
    maximumPrecisionExcess: 0,
    maximumPrecisionBound: 0,
    maximumResidual: 0,
    maximumResidualToPrecisionRatio: 0,
    minimumNonzeroTangentLength: null,
    nanTangentVertices: 0,
    outsidePrecisionVertices: 0,
    vertexCount: 0,
    withinPrecisionVertices: 0,
    zeroLengthTangentVertices: 0,
  };
  if (geometries.length === 0) return { ...base, notRunReason: 'mesh-geometry-missing', state: 'not-run' };

  let exactVertices = 0;
  let infiniteTangentVertices = 0;
  let invalidVertices = 0;
  let maximumPrecisionExcess = 0;
  let maximumPrecisionBound = 0;
  let maximumResidual = 0;
  let maximumResidualToPrecisionRatio = 0;
  let minimumNonzeroTangentLength = Number.POSITIVE_INFINITY;
  let nanTangentVertices = 0;
  let outsidePrecisionVertices = 0;
  let vertexCount = 0;
  let withinPrecisionVertices = 0;
  let zeroLengthTangentVertices = 0;
  for (const geometry of geometries) {
    const normalOffset = getVertexAttributeFloatOffset(geometry.layout, 'normal');
    const tangentOffset = tangentFloatOffset(geometry);
    const floatsPerVertex = geometry.layout.stride / 4;
    const count = vertexCountOf(geometry);
    vertexCount += count;
    if (normalOffset < 0 || tangentOffset < 0) {
      invalidVertices += count;
      continue;
    }

    for (let vertex = 0; vertex < count; vertex++) {
      const baseOffset = vertex * floatsPerVertex;
      const nx = geometry.vertices[baseOffset + normalOffset]!;
      const ny = geometry.vertices[baseOffset + normalOffset + 1]!;
      const nz = geometry.vertices[baseOffset + normalOffset + 2]!;
      const tx = geometry.vertices[baseOffset + tangentOffset]!;
      const ty = geometry.vertices[baseOffset + tangentOffset + 1]!;
      const tz = geometry.vertices[baseOffset + tangentOffset + 2]!;
      const tangentHasNan = Number.isNaN(tx) || Number.isNaN(ty) || Number.isNaN(tz);
      const tangentHasInfinity = [tx, ty, tz].some((value) => Math.abs(value) === Number.POSITIVE_INFINITY);
      const tangentIsZero = tx === 0 && ty === 0 && tz === 0;
      if (tangentHasNan) nanTangentVertices++;
      if (tangentHasInfinity) infiniteTangentVertices++;
      if (tangentIsZero) zeroLengthTangentVertices++;
      if (!numbersFinite(nx, ny, nz, tx, ty, tz) || (nx === 0 && ny === 0 && nz === 0) || tangentIsZero) {
        invalidVertices++;
        continue;
      }

      const tangentLength = Math.hypot(tx, ty, tz);
      if (tangentLength < minimumNonzeroTangentLength) minimumNonzeroTangentLength = tangentLength;

      const residual = Math.abs(nx * tx + ny * ty + nz * tz);
      const precisionBound = productRoundingBound(nx, tx) + productRoundingBound(ny, ty) + productRoundingBound(nz, tz);
      if (residual === 0) exactVertices++;
      else if (residual <= precisionBound) withinPrecisionVertices++;
      else outsidePrecisionVertices++;
      const precisionExcess = residual - precisionBound;
      const residualToPrecisionRatio = precisionBound > 0 ? residual / precisionBound : Number.POSITIVE_INFINITY;
      if (precisionExcess > maximumPrecisionExcess) maximumPrecisionExcess = precisionExcess;
      if (residual > maximumResidual) maximumResidual = residual;
      if (residualToPrecisionRatio > maximumResidualToPrecisionRatio)
        maximumResidualToPrecisionRatio = residualToPrecisionRatio;
      if (precisionBound > maximumPrecisionBound) maximumPrecisionBound = precisionBound;
    }
  }

  const measurements = {
    exactVertices,
    id: MD5_TANGENT_ORTHOGONALITY_ORACLE_ID as typeof MD5_TANGENT_ORTHOGONALITY_ORACLE_ID,
    infiniteTangentVertices,
    invalidVertices,
    maximumPrecisionExcess,
    maximumPrecisionBound,
    maximumResidual,
    maximumResidualToPrecisionRatio,
    minimumNonzeroTangentLength: Number.isFinite(minimumNonzeroTangentLength) ? minimumNonzeroTangentLength : null,
    nanTangentVertices,
    outsidePrecisionVertices,
    vertexCount,
    withinPrecisionVertices,
    zeroLengthTangentVertices,
  };
  if (outsidePrecisionVertices > 0) return { ...measurements, state: 'failed' };
  if (invalidVertices > 0) return { ...measurements, notRunReason: 'tangent-frame-unreadable', state: 'not-run' };
  return { ...measurements, state: 'passed' };
}

export function runProceduralMirroredUvTangentControl(): TangentXCorrelationOracle {
  const vertices = new Float32Array(4 * 12);
  setProceduralControlVertex(vertices, 0, 0, -1.2, 0, 0);
  setProceduralControlVertex(vertices, 1, 1.2, 0, 1, 0);
  setProceduralControlVertex(vertices, 2, 0, 1.2, 0, 1);
  setProceduralControlVertex(vertices, 3, -1.2, 0, 1, 0);
  const geometry = createMeshGeometry({
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
    vertices,
  });
  computeMeshGeometryTangents(geometry, geometry);
  return measureTangentXCorrelation(geometry);
}

export function measureTangentXCorrelation(geometry: Readonly<MeshGeometry>): TangentXCorrelationOracle {
  const floatsPerVertex = geometry.layout.stride / 4;
  const positionOffset = getVertexAttributeFloatOffset(geometry.layout, 'position');
  const tangentOffset = tangentFloatOffset(geometry);
  const indices = geometry.indices;
  const elementCount = indices?.length ?? vertexCountOf(geometry);
  const triangleCount = Math.floor(elementCount / 3);
  const base = {
    invalidTriangles: 0,
    mixedTangentHandednessTriangles: 0,
    negativeTangentHandednessTriangles: 0,
    negativeXNegativeHandednessTriangles: 0,
    negativeXPositiveHandednessTriangles: 0,
    oppositeSignToXTriangles: 0,
    positiveTangentHandednessTriangles: 0,
    positiveXNegativeHandednessTriangles: 0,
    positiveXPositiveHandednessTriangles: 0,
    sameSignAsXTriangles: 0,
    triangleCount,
    xCorrelation: 'indeterminate' as Md5TangentHandednessXCorrelation,
    xSideIndeterminateTriangles: 0,
  };
  if (floatsPerVertex <= 0 || positionOffset < 0 || tangentOffset < 0 || geometry.topology !== 'triangle-list') {
    return { ...base, invalidTriangles: triangleCount };
  }

  let invalidTriangles = 0;
  let mixedTangentHandednessTriangles = 0;
  let negativeTangentHandednessTriangles = 0;
  let negativeXNegativeHandednessTriangles = 0;
  let negativeXPositiveHandednessTriangles = 0;
  let positiveTangentHandednessTriangles = 0;
  let positiveXNegativeHandednessTriangles = 0;
  let positiveXPositiveHandednessTriangles = 0;
  let xSideIndeterminateTriangles = 0;
  const vertexCount = vertexCountOf(geometry);
  for (let element = 0; element + 2 < elementCount; element += 3) {
    const triangle = indices
      ? [indices[element]!, indices[element + 1]!, indices[element + 2]!]
      : [element, element + 1, element + 2];
    if (triangle.some((vertex) => vertex >= vertexCount)) {
      invalidTriangles++;
      continue;
    }
    const tangentHandedness = triangle.map(
      (vertex) => geometry.vertices[vertex * floatsPerVertex + tangentOffset + 3]!,
    );
    const observedSign = tangentHandedness.every((value) => value === 1)
      ? 1
      : tangentHandedness.every((value) => value === -1)
        ? -1
        : null;
    if (observedSign === 1) positiveTangentHandednessTriangles++;
    else if (observedSign === -1) negativeTangentHandednessTriangles++;
    else mixedTangentHandednessTriangles++;

    const xInterval = float32SumInterval(
      triangle.map((vertex) => geometry.vertices[vertex * floatsPerVertex + positionOffset]!),
    );
    if (xInterval === null || (xInterval.min <= 0 && xInterval.max >= 0)) {
      xSideIndeterminateTriangles++;
    } else if (observedSign !== null) {
      if (xInterval.min > 0) {
        if (observedSign > 0) positiveXPositiveHandednessTriangles++;
        else positiveXNegativeHandednessTriangles++;
      } else if (observedSign > 0) negativeXPositiveHandednessTriangles++;
      else negativeXNegativeHandednessTriangles++;
    }
  }
  const sameSignAsXTriangles = negativeXNegativeHandednessTriangles + positiveXPositiveHandednessTriangles;
  const oppositeSignToXTriangles = negativeXPositiveHandednessTriangles + positiveXNegativeHandednessTriangles;
  return {
    invalidTriangles,
    mixedTangentHandednessTriangles,
    negativeTangentHandednessTriangles,
    negativeXNegativeHandednessTriangles,
    negativeXPositiveHandednessTriangles,
    oppositeSignToXTriangles,
    positiveTangentHandednessTriangles,
    positiveXNegativeHandednessTriangles,
    positiveXPositiveHandednessTriangles,
    sameSignAsXTriangles,
    triangleCount,
    xCorrelation: classifyXCorrelation(
      positiveTangentHandednessTriangles,
      negativeTangentHandednessTriangles,
      mixedTangentHandednessTriangles,
      sameSignAsXTriangles,
      oppositeSignToXTriangles,
    ),
    xSideIndeterminateTriangles,
  };
}

export function measureMd5TangentHandedness(scene: Readonly<Scene3D>, meshSource: string): Md5TangentHandednessOracle {
  const sections = resolveGeometrySections(scene, meshSource);
  const base = {
    id: MD5_TANGENT_HANDEDNESS_ORACLE_ID as typeof MD5_TANGENT_HANDEDNESS_ORACLE_ID,
    indeterminateTriangles: 0,
    invalidTriangles: 0,
    matchingTriangles: 0,
    minimumCertainDeterminantMagnitude: null,
    mismatchingTriangles: 0,
    sections: [] as Md5TangentHandednessSectionOracle[],
    triangleCount: 0,
    xCorrelationRule: 'majority-direction-with-tie-indeterminate' as const,
    xSideComparison: 'triangle-centroid-sign-vs-observed-float32-rounding-cell' as const,
  };
  if (collectMeshGeometries(scene).length === 0) {
    return { ...base, notRunReason: 'mesh-geometry-missing', state: 'not-run' };
  }
  if (sections === null) return { ...base, notRunReason: 'source-topology-unreadable', state: 'not-run' };

  let indeterminateTriangles = 0;
  let invalidTriangles = 0;
  let matchingTriangles = 0;
  let minimumCertainDeterminantMagnitude = Number.POSITIVE_INFINITY;
  let mismatchingTriangles = 0;
  let triangleCount = 0;
  const sectionMeasurements: Md5TangentHandednessSectionOracle[] = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex]!;
    const { geometry } = section;
    const floatsPerVertex = geometry.layout.stride / 4;
    const indices = geometry.indices;
    const xCorrelation = measureTangentXCorrelation(geometry);
    let sectionIndeterminateUvWindingTriangles = 0;
    let sectionInvalidTriangles = 0;
    let sectionMatchingTriangles = 0;
    let sectionMismatchingTriangles = 0;
    let negativeUvWindingTriangles = 0;
    let positiveUvWindingTriangles = 0;
    let sectionTriangleCount = 0;
    if (indices === null || geometry.topology !== 'triangle-list') {
      sectionInvalidTriangles = Math.floor((indices?.length ?? vertexCountOf(geometry)) / 3);
      invalidTriangles += sectionInvalidTriangles;
      sectionTriangleCount = sectionInvalidTriangles;
      triangleCount += sectionTriangleCount;
      sectionMeasurements.push({
        ...xCorrelation,
        indeterminateUvWindingTriangles: 0,
        invalidTriangles: sectionInvalidTriangles,
        matchingTriangles: 0,
        mismatchingTriangles: 0,
        negativeUvWindingTriangles: 0,
        positiveUvWindingTriangles: 0,
        section: sectionIndex,
        triangleCount: sectionTriangleCount,
      });
      continue;
    }
    for (let element = 0; element + 2 < indices.length; element += 3) {
      triangleCount++;
      sectionTriangleCount++;
      const outputIndices = [indices[element]!, indices[element + 1]!, indices[element + 2]!];
      const sourceIndices = outputIndices.map((index) => section.outputToSource[index]);
      if (sourceIndices.some((index) => index === undefined)) {
        invalidTriangles++;
        sectionInvalidTriangles++;
        continue;
      }
      const tangentHandedness = outputIndices.map(
        (index) => geometry.vertices[index * floatsPerVertex + section.tangentOffset + 3]!,
      );
      const observedSign = tangentHandedness.every((value) => value === 1)
        ? 1
        : tangentHandedness.every((value) => value === -1)
          ? -1
          : null;

      const uv = sourceIndices.map((index) => section.source.uvs[index!]!);
      const determinant = determinantInterval(
        decimalRuntimeInterval(uv[0]!.u, geometry.vertices[outputIndices[0]! * floatsPerVertex + section.uvOffset]!),
        decimalRuntimeInterval(
          uv[0]!.v,
          geometry.vertices[outputIndices[0]! * floatsPerVertex + section.uvOffset + 1]!,
        ),
        decimalRuntimeInterval(uv[1]!.u, geometry.vertices[outputIndices[1]! * floatsPerVertex + section.uvOffset]!),
        decimalRuntimeInterval(
          uv[1]!.v,
          geometry.vertices[outputIndices[1]! * floatsPerVertex + section.uvOffset + 1]!,
        ),
        decimalRuntimeInterval(uv[2]!.u, geometry.vertices[outputIndices[2]! * floatsPerVertex + section.uvOffset]!),
        decimalRuntimeInterval(
          uv[2]!.v,
          geometry.vertices[outputIndices[2]! * floatsPerVertex + section.uvOffset + 1]!,
        ),
      );
      if (determinant === null) {
        invalidTriangles++;
        sectionInvalidTriangles++;
        continue;
      }
      if (determinant.min <= 0 && determinant.max >= 0) {
        indeterminateTriangles++;
        sectionIndeterminateUvWindingTriangles++;
        continue;
      }
      const expectedSign = determinant.min > 0 ? 1 : -1;
      if (expectedSign > 0) positiveUvWindingTriangles++;
      else negativeUvWindingTriangles++;
      const determinantMagnitude = Math.min(Math.abs(determinant.min), Math.abs(determinant.max));
      if (determinantMagnitude < minimumCertainDeterminantMagnitude)
        minimumCertainDeterminantMagnitude = determinantMagnitude;

      if (observedSign === expectedSign) {
        matchingTriangles++;
        sectionMatchingTriangles++;
      } else {
        mismatchingTriangles++;
        sectionMismatchingTriangles++;
      }
    }
    sectionMeasurements.push({
      ...xCorrelation,
      indeterminateUvWindingTriangles: sectionIndeterminateUvWindingTriangles,
      invalidTriangles: sectionInvalidTriangles,
      matchingTriangles: sectionMatchingTriangles,
      mismatchingTriangles: sectionMismatchingTriangles,
      negativeUvWindingTriangles,
      positiveUvWindingTriangles,
      section: sectionIndex,
      triangleCount: sectionTriangleCount,
    });
  }

  const measurements = {
    id: MD5_TANGENT_HANDEDNESS_ORACLE_ID as typeof MD5_TANGENT_HANDEDNESS_ORACLE_ID,
    indeterminateTriangles,
    invalidTriangles,
    matchingTriangles,
    minimumCertainDeterminantMagnitude: Number.isFinite(minimumCertainDeterminantMagnitude)
      ? minimumCertainDeterminantMagnitude
      : null,
    mismatchingTriangles,
    sections: sectionMeasurements,
    triangleCount,
    xCorrelationRule: 'majority-direction-with-tie-indeterminate' as const,
    xSideComparison: 'triangle-centroid-sign-vs-observed-float32-rounding-cell' as const,
  };
  // ★ READ THE COUNTS, NOT THE STATE WORD. `not-run` here does NOT mean the check did not run — every
  // triangle below was measured. It means the oracle DECLINES TO CLAIM A PASS while any triangle is
  // indeterminate or invalid, because a pass over a partially-unreadable population would assert more
  // than was measured. A corpus with degenerate UV triangles therefore lands on `not-run` no matter how
  // correct the importer is: those triangles have no texture orientation to compare against.
  //
  // So a successful fix moves this field from `failed` to `not-run`, which reads like a regression and
  // is not one. The evidence is matchingTriangles up, mismatchingTriangles at zero, with
  // indeterminateTriangles unchanged — the indeterminate count is a property of the corpus, not of the
  // code under test. On the reference corpus that is 2694 matching / 0 mismatching / 48 indeterminate,
  // and `not-run` is the expected terminal state for a fully correct importer.
  if (mismatchingTriangles > 0) return { ...measurements, state: 'failed' };
  if (indeterminateTriangles > 0 || invalidTriangles > 0) {
    return { ...measurements, notRunReason: 'uv-winding-indeterminate', state: 'not-run' };
  }
  return { ...measurements, state: 'passed' };
}

export function measureMd5SplitTangentDifference(
  scene: Readonly<Scene3D>,
  meshSource: string,
): Md5TangentSplitDifferenceOracle {
  const sections = resolveGeometrySections(scene, meshSource);
  const empty = {
    candidateSplitVertices: 0,
    directionOnlyPairs: 0,
    emittedVertices: 0,
    handednessDifferentPairs: 0,
    handednessIndeterminatePairs: 0,
    handednessSamePairs: 0,
    id: MD5_TANGENT_SPLIT_DIFFERENCE_ORACLE_ID as typeof MD5_TANGENT_SPLIT_DIFFERENCE_ORACLE_ID,
    identicalFramePairs: 0,
    mappedSplitPairs: 0,
    pairs: [] as Md5TangentSplitPairMeasurement[],
    sourceVertices: 0,
  };
  if (sections === null) return { ...empty, notRunReason: 'source-topology-unreadable', state: 'not-run' };

  const sourceVertices = sections.reduce((count, section) => count + section.source.vertexCount, 0);
  const emittedVertices = sections.reduce((count, section) => count + vertexCountOf(section.geometry), 0);
  const candidateSplitVertices = emittedVertices - sourceVertices;
  const base = { ...empty, candidateSplitVertices, emittedVertices, sourceVertices };
  let directionOnlyPairs = 0;
  let handednessDifferentPairs = 0;
  let handednessIndeterminatePairs = 0;
  let handednessSamePairs = 0;
  let identicalFramePairs = 0;
  const pairs: Md5TangentSplitPairMeasurement[] = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex]!;
    const { geometry } = section;
    const floatsPerVertex = geometry.layout.stride / 4;
    const outputCount = vertexCountOf(geometry);
    for (let splitVertex = section.source.vertexCount; splitVertex < outputCount; splitVertex++) {
      const originalVertex = section.outputToSource[splitVertex];
      if (originalVertex === undefined || originalVertex >= section.source.vertexCount) {
        return { ...base, notRunReason: 'split-vertices-unmappable', state: 'not-run' };
      }
      const originalBase = originalVertex * floatsPerVertex + section.tangentOffset;
      const splitBase = splitVertex * floatsPerVertex + section.tangentOffset;
      const residuals = [0, 1, 2].map((component) =>
        Math.abs(geometry.vertices[originalBase + component]! - geometry.vertices[splitBase + component]!),
      );
      if (residuals.some((value) => !Number.isFinite(value))) {
        return { ...base, notRunReason: 'split-vertices-unmappable', state: 'not-run' };
      }
      const directionResidual = Math.hypot(...residuals);
      const directionChanged = residuals.some((residual) => residual !== 0);
      const originalHandedness = geometry.vertices[originalBase + 3]!;
      const splitHandedness = geometry.vertices[splitBase + 3]!;
      const handednessDeterminate = Math.abs(originalHandedness) === 1 && Math.abs(splitHandedness) === 1;
      const state: Md5TangentSplitPairMeasurement['state'] = !handednessDeterminate
        ? 'handedness-indeterminate'
        : originalHandedness !== splitHandedness
          ? 'handedness-different'
          : directionChanged
            ? 'direction-only'
            : 'identical-frame';
      if (state === 'handedness-different') handednessDifferentPairs++;
      else if (state === 'handedness-indeterminate') handednessIndeterminatePairs++;
      else {
        handednessSamePairs++;
        if (state === 'direction-only') directionOnlyPairs++;
        else identicalFramePairs++;
      }
      pairs.push({
        directionChanged,
        directionResidual,
        originalHandedness,
        originalVertex,
        section: sectionIndex,
        splitHandedness,
        splitVertex,
        state,
      });
    }
  }

  const measurements = {
    candidateSplitVertices,
    directionOnlyPairs,
    emittedVertices,
    handednessDifferentPairs,
    handednessIndeterminatePairs,
    handednessSamePairs,
    id: MD5_TANGENT_SPLIT_DIFFERENCE_ORACLE_ID as typeof MD5_TANGENT_SPLIT_DIFFERENCE_ORACLE_ID,
    identicalFramePairs,
    mappedSplitPairs: pairs.length,
    pairs,
    sourceVertices,
  };
  if (pairs.length === 0) return { ...measurements, notRunReason: 'split-vertices-absent', state: 'not-run' };
  if (handednessSamePairs > 0) return { ...measurements, state: 'failed' };
  if (handednessIndeterminatePairs > 0) {
    return { ...measurements, notRunReason: 'split-handedness-indeterminate', state: 'not-run' };
  }
  return { ...measurements, state: 'passed' };
}

function computeCodePathCrossCheckTangentFrames(
  geometry: Readonly<MeshGeometry>,
  positionOffset: number,
  normalOffset: number,
  uvOffset: number,
  floatsPerVertex: number,
  vertexCount: number,
): Float64Array | null {
  const indices = geometry.indices;
  if (indices === null) return null;
  const tangentSums = new Float64Array(vertexCount * 3);
  const bitangentSums = new Float64Array(vertexCount * 3);
  for (let element = 0; element + 2 < indices.length; element += 3) {
    const i0 = indices[element]!;
    const i1 = indices[element + 1]!;
    const i2 = indices[element + 2]!;
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) return null;
    const b0 = i0 * floatsPerVertex;
    const b1 = i1 * floatsPerVertex;
    const b2 = i2 * floatsPerVertex;
    const e1 = [
      geometry.vertices[b1 + positionOffset]! - geometry.vertices[b0 + positionOffset]!,
      geometry.vertices[b1 + positionOffset + 1]! - geometry.vertices[b0 + positionOffset + 1]!,
      geometry.vertices[b1 + positionOffset + 2]! - geometry.vertices[b0 + positionOffset + 2]!,
    ];
    const e2 = [
      geometry.vertices[b2 + positionOffset]! - geometry.vertices[b0 + positionOffset]!,
      geometry.vertices[b2 + positionOffset + 1]! - geometry.vertices[b0 + positionOffset + 1]!,
      geometry.vertices[b2 + positionOffset + 2]! - geometry.vertices[b0 + positionOffset + 2]!,
    ];
    const du1 = geometry.vertices[b1 + uvOffset]! - geometry.vertices[b0 + uvOffset]!;
    const dv1 = geometry.vertices[b1 + uvOffset + 1]! - geometry.vertices[b0 + uvOffset + 1]!;
    const du2 = geometry.vertices[b2 + uvOffset]! - geometry.vertices[b0 + uvOffset]!;
    const dv2 = geometry.vertices[b2 + uvOffset + 1]! - geometry.vertices[b0 + uvOffset + 1]!;
    const determinant = du1 * dv2 - dv1 * du2;
    if (!numbersFinite(...e1, ...e2, du1, dv1, du2, dv2, determinant) || determinant === 0) return null;
    const inverseDeterminant = 1 / determinant;
    const tangent = e1.map((component, axis) => (dv2 * component - dv1 * e2[axis]!) * inverseDeterminant);
    const bitangent = e1.map((component, axis) => (-du2 * component + du1 * e2[axis]!) * inverseDeterminant);
    for (const vertex of [i0, i1, i2]) {
      const sumBase = vertex * 3;
      for (let axis = 0; axis < 3; axis++) {
        tangentSums[sumBase + axis] += tangent[axis]!;
        bitangentSums[sumBase + axis] += bitangent[axis]!;
      }
    }
  }

  const expected = new Float64Array(vertexCount * 4);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const vertexBase = vertex * floatsPerVertex;
    const sumBase = vertex * 3;
    const nx = geometry.vertices[vertexBase + normalOffset]!;
    const ny = geometry.vertices[vertexBase + normalOffset + 1]!;
    const nz = geometry.vertices[vertexBase + normalOffset + 2]!;
    let tx = tangentSums[sumBase]!;
    let ty = tangentSums[sumBase + 1]!;
    let tz = tangentSums[sumBase + 2]!;
    if (!numbersFinite(nx, ny, nz, tx, ty, tz)) return null;
    const normalSquaredLength = nx * nx + ny * ny + nz * nz;
    if (!(normalSquaredLength > 0)) return null;
    const projection = (nx * tx + ny * ty + nz * tz) / normalSquaredLength;
    tx -= projection * nx;
    ty -= projection * ny;
    tz -= projection * nz;
    const tangentLength = Math.hypot(tx, ty, tz);
    if (!(tangentLength > 0)) return null;
    tx /= tangentLength;
    ty /= tangentLength;
    tz /= tangentLength;
    const crossX = ny * tz - nz * ty;
    const crossY = nz * tx - nx * tz;
    const crossZ = nx * ty - ny * tx;
    const orientation =
      crossX * bitangentSums[sumBase]! + crossY * bitangentSums[sumBase + 1]! + crossZ * bitangentSums[sumBase + 2]!;
    const expectedBase = vertex * 4;
    expected[expectedBase] = tx;
    expected[expectedBase + 1] = ty;
    expected[expectedBase + 2] = tz;
    expected[expectedBase + 3] = orientation < 0 ? -1 : 1;
  }
  return expected;
}

function resolveGeometrySections(scene: Readonly<Scene3D>, source: string): GeometrySection[] | null {
  const geometries = collectMeshGeometries(scene);
  const sourceSections = parseSourceSections(source);
  if (sourceSections === null) return null;
  const nonemptySections = sourceSections.filter((section) => section.triangleCount > 0);
  if (geometries.length !== nonemptySections.length) return null;

  const sections: GeometrySection[] = [];
  for (let sectionIndex = 0; sectionIndex < geometries.length; sectionIndex++) {
    const geometry = geometries[sectionIndex]!;
    const sourceSection = nonemptySections[sectionIndex]!;
    const normalOffset = getVertexAttributeFloatOffset(geometry.layout, 'normal');
    const positionOffset = getVertexAttributeFloatOffset(geometry.layout, 'position');
    const tangentOffset = tangentFloatOffset(geometry);
    const uvOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
    const floatsPerVertex = geometry.layout.stride / 4;
    const outputCount = vertexCountOf(geometry);
    if (
      normalOffset < 0 ||
      positionOffset < 0 ||
      tangentOffset < 0 ||
      uvOffset < 0 ||
      outputCount < sourceSection.vertexCount ||
      geometry.indices === null
    ) {
      return null;
    }
    const outputToSource: number[] = [];
    for (let vertex = 0; vertex < sourceSection.vertexCount; vertex++) outputToSource.push(vertex);
    for (let vertex = sourceSection.vertexCount; vertex < outputCount; vertex++) {
      const matches: number[] = [];
      for (let sourceVertex = 0; sourceVertex < sourceSection.vertexCount; sourceVertex++) {
        if (recordsEqualExceptTangent(geometry, sourceVertex, vertex, tangentOffset, floatsPerVertex))
          matches.push(sourceVertex);
      }
      if (matches.length !== 1) return null;
      outputToSource.push(matches[0]!);
    }
    for (let vertex = 0; vertex < outputCount; vertex++) {
      const sourceVertex = outputToSource[vertex]!;
      const uv = sourceSection.uvs[sourceVertex]!;
      const runtimeBase = vertex * floatsPerVertex + uvOffset;
      if (
        geometry.vertices[runtimeBase] !== Math.fround(uv.u.value) ||
        geometry.vertices[runtimeBase + 1] !== Math.fround(uv.v.value)
      ) {
        return null;
      }
    }
    sections.push({
      geometry,
      normalOffset,
      outputToSource,
      positionOffset,
      source: sourceSection,
      tangentOffset,
      uvOffset,
    });
  }
  return sections;
}

function parseSourceSections(source: string): SourceSection[] | null {
  const probe = probeMd5Sections(source);
  if (probe.kind !== 'mesh' || !probe.declarationsReconciled) return null;
  const lines = source
    .split(/\r?\n/)
    .map(stripLineComment)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const meshBlocks: string[][] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    let startsMesh = lines[lineIndex] === 'mesh {';
    if (lines[lineIndex] === 'mesh' && lines[lineIndex + 1] === '{') {
      startsMesh = true;
      lineIndex++;
    }
    if (!startsMesh) continue;
    const block: string[] = [];
    let closed = false;
    for (lineIndex++; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;
      if (line === '}') {
        closed = true;
        break;
      }
      block.push(line);
    }
    if (!closed) return null;
    meshBlocks.push(block);
  }
  if (meshBlocks.length !== probe.sections.meshes.length) return null;

  const sections: SourceSection[] = [];
  const numberSource = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
  const vertPattern = new RegExp(
    String.raw`^vert\s+(\d+)\s+\(\s*(${numberSource})\s+(${numberSource})\s*\)\s+\d+\s+\d+$`,
  );
  for (let sectionIndex = 0; sectionIndex < meshBlocks.length; sectionIndex++) {
    const body = probe.sections.meshes[sectionIndex]!;
    const vertexCount = body.vertices.declaration.value;
    const triangleCount = body.triangles.declaration.value;
    if (vertexCount === null || triangleCount === null) return null;
    const uvs: ({ u: DecimalToken; v: DecimalToken } | undefined)[] = new Array(vertexCount);
    for (const line of meshBlocks[sectionIndex]!) {
      const match = vertPattern.exec(line);
      if (match === null) continue;
      const index = Number(match[1]);
      const u = parseDecimalToken(match[2]!);
      const v = parseDecimalToken(match[3]!);
      if (index >= vertexCount || u === null || v === null || uvs[index] !== undefined) return null;
      uvs[index] = { u, v };
    }
    if (uvs.some((uv) => uv === undefined)) return null;
    sections.push({ triangleCount, uvs: uvs as { u: DecimalToken; v: DecimalToken }[], vertexCount });
  }
  return sections;
}

function collectMeshGeometries(scene: Readonly<Scene3D>): Readonly<MeshGeometry>[] {
  const geometries: Readonly<MeshGeometry>[] = [];
  const pending = [scene.root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (isMesh(node)) geometries.push(node.geometry);
    const children = getNodeChildren(node);
    for (let child = children.length - 1; child >= 0; child--) pending.push(children[child]!);
  }
  return geometries;
}

function collectMd5MeshReferences(treeDirectory: string): string[] {
  const references: string[] = [];
  const pending = [treeDirectory];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md5mesh')) {
        references.push(relative(treeDirectory, path).split(sep).join('/'));
      }
    }
  }
  return references.sort();
}

function determinantInterval(
  u0: NumericInterval | null,
  v0: NumericInterval | null,
  u1: NumericInterval | null,
  v1: NumericInterval | null,
  u2: NumericInterval | null,
  v2: NumericInterval | null,
): NumericInterval | null {
  if (u0 === null || v0 === null || u1 === null || v1 === null || u2 === null || v2 === null) return null;
  const du1 = subtractIntervals(u1, u0);
  const dv1 = subtractIntervals(v1, v0);
  const du2 = subtractIntervals(u2, u0);
  const dv2 = subtractIntervals(v2, v0);
  return subtractIntervals(multiplyIntervals(du1, dv2), multiplyIntervals(du2, dv1));
}

function classifyXCorrelation(
  positiveTangentHandednessTriangles: number,
  negativeTangentHandednessTriangles: number,
  mixedTangentHandednessTriangles: number,
  sameSignAsXTriangles: number,
  oppositeSignToXTriangles: number,
): Md5TangentHandednessXCorrelation {
  if (mixedTangentHandednessTriangles > 0) return 'indeterminate';
  if (positiveTangentHandednessTriangles > 0 && negativeTangentHandednessTriangles === 0) return 'uniform-positive';
  if (negativeTangentHandednessTriangles > 0 && positiveTangentHandednessTriangles === 0) return 'uniform-negative';
  if (positiveTangentHandednessTriangles === 0 || negativeTangentHandednessTriangles === 0) return 'indeterminate';
  if (sameSignAsXTriangles > oppositeSignToXTriangles) return 'split-same-sign-as-x';
  if (oppositeSignToXTriangles > sameSignAsXTriangles) return 'split-opposite-sign-to-x';
  return 'indeterminate';
}

function float32SumInterval(values: readonly number[]): NumericInterval | null {
  let max = 0;
  let min = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return null;
    const radius = float32RoundingRadius(value);
    max += value + radius;
    min += value - radius;
  }
  return { max, min };
}

function decimalRuntimeInterval(token: DecimalToken, runtimeValue: number): NumericInterval | null {
  if (!Number.isFinite(runtimeValue) || runtimeValue !== Math.fround(token.value)) return null;
  const radius = token.precision + float32RoundingRadius(runtimeValue);
  return { max: runtimeValue + radius, min: runtimeValue - radius };
}

function multiplyIntervals(a: NumericInterval, b: NumericInterval): NumericInterval {
  const products = [a.min * b.min, a.min * b.max, a.max * b.min, a.max * b.max];
  return { max: Math.max(...products), min: Math.min(...products) };
}

function subtractIntervals(a: NumericInterval, b: NumericInterval): NumericInterval {
  return { max: a.max - b.min, min: a.min - b.max };
}

function parseDecimalToken(source: string): DecimalToken | null {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(source);
  if (match === null || (match[2] === '' && match[3] === '')) return null;
  const value = Number(source);
  if (!Number.isFinite(value)) return null;
  const fractionalDigits = match[3]?.length ?? 0;
  const exponent = match[4] === undefined ? 0 : Number(match[4]);
  const precision = 0.5 * 10 ** (exponent - fractionalDigits);
  if (!Number.isFinite(precision) || precision <= 0) return null;
  return { precision, value };
}

function recordsEqualExceptTangent(
  geometry: Readonly<MeshGeometry>,
  a: number,
  b: number,
  tangentOffset: number,
  floatsPerVertex: number,
): boolean {
  const aBase = a * floatsPerVertex;
  const bBase = b * floatsPerVertex;
  for (let component = 0; component < floatsPerVertex; component++) {
    if (component >= tangentOffset && component < tangentOffset + 4) continue;
    if (geometry.vertices[aBase + component] !== geometry.vertices[bBase + component]) return false;
  }
  return true;
}

function productRoundingBound(a: number, b: number): number {
  const aRadius = float32RoundingRadius(a);
  const bRadius = float32RoundingRadius(b);
  return Math.abs(a) * bRadius + Math.abs(b) * aRadius + aRadius * bRadius;
}

function float32RoundingRadius(value: number): number {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const previous = nextFloat32(value, -1);
  const next = nextFloat32(value, 1);
  return Math.max((value - previous) / 2, (next - value) / 2);
}

function nextFloat32(value: number, direction: -1 | 1): number {
  if (Number.isNaN(value)) return value;
  if (value === Number.POSITIVE_INFINITY) return direction > 0 ? value : FLOAT32_MAX;
  if (value === Number.NEGATIVE_INFINITY) return direction < 0 ? value : -FLOAT32_MAX;
  if (value === 0) return direction > 0 ? FLOAT32_MIN : -FLOAT32_MIN;
  FLOAT32_VIEW[0] = value;
  const increment = value > 0 === direction > 0 ? 1 : -1;
  UINT32_VIEW[0] = UINT32_VIEW[0]! + increment;
  return FLOAT32_VIEW[0]!;
}

function tangentFloatOffset(geometry: Readonly<MeshGeometry>): number {
  return getVertexAttributeFloatOffset(geometry.layout, 'tangent');
}

function vertexCountOf(geometry: Readonly<MeshGeometry>): number {
  const floatsPerVertex = geometry.layout.stride / 4;
  return floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
}

function numbersFinite(...values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

function setProceduralControlVertex(
  vertices: Float32Array,
  vertex: number,
  x: number,
  y: number,
  u: number,
  v: number,
): void {
  const base = vertex * 12;
  vertices[base] = x;
  vertices[base + 1] = y;
  vertices[base + 5] = 1;
  vertices[base + 10] = u;
  vertices[base + 11] = v;
}

function stripLineComment(line: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index + 1 < line.length; index++) {
    const char = line[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === '/' && line[index + 1] === '/') return line.slice(0, index);
  }
  return line;
}

function formatNotRunReason(value: { notRunReason?: string }): string {
  return value.notRunReason === undefined ? '' : ` reason=${value.notRunReason}`;
}

function splitPairReason(pair: Md5TangentSplitPairMeasurement): string {
  if (pair.state === 'handedness-different') return 'opposite-unit-handedness-signs';
  if (pair.state === 'direction-only') return 'same-unit-handedness-sign-direction-differs';
  if (pair.state === 'identical-frame') return 'same-unit-handedness-sign-and-direction';
  return 'one-or-both-handedness-signs-non-unit';
}

function main(): void {
  const selection = parseOracleSelection(process.argv.slice(2));
  if (selection === 'handedness-control') {
    const control = runProceduralMirroredUvTangentControl();
    process.stdout.write(
      `procedural-mirrored-uv triangles=${control.triangleCount} tangent-positive=${control.positiveTangentHandednessTriangles} tangent-negative=${control.negativeTangentHandednessTriangles} tangent-mixed=${control.mixedTangentHandednessTriangles} x-correlation=${control.xCorrelation} same-sign-as-x=${control.sameSignAsXTriangles} opposite-sign-to-x=${control.oppositeSignToXTriangles} negative-x-negative=${control.negativeXNegativeHandednessTriangles} negative-x-positive=${control.negativeXPositiveHandednessTriangles} positive-x-negative=${control.positiveXNegativeHandednessTriangles} positive-x-positive=${control.positiveXPositiveHandednessTriangles} x-side-indeterminate=${control.xSideIndeterminateTriangles} invalid=${control.invalidTriangles}\n`,
    );
    return;
  }
  const cacheDirectory = resolveFixtureCacheDirectory();
  const treeDirectory = getFixtureTreePath(cacheDirectory, MD5_TANGENT_FIXTURE_VARIANT, MD5_TANGENT_FIXTURE_PACK);
  const stamp = readFixtureTreeStamp(treeDirectory);
  const pack = stamp?.packs.find((candidate) => candidate.pack === MD5_TANGENT_FIXTURE_PACK);
  if (
    stamp === null ||
    pack === undefined ||
    stamp.tag !== FIXTURE_RELEASE_TAG ||
    stamp.variant !== MD5_TANGENT_FIXTURE_VARIANT
  ) {
    throw new Error(
      `Verified ${MD5_TANGENT_FIXTURE_PACK} ${MD5_TANGENT_FIXTURE_VARIANT} tree is unavailable; run npm run fixtures -- ${MD5_TANGENT_FIXTURE_PACK} --variant ${MD5_TANGENT_FIXTURE_VARIANT}`,
    );
  }
  const report = runMd5TangentFrameOracleCorpus(treeDirectory, pack.verifiedFixtureFiles, selection);
  process.stdout.write(formatMd5TangentFrameOracleCorpusReport(report));
  if (report.state === 'not-run') process.exitCode = 1;
}

function parseOracleSelection(arguments_: readonly string[]): Md5TangentFrameOracleCliSelection {
  if (arguments_.length === 0) return 'all';
  if (arguments_.length === 1 && arguments_[0] === '--oracle=handedness') return 'handedness';
  if (arguments_.length === 1 && arguments_[0] === '--oracle=handedness-control') return 'handedness-control';
  if (arguments_.length === 1 && arguments_[0] === '--oracle=split-difference') return 'split-difference';
  throw new Error(`Unknown MD5 tangent oracle arguments: ${arguments_.join(' ')}`);
}

const FLOAT32_STORAGE = new ArrayBuffer(4);
const FLOAT32_VIEW = new Float32Array(FLOAT32_STORAGE);
const UINT32_VIEW = new Uint32Array(FLOAT32_STORAGE);
const FLOAT32_MIN = 2 ** -149;
const FLOAT32_MAX = (2 - 2 ** -23) * 2 ** 127;
const MD5_TANGENT_FIXTURE_PACK = 'mesh-legacy-fixtures';
const MD5_TANGENT_FIXTURE_VARIANT = 'full';
const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  try {
    main();
  } catch (error: unknown) {
    process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
