import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FIXTURE_RELEASE_TAG } from '../../scripts/fixtures';

describe('import-conformance CLI', () => {
  it(
    'writes a complete NOT RUN artifact and exits two when the pack is unavailable',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'flight-conformance-cli-'));
      const score = join(directory, 'score.json');
      const result = runCli(directory, [
        '--pack=swf-ruffle-fixtures',
        `--score-file=${score}`,
        '--run-id=run-1',
        '--run-url=https://ci.invalid/run-1',
      ]);
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('NOT RUN: pack-unavailable');
      const artifact = JSON.parse(readFileSync(score, 'utf8'));
      expect(artifact.packs[0]).toMatchObject({ state: 'not-run', summary: null });
      expect(artifact.packs[0].capabilities).toHaveLength(82);
    },
    CLI_PROCESS_TEST_TIMEOUT_MS,
  );

  it(
    'removes an explicitly named stale target on invalid CLI input',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'flight-conformance-cli-'));
      const score = join(directory, 'score.json');
      writeFileSync(score, 'stale');
      const result = runCli(directory, ['--pack=swf-ruffle-fixtures', `--score-file=${score}`, '--since=HEAD']);
      expect(result.status).toBe(1);
      expect(existsSync(score)).toBe(false);
    },
    CLI_PROCESS_TEST_TIMEOUT_MS,
  );

  it(
    'keeps capability subset failure structurally scoreless',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'flight-conformance-cli-'));
      const result = runCli(directory, ['--pack=swf-ruffle-fixtures', '--capability=swf.fill.solid']);
      expect(result.status).toBe(1);
      expect(existsSync(join(directory, 'score.json'))).toBe(false);
    },
    CLI_PROCESS_TEST_TIMEOUT_MS,
  );

  it(
    'writes NOT RUN with the complete plan when another shard is missing',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'flight-conformance-cli-'));
      writeFixtureTree(directory);
      const score = join(directory, 'score.json');
      const result = runCli(
        directory,
        ['--pack=swf-ruffle-fixtures', `--score-file=${score}`, '--run-id=run-1', '--run-url=https://ci.invalid/run-1'],
        '2/2',
      );
      expect(result.status).toBe(2);
      const artifact = JSON.parse(readFileSync(score, 'utf8'));
      expect(artifact.packs[0]).toMatchObject({ reason: 'missing-shard', state: 'not-run', summary: null });
      expect(artifact.packs[0].sharding.shards).toEqual([
        { id: 0, reason: 'missing-shard', state: 'not-run' },
        { id: 1, state: 'measured' },
      ]);
    },
    CLI_PROCESS_TEST_TIMEOUT_MS,
  );
});

function runCli(fixtureDirectory: string, args: readonly string[], shard?: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'import-conformance.ts'), ...args], {
    cwd: join(import.meta.dirname, '../..'),
    encoding: 'utf8',
    env: { ...process.env, FLIGHT_CONFORMANCE_SHARD: shard, FLIGHT_FIXTURES_DIR: fixtureDirectory },
  });
}

function writeFixtureTree(root: string): void {
  const directory = join(root, 'extracted', 'full', 'swf-ruffle-fixtures');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'minimal.swf'), createMinimalSwf());
  writeFileSync(
    join(directory, '.flight-fixtures.json'),
    JSON.stringify({
      packs: [
        {
          file: 'unused.tar.gz',
          // The tree below holds exactly one corpus file and no pack metadata, so these are
          // read off the fixture rather than chosen: `files: 1` meant this and still does.
          metadataFiles: 0,
          pack: 'swf-ruffle-fixtures',
          sha256: 'a'.repeat(64),
          verifiedFixtureFiles: 1,
          verifiedFixturePaths: ['minimal.swf'],
        },
      ],
      tag: FIXTURE_RELEASE_TAG,
      variant: 'full',
    }),
  );
}

function createMinimalSwf(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x46, 0x57, 0x53, 9, 16, 0, 0, 0, 0x08, 0, 0, 24, 1, 0, 0, 0]);
  return bytes;
}

// Each case starts a real child process and loads the complete conformance CLI module graph. Repository-wide
// parallelism can delay that startup without changing the CLI result the assertions are designed to verify.
const CLI_PROCESS_TEST_TIMEOUT_MS = 15_000;
