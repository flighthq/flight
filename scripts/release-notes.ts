import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConventionalCommit } from './conventional-commits.js';
import { parseConventionalCommit } from './conventional-commits.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releasesDir = join(root, 'releases');
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const GENERATED_START = '<!-- generated changes: do not edit -->';
const GENERATED_END = '<!-- end generated changes -->';
const HIGHLIGHTS_PLACEHOLDER = '- Replace this line with the release highlights.';
const MIGRATION_PLACEHOLDER = '- Replace this line with migration guidance, or state that no migration is required.';

export interface ReleaseNoteInput {
  version: string;
  previousVersion: string;
  testedCandidate: string;
  changesThrough: string;
  commits: readonly ConventionalCommit[];
}

interface ReleaseMetadata {
  previousVersion: string;
  testedCandidate: string;
  changesThrough: string;
}

export function renderReleaseNote(input: Readonly<ReleaseNoteInput>): string {
  return `# Flight ${input.version}

- Previous release: \`${input.previousVersion}\`
- Tested candidate: \`@flighthq/sdk@${input.testedCandidate}\`
- Changes through: \`${input.changesThrough}\`

## Highlights

${HIGHLIGHTS_PLACEHOLDER}

## Migration

${MIGRATION_PLACEHOLDER}

## Changes

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
  return `${GENERATED_START}\n${sections.join('\n\n')}\n\n${comparison}\n${GENERATED_END}\n`;
}

export function validateReleaseNote(
  contents: string,
  expected: Readonly<ReleaseNoteInput>,
  postCandidateSubjects: readonly string[],
): string[] {
  const issues: string[] = [];
  if (!contents.startsWith(`# Flight ${expected.version}\n`)) issues.push(`title is not Flight ${expected.version}`);
  if (contents.includes(HIGHLIGHTS_PLACEHOLDER)) issues.push('Highlights still contains its draft placeholder');
  if (contents.includes(MIGRATION_PLACEHOLDER)) issues.push('Migration still contains its draft placeholder');

  const metadata = parseReleaseMetadata(contents);
  if (metadata === null) {
    issues.push('release metadata is missing or malformed');
  } else {
    if (metadata.previousVersion !== expected.previousVersion) {
      issues.push(`previous release is ${metadata.previousVersion}, expected ${expected.previousVersion}`);
    }
    if (metadata.testedCandidate !== expected.testedCandidate) {
      issues.push(`tested candidate is ${metadata.testedCandidate}, expected ${expected.testedCandidate}`);
    }
    if (metadata.changesThrough !== expected.changesThrough) {
      issues.push(`changes-through commit is ${metadata.changesThrough}, expected ${expected.changesThrough}`);
    }
  }

  const actualGenerated = betweenMarkers(contents, GENERATED_START, GENERATED_END);
  const expectedGenerated = betweenMarkers(
    renderGeneratedChanges(expected.commits, expected),
    GENERATED_START,
    GENERATED_END,
  );
  if (actualGenerated === null || actualGenerated !== expectedGenerated) {
    issues.push('generated Changes appendix does not match the conventional commits in the recorded range');
  }

  for (const subject of postCandidateSubjects) {
    if (!subject.startsWith('chore(release): ')) {
      issues.push(`untested post-candidate commit is not release metadata: ${subject}`);
    }
  }
  return issues;
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

function parseReleaseMetadata(contents: string): ReleaseMetadata | null {
  const previousVersion = /^- Previous release: `([^`]+)`$/m.exec(contents)?.[1];
  const testedCandidate = /^- Tested candidate: `@flighthq\/sdk@([^`]+)`$/m.exec(contents)?.[1];
  const changesThrough = /^- Changes through: `([0-9a-f]{40})`$/m.exec(contents)?.[1];
  if (previousVersion === undefined || testedCandidate === undefined || changesThrough === undefined) return null;
  return { previousVersion, testedCandidate, changesThrough };
}

function betweenMarkers(contents: string, startMarker: string, endMarker: string): string | null {
  const start = contents.indexOf(startMarker);
  const end = contents.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return null;
  return contents.slice(start + startMarker.length, end).trim();
}

function main(): void {
  const [mode, version, ...args] = process.argv.slice(2);
  if ((mode !== 'draft' && mode !== 'check') || version === undefined || !VERSION_PATTERN.test(version)) {
    fail('Usage: release-notes.ts <draft|check> <version> [--candidate <exact-next-version>]');
  }

  const notePath = join(releasesDir, `${version}.md`);
  if (mode === 'draft') {
    const testedCandidate = readOption(args, '--candidate');
    if (testedCandidate === null) fail('draft requires --candidate <exact-next-version>');
    const input = resolveReleaseInput(version, testedCandidate);
    mkdirSync(releasesDir, { recursive: true });
    if (existsSync(notePath)) fail(`${notePath} already exists; refusing to overwrite human release notes`);
    writeFileSync(notePath, renderReleaseNote(input));
    console.log(
      `[release:notes] drafted ${relativePath(notePath)} from ${input.previousVersion} through ${input.changesThrough}`,
    );
    console.log('[release:notes] curate Highlights and Migration, then run the check command.');
    return;
  }

  if (!existsSync(notePath)) fail(`missing ${relativePath(notePath)}; run the draft command first`);
  const contents = readFileSync(notePath, 'utf8');
  const metadata = parseReleaseMetadata(contents);
  if (metadata === null) fail(`${relativePath(notePath)} has missing or malformed release metadata`);
  const input = resolveReleaseInput(version, metadata.testedCandidate, metadata.changesThrough);
  const subjects = git('log', '--format=%s', `${input.changesThrough}..HEAD`)
    .split('\n')
    .map((subject) => subject.trim())
    .filter(Boolean);
  const issues = validateReleaseNote(contents, input, subjects);
  if (issues.length > 0) {
    console.error(`[release:notes] ${relativePath(notePath)} has ${issues.length} issue(s):`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log(
    `[release:notes] ${relativePath(notePath)} matches ${input.commits.length} release commits; tested candidate ${input.testedCandidate}`,
  );
}

export function resolveReleaseInput(
  version: string,
  testedCandidate: string,
  explicitThrough?: string,
): ReleaseNoteInput {
  const candidatePattern = new RegExp(`^${escapeRegExp(version)}-next\\.\\d+\\.([0-9a-f]{7,40})$`);
  const candidateMatch = candidatePattern.exec(testedCandidate);
  if (candidateMatch === null) {
    fail(`tested candidate must be an exact ${version}-next.<count>.<sha> version, got ${testedCandidate}`);
  }
  const candidateSha = candidateMatch[1];
  const changesThrough = git('rev-parse', `${explicitThrough ?? candidateSha}^{commit}`);
  if (!changesThrough.startsWith(candidateSha)) {
    fail(`tested candidate suffix ${candidateSha} does not identify changes-through commit ${changesThrough}`);
  }
  if (!isAncestor(changesThrough, 'HEAD')) fail(`${changesThrough} is not an ancestor of HEAD`);

  const previousVersion = previousVersionTag(version, changesThrough);
  if (previousVersion === null) fail(`no earlier numeric version tag is reachable from ${changesThrough}`);
  return {
    version,
    previousVersion,
    testedCandidate,
    changesThrough,
    commits: readCommits(`${previousVersion}..${changesThrough}`),
  };
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
    .filter((tag) => VERSION_PATTERN.test(tag) && compareVersions(tag, version) < 0)
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

function readOption(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1 || args[index + 1] === undefined) return null;
  return args[index + 1];
}

function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function git(...args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function relativePath(path: string): string {
  return path.slice(root.length + 1).replaceAll('\\', '/');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message: string): never {
  console.error(`[release:notes] ${message}`);
  process.exit(1);
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
