import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION,
  captureBaselineCoverageManifestPath,
  createCaptureBaselineCoverageManifest,
  diffCaptureBaselineCoverage,
  formatCaptureBaselineCoverageIdentity,
  isCaptureBaselineCoverageFailure,
  readCaptureBaselineCoverageManifest,
  writeCaptureBaselineCoverageManifest,
} from './captureBaselineCoverageManifest';

const manifest = createCaptureBaselineCoverageManifest({
  functional: ['svg-image/webgl', 'svg-image/canvas', 'node-alpha/canvas'],
  examples: ['text/canvas'],
});

describe('CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION', () => {
  it('is the schema the manifest is written with', () => {
    expect(createCaptureBaselineCoverageManifest({}).schemaVersion).toBe(CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION);
  });
});

describe('captureBaselineCoverageManifestPath', () => {
  it('pins the manifest beside the reachability baseline', () => {
    expect(captureBaselineCoverageManifestPath('/repo')).toBe('/repo/scripts/capture-baseline-coverage-manifest.json');
  });
});

describe('createCaptureBaselineCoverageManifest', () => {
  it('sorts identities so the committed file has a stable diff', () => {
    expect(manifest.subjects.functional).toEqual(['node-alpha/canvas', 'svg-image/canvas', 'svg-image/webgl']);
  });

  it('keeps subjects separate', () => {
    expect(manifest.subjects.examples).toEqual(['text/canvas']);
  });
});

