import { describe, expect, it } from 'vitest';

import type { FixtureManifest } from './fixtures-core';
import {
  crossCheckFixtureChecksums,
  crossCheckFixtureTag,
  formatFixturePlan,
  listFixturePackVariants,
  parseFixtureChecksums,
  parseFixtureManifest,
  planFixtureFetch,
} from './fixtures-core';

// The shape of the real 0.1.0 release in miniature: a full-only pack, a pack missing `permissive`, a
// two-member merge group, and an ungrouped pack with all three variants. Every rule this file pins has
// a defeating case in the live manifest, so the fixture carries one for each.
function createTestManifest(): FixtureManifest {
  return {
    packs: [
      entry('atf-fixtures', 'full'),
      entry('gltf-khronos-fixtures', 'full', 'gltf-khronos'),
      entry('gltf-khronos-fixtures', 'permissive', 'gltf-khronos'),
      entry('gltf-khronos-textures', 'full', 'gltf-khronos'),
      entry('gltf-khronos-textures', 'permissive', 'gltf-khronos'),
      entry('spine-fixtures', 'demo'),
      entry('spine-fixtures', 'full'),
      entry('swf-ruffle-fixtures', 'demo'),
      entry('swf-ruffle-fixtures', 'full'),
      entry('swf-ruffle-fixtures', 'permissive'),
    ],
    version: '0.1.0',
  };
}

function entry(pack: string, variant: string, mergeGroup?: string) {
  const file = `${pack}-${variant}-0.1.0.tar.gz`;
  const sha256 = hashOf(file);
  return mergeGroup === undefined
    ? { file, files: 10, pack, sha256, size: 1000, variant }
    : { file, files: 10, mergeGroup, pack, sha256, size: 1000, variant };
}

// A deterministic stand-in for a real digest — the parser only requires 64 lowercase hex characters,
// and using a recognizably synthetic value keeps a test hash from ever reading as a published one.
function hashOf(file: string): string {
  let value = '';
  for (let index = 0; index < 64; index += 1)
    value += '0123456789abcdef'[(file.charCodeAt(index % file.length) + index) % 16];
  return value;
}

describe('crossCheckFixtureChecksums', () => {
  it('reports nothing when the two published copies agree exactly', () => {
    const manifest = createTestManifest();
    const checksums = new Map(manifest.packs.map((packEntry) => [packEntry.file, packEntry.sha256]));
    expect(crossCheckFixtureChecksums(manifest, checksums)).toEqual([]);
  });

  it('reports a hash that differs between the two copies, naming both values', () => {
    const manifest = createTestManifest();
    const checksums = new Map(manifest.packs.map((packEntry) => [packEntry.file, packEntry.sha256]));
    checksums.set('atf-fixtures-full-0.1.0.tar.gz', 'f'.repeat(64));
    const problems = crossCheckFixtureChecksums(manifest, checksums);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('hashes disagree');
    expect(problems[0]).toContain('f'.repeat(64));
    expect(problems[0]).toContain(manifest.packs[0]!.sha256);
  });

  it('reports an entry present in only one copy, in both directions', () => {
    const manifest = createTestManifest();
    const checksums = new Map(manifest.packs.slice(1).map((packEntry) => [packEntry.file, packEntry.sha256]));
    checksums.set('unpublished-full-0.1.0.tar.gz', 'a'.repeat(64));
    expect(crossCheckFixtureChecksums(manifest, checksums)).toEqual([
      'atf-fixtures-full-0.1.0.tar.gz is in index.json but absent from SHA256SUMS',
      'unpublished-full-0.1.0.tar.gz is in SHA256SUMS but absent from index.json',
    ]);
  });
});

describe('crossCheckFixtureTag', () => {
  it('accepts a manifest whose version and filenames both carry the pinned tag', () => {
    expect(crossCheckFixtureTag(createTestManifest(), '0.1.0')).toEqual([]);
  });

  it('reports a manifest served from a different tag than the one pinned', () => {
    const manifest = { ...createTestManifest(), version: '0.2.0' };
    expect(crossCheckFixtureTag(manifest, '0.1.0')[0]).toContain('declares version 0.2.0');
  });

  it('reports an asset filename that does not carry the pinned tag', () => {
    const manifest = createTestManifest();
    const packs = [{ ...manifest.packs[0]!, file: 'atf-fixtures-full.tar.gz' }, ...manifest.packs.slice(1)];
    expect(crossCheckFixtureTag({ ...manifest, packs }, '0.1.0')[0]).toContain('does not carry the pinned tag');
  });
});

