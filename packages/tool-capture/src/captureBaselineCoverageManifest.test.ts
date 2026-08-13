import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION,
  CAPTURE_BASELINE_EVIDENCE_KINDS,
  formatCaptureBaselineEvidenceIdentity,
  listCaptureBaselineEvidence,
  captureBaselineCoverageManifestPath,
  createCaptureBaselineCoverageManifest,
  diffCaptureBaselineCoverage,
  formatCaptureBaselineCoverageIdentity,
  isCaptureBaselineCoverageFailure,
  readCaptureBaselineCoverageManifest,
  writeCaptureBaselineCoverageManifest,
} from './captureBaselineCoverageManifest';

const ALL = ['fingerprint', 'oracle', 'screenshot'] as const;
const manifest = createCaptureBaselineCoverageManifest({
  functional: {
    'svg-image/webgl': ALL,
    'svg-image/canvas': ALL,
    'node-alpha/canvas': ALL,
  },
  examples: { 'text/canvas': ALL },
});
const everything = (
  identities: readonly string[],
): Record<string, readonly ('fingerprint' | 'oracle' | 'screenshot')[]> =>
  Object.fromEntries(identities.map((identity) => [identity, ALL]));

describe('CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION', () => {
  it('is the schema the manifest is written with', () => {
    expect(createCaptureBaselineCoverageManifest({}).schemaVersion).toBe(CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION);
  });
});

describe('CAPTURE_BASELINE_EVIDENCE_KINDS', () => {
  it('is the three evidence kinds, sorted', () => {
    expect(CAPTURE_BASELINE_EVIDENCE_KINDS).toEqual(['fingerprint', 'oracle', 'screenshot']);
  });
});

describe('captureBaselineCoverageManifestPath', () => {
  it('pins the manifest beside the reachability baseline', () => {
    expect(captureBaselineCoverageManifestPath('/repo')).toBe('/repo/scripts/capture-baseline-coverage-manifest.json');
  });
});

describe('createCaptureBaselineCoverageManifest', () => {
  it('sorts identities so the committed file has a stable diff', () => {
    expect(Object.keys(manifest.subjects.functional)).toEqual([
      'node-alpha/canvas',
      'svg-image/canvas',
      'svg-image/webgl',
    ]);
  });

  it('keeps subjects separate', () => {
    expect(manifest.subjects.examples).toEqual({ 'text/canvas': ['fingerprint', 'oracle', 'screenshot'] });
  });
});

