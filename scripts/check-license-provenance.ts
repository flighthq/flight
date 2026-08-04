import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

export interface LicenseProvenanceInput {
  path: string;
  text: string;
}

export interface LicenseProvenanceReport {
  escapes: LicenseProvenanceEscapeResult[];
  matcherState: string;
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
  name: string;
  phrase: string;
}

interface LicenseTokenMatch {
  index: number;
  match: string;
  rule: string;
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
  marker('derived-from-with-provenance', 'derived', 'from'),
];

const LICENSE_VOCABULARY = [
  words('third-party', 'licence'),
  words('third-party', 'license'),
  words('attribution', 'obligation'),
  words('permission', 'is', 'hereby', 'granted'),
  words('subject', 'to', 'the', 'following', 'conditions'),
];

const IDENTIFIER_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(?:${IDENTIFIERS.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`,
  'g',
);
const LICENSE_VOCABULARY_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(?:${LICENSE_VOCABULARY.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`,
  'gi',
);
const NEGATION_PATTERN = /\b(?:never|neither|no|not|nothing|without)\b/i;
const MANIFEST_LICENSE_LINE = /^\s*"license"\s*:\s*"[^"]+"\s*,?\s*$/;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const DISSOLVED_FLIGHT_PACKAGES = new Set(['filters']);

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

/** Finds licence tokens and classifies implementation-origin language only when a token is present. */
export function checkLicenseProvenance(inputs: readonly LicenseProvenanceInput[]): LicenseProvenanceReport {
  const escapeLines = NAMED_ESCAPES.map(() => new Set<string>());
  const flightPackages = getFlightPackageNames(inputs);
  const violations: LicenseProvenanceViolation[] = [];
  const structuralMatches = new Set<string>();

  for (const input of inputs) {
    const path = normalizePath(input.path);
    const lines = input.text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const activeTokens = licenseTokenMatches(line).filter((match) => !isNegated(line, match.index));
      for (const token of activeTokens) {
        const disposition = dispositionOf(path, line, index, escapeLines);
        if (disposition === 'structural') {
          structuralMatches.add(`${path}:${index + 1}:${token.match}`);
        } else if (disposition === 'violation') {
          violations.push({ line: index + 1, match: token.match, path, rule: token.rule });
        }
      }

      if (activeTokens.length === 0) continue;
      for (const rule of MARKERS) {
        const pattern = markerPattern(rule.phrase);
        for (const match of line.matchAll(pattern)) {
          if (isNegated(line, match.index ?? 0)) continue;
          if (isPermittedDerivationObject(line, match, flightPackages)) continue;
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
    matcherState: 'semantic negatives and positive verification protected; token-keying active',
    scannedFiles: new Set(inputs.map((input) => normalizePath(input.path))).size,
    structuralMatches: structuralMatches.size,
    violations: uniqueViolations,
  };
}

export function formatLicenseProvenanceReport(report: Readonly<LicenseProvenanceReport>): string {
  const passed = report.violations.length === 0;
  const lines = [
    `${passed ? pc.green('OK') : pc.yellow('!')} ${pc.bold('License and provenance declarations stay at approved sites')} ${pc.dim(`(${report.scannedFiles} tracked text files, ${report.structuralMatches} structural matches)`)}`,
    `  Matcher state: [${report.matcherState}]`,
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

function getFlightPackageNames(inputs: readonly LicenseProvenanceInput[]): Set<string> {
  const names = new Set(DISSOLVED_FLIGHT_PACKAGES);
  for (const input of inputs) {
    const match = normalizePath(input.path).match(/^packages\/([^/]+)\/package\.json$/);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

function identifierPattern(): RegExp {
  return new RegExp(IDENTIFIER_PATTERN.source, IDENTIFIER_PATTERN.flags);
}

function licenseTokenMatches(line: string): LicenseTokenMatch[] {
  return [
    ...[...line.matchAll(identifierPattern())].map((match) => ({
      index: match.index ?? 0,
      match: match[0],
      rule: 'license-identifier',
    })),
    ...[...line.matchAll(licenseVocabularyPattern())].map((match) => ({
      index: match.index ?? 0,
      match: match[0],
      rule: 'license-vocabulary',
    })),
  ].sort((a, b) => a.index - b.index || a.match.localeCompare(b.match));
}

function licenseVocabularyPattern(): RegExp {
  return new RegExp(LICENSE_VOCABULARY_PATTERN.source, LICENSE_VOCABULARY_PATTERN.flags);
}

function isNegated(line: string, matchIndex: number): boolean {
  const prefix = line.slice(0, matchIndex);
  const boundaries = [...prefix.matchAll(/[;!?—]|\.(?=\s|$)/g)];
  const clauseStart = boundaries.at(-1)?.index ?? -1;
  const wordsBefore =
    line
      .slice(clauseStart + 1, matchIndex)
      .match(/[A-Za-z]+/g)
      ?.slice(-12)
      .join(' ') ?? '';
  return NEGATION_PATTERN.test(wordsBefore);
}

function isPermittedDerivationObject(
  line: string,
  match: RegExpMatchArray,
  flightPackages: ReadonlySet<string>,
): boolean {
  const tail = line.slice((match.index ?? 0) + match[0].length);
  const clause = tail.split(/[.;!?—]/, 1)[0] ?? tail;
  if (!/\bimplementation\b/i.test(clause) && /\b(?:format description|specification|standard)\b/i.test(clause)) {
    return true;
  }
  const packageMatch = clause.match(
    /^\s+(?:(?:a|an|the)\s+)?(?:(?:current|dissolved|former|internal|removed|renamed-away)\s+)?`?(?:@flighthq\/)?([a-z][a-z0-9-]*)`?/,
  );
  return packageMatch?.[1] !== undefined && flightPackages.has(packageMatch[1]);
}

function isPackageManifest(path: string): boolean {
  return path === 'package.json' || path.endsWith('/package.json');
}

function marker(name: string, ...phrase: string[]): MarkerRule {
  return { name, phrase: words(...phrase) };
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
