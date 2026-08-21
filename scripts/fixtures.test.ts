import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  extractFixturePack,
  FIXTURE_RELEASE_TAG,
  isFixturePackMetadataEntry,
  FIXTURE_STAMP_FILE,
  getFixtureArchivePath,
  getFixturePackUrl,
  getFixtureTreePath,
  hashFixtureFile,
  parseFixtureArguments,
  readFixtureTreeStamp,
  realizeFixturePlan,
  resolveFixtureCacheDirectory,
  verifyFixtureArchive,
  verifyFixtureExtraction,
  writeFixtureTreeStamp,
} from './fixtures';

// NOTHING IN THIS FILE REACHES THE NETWORK. The verify and extract paths are exercised against tarballs
// this file builds in a temp directory, which is what makes them testable at all — the live fetch is a
// demonstration a person runs and reports, never a test that runs in CI.
let workspace = '';

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'flight-fixtures-'));
});

afterEach(() => {
  rmSync(workspace, { force: true, recursive: true });
  delete process.env['FLIGHT_FIXTURES_DIR'];
});

// A real gzipped tarball, so the extract path is proved against the same archive format the release
// publishes rather than against a stub that only looks like one.
function buildTarball(name: string, files: Readonly<Record<string, string>>): string {
  const stagingDirectory = join(workspace, `staging-${name}`);
  for (const [path, text] of Object.entries(files)) {
    const full = join(stagingDirectory, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text, 'utf8');
  }
  const archivePath = join(workspace, `${name}.tar.gz`);
  execFileSync('tar', ['-czf', archivePath, '-C', stagingDirectory, '.']);
  return archivePath;
}

function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('extractFixturePack', () => {
  it('unpacks a pack into a tree that did not exist yet', () => {
    const archivePath = buildTarball('one', { 'assets/first.txt': 'first', 'readme.txt': 'top' });
    const treeDirectory = join(workspace, 'tree');
    extractFixturePack(archivePath, treeDirectory);
    expect(readFileSync(join(treeDirectory, 'assets', 'first.txt'), 'utf8')).toBe('first');
    expect(readFileSync(join(treeDirectory, 'readme.txt'), 'utf8')).toBe('top');
  });

  it('merges two packs into one shared tree, which is what a merge group depends on', () => {
    const first = buildTarball('first', { 'shared/a.txt': 'a' });
    const second = buildTarball('second', { 'shared/b.txt': 'b' });
    const treeDirectory = join(workspace, 'tree');
    extractFixturePack(first, treeDirectory);
    extractFixturePack(second, treeDirectory);
    expect(existsSync(join(treeDirectory, 'shared', 'a.txt'))).toBe(true);
    expect(existsSync(join(treeDirectory, 'shared', 'b.txt'))).toBe(true);
  });
});

describe('getFixtureArchivePath', () => {
  it('addresses an archive by its hash alone, so a release bump reuses unchanged bytes', () => {
    const sha256 = 'a'.repeat(64);
    expect(getFixtureArchivePath('/cache', sha256)).toBe(join('/cache', 'packs', `${sha256}.tar.gz`));
  });

  it('gives two packs with identical bytes the same path and two different packs different paths', () => {
    expect(getFixtureArchivePath('/cache', 'a'.repeat(64))).toBe(getFixtureArchivePath('/cache', 'a'.repeat(64)));
    expect(getFixtureArchivePath('/cache', 'a'.repeat(64))).not.toBe(getFixtureArchivePath('/cache', 'b'.repeat(64)));
  });
});

describe('getFixturePackUrl', () => {
  it('resolves against the pinned tag rather than a moving release', () => {
    // The archive filename is deliberately independent of the release pin: this test proves the URL keeps the
    // manifest-owned filename verbatim while taking only its directory segment from FIXTURE_RELEASE_TAG.
    const url = getFixturePackUrl({
      file: 'atf-fixtures-full-0.1.0.tar.gz',
      files: 14,
      pack: 'atf-fixtures',
      sha256: 'a'.repeat(64),
      size: 1,
      variant: 'full',
    });
    expect(url).toContain(`/${FIXTURE_RELEASE_TAG}/`);
    expect(url).not.toContain('latest');
    expect(url.endsWith('/atf-fixtures-full-0.1.0.tar.gz')).toBe(true);
  });
});

