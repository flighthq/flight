import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
const TSX = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'tsx');
const PIXEL_SHA256 = hashOraclePixelBytes(new Uint8Array(4));
const BUILD_COMMIT = 'b'.repeat(40);

describe('reference-image-commission request binding', () => {
  it('stages the capture only when its decoded pixels match the request', () => {
    const fixture = commissionedCapture(PIXEL_SHA256);

    const run = bundle(fixture);

    expect(run.status).toBe(0);
    expect(existsSync(join(fixture.stage, 'request', 'candidate.json'))).toBe(true);
  });

  it('refuses a later capture whose decoded pixels differ from the image the requester selected', () => {
    const fixture = commissionedCapture('f'.repeat(64));

    const run = bundle(fixture);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('request-image-mismatch');
    expect(run.stderr).toContain('refusing to stage');
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
  });
});

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
  try {
    const stdout = execFileSync(TSX, [SCRIPT, subcommand, fixture.request, ...rest], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stderr: '', stdout };
  } catch (error) {
    const failure = error as { status?: number; stderr?: string; stdout?: string };
    return { status: failure.status ?? -1, stderr: failure.stderr ?? '', stdout: failure.stdout ?? '' };
  }
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
