import { getNodeChildren } from '@flighthq/node/contract';
import { createScene3DFromMd5Mesh } from '@flighthq/scene3d-formats/contract';
import type { Mesh, Scene3D } from '@flighthq/types/contract';

import {
  formatMd5TangentFrameOracleCorpusReport,
  measureMd5SplitTangentDifference,
  measureMd5TangentCodePathCrossCheck,
  measureMd5TangentHandedness,
  measureMd5TangentOrthogonality,
  runMd5TangentFrameOracles,
  runMd5TangentFrameOracleCorpus,
  runProceduralMirroredUvTangentControl,
} from './md5-tangent-frame-oracle';

describe('MD5 tangent orthogonality measurement', () => {
  it('measures tangent-normal residuals against Float32 rounding cells', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    expect(measureMd5TangentOrthogonality(scene)).toEqual({
      exactVertices: 3,
      id: 'md5.tangent-orthogonality',
      infiniteTangentVertices: 0,
      invalidVertices: 0,
      maximumPrecisionExcess: 0,
      maximumPrecisionBound: 1.4012985478487143e-45,
      maximumResidual: 0,
      maximumResidualToPrecisionRatio: 0,
      minimumNonzeroTangentLength: 1,
      nanTangentVertices: 0,
      outsidePrecisionVertices: 0,
      state: 'passed',
      vertexCount: 3,
      withinPrecisionVertices: 0,
      zeroLengthTangentVertices: 0,
    });
  });

  it('separates a residual outside representable precision from an unreadable frame', () => {
    const outside = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const outsideGeometry = meshGeometry(outside);
    outsideGeometry.vertices[7] = 0.25;
    expect(measureMd5TangentOrthogonality(outside)).toMatchObject({
      maximumResidual: 0.25,
      outsidePrecisionVertices: 1,
      state: 'failed',
    });

    const unreadable = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const unreadableGeometry = meshGeometry(unreadable);
    unreadableGeometry.vertices.fill(0, 6, 9);
    expect(measureMd5TangentOrthogonality(unreadable)).toMatchObject({
      invalidVertices: 1,
      notRunReason: 'tangent-frame-unreadable',
      state: 'not-run',
      zeroLengthTangentVertices: 1,
    });

    unreadableGeometry.vertices[6] = Number.NaN;
    expect(measureMd5TangentOrthogonality(unreadable)).toMatchObject({
      nanTangentVertices: 1,
      state: 'not-run',
      zeroLengthTangentVertices: 0,
    });
  });
});

