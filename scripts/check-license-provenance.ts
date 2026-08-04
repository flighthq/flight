import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

export interface LicenseProvenanceInput {
  path: string;
  text: string;
}

export interface LicenseProvenanceReport {
  escapes: LicenseProvenanceEscapeResult[];
  scannedFiles: number;
  structuralMatches: number;
  violations: LicenseProvenanceViolation[];
}

export interface LicenseProvenanceViolation {
  line: number;
  match: string;
  path: string;
  rule: string;
}

interface LicenseProvenanceEscape {
  match: (path: string, line: string) => boolean;
  name: string;
  reason: string;
}

export interface LicenseProvenanceEscapeResult {
  matches: number;
  name: string;
  reason: string;
}

interface MarkerRule {
  conditional: boolean;
  name: string;
  phrase: string;
}

const IDENTIFIERS = [
  parts('M', 'IT'),
  parts('B', 'SD'),
  parts('A', 'pache'),
  parts('G', 'PL'),
  parts('L', 'G', 'PL'),
  parts('A', 'G', 'PL'),
  parts('I', 'SC'),
  parts('M', 'PL'),
  parts('E', 'PL'),
  parts('C', 'DDL'),
  parts('Z', 'lib'),
  parts('Un', 'license'),
  parts('C', 'C0'),
  parts('C', 'C-BY'),
  parts('W', 'TFPL'),
  parts('Boost', ' Software License'),
  parts('SIL', ' OFL'),
];

const MARKERS: readonly MarkerRule[] = [
  marker('adapted-from', 'adapted', 'from'),
  marker('transcribed-from', 'transcribed', 'from'),
  marker('translated-from', 'translated', 'from'),
  marker('algebra-sourced-from', 'algebra', 'sourced', 'from'),
  marker('ported-from', 'ported', 'from'),
  { conditional: true, name: 'derived-from-with-provenance', phrase: words('derived', 'from') },
];

