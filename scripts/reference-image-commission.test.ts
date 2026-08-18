import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { hashOraclePixelBytes } from './reference-image-png';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'reference-image-commission.ts');
const WORKFLOW = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'workflows',
  'reference-image-capture.yml',
);
const REVIEW_MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'review', 'src', 'main.ts');
const TSX = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'tsx');
const PIXEL_SHA256 = hashOraclePixelBytes(new Uint8Array(4));
const BUILD_COMMIT = 'b'.repeat(40);

describe('reference-image-commission request binding', () => {
  it('stages a matching capture with an empty difference-evidence sidecar', () => {
    const fixture = commissionedCapture(PIXEL_SHA256);

    const run = bundle(fixture);

    expect(run.status).toBe(0);
    expect(existsSync(join(fixture.stage, 'request', 'candidate.json'))).toBe(true);
    expect(readJson(join(fixture.stage, 'request', 'request-image-differences.json'))).toEqual({
      differences: [],
      requestId: 'request',
      schemaVersion: 1,
    });
  });

  it('stages a later capture whose decoded pixels differ and records both hashes for review', () => {
    const fixture = commissionedCapture('f'.repeat(64));

    const run = bundle(fixture);

    expect(run.status).toBe(0);
    expect(run.stderr).toContain('request-image-mismatch');
    expect(run.stderr).toContain('recording the difference for review');
    expect(existsSync(join(fixture.stage, 'request', 'candidate.json'))).toBe(true);
    expect(readJson(join(fixture.stage, 'request', 'request-image-differences.json'))).toEqual({
      differences: [
        {
          capturedPixelSha256: PIXEL_SHA256,
          identity: { entry: 'shape', renderer: 'webgl', subject: 'functional' },
          requestedPixelSha256: 'f'.repeat(64),
        },
      ],
      requestId: 'request',
      schemaVersion: 1,
    });
  });

  it('still refuses a missing requested image and stages no partial archive', () => {
    const fixture = commissionedCapture(PIXEL_SHA256);
    rmSync(join(fixture.artifacts, 'functional', 'shape', 'webgl', 'screenshot.png'));

    const run = bundle(fixture);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('request-image-missing');
    expect(existsSync(join(fixture.stage, 'request', 'candidate.json'))).toBe(false);
  });

  it('still refuses an unreadable requested image and stages no partial archive', () => {
    const fixture = commissionedCapture(PIXEL_SHA256);
    writeFileSync(join(fixture.artifacts, 'functional', 'shape', 'webgl', 'screenshot.png'), 'not a png');

    const run = bundle(fixture);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('request-image-unreadable');
    expect(existsSync(join(fixture.stage, 'request', 'candidate.json'))).toBe(false);
  });

  it('resolves the request build commit rather than the current push commit', () => {
    const fixture = commissionedCapture(PIXEL_SHA256);

    const run = command('build-commit', fixture);

    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe(BUILD_COMMIT);
    expect(run.stdout.trim()).not.toBe(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  });

  it('checks out the resolved request commit and names an unreachable commit before checkout', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');

    expect(workflow).toContain('ref: ${{ steps.reviewed-build.outputs.commit }}');
    expect(workflow).toContain('the request names commit $commit, which is not reachable from this push');
    expect(workflow).toContain('WORKFLOW FROM TRUNK, CODE FROM THE REQUEST IS INTENTIONAL');
    expect(workflow).toContain('request-image-differences.json');
    expect(workflow).toContain('reviewed build commit: \\`${{ steps.reviewed-build.outputs.commit }}\\`');
  });

  it('tells the reviewer that replay differences are preserved as evidence', () => {
    const review = readFileSync(REVIEW_MAIN, 'utf8');

    expect(review).toContain('CI recreates the recorded build commit');
    expect(review).toContain('any decoded-pixel difference is preserved in request-image-differences.json for review');
  });
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function commissionedCapture(pixelSha256: string): { artifacts: string; request: string; stage: string } {
  const root = mkdtempSync(join(tmpdir(), 'reference-image-commission-'));
  const artifacts = join(root, 'artifacts');
  const cell = join(artifacts, 'functional', 'shape', 'webgl');
  mkdirSync(cell, { recursive: true });
  writeFileSync(join(cell, 'screenshot.png'), png());
  writeFileSync(
    join(cell, 'status.json'),
    JSON.stringify({
      build: { commit: BUILD_COMMIT, dirty: ['README.md'], dirtyOmitted: 47 },
      hash: 'browser-capture-hash',
      provenance: { frames: 1, sourceHash: null, targetKind: 'webgl', verifyPublished: true, warmupFrames: 0 },
      state: 'ready',
    }),
  );
  const request = join(root, 'request.json');
  writeFileSync(
    request,
    JSON.stringify({
      frames: 1,
      id: 'request',
      reason: 'test',
      schemaVersion: 3,
      subject: 'functional',
      targets: [
        {
          build: { commit: BUILD_COMMIT, dirty: ['README.md'], dirtyOmitted: 47 },
          capture: { environmentId: 'environment', hostInstanceId: 'host' },
          entry: 'shape',
          pixelSha256,
          renderer: 'webgl',
        },
      ],
    }),
  );
  return { artifacts, request, stage: join(root, 'stage') };
}

function bundle(fixture: { artifacts: string; request: string; stage: string }): CommandResult {
  return command('bundle', fixture, ['--artifacts', fixture.artifacts, '--stage', fixture.stage]);
}

interface CommandResult {
  status: number;
  stderr: string;
  stdout: string;
}

function command(
  subcommand: string,
  fixture: { artifacts: string; request: string; stage: string },
  rest: readonly string[] = [],
): CommandResult {
  const result = spawnSync(TSX, [SCRIPT, subcommand, fixture.request, ...rest], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return { status: result.status ?? -1, stderr: result.stderr, stdout: result.stdout };
}

function png(): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 1, false);
  view.setUint32(4, 1, false);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(new Uint8Array(5))),
    chunk('IEND', new Uint8Array()),
  ];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function chunk(type: string, data: Readonly<Uint8Array>): Uint8Array {
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length, false);
  for (const [index, character] of [...type].entries()) bytes[4 + index] = character.charCodeAt(0);
  bytes.set(data, 8);
  return bytes;
}