describe('MD5 tangent frame corpus runner', () => {
  it('reports an empty acquired population as not run', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-md5-tangent-empty-'));
    try {
      const report = runMd5TangentFrameOracleCorpus(directory, 0);
      expect(report).toEqual({
        acquisition: {
          pack: 'mesh-legacy-fixtures',
          release: expect.any(String),
          variant: 'full',
          verifiedFixtureFiles: 0,
        },
        cases: [],
        discoveredMeshFiles: 0,
        importNotRunMeshFiles: 0,
        measuredMeshFiles: 0,
        notRunReason: 'md5-mesh-fixtures-absent',
        selection: 'all',
        state: 'not-run',
      });
      expect(formatMd5TangentFrameOracleCorpusReport(report)).toContain(
        'corpus-state=not-run measured-md5mesh=0 import-not-run-md5mesh=0 reason=md5-mesh-fixtures-absent',
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('walks and imports each acquired MD5 mesh before comparing it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-md5-tangent-populated-'));
    try {
      mkdirSync(join(directory, 'meshes', 'synthetic'), { recursive: true });
      writeFileSync(join(directory, 'meshes', 'synthetic', 'triangle.md5mesh'), SINGLE_TRIANGLE);
      const report = runMd5TangentFrameOracleCorpus(directory, 1);
      expect(report).toMatchObject({
        cases: [{ reference: 'meshes/synthetic/triangle.md5mesh', state: 'measured' }],
        discoveredMeshFiles: 1,
        importNotRunMeshFiles: 0,
        measuredMeshFiles: 1,
        state: 'measured',
      });
      expect(formatMd5TangentFrameOracleCorpusReport(report)).toContain(
        'tangent-nan=0 tangent-infinite=0 tangent-zero-length=0',
      );

      const handednessReport = runMd5TangentFrameOracleCorpus(directory, 1, 'handedness');
      expect(handednessReport).toMatchObject({
        cases: [
          {
            oracles: {
              handedness: { id: 'md5.tangent-handedness' },
            },
          },
        ],
        selection: 'handedness',
      });
      expect(
        Object.keys(handednessReport.cases[0]!.state === 'measured' ? handednessReport.cases[0]!.oracles : {}),
      ).toEqual(['handedness']);
      expect(formatMd5TangentFrameOracleCorpusReport(handednessReport)).not.toContain('tangent-nan=');

      writeFileSync(join(directory, 'meshes', 'synthetic', 'triangle.md5mesh'), MIRRORED_UV_TRIANGLES);
      const splitReport = runMd5TangentFrameOracleCorpus(directory, 1, 'split-difference');
      expect(splitReport).toMatchObject({
        acquisition: { verifiedFixtureFiles: 1 },
        cases: [
          {
            oracles: {
              splitDifference: {
                candidateSplitVertices: 2,
                emittedVertices: 6,
                mappedSplitPairs: 2,
                sourceVertices: 4,
              },
            },
          },
        ],
        selection: 'split-difference',
      });
      expect(formatMd5TangentFrameOracleCorpusReport(splitReport)).toContain(
        'source-vertices=4 emitted-vertices=6 candidate-splits=2 mapped-splits=2',
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

describe('MD5 tangent handedness measurement', () => {
  it('uses the same X-correlation measurement on a controlled procedural mirrored UV seam', () => {
    expect(runProceduralMirroredUvTangentControl()).toEqual({
      invalidTriangles: 0,
      mixedTangentHandednessTriangles: 0,
      negativeTangentHandednessTriangles: 1,
      negativeXNegativeHandednessTriangles: 1,
      negativeXPositiveHandednessTriangles: 0,
      oppositeSignToXTriangles: 0,
      positiveTangentHandednessTriangles: 1,
      positiveXNegativeHandednessTriangles: 0,
      positiveXPositiveHandednessTriangles: 1,
      sameSignAsXTriangles: 2,
      triangleCount: 2,
      xCorrelation: 'split-same-sign-as-x',
      xSideIndeterminateTriangles: 0,
    });
  });

  it('matches each tangent sign against a source-precision UV winding interval', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    expect(measureMd5TangentHandedness(scene, SINGLE_TRIANGLE)).toMatchObject({
      indeterminateTriangles: 0,
      invalidTriangles: 0,
      matchingTriangles: 1,
      mismatchingTriangles: 0,
      state: 'passed',
      triangleCount: 1,
    });
  });

  it('reports a known wrong sign as failure', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = meshGeometry(scene);
    const stride = geometry.layout.stride / 4;
    for (let vertex = 0; vertex < 3; vertex++) geometry.vertices[vertex * stride + 9] = 1;

    expect(measureMd5TangentHandedness(scene, SINGLE_TRIANGLE)).toMatchObject({
      mismatchingTriangles: 1,
      state: 'failed',
    });
  });

  it('withholds a sign when the source decimal cells admit both UV windings', () => {
    const coarseSource = SINGLE_TRIANGLE.replaceAll('0.0', '0').replaceAll('1.0', '1');
    const scene = createScene3DFromMd5Mesh(coarseSource);

    // The subject here is the WITHHOLDING — the source decimals admit both windings, so the oracle
    // must decline to judge. The handedness counts below are incidental observations of whatever the
    // importer emitted, and they follow the importer's convention: the sign now comes from the emitted
    // UV polarity per triangle rather than from a format-wide flip, which is why this fixture reads
    // negative where it once read positive. Neither value is the property under test.
    expect(measureMd5TangentHandedness(scene, coarseSource)).toMatchObject({
      indeterminateTriangles: 1,
      notRunReason: 'uv-winding-indeterminate',
      sections: [
        {
          indeterminateUvWindingTriangles: 1,
          negativeTangentHandednessTriangles: 1,
          negativeUvWindingTriangles: 0,
          positiveTangentHandednessTriangles: 0,
          positiveUvWindingTriangles: 0,
          xCorrelation: 'uniform-negative',
        },
      ],
      state: 'not-run',
    });
  });

  it('does not guess topology from unreadable source text', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    expect(measureMd5TangentHandedness(scene, 'not md5')).toMatchObject({
      notRunReason: 'source-topology-unreadable',
      state: 'not-run',
    });
  });

  it('distinguishes uniform, same-sign, and opposite-sign X correlation', () => {
    const uniform = createScene3DFromMd5Mesh(SIDE_SEPARATED_TRIANGLES);
    setHandednessByXSide(uniform, 1, 1);
    expect(measureMd5TangentHandedness(uniform, SIDE_SEPARATED_TRIANGLES).sections[0]).toMatchObject({
      negativeTangentHandednessTriangles: 0,
      positiveTangentHandednessTriangles: 2,
      xCorrelation: 'uniform-positive',
    });

    const sameSign = createScene3DFromMd5Mesh(SIDE_SEPARATED_TRIANGLES);
    setHandednessByXSide(sameSign, -1, 1);
    expect(measureMd5TangentHandedness(sameSign, SIDE_SEPARATED_TRIANGLES).sections[0]).toMatchObject({
      oppositeSignToXTriangles: 0,
      sameSignAsXTriangles: 2,
      xCorrelation: 'split-same-sign-as-x',
    });

    const oppositeSign = createScene3DFromMd5Mesh(SIDE_SEPARATED_TRIANGLES);
    setHandednessByXSide(oppositeSign, 1, -1);
    expect(measureMd5TangentHandedness(oppositeSign, SIDE_SEPARATED_TRIANGLES).sections[0]).toMatchObject({
      oppositeSignToXTriangles: 2,
      sameSignAsXTriangles: 0,
      xCorrelation: 'split-opposite-sign-to-x',
    });
  });
});

describe('MD5 split tangent difference measurement', () => {
  it('counts opposite unit handedness signs without a direction threshold', () => {
    const scene = createScene3DFromMd5Mesh(MIRRORED_UV_TRIANGLES);
    const result = measureMd5SplitTangentDifference(scene, MIRRORED_UV_TRIANGLES);

    expect(result).toMatchObject({
      candidateSplitVertices: 2,
      directionOnlyPairs: 0,
      emittedVertices: 6,
      handednessDifferentPairs: 2,
      handednessIndeterminatePairs: 0,
      handednessSamePairs: 0,
      identicalFramePairs: 0,
      mappedSplitPairs: 2,
      sourceVertices: 4,
      state: 'passed',
    });
    expect(result.pairs).toEqual([
      expect.objectContaining({ originalVertex: 0, splitVertex: 4, state: 'handedness-different' }),
      expect.objectContaining({ originalVertex: 2, splitVertex: 5, state: 'handedness-different' }),
    ]);
  });

  it('reports same-sign direction-only splits as a removal candidate without deciding it', () => {
    const scene = createScene3DFromMd5Mesh(MIRRORED_UV_TRIANGLES);
    const geometry = meshGeometry(scene);
    const stride = geometry.layout.stride / 4;
    for (const [original, split] of [
      [0, 4],
      [2, 5],
    ] as const) {
      geometry.vertices[split * stride + 9] = geometry.vertices[original * stride + 9]!;
    }

    expect(measureMd5SplitTangentDifference(scene, MIRRORED_UV_TRIANGLES)).toMatchObject({
      directionOnlyPairs: 2,
      handednessDifferentPairs: 0,
      handednessSamePairs: 2,
      identicalFramePairs: 0,
      state: 'failed',
    });
  });

  it('distinguishes an identical emitted frame from a direction-only split', () => {
    const scene = createScene3DFromMd5Mesh(MIRRORED_UV_TRIANGLES);
    const geometry = meshGeometry(scene);
    const stride = geometry.layout.stride / 4;
    for (const [original, split] of [
      [0, 4],
      [2, 5],
    ] as const) {
      geometry.vertices.copyWithin(split * stride + 6, original * stride + 6, original * stride + 10);
    }

    expect(measureMd5SplitTangentDifference(scene, MIRRORED_UV_TRIANGLES)).toMatchObject({
      directionOnlyPairs: 0,
      handednessSamePairs: 2,
      identicalFramePairs: 2,
      state: 'failed',
    });
  });

  it('does not count a non-unit handedness value as agreement', () => {
    const scene = createScene3DFromMd5Mesh(MIRRORED_UV_TRIANGLES);
    const geometry = meshGeometry(scene);
    const stride = geometry.layout.stride / 4;
    geometry.vertices[4 * stride + 9] = 0;
    geometry.vertices[5 * stride + 9] = Number.NaN;

    expect(measureMd5SplitTangentDifference(scene, MIRRORED_UV_TRIANGLES)).toMatchObject({
      handednessDifferentPairs: 0,
      handednessIndeterminatePairs: 2,
      handednessSamePairs: 0,
      notRunReason: 'split-handedness-indeterminate',
      state: 'not-run',
    });
  });

  it('keeps a mesh without tangent splits as not measured', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    expect(measureMd5SplitTangentDifference(scene, SINGLE_TRIANGLE)).toMatchObject({
      candidateSplitVertices: 0,
      emittedVertices: 3,
      mappedSplitPairs: 0,
      notRunReason: 'split-vertices-absent',
      pairs: [],
      sourceVertices: 3,
      state: 'not-run',
    });
  });
});

describe('MD5 tangent code-path cross-check diagnostic', () => {
  it('records and executes its same-author procedure after the direct invariants', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const result = runMd5TangentFrameOracles(scene, SINGLE_TRIANGLE);

    expect(result.codePathCrossCheck).toEqual({
      calculation: 'per-triangle-uv-jacobian-solve-and-generalized-gram-schmidt',
      comparedComponents: 12,
      comparison: 'absolute-component-residual-vs-observed-float32-rounding-cell',
      coordinateBasis: 'flight-right-handed-y-up-after-import',
      differingComponents: 0,
      differingVertices: 0,
      id: 'md5.tangent-code-path-cross-check',
      independence: 'same-author-code-path-only',
      inputPreparation: 'imported-float32-position-normal-uv-and-index-streams',
      maximumPrecisionExcess: 0,
      maximumPrecisionBound: 5.960464477539063e-8,
      maximumResidual: 0,
      maximumResidualToPrecisionRatio: 0,
      role: 'diagnostic',
      state: 'passed',
      tool: 'conformance/md5/md5-tangent-frame-oracle',
    });
  });

  it('finds an emitted tangent that differs from the code-path-independent computation', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    meshGeometry(scene).vertices[6] = 0.5;

    expect(measureMd5TangentCodePathCrossCheck(scene)).toMatchObject({
      differingComponents: 1,
      differingVertices: 1,
      maximumResidual: 0.5,
      state: 'failed',
    });
  });

  it('does not repeat the production assumption that an encoded normal is exactly unit length', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = meshGeometry(scene);
    const stride = geometry.layout.stride / 4;
    for (let vertex = 0; vertex < 3; vertex++) {
      geometry.vertices[vertex * stride + 3] = 0.001;
      geometry.vertices[vertex * stride + 4] = -0.999999;
    }

    expect(measureMd5TangentCodePathCrossCheck(scene)).toMatchObject({
      differingComponents: 6,
      differingVertices: 3,
      state: 'failed',
    });
  });

  it('withholds the diagnostic for a UV gradient that has no source direction', () => {
    const degenerateSource = SINGLE_TRIANGLE.replace('vert 1 ( 1.0 0.0 )', 'vert 1 ( 0.0 0.0 )').replace(
      'vert 2 ( 0.0 1.0 )',
      'vert 2 ( 0.0 0.0 )',
    );
    const scene = createScene3DFromMd5Mesh(degenerateSource);

    expect(measureMd5TangentCodePathCrossCheck(scene)).toMatchObject({
      notRunReason: 'uv-gradient-indeterminate',
      state: 'not-run',
    });
  });
});

