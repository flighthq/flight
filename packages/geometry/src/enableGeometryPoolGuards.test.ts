import {
  addLogSink,
  clearLogOnceKeys,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import {
  areGeometryPoolGuardsEnabled,
  disableGeometryPoolGuards,
  enableGeometryPoolGuards,
} from './enableGeometryPoolGuards';
import { acquireMatrix3, clearMatrix3Pool, releaseMatrix3 } from './matrix3Pool';
import { acquireMatrix4, clearMatrix4Pool, releaseMatrix4 } from './matrix4Pool';
import { acquireMatrix, clearMatrixPool, releaseMatrix } from './matrixPool';
import { acquireQuaternion, clearQuaternionPool, releaseQuaternion } from './quaternionPool';
import { acquireRectangle, clearRectanglePool, releaseRectangle } from './rectanglePool';
import { acquireVector2, clearVector2Pool, releaseVector2 } from './vector2Pool';
import { acquireVector3, clearVector3Pool, releaseVector3 } from './vector3Pool';
import { acquireVector4, clearVector4Pool, releaseVector4 } from './vector4Pool';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(16);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function clearPools(): void {
  clearMatrixPool();
  clearMatrix3Pool();
  clearMatrix4Pool();
  clearQuaternionPool();
  clearRectanglePool();
  clearVector2Pool();
  clearVector3Pool();
  clearVector4Pool();
}

function doubleRelease<Value>(acquire: () => Value, release: (value: Value) => void): void {
  const value = acquire();
  release(value);
  release(value);
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

beforeEach(() => {
  clearLogOnceKeys();
  clearPools();
});

afterEach(() => {
  disableGeometryPoolGuards();
  clearPools();
});

describe('areGeometryPoolGuardsEnabled', () => {
  it('reports whether the pool release diagnostic is installed', () => {
    expect(areGeometryPoolGuardsEnabled()).toBe(false);
    enableGeometryPoolGuards();
    expect(areGeometryPoolGuardsEnabled()).toBe(true);
    disableGeometryPoolGuards();
    expect(areGeometryPoolGuardsEnabled()).toBe(false);
  });
});

describe('disableGeometryPoolGuards', () => {
  it('restores the production-default silent release path', () => {
    enableGeometryPoolGuards();
    disableGeometryPoolGuards();
    const entries = captureLog(() => doubleRelease(acquireVector2, releaseVector2));
    expect(entries).toHaveLength(0);
  });
});

describe('enableGeometryPoolGuards', () => {
  // ONE firing test deliberately consumes all eight process-lifetime logOnce keys.
  it('warns once for a double release from every geometry pool and stays silent for valid brackets', () => {
    enableGeometryPoolGuards();

    const pairedEntries = captureLog(() => {
      releaseMatrix(acquireMatrix());
      releaseMatrix3(acquireMatrix3());
      releaseMatrix4(acquireMatrix4());
      releaseQuaternion(acquireQuaternion());
      releaseRectangle(acquireRectangle());
      releaseVector2(acquireVector2());
      releaseVector3(acquireVector3());
      releaseVector4(acquireVector4());
    });
    expect(pairedEntries).toHaveLength(0);

    const entries = captureLog(() => {
      doubleRelease(acquireMatrix, releaseMatrix);
      doubleRelease(acquireMatrix3, releaseMatrix3);
      doubleRelease(acquireMatrix4, releaseMatrix4);
      doubleRelease(acquireQuaternion, releaseQuaternion);
      doubleRelease(acquireRectangle, releaseRectangle);
      doubleRelease(acquireVector2, releaseVector2);
      doubleRelease(acquireVector3, releaseVector3);
      doubleRelease(acquireVector4, releaseVector4);
    });

    expect(entries).toHaveLength(8);
    expect(entries.every((entry) => entry.channel === 'geometry')).toBe(true);
    const messages = entries.map(messageOf);
    for (const releaseFunction of [
      'releaseMatrix',
      'releaseMatrix3',
      'releaseMatrix4',
      'releaseQuaternion',
      'releaseRectangle',
      'releaseVector2',
      'releaseVector3',
      'releaseVector4',
    ]) {
      expect(messages.some((message) => message.includes(releaseFunction))).toBe(true);
    }
  });
});