describe('formatFixturePlan', () => {
  it('names the added packs and why they were added when a merge group expands', () => {
    const plan = planFixtureFetch(createTestManifest(), ['gltf-khronos-fixtures'], 'full');
    const text = formatFixturePlan(plan);
    expect(text).toContain('gltf-khronos-textures');
    expect(text).toContain('shares the gltf-khronos tree');
    expect(text).toContain('a lone member yields a tree that looks complete and is not');
  });

  it('says nothing about merge groups when no pack was added', () => {
    expect(formatFixturePlan(planFixtureFetch(createTestManifest(), ['swf-ruffle-fixtures'], 'full'))).not.toContain(
      'Merge groups',
    );
  });

  it('states the variant it planned for', () => {
    expect(formatFixturePlan(planFixtureFetch(createTestManifest(), ['swf-ruffle-fixtures'], 'demo'))).toContain(
      'variant demo',
    );
  });

  it('prints the errors instead of a plan when the request could not be resolved', () => {
    expect(formatFixturePlan(planFixtureFetch(createTestManifest(), ['spine-fixtures'], 'permissive'))).toContain('✗');
  });
});

describe('listFixturePackVariants', () => {
  it('lists only the variants a pack actually publishes', () => {
    expect(listFixturePackVariants(createTestManifest(), 'spine-fixtures')).toEqual(['demo', 'full']);
    expect(listFixturePackVariants(createTestManifest(), 'atf-fixtures')).toEqual(['full']);
  });

  it('returns nothing for a pack the release does not publish', () => {
    expect(listFixturePackVariants(createTestManifest(), 'absent-fixtures')).toEqual([]);
  });
});

describe('parseFixtureChecksums', () => {
  it('reads the conventional two-space listing', () => {
    const parsed = parseFixtureChecksums(
      `${'a'.repeat(64)}  first-0.1.0.tar.gz\n${'b'.repeat(64)}  second-0.1.0.tar.gz\n`,
    );
    expect(parsed?.get('first-0.1.0.tar.gz')).toBe('a'.repeat(64));
    expect(parsed?.size).toBe(2);
  });

  it('reads the binary-mode star marker as well as the two-space form', () => {
    expect(parseFixtureChecksums(`${'a'.repeat(64)} *first-0.1.0.tar.gz\n`)?.get('first-0.1.0.tar.gz')).toBe(
      'a'.repeat(64),
    );
  });

  it('rejects the whole listing when any line is unreadable, rather than verifying fewer packs than it appears to', () => {
    expect(parseFixtureChecksums(`${'a'.repeat(64)}  first-0.1.0.tar.gz\nnot a checksum line\n`)).toBeNull();
  });

  it('returns the sentinel for an empty listing', () => {
    expect(parseFixtureChecksums('\n\n')).toBeNull();
  });
});

describe('parseFixtureManifest', () => {
  it('reads the published object shape', () => {
    const manifest = parseFixtureManifest(JSON.stringify(createTestManifest()));
    expect(manifest?.version).toBe('0.1.0');
    expect(manifest?.packs).toHaveLength(10);
  });

  it('preserves mergeGroup only on the entries that carry it', () => {
    const manifest = parseFixtureManifest(JSON.stringify(createTestManifest()));
    expect(manifest?.packs.find((packEntry) => packEntry.pack === 'gltf-khronos-textures')?.mergeGroup).toBe(
      'gltf-khronos',
    );
    expect(manifest?.packs.find((packEntry) => packEntry.pack === 'atf-fixtures')?.mergeGroup).toBeUndefined();
  });

  it('rejects the bare array a naive reader would assume', () => {
    expect(parseFixtureManifest(JSON.stringify(createTestManifest().packs))).toBeNull();
  });

  it('rejects an entry whose sha256 is not 64 hex characters', () => {
    const manifest = createTestManifest();
    const packs = [{ ...manifest.packs[0]!, sha256: 'abc' }, ...manifest.packs.slice(1)];
    expect(parseFixtureManifest(JSON.stringify({ ...manifest, packs }))).toBeNull();
  });

  it('rejects text that is not JSON at all', () => {
    expect(parseFixtureManifest('<!doctype html>')).toBeNull();
  });
});

