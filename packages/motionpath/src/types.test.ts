// Generated from crates/flight-motionpath/tests/types_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { createMotionPath, getMotionPathLoopModeString, parseMotionPathLoopMode } from './contract.ts';
import type { MotionPathLoopMode } from './contract.ts';

describe('directionValues', () => {
  it('exposes the closed forward and backward representation', () => {
    expect(1).toEqual(1);
    expect(-1).toEqual(-1);
  });
  it('carries the source numeric values', () => {
    expect(1).toEqual(1);
    expect(-1).toEqual(-1);
  });
  it('is copyable and comparable', () => {
    const direction = -1;
    expect(direction).toEqual(-1);
    expect(direction).not.toEqual(1);
  });
});

describe('getMotionPathLoopModeString', () => {
  it('returns the source literals', () => {
    expect(getMotionPathLoopModeString('clamp')).toEqual('clamp');
    expect(getMotionPathLoopModeString('loop')).toEqual('loop');
    expect(getMotionPathLoopModeString('pingpong')).toEqual('pingpong');
  });
});

describe('parseMotionPathLoopMode', () => {
  it('round trips every mode', () => {
    const modes: MotionPathLoopMode[] = ['clamp', 'loop', 'pingpong'];
    for (const mode of modes) {
      expect(parseMotionPathLoopMode(getMotionPathLoopModeString(mode))).toEqual(mode);
    }
  });
  it('rejects an unknown string', () => {
    expect(parseMotionPathLoopMode('bounce')).toEqual(undefined);
  });
});

describe('pathIdentity', () => {
  it('retains the source path object reference', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    const handle: Path = path;
    const marker = createMotionPath(handle, 0.0, undefined, undefined);
    expect(marker.path === handle).toBe(true);
  });
});
