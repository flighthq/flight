import {
  createCamera3D,
  createPerspectiveProjection,
  setCamera3DViewMatrix4FromMatrix4,
} from '@flighthq/camera/contract';
import { createMatrix4 } from '@flighthq/geometry/contract';
import { setLogSink } from '@flighthq/log/contract';
import { createPlaneMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, LogEntry } from '@flighthq/types/contract';
import { afterEach, describe, expect, test } from 'vitest';

import { createBillboard } from './billboard';
import { orientBillboardToCamera } from './billboardCamera';
import { areScene3DGuardsEnabled, disableScene3DGuards, enableScene3DGuards } from './enableScene3DGuards';

describe('areScene3DGuardsEnabled', () => {
  test('reports whether the guards are installed', () => {
    expect(areScene3DGuardsEnabled()).toBe(false);
    enableScene3DGuards();
    expect(areScene3DGuardsEnabled()).toBe(true);
    disableScene3DGuards();
    expect(areScene3DGuardsEnabled()).toBe(false);
  });
});

describe('disableScene3DGuards', () => {
  test('leaves the core silent again once removed', () => {
    enableScene3DGuards();
    disableScene3DGuards();
    expect(captureLog(() => orientBillboardToCamera(billboard(), singularCamera()))).toHaveLength(0);
  });
});

describe('enableScene3DGuards', () => {
  // `logOnce` keys this condition once and has no reset, so exactly ONE test may trigger it — a second
  // would be deduplicated away and assert nothing while still looking green.
  test('warns, naming the setter that can produce it, when the camera basis cannot be derived', () => {
    enableScene3DGuards();
    const entries = captureLog(() => orientBillboardToCamera(billboard(), singularCamera()));
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message: string }).message)).toContain('setCamera3DViewMatrix4FromMatrix4');
  });
});

afterEach(() => {
  disableScene3DGuards();
});

function billboard(): ReturnType<typeof createBillboard> {
  return createBillboard(createPlaneMeshGeometry(), [null], 'full');
}

function captureLog(run: () => void): LogEntry[] {
  const entries: LogEntry[] = [];
  setLogSink((entry) => entries.push(entry));
  try {
    run();
  } finally {
    setLogSink(null);
  }
  return entries;
}

function singularCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
  });
  setCamera3DViewMatrix4FromMatrix4(camera, createMatrix4(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
  return camera;
}
