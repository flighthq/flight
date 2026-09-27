import { describe, expect, it } from 'vitest';

import {
  analyzeSkeleton2DJson,
  registerSkeleton2DJsonAnalyzer,
  unregisterSkeleton2DJsonAnalyzer,
} from './skeleton2dJsonAnalyzer.ts';

describe('analyzeSkeleton2DJson', () => {
  it('returns null for invalid JSON', () => {
    expect(analyzeSkeleton2DJson('not-json')).toBeNull();
  });

  it('returns null for a JSON null', () => {
    expect(analyzeSkeleton2DJson('null')).toBeNull();
  });

  it('returns null for unrelated JSON', () => {
    expect(analyzeSkeleton2DJson(JSON.stringify({ type: 'lottie', v: '5.0' }))).toBeNull();
  });

  it('identifies a DragonBones document', () => {
    const result = analyzeSkeleton2DJson(JSON.stringify({ armature: [{ bone: [{ name: 'root' }] }] }));
    expect(result).not.toBeNull();
    expect(result!.format).toBe('dragonbones');
    expect(result!.counts).toBeInstanceOf(Map);
  });

  it('identifies a Spine JSON document', () => {
    const result = analyzeSkeleton2DJson(JSON.stringify({ bones: [{ name: 'root' }] }));
    expect(result).not.toBeNull();
    expect(result!.format).toBe('spine-json');
  });

  it('prefers Spine JSON over DragonBones when both keys present but no armature array', () => {
    const result = analyzeSkeleton2DJson(JSON.stringify({ bones: [{ name: 'root' }], armature: 'not-array' }));
    expect(result).not.toBeNull();
    expect(result!.format).toBe('spine-json');
  });
});

describe('registerSkeleton2DJsonAnalyzer', () => {
  it('adds a custom analyzer that takes precedence by registration order', () => {
    registerSkeleton2DJsonAnalyzer(
      'test-format',
      (record) => record.testMarker === true,
      () => new Map([['testSection', 1]]),
    );
    const result = analyzeSkeleton2DJson(JSON.stringify({ testMarker: true }));
    expect(result).not.toBeNull();
    expect(result!.format).toBe('test-format');
    unregisterSkeleton2DJsonAnalyzer('test-format');
  });
});

describe('unregisterSkeleton2DJsonAnalyzer', () => {
  it('returns false when removing a non-existent analyzer', () => {
    expect(unregisterSkeleton2DJsonAnalyzer('nonexistent-format')).toBe(false);
  });

  it('removes a previously registered analyzer', () => {
    registerSkeleton2DJsonAnalyzer(
      'removable',
      () => true,
      () => new Map(),
    );
    expect(unregisterSkeleton2DJsonAnalyzer('removable')).toBe(true);
    expect(unregisterSkeleton2DJsonAnalyzer('removable')).toBe(false);
  });
});