describe('diffCaptureBaselineCoverage', () => {
  const all = ['svg-image/webgl', 'svg-image/canvas', 'node-alpha/canvas'];
  const WHOLE = { entryFiltered: false, activeRenderers: null };
  const FILTERED = { entryFiltered: true, activeRenderers: null };

  it('reports nothing when observed coverage matches the pin', () => {
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', all, all, WHOLE);
    expect(diff).toEqual({ gained: [], lost: [], absent: [] });
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(false);
  });

  // The defect this mechanism closes: one target loses its baseline while others still compare, so the
  // zero-floor is satisfied and the run stays green. Here that loss is named.
  it('NAMES a target that ran but is no longer covered', () => {
    const covered = ['svg-image/canvas', 'node-alpha/canvas'];
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', covered, all, WHOLE);
    expect(diff.lost).toEqual(['svg-image/webgl']);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // The manifest is an exact set: an unaccepted gain ages the pin, so it must be accepted, not ignored.
  it('names new coverage as a gain AND fails on it', () => {
    const covered = [...all, 'svg-text/webgl'];
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', covered, covered, WHOLE);
    expect(diff.gained).toEqual(['svg-text/webgl']);
    expect(diff.lost).toEqual([]);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // ★ The case that justifies identities over a count: the total is unchanged, so every count-shaped
  // check reconciles and reports clean. Only an exact set names the half that left and the half that came.
  it('catches a SAME-COUNT swap, naming both halves', () => {
    const covered = ['svg-image/canvas', 'node-alpha/canvas', 'svg-text/webgl'];
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', covered, [...all, 'svg-text/webgl'], WHOLE);
    expect(covered.length).toBe(manifest.subjects.functional.length);
    expect(diff.lost).toEqual(['svg-image/webgl']);
    expect(diff.gained).toEqual(['svg-text/webgl']);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // A whole-repo run can tell "this target vanished from discovery" from "this target lost its
  // baseline"; a scoped run cannot, because not-visited is indistinguishable from filtered-out.
  it('reports a vanished target as absent ONLY on a whole-repo run', () => {
    const covered = ['svg-image/canvas', 'svg-image/webgl'];
    const visited = covered;
    expect(diffCaptureBaselineCoverage(manifest, 'functional', covered, visited, WHOLE).absent).toEqual([
      'node-alpha/canvas',
    ]);
    expect(diffCaptureBaselineCoverage(manifest, 'functional', covered, visited, FILTERED).absent).toEqual([]);
  });

  // A scoped run must still be able to fail: it visited the target and found no baseline.
  it('still reports a loss on a scoped run for a target it actually visited', () => {
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', [], ['svg-image/webgl'], FILTERED);
    expect(diff.lost).toEqual(['svg-image/webgl']);
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });

  // --renderer=webgl must not report every canvas pin as vanished.
  it('narrows the absence check to the renderers the run actually ran', () => {
    const diff = diffCaptureBaselineCoverage(manifest, 'functional', ['svg-image/webgl'], ['svg-image/webgl'], {
      entryFiltered: false,
      activeRenderers: ['webgl'],
    });
    expect(diff.absent).toEqual([]);
    expect(diff.lost).toEqual([]);
  });

  // A page that never loaded settles nothing. Reporting it as vanished would blame the manifest for a
  // load failure the run already reported on its own.
  it('does not report an UNDETERMINED identity as absent', () => {
    const diff = diffCaptureBaselineCoverage(
      manifest,
      'functional',
      ['svg-image/canvas', 'node-alpha/canvas'],
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
    const diff = diffCaptureBaselineCoverage(manifest, 'reference', ['a/canvas'], ['a/canvas'], WHOLE);
    expect(diff).toEqual({ gained: ['a/canvas'], lost: [], absent: [] });
    expect(isCaptureBaselineCoverageFailure(diff)).toBe(true);
  });
});

describe('formatCaptureBaselineCoverageIdentity', () => {
  it('joins entry and renderer into the pinned identity', () => {
    expect(formatCaptureBaselineCoverageIdentity('svg-image', 'webgl')).toBe('svg-image/webgl');
  });
});

describe('isCaptureBaselineCoverageFailure', () => {
  it('is true in every direction and false only for an exact match', () => {
    expect(isCaptureBaselineCoverageFailure({ gained: [], lost: [], absent: [] })).toBe(false);
    expect(isCaptureBaselineCoverageFailure({ gained: ['x/canvas'], lost: [], absent: [] })).toBe(true);
    expect(isCaptureBaselineCoverageFailure({ gained: [], lost: ['x/canvas'], absent: [] })).toBe(true);
    expect(isCaptureBaselineCoverageFailure({ gained: [], lost: [], absent: ['x/canvas'] })).toBe(true);
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
    writeCaptureBaselineCoverageManifest(root, 'functional', ['b/canvas', 'a/webgl']);
    expect(readCaptureBaselineCoverageManifest(root).subjects.functional).toEqual(['a/webgl', 'b/canvas']);
  });
});

describe('writeCaptureBaselineCoverageManifest', () => {
  // A functional update run knows nothing about the examples subject and must not speak for it.
  it('rewrites ONE subject and preserves the others', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'examples', ['text/canvas']);
    const manifest = writeCaptureBaselineCoverageManifest(root, 'functional', ['a/webgl']);
    expect(manifest.subjects).toEqual({ examples: ['text/canvas'], functional: ['a/webgl'] });
  });

  // The regression tier runs --renderer=canvas,webgl,webgpu. Such a run must not retire dom pins.
  it('carries pins for renderers the update run did not cover', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'functional', ['a/dom', 'a/canvas']);
    const manifest = writeCaptureBaselineCoverageManifest(root, 'functional', ['a/canvas'], ['canvas', 'webgl']);
    expect(manifest.subjects.functional).toEqual(['a/canvas', 'a/dom']);
  });

  // One flaky target must not retire its own pin: the run never determined it, so the pin stands.
  it('carries forward a pin the run did not determine', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'examples', ['collision/webgpu', 'collision/canvas']);
    const manifestAfter = writeCaptureBaselineCoverageManifest(root, 'examples', ['collision/canvas'], null, [
      'collision/canvas',
    ]);
    expect(manifestAfter.subjects.examples).toEqual(['collision/canvas', 'collision/webgpu']);
  });

  // Determined AND uncovered is a real retirement, and must still go through.
  it('retires a pin the run determined to be uncovered', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'examples', ['collision/webgpu', 'collision/canvas']);
    const manifestAfter = writeCaptureBaselineCoverageManifest(root, 'examples', ['collision/canvas'], null, [
      'collision/canvas',
      'collision/webgpu',
    ]);
    expect(manifestAfter.subjects.examples).toEqual(['collision/canvas']);
  });

  // With no renderer scope the run speaks for the whole subject, so a dropped target really is retired.
  it('retires a target on an unscoped update', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'functional', ['a/dom', 'a/canvas']);
    const manifest = writeCaptureBaselineCoverageManifest(root, 'functional', ['a/canvas']);
    expect(manifest.subjects.functional).toEqual(['a/canvas']);
  });

  it('writes a trailing newline so the format gate never churns it', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-coverage-'));
    mkdirSync(join(root, 'scripts'));
    writeCaptureBaselineCoverageManifest(root, 'functional', ['a/webgl']);
    expect(readFileSync(captureBaselineCoverageManifestPath(root), 'utf8').endsWith('}\n')).toBe(true);
  });
});