describe('getFixtureTreePath', () => {
  it('separates the variants so two builds of one pack can never be mistaken for each other', () => {
    expect(getFixtureTreePath('/cache', 'full', 'spine-fixtures')).not.toBe(
      getFixtureTreePath('/cache', 'demo', 'spine-fixtures'),
    );
  });

  it('names the tree after the merge group when there is one', () => {
    expect(getFixtureTreePath('/cache', 'full', 'gltf-khronos')).toBe(
      join('/cache', 'extracted', 'full', 'gltf-khronos'),
    );
  });
});

describe('hashFixtureFile', () => {
  it('agrees with a whole-file digest of the same bytes', async () => {
    const archivePath = buildTarball('hashed', { 'a.txt': 'contents' });
    await expect(hashFixtureFile(archivePath)).resolves.toBe(sha256Of(archivePath));
  });
});

describe('readFixtureTreeStamp', () => {
  it('returns the sentinel for a tree that has never been extracted into', () => {
    expect(readFixtureTreeStamp(join(workspace, 'absent'))).toBeNull();
  });

  it('returns the sentinel for an unreadable stamp rather than trusting a partial one', () => {
    const treeDirectory = join(workspace, 'tree');
    mkdirSync(treeDirectory, { recursive: true });
    writeFileSync(join(treeDirectory, FIXTURE_STAMP_FILE), '{ not json', 'utf8');
    expect(readFixtureTreeStamp(treeDirectory)).toBeNull();
  });

  it('returns the sentinel for a stamp missing the variant it exists to record', () => {
    const treeDirectory = join(workspace, 'tree');
    mkdirSync(treeDirectory, { recursive: true });
    // The tag is deliberately pin-independent: absence of variant must reject even an otherwise arbitrary stamp.
    writeFileSync(join(treeDirectory, FIXTURE_STAMP_FILE), JSON.stringify({ packs: [], tag: '0.1.0' }), 'utf8');
    expect(readFixtureTreeStamp(treeDirectory)).toBeNull();
  });

  it('treats a count-only legacy stamp as stale so cached archives are re-extracted', () => {
    const treeDirectory = join(workspace, 'tree');
    mkdirSync(treeDirectory, { recursive: true });
    writeFileSync(
      join(treeDirectory, FIXTURE_STAMP_FILE),
      JSON.stringify({
        packs: [
          {
            file: 'legacy.tar.gz',
            metadataFiles: 0,
            pack: 'legacy-fixtures',
            sha256: 'a'.repeat(64),
            verifiedFixtureFiles: 1,
          },
        ],
        tag: FIXTURE_RELEASE_TAG,
        variant: 'full',
      }),
      'utf8',
    );

    expect(readFixtureTreeStamp(treeDirectory)).toBeNull();
  });

  it('rejects path arrays that do not agree with their count or repeat a path', () => {
    const treeDirectory = join(workspace, 'tree');
    mkdirSync(treeDirectory, { recursive: true });
    const base = {
      file: 'invalid.tar.gz',
      metadataFiles: 0,
      pack: 'invalid-fixtures',
      sha256: 'a'.repeat(64),
      verifiedFixtureFiles: 2,
    };
    for (const verifiedFixturePaths of [['one.asset'], ['one.asset', 'one.asset']]) {
      writeFileSync(
        join(treeDirectory, FIXTURE_STAMP_FILE),
        JSON.stringify({
          packs: [{ ...base, verifiedFixturePaths }],
          tag: FIXTURE_RELEASE_TAG,
          variant: 'full',
        }),
        'utf8',
      );
      expect(readFixtureTreeStamp(treeDirectory)).toBeNull();
    }
  });
});

describe('resolveFixtureCacheDirectory', () => {
  it('defaults to the gitignored pool beside the asset cache', () => {
    delete process.env['FLIGHT_FIXTURES_DIR'];
    expect(resolveFixtureCacheDirectory().endsWith(join('.cache', 'fixtures'))).toBe(true);
  });

  it('moves the whole pool off the workspace when FLIGHT_FIXTURES_DIR is set', () => {
    process.env['FLIGHT_FIXTURES_DIR'] = workspace;
    expect(resolveFixtureCacheDirectory()).toBe(workspace);
  });

  it('ignores an empty override rather than resolving the cache to the working directory', () => {
    process.env['FLIGHT_FIXTURES_DIR'] = '';
    expect(resolveFixtureCacheDirectory().endsWith(join('.cache', 'fixtures'))).toBe(true);
  });
});