function meshGeometry(scene: Readonly<Scene3D>): Mesh['geometry'] {
  return (getNodeChildren(scene.root)[1] as Mesh).geometry;
}

function setHandednessByXSide(scene: Readonly<Scene3D>, negativeXSign: -1 | 1, positiveXSign: -1 | 1): void {
  const geometry = meshGeometry(scene);
  const indices = geometry.indices!;
  const stride = geometry.layout.stride / 4;
  for (let element = 0; element < indices.length; element += 3) {
    const triangle = [indices[element]!, indices[element + 1]!, indices[element + 2]!];
    const xSum = triangle.reduce((sum, index) => sum + geometry.vertices[index * stride]!, 0);
    const sign = xSum < 0 ? negativeXSign : positiveXSign;
    for (const index of triangle) geometry.vertices[index * stride + 9] = sign;
  }
}

const SINGLE_TRIANGLE = [
  'MD5Version 10',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/example"',
  '  numverts 3',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '  numtris 1',
  '  tri 0 0 1 2',
  '  numweights 3',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 1 0 0 )',
  '  weight 2 0 1.0 ( 0 1 0 )',
  '}',
].join('\n');

const MIRRORED_UV_TRIANGLES = [
  'MD5Version 10',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/mirrored"',
  '  numverts 4',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '  vert 3 ( 1.0 0.0 ) 3 1',
  '  numtris 2',
  '  tri 0 0 1 2',
  '  tri 1 0 2 3',
  '  numweights 4',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 1 0 0 )',
  '  weight 2 0 1.0 ( 0 1 0 )',
  '  weight 3 0 1.0 ( -1 0 0 )',
  '}',
].join('\n');

const SIDE_SEPARATED_TRIANGLES = [
  'MD5Version 10',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/sides"',
  '  numverts 6',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '  vert 3 ( 0.0 0.0 ) 3 1',
  '  vert 4 ( 1.0 0.0 ) 4 1',
  '  vert 5 ( 0.0 1.0 ) 5 1',
  '  numtris 2',
  '  tri 0 0 1 2',
  '  tri 1 3 4 5',
  '  numweights 6',
  '  weight 0 0 1.0 ( -2 0 0 )',
  '  weight 1 0 1.0 ( -1 0 0 )',
  '  weight 2 0 1.0 ( -2 1 0 )',
  '  weight 3 0 1.0 ( 1 0 0 )',
  '  weight 4 0 1.0 ( 2 0 0 )',
  '  weight 5 0 1.0 ( 1 1 0 )',
  '}',
].join('\n');
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
