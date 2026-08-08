import { createHash } from 'node:crypto';

import {
  assertImportConformanceOracleOutcomes,
  createImportConformanceCaseIdentity,
  createImportConformanceSingleMemberCaseIdentity,
  isImportConformancePackFileReference,
} from './import-conformance-case';

describe('import conformance case identity', () => {
  it('hashes a case as an order-independent set of exact member identities', () => {
    const mesh = { reference: 'models/walk.md5mesh', role: 'mesh', sourceHash: hash('mesh') };
    const animation = { reference: 'models/walk.md5anim', role: 'animation', sourceHash: hash('animation') };
    const first = createImportConformanceCaseIdentity('models/walk', [mesh, animation]);
    const reordered = createImportConformanceCaseIdentity('models/walk', [animation, mesh]);

    expect(first).toEqual(reordered);
    expect(first.members.map((member) => member.role)).toEqual(['animation', 'mesh']);
    expect(first.caseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      createImportConformanceCaseIdentity('models/walk', [mesh, { ...animation, sourceHash: hash('changed') }])
        .caseHash,
    ).not.toBe(first.caseHash);
  });

  it('keeps the case label out of content identity and rejects duplicate or empty member sets', () => {
    const member = { reference: 'suite/example.swf', role: 'source', sourceHash: hash('fixture') };
    expect(createImportConformanceCaseIdentity('suite/alias', [member]).caseHash).toBe(
      createImportConformanceCaseIdentity('suite/example.swf', [member]).caseHash,
    );
    expect(() => createImportConformanceCaseIdentity('empty', [])).toThrow(/at least one member/);
    expect(() => createImportConformanceCaseIdentity('duplicate', [member, member])).toThrow(/duplicate member/);
  });

  it('represents the existing one-file adapter without a second identity rule', () => {
    expect(createImportConformanceSingleMemberCaseIdentity('suite/example.swf', hash('fixture'))).toEqual(
      createImportConformanceCaseIdentity('suite/example.swf', [
        { reference: 'suite/example.swf', role: 'source', sourceHash: hash('fixture') },
      ]),
    );
  });
});

describe('import conformance fixture-pack file policy', () => {
  const policy = {
    excludedPathSegments: new Set(['LICENSES']),
    extensions: ['.md5anim', '.md5mesh'],
    rootMetadataReferences: new Set(['manifest.json', 'NOTICE.md']),
  };

  it('selects adapter-declared extensions while applying adapter-declared metadata rules', () => {
    expect(isImportConformancePackFileReference('models/walk.MD5MESH', policy)).toBe(true);
    expect(isImportConformancePackFileReference('models/walk.md5anim', policy)).toBe(true);
    expect(isImportConformancePackFileReference('models/LICENSES/walk.md5mesh', policy)).toBe(false);
    expect(isImportConformancePackFileReference('manifest.json', policy)).toBe(false);
    expect(isImportConformancePackFileReference('models/readme.txt', policy)).toBe(false);
  });
});

describe('import conformance oracle outcomes', () => {
  it('requires stable ordered property identities and preserves unknown separately from failure', () => {
    expect(() =>
      assertImportConformanceOracleOutcomes([
        { evidence: { frames: 2 }, id: 'md5.animation.frame-count', state: 'passed' },
        {
          evidence: { importedBounds: [], signedEdgeDeltas: [-0.5, 0, 0.5] },
          id: 'md5.mesh.vertex-count',
          notRunReason: 'missing-animation-clip',
          state: 'not-run',
        },
      ]),
    ).not.toThrow();
    expect(() =>
      assertImportConformanceOracleOutcomes([
        { evidence: {}, id: 'md5.mesh.vertex-count', state: 'failed' },
        { evidence: {}, id: 'md5.animation.frame-count', state: 'passed' },
      ]),
    ).toThrow(/sorted and unique/);
    expect(() =>
      assertImportConformanceOracleOutcomes([{ evidence: {}, id: 'md5.animation-bounds', state: 'not-run' }]),
    ).toThrow(/stable not-run reason/);
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