describe('verifyFixtureArchive', () => {
  it('passes an untouched archive', async () => {
    const archivePath = buildTarball('good', { 'a.txt': 'contents' });
    await expect(verifyFixtureArchive(archivePath, sha256Of(archivePath))).resolves.toBeNull();
  });

  it('fails a cached archive whose bytes were altered, returning the hash it actually found', async () => {
    const archivePath = buildTarball('tampered', { 'a.txt': 'contents' });
    const expected = sha256Of(archivePath);
    const bytes = readFileSync(archivePath);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(archivePath, bytes);

    const actual = await verifyFixtureArchive(archivePath, expected);
    expect(actual).not.toBeNull();
    expect(actual).not.toBe(expected);
    expect(actual).toBe(sha256Of(archivePath));
  });

  it('fails a truncated archive, which is what an interrupted transfer leaves behind', async () => {
    const archivePath = buildTarball('short', { 'a.txt': 'contents' });
    const expected = sha256Of(archivePath);
    writeFileSync(archivePath, readFileSync(archivePath).subarray(0, 16));
    await expect(verifyFixtureArchive(archivePath, expected)).resolves.not.toBeNull();
  });
});

describe('isFixturePackMetadataEntry', () => {
  it('names the pack metadata rather than tolerating it as slack', () => {
    for (const path of ['NOTICE.md', 'README.md', 'manifest.json', 'LICENSES/anything.txt']) {
      expect(isFixturePackMetadataEntry(path)).toBe(true);
    }
  });

  it('treats fixtures as fixtures, including ones whose names resemble the metadata', () => {
    // A fixture that merely LIVES somewhere with a similar name must still be counted, or the exclusion
    // quietly becomes the tolerance it exists to avoid.
    for (const path of ['avm1/x.swf', 'docs/README.md', 'nested/LICENSES/x.txt', 'READMEs.md']) {
      expect(isFixturePackMetadataEntry(path)).toBe(false);
    }
  });

  it('normalizes the ./ prefix tar may or may not emit', () => {
    expect(isFixturePackMetadataEntry('./NOTICE.md')).toBe(true);
    expect(isFixturePackMetadataEntry('./LICENSES/x.txt')).toBe(true);
  });
});

describe('parseFixtureArguments', () => {
  it('selects every pack only when --all is explicit', () => {
    expect(parseFixtureArguments(['--all'])).toEqual({ all: true, list: false, packs: [], variant: 'full' });
  });

  it('retains named-pack and variant selection', () => {
    expect(parseFixtureArguments(['spine-fixtures', '--variant', 'demo'])).toEqual({
      all: false,
      list: false,
      packs: ['spine-fixtures'],
      variant: 'demo',
    });
  });

  it('rejects ambiguous all/list combinations and empty variants', () => {
    expect(() => parseFixtureArguments(['--all', 'spine-fixtures'])).toThrow('--all cannot be combined');
    expect(() => parseFixtureArguments(['--list', '--all'])).toThrow('--list cannot be combined');
    expect(() => parseFixtureArguments(['--variant='])).toThrow('--variant requires a non-empty value');
  });
});

