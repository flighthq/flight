import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('import-conformance CLI', () => {
  it('writes a complete NOT RUN artifact and exits two when the pack is unavailable', () => {
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
    expect(artifact.packs[0].capabilities).toHaveLength(80);
  });

  it('removes an explicitly named stale target on invalid CLI input', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-conformance-cli-'));
    const score = join(directory, 'score.json');
    writeFileSync(score, 'stale');
    const result = runCli(directory, ['--pack=swf-ruffle-fixtures', `--score-file=${score}`, '--since=HEAD']);
    expect(result.status).toBe(1);
    expect(existsSync(score)).toBe(false);
  });

  it('keeps capability subset failure structurally scoreless', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-conformance-cli-'));
    const result = runCli(directory, ['--pack=swf-ruffle-fixtures', '--capability=swf.fill.solid']);
    expect(result.status).toBe(1);
    expect(existsSync(join(directory, 'score.json'))).toBe(false);
  });
});

function runCli(fixtureDirectory: string, args: readonly string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'import-conformance.ts'), ...args], {
    cwd: join(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, FLIGHT_FIXTURES_DIR: fixtureDirectory },
  });
}
