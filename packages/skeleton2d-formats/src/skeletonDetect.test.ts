import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseSkeleton2D, registerSkeleton2DFormat } from './skeletonDetect';

describe('parseSkeleton2D', () => {
  it('auto-detects a Spine JSON document and parses it', () => {
    const doc = JSON.stringify({ skeleton: { spine: '4.1' }, bones: [{ name: 'root' }] });
    const result = parseSkeleton2D(doc);
    expect(result).not.toBeNull();
    expect(result!.skeleton.bones.length).toBe(1);
    expect(result!.skeleton.bones[0].name).toBe('root');
  });

  it('threads the diagnostics sink through to the detected parser', () => {
    const crumbs: ImportDiagnostic[] = [];
    const doc = JSON.stringify({
      bones: [{ name: 'root' }],
      slots: [{ name: 's', bone: 'root', attachment: 'c' }],
      skins: [{ name: 'default', attachments: { s: { c: { type: 'point' } } } }],
    });
    parseSkeleton2D(doc, crumbs);
    expect(crumbs.map((c) => c.kind)).toContain('spine.point-attachment-unsupported');
  });

  it('auto-detects a DragonBones JSON document (armature container) and parses it', () => {
    const doc = JSON.stringify({ version: '5.5', armature: [{ bone: [{ name: 'root' }] }] });
    const result = parseSkeleton2D(doc);
    expect(result).not.toBeNull();
    expect(result!.skeleton.bones[0].name).toBe('root');
  });

  it('returns null when no registered format recognizes the text', () => {
    expect(parseSkeleton2D('not a skeleton')).toBeNull();
    expect(parseSkeleton2D('<xml/>')).toBeNull();
    expect(parseSkeleton2D('{ "unrelated": true }')).toBeNull();
  });
});

describe('registerSkeleton2DFormat', () => {
  it('registers a custom (vendor-prefixed) format that parseSkeleton2D then dispatches to', () => {
    const sentinel = { animations: [], skeleton: { bones: [], slots: null } } as unknown as Skeleton2DImport;
    registerSkeleton2DFormat(
      'acme.Rig',
      (text) => text.startsWith('ACME'),
      () => sentinel,
    );
    expect(parseSkeleton2D('ACME rig v1')).toBe(sentinel);
  });
});