describe('verifyFixtureExtraction', () => {
  // ★ THE MANIFEST'S PATH SET IS THE SPECIFICATION. Files the manifest does not declare are reported as
  // unlisted and gate nothing — the pack's NOTICE, its licences and its own manifest arrive alongside the
  // corpus and are not fixtures. This replaced a count comparison that needed the pack's author and this
  // reader to classify every file identically; the first pack filing a per-project licence beside its
  // assets showed they need not agree, and that neither of them was wrong.
  it('confirms every declared path landed and reports undeclared arrivals without gating on them', () => {
    const archivePath = buildTarball('verified', {
      'NOTICE.md': 'n',
      'README.md': 'r',
      'manifest.json': '{}',
      'LICENSES/terms-a.txt': 'x',
      'avm1/a.swf': 'a',
      'avm1/b.swf': 'b',
      'avm1/deep/license.txt': 'per-asset licence, one level down — the case that broke the old check',
    });
    const treeDirectory = join(workspace, 'verified-tree');
    extractFixturePack(archivePath, treeDirectory);

    const result = verifyFixtureExtraction(archivePath, treeDirectory, ['avm1/a.swf', 'avm1/b.swf']);

    expect(result.declaredFixtureFiles).toBe(2);
    expect(result.presentFixtureFiles).toBe(2);
    expect(result.missingSample).toEqual([]);
    // Five undeclared arrivals, including the nested per-asset licence. Visible, not fatal.
    expect(result.unlistedEntries).toContain('avm1/deep/license.txt');
    expect(result.unlistedEntries).toHaveLength(5);
  });

  // THE CASE THE CHECK EXISTS FOR. Before this, a partial write produced the same success line as a whole
  // one, because nothing between tar returning and the tick being printed looked at the tree.
  it('detects a truncated extraction and names what is missing', () => {
    const archivePath = buildTarball('partial', { 'avm1/a.swf': 'a', 'avm1/b.swf': 'b', 'avm1/c.swf': 'c' });
    const treeDirectory = join(workspace, 'partial-tree');
    extractFixturePack(archivePath, treeDirectory);
    rmSync(join(treeDirectory, 'avm1', 'b.swf'));

    const result = verifyFixtureExtraction(archivePath, treeDirectory, ['avm1/a.swf', 'avm1/b.swf', 'avm1/c.swf']);

    expect(result.declaredFixtureFiles).toBe(3);
    expect(result.presentFixtureFiles).toBe(2);
    expect(result.missingSample).toEqual(['avm1/b.swf']);
  });

  it('caps the missing sample so a wholly failed extraction does not carry thousands of entries', () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 25; index += 1) files[`avm1/f${index}.swf`] = 'x';
    const archivePath = buildTarball('empty-tree', files);
    const treeDirectory = join(workspace, 'never-extracted');
    mkdirSync(treeDirectory, { recursive: true });

    const declared = Array.from({ length: 25 }, (_unused, index) => `avm1/f${index}.swf`);
    const result = verifyFixtureExtraction(archivePath, treeDirectory, declared);
    expect(result.presentFixtureFiles).toBe(0);
    expect(result.missingSample).toHaveLength(10);
  });
});

describe('writeFixtureTreeStamp', () => {
  it('round-trips the tag, the variant, and the packs already in the tree', () => {
    const treeDirectory = join(workspace, 'tree');
    // These literals are deliberately pin-independent serialization data. Binding them would stop proving that
    // stamp reads and writes preserve a caller-supplied historical tag and its manifest-owned archive filename.
    writeFixtureTreeStamp(treeDirectory, {
      packs: [
        {
          file: 'b-full-0.1.0.tar.gz',
          metadataFiles: 1,
          pack: 'b-fixtures',
          sha256: 'b'.repeat(64),
          verifiedFixtureFiles: 2,
          verifiedFixturePaths: ['b.asset', 'a.asset'],
        },
      ],
      tag: '0.1.0',
      variant: 'full',
    });
    expect(readFixtureTreeStamp(treeDirectory)).toEqual({
      packs: [
        {
          file: 'b-full-0.1.0.tar.gz',
          metadataFiles: 1,
          pack: 'b-fixtures',
          sha256: 'b'.repeat(64),
          verifiedFixtureFiles: 2,
          verifiedFixturePaths: ['a.asset', 'b.asset'],
        },
      ],
      tag: '0.1.0',
      variant: 'full',
    });
  });

  it('records the packs in a stable order so two runs write the same stamp', () => {
    const treeDirectory = join(workspace, 'tree');
    // Filenames and tag are deliberately pin-independent: ordering must not depend on current release identity.
    const packs = [
      {
        file: 'z-full-0.1.0.tar.gz',
        metadataFiles: 0,
        pack: 'z-fixtures',
        sha256: 'c'.repeat(64),
        verifiedFixtureFiles: 1,
        verifiedFixturePaths: ['z.asset'],
      },
      {
        file: 'a-full-0.1.0.tar.gz',
        metadataFiles: 0,
        pack: 'a-fixtures',
        sha256: 'a'.repeat(64),
        verifiedFixtureFiles: 1,
        verifiedFixturePaths: ['a.asset'],
      },
    ];
    writeFixtureTreeStamp(treeDirectory, { packs, tag: '0.1.0', variant: 'full' });
    expect(readFixtureTreeStamp(treeDirectory)?.packs.map((pack) => pack.pack)).toEqual(['a-fixtures', 'z-fixtures']);
  });
});

