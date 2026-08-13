import { createMatrix4 } from '@flighthq/geometry/contract';
import { describe, expect, test } from 'vitest';

import { createCamera3D, setCamera3DViewMatrix4FromLookAt, setCamera3DViewMatrix4FromMatrix4 } from './camera';
import { explainCamera3DView } from './explainCamera3DView';
import { createPerspectiveProjection } from './projection';

describe('explainCamera3DView', () => {
  test('accepts a rigid lookAt view', () => {
    const camera = perspectiveCamera();
    setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const explanation = explainCamera3DView(camera);
    expect(explanation.isOrthonormal).toBe(true);
    expect(explanation.isReflection).toBe(false);
    expect(explanation.determinant).toBeCloseTo(1, 6);
  });

  // The case manager asked to be costed before the contract was accepted: a mirror camera is improper
  // orthogonal (det = -1) but STILL orthogonal, so Rᵀ = R⁻¹ holds and nothing that relies on the
  // transpose is lost. It must not be reported as a violation.
  test('accepts a reflection view and reports it as one', () => {
    const camera = perspectiveCamera();
    setCamera3DViewMatrix4FromMatrix4(camera, createMatrix4(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 7, 9, 1));
    const explanation = explainCamera3DView(camera);
    expect(explanation.isOrthonormal).toBe(true);
    expect(explanation.isReflection).toBe(true);
    expect(explanation.determinant).toBeCloseTo(-1, 6);
  });

  test('reports a scaled view as non-orthonormal, with the deviation', () => {
    const camera = perspectiveCamera();
    setCamera3DViewMatrix4FromMatrix4(camera, createMatrix4(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1));
    const explanation = explainCamera3DView(camera);
    expect(explanation.isOrthonormal).toBe(false);
    expect(explanation.scaleDeviation).toBeCloseTo(1, 6);
  });

  test('reports a sheared view as non-orthonormal', () => {
    const camera = perspectiveCamera();
    setCamera3DViewMatrix4FromMatrix4(camera, createMatrix4(1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
    const explanation = explainCamera3DView(camera);
    expect(explanation.isOrthonormal).toBe(false);
    expect(explanation.shearDeviation).toBeGreaterThan(0.1);
  });
});

function perspectiveCamera(): ReturnType<typeof createCamera3D> {
  return createCamera3D({ far: 100, near: 0.1, projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }) });
}
