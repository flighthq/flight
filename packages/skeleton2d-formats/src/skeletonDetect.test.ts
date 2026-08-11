import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  getSkeleton2DFormatKinds,
  parseSkeleton2D,
  registerSkeleton2DFormat,
  unregisterSkeleton2DFormat,
} from './skeletonDetect';

describe('getSkeleton2DFormatKinds', () => {
  it('enumerates sorted bound kinds and stops naming one after it is unregistered', () => {
    registerSkeleton2DFormat(
      'acme.Rig',
      (text) => text.startsWith('ACME'),
      () => null,
    );
    expect(getSkeleton2DFormatKinds()).toEqual(['DragonBones', 'Spine', 'acme.Rig']);

    unregisterSkeleton2DFormat('acme.Rig');

    expect(getSkeleton2DFormatKinds()).toEqual(['DragonBones', 'Spine']);
  });
});

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

    const parsed = parseSkeleton2D('ACME rig v1');
    // The registry is a module global, so this leaves it as it was found rather than claiming the kind —
    // and its detector matches a bare prefix, which would otherwise sit in front of every later parse.
    unregisterSkeleton2DFormat('acme.Rig');

    expect(parsed).toBe(sentinel);
  });
});

describe('unregisterSkeleton2DFormat', () => {
  it('removes a format, after which parseSkeleton2D no longer dispatches to it', () => {
    const sentinel = { animations: [], skeleton: { bones: [], slots: null } } as unknown as Skeleton2DImport;
    registerSkeleton2DFormat(
      'acme.Rig',
      (text) => text.startsWith('ACME'),
      () => sentinel,
    );

    unregisterSkeleton2DFormat('acme.Rig');

    expect(parseSkeleton2D('ACME rig v1')).toBeNull();
  });
});