describe('planFixtureFetch', () => {
  it('plans an ungrouped pack as exactly itself', () => {
    const plan = planFixtureFetch(createTestManifest(), ['swf-ruffle-fixtures'], 'full');
    expect(plan.errors).toEqual([]);
    expect(plan.entries.map((planned) => planned.entry.pack)).toEqual(['swf-ruffle-fixtures']);
    expect(plan.entries[0]!.tree).toBe('swf-ruffle-fixtures');
    expect(plan.entries[0]!.requested).toBe(true);
  });

  it('expands a named merge-group member to the whole group, into one shared tree', () => {
    const plan = planFixtureFetch(createTestManifest(), ['gltf-khronos-fixtures'], 'full');
    expect(plan.errors).toEqual([]);
    expect(plan.entries.map((planned) => planned.entry.pack)).toEqual([
      'gltf-khronos-fixtures',
      'gltf-khronos-textures',
    ]);
    expect(new Set(plan.entries.map((planned) => planned.tree))).toEqual(new Set(['gltf-khronos']));
  });

  it('marks the expanded packs as unrequested and the named one as requested', () => {
    const plan = planFixtureFetch(createTestManifest(), ['gltf-khronos-textures'], 'full');
    expect(plan.entries.find((planned) => planned.entry.pack === 'gltf-khronos-textures')?.requested).toBe(true);
    expect(plan.entries.find((planned) => planned.entry.pack === 'gltf-khronos-fixtures')?.requested).toBe(false);
  });

  it('keeps every member requested when the whole group was named explicitly', () => {
    const plan = planFixtureFetch(createTestManifest(), ['gltf-khronos-fixtures', 'gltf-khronos-textures'], 'full');
    expect(plan.entries.every((planned) => planned.requested)).toBe(true);
  });

  it('does not double-count a pack named twice', () => {
    const plan = planFixtureFetch(createTestManifest(), ['swf-ruffle-fixtures', 'swf-ruffle-fixtures'], 'full');
    expect(plan.entries).toHaveLength(1);
    expect(plan.totalBytes).toBe(1000);
  });

  it('fails a pack that publishes no such variant, naming the variants it does publish', () => {
    const plan = planFixtureFetch(createTestManifest(), ['spine-fixtures'], 'permissive');
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toContain('publishes no permissive variant');
    expect(plan.errors[0]).toContain('demo, full');
  });

  it('does not fall back to another variant when the asked-for one is missing', () => {
    const plan = planFixtureFetch(createTestManifest(), ['atf-fixtures'], 'demo');
    expect(plan.entries).toEqual([]);
    expect(plan.errors[0]).toContain('it publishes full');
  });

  it('says a missing variant came from merge-group expansion when it did', () => {
    const manifest = createTestManifest();
    const packs = manifest.packs.filter(
      (packEntry) => !(packEntry.pack === 'gltf-khronos-textures' && packEntry.variant === 'permissive'),
    );
    const plan = planFixtureFetch({ ...manifest, packs }, ['gltf-khronos-fixtures'], 'permissive');
    expect(plan.errors[0]).toContain('pulled in by merge-group expansion');
  });

  it('fails an unknown pack by name', () => {
    expect(planFixtureFetch(createTestManifest(), ['not-a-pack'], 'full').errors[0]).toContain(
      'unknown pack not-a-pack',
    );
  });

  it('fails when no pack was named', () => {
    expect(planFixtureFetch(createTestManifest(), [], 'full').errors[0]).toContain('no pack named');
  });

  it('withholds every entry when any part of the request failed, so a partial fetch never runs', () => {
    const plan = planFixtureFetch(createTestManifest(), ['swf-ruffle-fixtures', 'not-a-pack'], 'full');
    expect(plan.entries).toEqual([]);
    expect(plan.errors).toHaveLength(1);
  });

  it('totals the bytes and files of the whole expanded plan, not just the named pack', () => {
    const plan = planFixtureFetch(createTestManifest(), ['gltf-khronos-fixtures'], 'full');
    expect(plan.totalBytes).toBe(2000);
    expect(plan.totalFiles).toBe(20);
  });
});