describe('diffCaptureBaselineCoverage', () => {
  const all = ['svg-image/webgl', 'svg-image/canvas', 'node-alpha/canvas'];
  const WHOLE = { entryFiltered: false, activeRenderers: null };
  const FILTERED = { entryFiltered: true, activeRenderers: null };

  it('reports nothing when observed coverage matches the pin', () => {
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', everything(all), all, WHOLE);
    expect(diff).toEqual({ gained: [], lost: [], absent: [] });
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(false);
  });

  // The defect this mechanism closes: one target loses its baseline while others still compare, so the
  // zero-floor is satisfied and the run stays green. Here that loss is named.
  it('NAMES a target that ran but is no longer covered', () => {
    const covered = ['svg-image/canvas', 'node-alpha/canvas'];
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', everything(covered), all, WHOLE);
    expect(diff.lost).toEqual(['svg-image/webgl#fingerprint', 'svg-image/webgl#oracle', 'svg-image/webgl#screenshot']);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // The manifest is an exact set: an unaccepted gain ages the pin, so it must be accepted, not ignored.
  it('names new coverage as a gain AND fails on it', () => {
    const covered = [...all, 'svg-text/webgl'];
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', everything(covered), covered, WHOLE);
    expect(diff.gained).toEqual(['svg-text/webgl#fingerprint', 'svg-text/webgl#oracle', 'svg-text/webgl#screenshot']);
    expect(diff.lost).toEqual([]);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // ★ The case that justifies identities over a count: the total is unchanged, so every count-shaped
  // check reconciles and reports clean. Only an exact set names the half that left and the half that came.
  it('catches a SAME-COUNT swap, naming both halves', () => {
    const covered = ['svg-image/canvas', 'node-alpha/canvas', 'svg-text/webgl'];
    const diff = diffCaptureBaselineCoverage(
      manifest,
      'functional',
      everything(covered),
      [...all, 'svg-text/webgl'],
      WHOLE,
    );
    expect(covered.length).toBe(Object.keys(manifest.subjects.functional).length);
    expect(diff.lost).toEqual(['svg-image/webgl#fingerprint', 'svg-image/webgl#oracle', 'svg-image/webgl#screenshot']);
    expect(diff.gained).toEqual(['svg-text/webgl#fingerprint', 'svg-text/webgl#oracle', 'svg-text/webgl#screenshot']);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // A whole-repo run can tell "this target vanished from discovery" from "this target lost its
  // baseline"; a scoped run cannot, because not-visited is indistinguishable from filtered-out.
  it('reports a vanished target as absent ONLY on a whole-repo run', () => {
    const covered = ['svg-image/canvas', 'svg-image/webgl'];
    const visited = covered;
    expect(diffCaptureBaselineCoverage(manifest, 'functional', everything(covered), visited, WHOLE).absent).toEqual([
      'node-alpha/canvas#fingerprint',
      'node-alpha/canvas#oracle',
      'node-alpha/canvas#screenshot',
    ]);
    expect(diffCaptureBaselineCoverage(manifest, 'functional', everything(covered), visited, FILTERED).absent).toEqual(
      [],
    );
  });

  // A scoped run must still be able to fail: it visited the target and found no baseline.
  it('still reports a loss on a scoped run for a target it actually visited', () => {
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', {}, ['svg-image/webgl'], FILTERED);
    expect(diff.lost).toEqual(['svg-image/webgl#fingerprint', 'svg-image/webgl#oracle', 'svg-image/webgl#screenshot']);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // --renderer=webgl must not report every canvas pin as vanished.
  it('narrows the absence check to the renderers the run actually ran', () => {
    const diff = diffCaptureBaselineCoverage(
      manifest,
      'functional',
      everything(['svg-image/webgl']),
      ['svg-image/webgl'],
      {
        entryFiltered: false,
        activeRenderers: ['webgl'],
      },
    );
    expect(diff.absent).toEqual([]);
    expect(diff.lost).toEqual([]);
  });

  // A page that never loaded settles nothing. Reporting it as vanished would blame the manifest for a
  // load failure the run already reported on its own.
  it('does not report an UNDETERMINED identity as absent', () => {
    const diff = diffCaptureBaselineCoverage(
      manifest,
      'functional',
      everything(['svg-image/canvas', 'node-alpha/canvas']),
      ['svg-image/canvas', 'node-alpha/canvas'],
      {
        entryFiltered: false,
        activeRenderers: null,
        undetermined: ['svg-image/webgl'],
      },
    );
    expect(diff.absent).toEqual([]);
    expect(diff.lost).toEqual([]);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(false);
  });

  it('treats an unknown subject as an empty pin rather than throwing', () => {
    const diff = diffCaptureBaselineCoverage(manifest, 'reference', everything(['a/canvas']), ['a/canvas'], WHOLE);
    expect(diff).toEqual({
      gained: ['a/canvas#fingerprint', 'a/canvas#oracle', 'a/canvas#screenshot'],
      lost: [],
      absent: [],
    });
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });
});

describe('evidence-kind scope', () => {
  const all = ['svg-image/webgl', 'svg-image/canvas', 'node-alpha/canvas'];

  // ★ The rule that makes ONE manifest over three tiers safe. A validate run observes fingerprints and
  // nothing else; without this it would report every screenshot and oracle pin as lost on every run —
  // absence of OBSERVATION reported as absence of EVIDENCE, which is the defect being fixed.
  it('does not report a kind the run never observed', () => {
    const diff = diffCaptureBaselineCoverage(
      manifest,
      'functional',
      Object.fromEntries(all.map((identity) => [identity, ['fingerprint'] as const])),
      all,
      { entryFiltered: false, activeRenderers: null, kinds: ['fingerprint'] },
    );
    expect(diff).toEqual({ gained: [], lost: [], absent: [] });
  });

  // Same run, same data, WITHOUT declaring the observed kind: the two unobserved columns read as lost.
  // This is the control — it shows the guard above is load-bearing rather than decorative.
  it('DOES report them when the run fails to declare what it observed', () => {
    const diff = diffCaptureBaselineCoverage(
      manifest,
      'functional',
      Object.fromEntries(all.map((identity) => [identity, ['fingerprint'] as const])),
      all,
      { entryFiltered: false, activeRenderers: null },
    );
    expect(diff.lost).toContain('svg-image/webgl#oracle');
    expect(diff.lost).toContain('svg-image/webgl#screenshot');
    expect(diff.lost).not.toContain('svg-image/webgl#fingerprint');
  });

  // One target losing ONE of its three columns is the erosion this consolidation must still catch.
  it('names the single lost column, not the whole target', () => {
    const covered: Record<string, readonly ('fingerprint' | 'oracle' | 'screenshot')[]> = {
      'svg-image/webgl': ['fingerprint', 'screenshot'],
      'svg-image/canvas': ALL,
      'node-alpha/canvas': ALL,
    };
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', covered, all, {
      entryFiltered: false,
      activeRenderers: null,
    });
    expect(diff.lost).toEqual(['svg-image/webgl#oracle']);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });
});

describe('formatCaptureBaselineCoverageIdentity', () => {
  it('joins entry and renderer into the pinned identity', () => {
    expect(formatCaptureBaselineCoverageIdentity('svg-image', 'webgl')).toBe('svg-image/webgl');
  });
});

describe('formatCaptureBaselineEvidenceIdentity', () => {
  // `#`, not `:` — a renderer id may itself contain a colon (`flight:webgl`), so a colon separator
  // would make the target and the kind ambiguous to split.
  it('joins target and kind with a separator no renderer id contains', () => {
    expect(formatCaptureBaselineEvidenceIdentity('svg-image/flight:webgl', 'oracle')).toBe(
      'svg-image/flight:webgl#oracle',
    );
  });
});

describe('isCaptureBaselineCoverageFailure', () => {
  it('is true in every direction and false only for an exact match', () => {
    expect(isCaptureBaselineCoverageFailure({ gained: [], lost: [], absent: [] })).toBe(false);
    expect(isCaptureBaselineCoverageFailure({ gained: ['x/canvas#oracle'], lost: [], absent: [] })).toBe(true);
    expect(isCaptureBaselineCoverageFailure({ gained: [], lost: ['x/canvas#fingerprint'], absent: [] })).toBe(true);
    expect(isCaptureBaselineCoverageFailure({ gained: [], lost: [], absent: ['x/canvas#screenshot'] })).toBe(true);
  });
});

describe('listCaptureBaselineEvidence', () => {
  it('flattens every pinned target into its individual evidence units', () => {
    expect(listCaptureBaselineEvidence(manifest, 'examples')).toEqual([
      'text/canvas#fingerprint',
      'text/canvas#oracle',
      'text/canvas#screenshot',
    ]);
  });

  it('is empty for a subject the manifest does not pin', () => {
    expect(listCaptureBaselineEvidence(manifest, 'reference')).toEqual([]);
  });
});

describe('readCaptureBaselineCoverageManifest', () => {
  it('reads a missing manifest as empty rather than throwing', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    expect(readCaptureBaselineCoverageManifest(root).subjects).toEqual({});
  });

  it('round-trips what was written', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'functional', everything(['b/canvas', 'a/webgl']));
    expect(Object.keys(readCaptureBaselineCoverageManifest(root).subjects.functional)).toEqual(['a/webgl', 'b/canvas']);
  });
});

describe('schema 1 migration', () => {
  // Schema 1 knew only fingerprints, so a bare identity list means fingerprint-only. Reading it as all
  // three would manufacture screenshot and oracle pins nobody ever accepted, and the next run would
  // report them as losses.
  it('reads a v1 identity list as fingerprint evidence only', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-v1-'));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(
      join(root, 'scripts', 'capture-baseline-coverage-manifest.json'),
      JSON.stringify({ schemaVersion: 1, subjects: { functional: ['a/webgl', 'b/canvas'] } }),
    );
    const read = readCaptureBaselineCoverageManifest(root);
    expect(read.schemaVersion).toBe(2);
    expect(read.subjects.functional).toEqual({ 'a/webgl': ['fingerprint'], 'b/canvas': ['fingerprint'] });
  });
});

describe('writeCaptureBaselineCoverageManifest', () => {
  // A functional update run knows nothing about the examples subject and must not speak for it.
  it('rewrites ONE subject and preserves the others', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'examples', everything(['text/canvas']));
    const manifest = writeCaptureBaselineCoverageManifest(root, 'functional', everything(['a/webgl']));
    expect(Object.keys(manifest.subjects.examples)).toEqual(['text/canvas']);
    expect(Object.keys(manifest.subjects.functional)).toEqual(['a/webgl']);
  });

  // The regression tier runs --renderer=canvas,webgl,webgpu. Such a run must not retire dom pins.
  it('carries pins for renderers the update run did not cover', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'functional', everything(['a/dom', 'a/canvas']));
    const manifest = writeCaptureBaselineCoverageManifest(root, 'functional', everything(['a/canvas']), [
      'canvas',
      'webgl',
    ]);
    expect(Object.keys(manifest.subjects.functional)).toEqual(['a/canvas', 'a/dom']);
  });

  // One flaky target must not retire its own pin: the run never determined it, so the pin stands.
  it('carries forward a pin the run did not determine', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'examples', everything(['collision/webgpu', 'collision/canvas']));
    const manifestAfter = writeCaptureBaselineCoverageManifest(
      root,
      'examples',
      everything(['collision/canvas']),
      null,
      ['collision/canvas'],
    );
    expect(Object.keys(manifestAfter.subjects.examples)).toEqual(['collision/canvas', 'collision/webgpu']);
  });

  // Determined AND uncovered is a real retirement, and must still go through.
  it('retires a pin the run determined to be uncovered', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'examples', everything(['collision/webgpu', 'collision/canvas']));
    const manifestAfter = writeCaptureBaselineCoverageManifest(
      root,
      'examples',
      everything(['collision/canvas']),
      null,
      ['collision/canvas', 'collision/webgpu'],
    );
    expect(Object.keys(manifestAfter.subjects.examples)).toEqual(['collision/canvas']);
  });

  // With no renderer scope the run speaks for the whole subject, so a dropped target really is retired.
  it('retires a target on an unscoped update', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'functional', everything(['a/dom', 'a/canvas']));
    const manifest = writeCaptureBaselineCoverageManifest(root, 'functional', everything(['a/canvas']), null, [
      'a/canvas',
      'a/dom',
    ]);
    expect(Object.keys(manifest.subjects.functional)).toEqual(['a/canvas']);
  });

  it('writes a trailing newline so the format gate never churns it', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'functional', everything(['a/webgl']));
    expect(readFileSync(captureBaselineCoverageManifestPath(root), 'utf8').endsWith('}\n')).toBe(true);
  });
});