describe('realizeFixturePlan cache migration', () => {
  it('re-extracts a legacy shared tree from cached archives and stamps every member path set', async () => {
    process.env['FLIGHT_FIXTURES_DIR'] = workspace;
    const alphaArchive = buildTarball('alpha', {
      'alpha/a.asset': 'a',
      'manifest.json': JSON.stringify({ files: [{ path: 'alpha/a.asset' }] }),
    });
    const betaArchive = buildTarball('beta', {
      'beta/b.asset': 'b',
      'manifest.json': JSON.stringify({ files: [{ path: 'beta/b.asset' }] }),
    });
    const alphaHash = sha256Of(alphaArchive);
    const betaHash = sha256Of(betaArchive);
    mkdirSync(join(workspace, 'packs'), { recursive: true });
    writeFileSync(getFixtureArchivePath(workspace, alphaHash), readFileSync(alphaArchive));
    writeFileSync(getFixtureArchivePath(workspace, betaHash), readFileSync(betaArchive));

    const treeDirectory = getFixtureTreePath(workspace, 'full', 'shared-tree');
    mkdirSync(treeDirectory, { recursive: true });
    writeFileSync(
      join(treeDirectory, FIXTURE_STAMP_FILE),
      JSON.stringify({
        packs: [
          legacyPack('alpha-fixtures', 'alpha.tar.gz', alphaHash),
          legacyPack('beta-fixtures', 'beta.tar.gz', betaHash),
        ],
        tag: FIXTURE_RELEASE_TAG,
        variant: 'full',
      }),
      'utf8',
    );

    await realizeFixturePlan({
      entries: [
        plannedPack('alpha-fixtures', 'alpha.tar.gz', alphaHash),
        plannedPack('beta-fixtures', 'beta.tar.gz', betaHash),
      ],
      errors: [],
      totalBytes: 2,
      totalFiles: 2,
      variant: 'full',
    });

    expect(readFixtureTreeStamp(treeDirectory)?.packs).toMatchObject([
      { pack: 'alpha-fixtures', verifiedFixtureFiles: 1, verifiedFixturePaths: ['alpha/a.asset'] },
      { pack: 'beta-fixtures', verifiedFixtureFiles: 1, verifiedFixturePaths: ['beta/b.asset'] },
    ]);
    expect(readFileSync(join(treeDirectory, 'alpha', 'a.asset'), 'utf8')).toBe('a');
    expect(readFileSync(join(treeDirectory, 'beta', 'b.asset'), 'utf8')).toBe('b');
  });
});

function legacyPack(pack: string, file: string, sha256: string) {
  return { file, metadataFiles: 1, pack, sha256, verifiedFixtureFiles: 1 };
}

function plannedPack(pack: string, file: string, sha256: string) {
  return {
    entry: { file, files: 1, mergeGroup: 'shared-tree', pack, sha256, size: 1, variant: 'full' },
    requested: true,
    tree: 'shared-tree',
  };
}

describe('isFixturePackMetadataEntry nested metadata', () => {
  // Synthetic path strings throughout: no pack is fetched, no file is opened, and nothing here depends
  // on a corpus being present. The strings are shaped like the real ones and are only shapes.
  it('treats a per-item LICENSE.md at any depth as metadata', () => {
    // The defect this fixes: a corpus filing one of these inside every model directory had them counted
    // as fixtures, so the archive appeared to hold more files than its manifest declared and the whole
    // pack was rejected — blaming a publisher that was right.
    expect(isFixturePackMetadataEntry('ABeautifulGame/LICENSE.md')).toBe(true);
    expect(isFixturePackMetadataEntry('./AnimatedCube/LICENSE.md')).toBe(true);
    expect(isFixturePackMetadataEntry('a/b/c/LICENSE.md')).toBe(true);
  });

  it('does NOT exempt other nested markdown, because this is a name and not a tolerance', () => {
    // Exempting "any .md below the root" would re-hide what the count exists to surface: a pack that
    // lost real fixtures and gained notes would still balance.
    expect(isFixturePackMetadataEntry('AnimatedCube/NOTES.md')).toBe(false);
    expect(isFixturePackMetadataEntry('AnimatedCube/README.md')).toBe(false);
    expect(isFixturePackMetadataEntry('AnimatedCube/model.gltf')).toBe(false);
  });

  it('does not exempt a fixture whose name merely ends with the metadata name', () => {
    // A basename comparison rather than a suffix one; `MYLICENSE.md` is a file somebody authored.
    expect(isFixturePackMetadataEntry('AnimatedCube/MYLICENSE.md')).toBe(false);
  });

  it('still classifies the root files and the LICENSES directory as before', () => {
    expect(isFixturePackMetadataEntry('manifest.json')).toBe(true);
    expect(isFixturePackMetadataEntry('LICENSES/gltf-duck.txt')).toBe(true);
    expect(isFixturePackMetadataEntry('Duck/Duck.gltf')).toBe(false);
  });
});