const IDENTIFIER_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(?:${IDENTIFIERS.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`,
  'g',
);

const PROJECT_BRANDS = [parts('Dragon', 'Bones'), parts('Open', 'FL'), parts('Pixi', 'JS')];
const PROJECT_CONTEXT_PATTERN = new RegExp(
  `(?:${PROJECT_BRANDS.map(escapeRegExp).join('|')})|\\b[A-Z][A-Za-z0-9]*(?:[ -][A-Z][A-Za-z0-9]*)* (?:codebase|corpus|framework|library|project|repo|repository|runtime)\\b`,
);
const URL_PATTERN = /https?:\/\/[^\s)>'"]+/;
const NEGATION_PATTERN = /\b(?:never|neither|no|not|nothing|without)\b/i;
const MANIFEST_LICENSE_LINE = /^\s*"license"\s*:\s*"[^"]+"\s*,?\s*$/;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

const PROJECT_POLICY_LINE = `Flight is ${parts('M', 'IT')}, copyright Joshua Granick alone. **No work may attach an attribution obligation to anyone else.** This outranks any feature, unblock, or deadline. If you think you need third-party material for anything, stop and ask.`;
const PROHIBITED_EXAMPLE_LINE = `- **State format facts as facts about the format, not as excerpts from a document.** "PNG's magic bytes are \`89 50 4E 47\`" needs no attribution; "${words('derived', 'from')} \`<url>\` at \`<sha>\`, ${parts('M', 'IT')}" manufactures one.`;

const NAMED_ESCAPES: readonly LicenseProvenanceEscape[] = [
  {
    match: (path, line) => path === 'package-lock.json' && MANIFEST_LICENSE_LINE.test(line),
    name: 'npm-lock-license-metadata',
    reason: 'generated dependency metadata; only an exact license property line is allowed',
  },
  {
    match: (path, line) => path === 'AGENTS.md' && line.trim() === PROJECT_POLICY_LINE,
    name: 'project-license-policy',
    reason: 'the repository policy must be able to name its own declaration',
  },
  {
    match: (path, line) => path === 'AGENTS.md' && line.trim() === PROHIBITED_EXAMPLE_LINE,
    name: 'prohibited-provenance-example',
    reason: 'the repository policy includes one exact hypothetical showing what contributors must not add',
  },
];

/** Finds declaration and attribution markers outside the repository's narrow structural sites. */
export function checkLicenseProvenance(inputs: readonly LicenseProvenanceInput[]): LicenseProvenanceReport {
  const escapeLines = NAMED_ESCAPES.map(() => new Set<string>());
  const violations: LicenseProvenanceViolation[] = [];
  const structuralMatches = new Set<string>();

  for (const input of inputs) {
    const path = normalizePath(input.path);
    const lines = input.text.split(/\r?\n/);
    const contexts = commentContexts(path, lines);
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(identifierPattern())) {
        const disposition = dispositionOf(path, line, index, escapeLines);
        if (disposition === 'structural') {
          structuralMatches.add(`${path}:${index + 1}:${match[0]}`);
        } else if (disposition === 'violation') {
          violations.push({ line: index + 1, match: match[0], path, rule: 'license-identifier' });
        }
      }

      for (const rule of MARKERS) {
        const pattern = markerPattern(rule.phrase);
        for (const match of line.matchAll(pattern)) {
          if (isNegated(line, match.index ?? 0)) continue;
          const context = contexts.get(index) ?? line;
          if (rule.conditional && !hasProvenanceContext(context)) continue;
          const disposition = dispositionOf(path, line, index, escapeLines);
          if (disposition === 'structural') {
            structuralMatches.add(`${path}:${index + 1}:${match[0]}`);
          } else if (disposition === 'violation') {
            violations.push({ line: index + 1, match: match[0], path, rule: rule.name });
          }
        }
      }
    }
  }

  const uniqueViolations = [
    ...new Map(violations.map((entry) => [`${entry.path}:${entry.line}:${entry.rule}:${entry.match}`, entry])).values(),
  ].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));
  return {
    escapes: NAMED_ESCAPES.map((entry, index) => ({
      matches: escapeLines[index]?.size ?? 0,
      name: entry.name,
      reason: entry.reason,
    })),
    scannedFiles: new Set(inputs.map((input) => normalizePath(input.path))).size,
    structuralMatches: structuralMatches.size,
    violations: uniqueViolations,
  };
}

export function formatLicenseProvenanceReport(report: Readonly<LicenseProvenanceReport>): string {
  const passed = report.violations.length === 0;
  const lines = [
    `${passed ? pc.green('OK') : pc.yellow('!')} ${pc.bold('License and provenance declarations stay at approved sites')} ${pc.dim(`(${report.scannedFiles} tracked text files, ${report.structuralMatches} structural matches)`)}`,
    '',
    '  Named escapes:',
  ];
  for (const entry of report.escapes) {
    lines.push(`  - ${entry.name} [${entry.matches} matched line${entry.matches === 1 ? '' : 's'}] — ${entry.reason}`);
  }
  if (!passed) {
    lines.push('', `  ${report.violations.length} violation${report.violations.length === 1 ? '' : 's'}:`);
    for (const violation of report.violations) {
      lines.push(`  - ${violation.path}:${violation.line} [${violation.rule}] — ${JSON.stringify(violation.match)}`);
    }
  }
  return lines.join('\n');
}

function commentContexts(path: string, lines: readonly string[]): Map<number, string> {
  const contexts = new Map<number, string>();
  addDelimitedCommentContexts(lines, contexts, '/*', '*/');
  addDelimitedCommentContexts(lines, contexts, '<!--', '-->');
  addPrefixedCommentContexts(lines, contexts, '//');
  if (supportsHashComments(path)) addPrefixedCommentContexts(lines, contexts, '#');
  return contexts;
}

function addDelimitedCommentContexts(
  lines: readonly string[],
  contexts: Map<number, string>,
  open: string,
  close: string,
): void {
  let start = -1;
  for (const [index, line] of lines.entries()) {
    if (start < 0 && line.includes(open)) start = index;
    if (start < 0 || !line.includes(close)) continue;
    const context = lines.slice(start, index + 1).join('\n');
    for (let member = start; member <= index; member++) contexts.set(member, context);
    start = -1;
  }
  if (start >= 0) {
    const context = lines.slice(start).join('\n');
    for (let member = start; member < lines.length; member++) contexts.set(member, context);
  }
}

function addPrefixedCommentContexts(lines: readonly string[], contexts: Map<number, string>, prefix: string): void {
  for (let start = 0; start < lines.length; start++) {
    if (!lines[start]?.trimStart().startsWith(prefix)) continue;
    let end = start;
    while (lines[end + 1]?.trimStart().startsWith(prefix)) end++;
    const context = lines.slice(start, end + 1).join('\n');
    for (let member = start; member <= end; member++) {
      if (!contexts.has(member)) contexts.set(member, context);
    }
    start = end;
  }
}

function dispositionOf(
  path: string,
  line: string,
  lineIndex: number,
  escapeLines: readonly Set<string>[],
): 'escape' | 'structural' | 'violation' {
  if (path === 'LICENSE.md') return 'structural';
  if (isPackageManifest(path) && MANIFEST_LICENSE_LINE.test(line)) return 'structural';
  for (const [index, escape] of NAMED_ESCAPES.entries()) {
    if (!escape.match(path, line)) continue;
    escapeLines[index]?.add(`${path}:${lineIndex + 1}`);
    return 'escape';
  }
  return 'violation';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTrackedTextInputs(repositoryRoot: string): LicenseProvenanceInput[] {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  const inputs: LicenseProvenanceInput[] = [];
  const workingText = new Map<string, string>();
  for (const path of output.split('\0')) {
    if (path === '') continue;
    const absolutePath = join(repositoryRoot, path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    const bytes = readFileSync(absolutePath);
    if (bytes.includes(0)) continue;
    const normalizedPath = normalizePath(path);
    const text = bytes.toString('utf8');
    inputs.push({ path: normalizedPath, text });
    workingText.set(normalizedPath, text);
  }

  const stagedOutput = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  for (const path of stagedOutput.split('\0')) {
    if (path === '') continue;
    const normalizedPath = normalizePath(path);
    const bytes = execFileSync('git', ['show', `:${path}`], { cwd: repositoryRoot, maxBuffer: MAX_GIT_OUTPUT_BYTES });
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    if (workingText.get(normalizedPath) !== text) inputs.push({ path: normalizedPath, text });
  }
  return inputs;
}

function hasProvenanceContext(context: string): boolean {
  return identifierPattern().test(context) || URL_PATTERN.test(context) || PROJECT_CONTEXT_PATTERN.test(context);
}

function identifierPattern(): RegExp {
  return new RegExp(IDENTIFIER_PATTERN.source, IDENTIFIER_PATTERN.flags);
}

function isNegated(line: string, matchIndex: number): boolean {
  const clauseStart = Math.max(
    line.lastIndexOf('.', matchIndex - 1),
    line.lastIndexOf(';', matchIndex - 1),
    line.lastIndexOf('!', matchIndex - 1),
    line.lastIndexOf('?', matchIndex - 1),
  );
  const wordsBefore =
    line
      .slice(clauseStart + 1, matchIndex)
      .match(/[A-Za-z]+/g)
      ?.slice(-8)
      .join(' ') ?? '';
  return NEGATION_PATTERN.test(wordsBefore);
}

function isPackageManifest(path: string): boolean {
  return path === 'package.json' || path.endsWith('/package.json');
}

function marker(name: string, ...phrase: string[]): MarkerRule {
  return { conditional: false, name, phrase: words(...phrase) };
}

function markerPattern(phrase: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(phrase)}(?![A-Za-z0-9])`, 'gi');
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}

function parts(...values: string[]): string {
  return values.join('');
}

function supportsHashComments(path: string): boolean {
  return ['.ini', '.py', '.rb', '.sh', '.toml', '.yaml', '.yml'].includes(extname(path));
}

function words(...values: string[]): string {
  return values.join(' ');
}

function main(): void {
  const report = checkLicenseProvenance(getTrackedTextInputs(root));
  console.log(formatLicenseProvenanceReport(report));
  if (report.violations.length > 0) process.exitCode = 1;
}

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
