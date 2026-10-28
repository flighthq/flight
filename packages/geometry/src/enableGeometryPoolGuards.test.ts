import type { LogState } from '@flighthq/log/contract';
import {
  addLogSink,
  clearMemoryLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
} from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import {
  areGeometryPoolGuardsEnabled,
  disableGeometryPoolGuards,
  enableGeometryPoolGuards,
} from './enableGeometryPoolGuards.ts';
import { acquireMatrix3, clearMatrix3Pool, releaseMatrix3 } from './matrix3Pool.ts';
import { acquireMatrix4, clearMatrix4Pool, releaseMatrix4 } from './matrix4Pool.ts';
import { acquireMatrix, clearMatrixPool, releaseMatrix } from './matrixPool.ts';
import { acquireQuaternion, clearQuaternionPool, releaseQuaternion } from './quaternionPool.ts';
import { acquireRectangle, clearRectanglePool, releaseRectangle } from './rectanglePool.ts';
import { acquireVector2, clearVector2Pool, releaseVector2 } from './vector2Pool.ts';
import { acquireVector3, clearVector3Pool, releaseVector3 } from './vector3Pool.ts';
import { acquireVector4, clearVector4Pool, releaseVector4 } from './vector4Pool.ts';

// Each test gets its own caller-owned log state, so once-keys never leak between tests.
function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(16);
  addLogSink(logState, sink.sink);
  run();
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  clearMemoryLogSink(sink);
  return entries;
}

function clock(): number {
  return 0;
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
  logState = createLogState();
  clearPools();
});

afterEach(() => {
  disableGeometryPoolGuards();
  clearPools();
});

describe('areGeometryPoolGuardsEnabled', () => {
  it('reports whether the pool release diagnostic is installed', () => {
    expect(areGeometryPoolGuardsEnabled()).toBe(false);
    enableGeometryPoolGuards(logState, clock);
    expect(areGeometryPoolGuardsEnabled()).toBe(true);
    disableGeometryPoolGuards();
    expect(areGeometryPoolGuardsEnabled()).toBe(false);
  });
});

describe('disableGeometryPoolGuards', () => {
  it('restores the production-default silent release path', () => {
    enableGeometryPoolGuards(logState, clock);
    disableGeometryPoolGuards();
    const entries = captureLog(() => doubleRelease(acquireVector2, releaseVector2));
    expect(entries).toHaveLength(0);
  });
});

describe('enableGeometryPoolGuards', () => {
  // ONE firing test deliberately consumes all eight logOnce keys of this test's log state.
  it('warns once for a double release from every geometry pool and stays silent for valid brackets', () => {
    enableGeometryPoolGuards(logState, clock);

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

let logState: LogState = createLogState();
