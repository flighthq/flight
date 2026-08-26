import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConventionalCommit } from './conventional-commits.js';
import { parseConventionalCommit } from './conventional-commits.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const RELEASE_VERSION_PATTERN = /^(\d+\.\d+\.\d+)(?:-(?:next|edge)\.\d+\.([0-9a-f]{7,40}))?$/;

export interface ReleaseNoteInput {
  version: string;
  previousVersion: string;
  changesThrough: string;
  description: string;
  commits: readonly ConventionalCommit[];
}

interface CliOptions {
  description: string;
  through: string;
  output: string | null;
}

export function renderReleaseNote(input: Readonly<ReleaseNoteInput>): string {
  const description = input.description.trim();
  const introduction = description === '' ? '' : `${description}\n\n`;
  return `# Flight ${input.version}

${introduction}## Changes

${renderGeneratedChanges(input.commits, input)}`;
}

export function renderGeneratedChanges(
  commits: readonly ConventionalCommit[],
  context: Pick<ReleaseNoteInput, 'previousVersion' | 'changesThrough'>,
): string {
  const breaking = commits.filter((commit) => commit.breaking);
  const features = commits.filter((commit) => !commit.breaking && commit.type === 'feat');
  const fixes = commits.filter((commit) => !commit.breaking && commit.type === 'fix');
  const performance = commits.filter((commit) => !commit.breaking && commit.type === 'perf');
  const sections = [
    formatCommitSection('Breaking changes', breaking),
    formatCommitSection('Features', features),
    formatFixSummary(fixes),
    formatCommitSection('Performance', performance),
  ];
  const comparison =
    `[Full comparison](https://github.com/flighthq/flight/compare/${context.previousVersion}...${context.changesThrough}) ` +
    'includes individual fixes, documentation, tests, refactors, and maintenance commits.';
  return `${sections.join('\n\n')}\n\n${comparison}\n`;
}

function formatCommit(commit: Readonly<ConventionalCommit>): string {
  const scope = commit.scope === null ? '' : `**${escapeMarkdown(commit.scope)}:** `;
  const summary = escapeMarkdown(commit.summary);
  const shortSha = commit.sha.slice(0, 7);
  return `- ${scope}${summary} ([${shortSha}](https://github.com/flighthq/flight/commit/${commit.sha}))`;
}

function formatCommitSection(title: string, commits: readonly ConventionalCommit[]): string {
  const rows = commits.length === 0 ? ['- None.'] : commits.map(formatCommit);
  return `### ${title}\n\n${rows.join('\n')}`;
}

function formatFixSummary(commits: readonly ConventionalCommit[]): string {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const scope = commit.scope ?? 'repository';
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  const rows = [...counts]
    .sort(([scopeA], [scopeB]) => scopeA.localeCompare(scopeB))
    .map(([scope, count]) => `- **${escapeMarkdown(scope)}:** ${count} fix${count === 1 ? '' : 'es'}`);
  return `### Fixes\n\n${rows.length === 0 ? '- None.' : rows.join('\n')}`;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

export function resolveReleaseInput(version: string, through = 'HEAD', description = ''): ReleaseNoteInput {
  const versionMatch = RELEASE_VERSION_PATTERN.exec(version);
  const stableTargetVersion = versionMatch?.[1];
  if (stableTargetVersion === undefined) {
    fail(`version must be numeric stable or a next/edge snapshot, got ${version}`);
  }
  const changesThrough = git('rev-parse', `${through}^{commit}`);
  const snapshotSha = versionMatch?.[2];
  if (snapshotSha !== undefined && !changesThrough.startsWith(snapshotSha)) {
    fail(`snapshot suffix ${snapshotSha} does not identify changes-through commit ${changesThrough}`);
  }
  const previousVersion = previousVersionTag(stableTargetVersion, changesThrough);
  if (previousVersion === null) fail(`no earlier numeric version tag is reachable from ${changesThrough}`);
  return {
    version,
    previousVersion,
    changesThrough,
    description,
    commits: readCommits(`${previousVersion}..${changesThrough}`),
  };
}

export function getStableTargetVersion(version: string): string | null {
  return RELEASE_VERSION_PATTERN.exec(version)?.[1] ?? null;
}

function readCommits(range: string): ConventionalCommit[] {
  const records = git('log', '--reverse', '--format=%H%x1f%s%x1f%b%x1e', range).split('\x1e');
  return records.flatMap((record) => {
    const normalized = record.trim();
    if (normalized === '') return [];
    const [sha, subject, body = ''] = normalized.split('\x1f');
    if (sha === undefined || subject === undefined) fail(`could not parse git log record in ${range}`);
    return [parseConventionalCommit(sha, subject, body)];
  });
}

function previousVersionTag(version: string, through: string): string | null {
  const candidates = git('tag', '--merged', through, '--list')
    .split('\n')
    .filter((tag) => STABLE_VERSION_PATTERN.test(tag) && compareVersions(tag, version) < 0)
    .sort(compareVersions);
  return candidates.at(-1) ?? null;
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseOptions(args: readonly string[]): CliOptions {
  const options: CliOptions = { description: '', through: 'HEAD', output: null };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined) fail(`${flag ?? 'option'} requires a value`);
    if (flag === '--description') options.description = value;
    else if (flag === '--through') options.through = value;
    else if (flag === '--output') options.output = value;
    else fail(`unknown option ${flag}`);
  }
  return options;
}

function git(...args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fail(message: string): never {
  console.error(`[release:notes] ${message}`);
  process.exit(1);
}

function main(): void {
  const [version, ...args] = process.argv.slice(2);
  if (version === undefined || getStableTargetVersion(version) === null) {
    fail(
      'Usage: release-notes.ts <stable-or-snapshot-version> [--description <markdown>] [--through <git-ref>] [--output <path>]',
    );
  }

  const options = parseOptions(args);
  const input = resolveReleaseInput(version, options.through, options.description);
  const contents = renderReleaseNote(input);
  if (options.output === null) {
    process.stdout.write(contents);
    return;
  }

  const outputPath = resolve(root, options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, contents);
  console.log(`[release:notes] generated ${outputPath} from ${input.previousVersion} through ${input.changesThrough}`);
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
