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
  match: (context: Readonly<LicenseProvenanceEscapeContext>) => boolean;
  name: string;
  reason: string;
}

interface LicenseProvenanceEscapeContext extends LicenseTokenMatch {
  line: string;
  path: string;
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
  marker('sourced-from', 'sourced', 'from'),
  marker('adapted-from', 'adapted', 'from'),
  marker('transcribed-from', 'transcribed', 'from'),
  marker('translated-from', 'translated', 'from'),
  marker('ported-from', 'ported', 'from'),
  marker('derived-from-with-provenance', 'derived', 'from'),
  marker('replicates-origin', 'replicates'),
  marker('reproduces-origin', 'reproduces'),
  marker('mirrors-origin', 'mirrors'),
  marker('follows-origin', 'follows'),
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
const MARKER_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(?:${MARKERS.map((r) => escapeRegExp(r.phrase)).join('|')})(?![A-Za-z0-9])`,
  'gi',
);
const MARKER_PHRASE_TO_RULE = new Map(MARKERS.map((r) => [r.phrase.toLowerCase(), r]));
const NEGATION_PATTERN = /\b(?:never|neither|no|not|nothing|without)\b/i;
const MANIFEST_LICENSE_LINE = /^\s*"license"\s*:\s*"[^"]+"\s*,?\s*$/;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const DISSOLVED_FLIGHT_PACKAGES = new Set(['filters']);

const PROHIBITED_EXAMPLE_LINE = `- **State format facts as facts about the format, not as excerpts from a document.** "PNG's magic bytes are \`89 50 4E 47\`" needs no attribution; "${words('derived', 'from')} \`<url>\` at \`<sha>\`, ${parts('M', 'IT')}" manufactures one.`;

const NAMED_ESCAPES: readonly LicenseProvenanceEscape[] = [
  {
    match: ({ line, path }) => path === 'package-lock.json' && MANIFEST_LICENSE_LINE.test(line),
    name: 'npm-lock-license-metadata',
    reason: 'generated dependency metadata; only an exact license property line is allowed',
  },
  {
    match: isProjectPolicyToken,
    name: 'project-license-policy',
    reason: 'the repository policy must be able to name its own declaration; keyed by file and policy rule',
  },
  {
    match: ({ line, path }) => path === 'AGENTS.md' && line.trim() === PROHIBITED_EXAMPLE_LINE,
    name: 'prohibited-provenance-example',
    reason: 'the repository policy includes one exact hypothetical showing what contributors must not add',
  },
];

/** Finds licence tokens and independently classifies claims that take from an external implementation object. */
export function checkLicenseProvenance(inputs: readonly LicenseProvenanceInput[]): LicenseProvenanceReport {
  const escapeLines = NAMED_ESCAPES.map(() => new Set<string>());
  const flightPackages = getFlightPackageNames(inputs);
  const violations: LicenseProvenanceViolation[] = [];
  const structuralMatches = new Set<string>();

  for (const input of inputs) {
    const path = normalizePath(input.path);
    const lines = input.text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const activeTokens = licenseTokenMatches(line).filter(
        (match) => !isNegated(line, match.index) && !isNonCopyLicenseReason(lines, index),
      );
      for (const token of activeTokens) {
        const disposition = dispositionOf(path, line, index, escapeLines, token);
        if (disposition === 'structural') {
          structuralMatches.add(`${path}:${index + 1}:${token.match}`);
        } else if (disposition === 'violation') {
          violations.push({ line: index + 1, match: token.match, path, rule: token.rule });
        }
      }

      for (const match of line.matchAll(combinedMarkerPattern())) {
        const rule = MARKER_PHRASE_TO_RULE.get(match[0].toLowerCase());
        if (!rule) continue;
        if (isNegated(line, match.index ?? 0)) continue;
        if (isPermittedDerivationObject(line, match, flightPackages)) continue;
        if (!isImplementationDerivationObject(line, match, lines[index - 1] ?? '')) continue;
        const disposition = dispositionOf(path, line, index, escapeLines, {
          index: match.index ?? 0,
          match: match[0],
          rule: rule.name,
        });
        if (disposition === 'structural') {
          structuralMatches.add(`${path}:${index + 1}:${match[0]}`);
        } else if (disposition === 'violation') {
          violations.push({ line: index + 1, match: match[0], path, rule: rule.name });
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
    matcherState:
      'semantic negatives, independent convention comparisons, and verification protected; implementation derivations token-independent',
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
  finding: Readonly<LicenseTokenMatch>,
): 'escape' | 'structural' | 'violation' {
  if (path === 'LICENSE.md') return 'structural';
  if (isPackageManifest(path) && MANIFEST_LICENSE_LINE.test(line)) return 'structural';
  for (const [index, escape] of NAMED_ESCAPES.entries()) {
    if (!escape.match({ ...finding, line, path })) continue;
    escapeLines[index]?.add(`${path}:${lineIndex + 1}`);
    return 'escape';
  }
  return 'violation';
}

function isProjectPolicyToken(context: Readonly<LicenseProvenanceEscapeContext>): boolean {
  if (context.path !== 'AGENTS.md' || context.rule !== 'license-identifier') return false;
  const declaration = context.line.match(/^Flight\s+is\s+([A-Za-z0-9-]+)/);
  if (declaration?.[1] !== context.match || context.line.indexOf(context.match) !== context.index) return false;
  return (
    /\bcopyright\b/i.test(context.line) &&
    PROJECT_POLICY_OBLIGATION_PATTERN.test(context.line) &&
    /\bthird-party material\b/i.test(context.line)
  );
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

function isImplementationDerivationObject(line: string, match: RegExpMatchArray, previousLine: string): boolean {
  const matchIndex = match.index ?? 0;
  const prefix = line.slice(0, matchIndex);
  const boundaries = [...prefix.matchAll(/[;!?—]|\.(?=\s|$)/g)];
  const clauseStart = boundaries.at(-1)?.index ?? -1;
  const clauseTail = line.slice(matchIndex + match[0].length);
  const relativeEnd = clauseTail.search(/[;!?—]|\.(?=\s|$)/);
  const clauseEnd = relativeEnd < 0 ? line.length : matchIndex + match[0].length + relativeEnd;
  const object = line.slice(matchIndex + match[0].length, clauseEnd);
  const objectHead = object.split(/,\s*(?:but|not|rather)\b|\b(?:but|not|rather)\b/i, 1)[0] ?? object;
  const claimPrefix = line.slice(clauseStart + 1, matchIndex);

  if (isIndependentConventionComparison(previousLine, line, match)) return false;

  // Format/interface provenance is allowed even when it names a project. An implementation noun in
  // the same clause makes the opposite claim: the sentence says it took from executable code.
  if (/\bimplementation(?:\s+[A-Za-z]+){0,3}\s*$/i.test(claimPrefix)) return true;
  if (IMPLEMENTATION_CONTEXT_PATTERN.test(objectHead)) return true;
  if (ANALOGY_OBJECT_PATTERN.test(objectHead)) return false;

  let implementationIndex = EXTERNAL_OBJECT_PATTERN.exec(object)?.index ?? Number.POSITIVE_INFINITY;
  implementationIndex = Math.min(implementationIndex, externalRepositoryPathIndex(object));
  const artifactIndex = IMPLEMENTATION_ARTIFACT_PATTERN.exec(object)?.index ?? Number.POSITIVE_INFINITY;
  if (
    artifactIndex < Number.POSITIVE_INFINITY &&
    (THIRD_PERSON_IMPLEMENTATION_PATTERN.test(object) || BRAND_IMPLEMENTATION_PATTERN.test(object))
  ) {
    implementationIndex = Math.min(implementationIndex, artifactIndex);
  }
  const formatIndex = FORMAT_OBJECT_PATTERN.exec(objectHead)?.index ?? Number.POSITIVE_INFINITY;
  return implementationIndex < formatIndex;
}

function isIndependentConventionComparison(
  previousLine: string,
  line: string,
  match: Readonly<RegExpMatchArray>,
): boolean {
  if (!/^mirrors$/i.test(match[0])) return false;
  const prefix = `${previousLine} ${line.slice(0, match.index ?? 0)}`;
  return INDEPENDENT_STANDARD_MODEL_PATTERN.test(prefix) || FLIGHT_PRIMARY_ANALOGUE_PATTERN.test(prefix);
}

function isNonCopyLicenseReason(lines: readonly string[], index: number): boolean {
  const context = lines.slice(Math.max(0, index - 2), index + 2).join(' ');
  return NON_COPY_CLAIM_PATTERN.test(context) && LICENSE_NON_COPY_REASON_PATTERN.test(context);
}

function externalRepositoryPathIndex(object: string): number {
  const match = object.match(/`([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)`/);
  if (match?.[1] === undefined) return Number.POSITIVE_INFINITY;
  return /^(?:@flighthq|agents|crates|functional|packages|scripts|tools)\//.test(match[1])
    ? Number.POSITIVE_INFINITY
    : (match.index ?? Number.POSITIVE_INFINITY);
}

function isPackageManifest(path: string): boolean {
  return path === 'package.json' || path.endsWith('/package.json');
}

function marker(name: string, ...phrase: string[]): MarkerRule {
  return { name, phrase: words(...phrase) };
}

function combinedMarkerPattern(): RegExp {
  return new RegExp(MARKER_PATTERN.source, MARKER_PATTERN.flags);
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

const ANALOGY_OBJECT_PATTERN =
  /\b(?:contract|convention|data model|design|model|naming|parameters?|pattern|principle|rules?|shape)\b/i;
const FLIGHT_PRIMARY_ANALOGUE_PATTERN = /\banalogue of\b.{0,160}@flighthq\/[a-z0-9-]+(?:['’]s)?\b/i;
const FORMAT_OBJECT_PATTERN =
  /\b(?:algorithm|equation|facts?|format(?: description)?|identity|inputs?|matrix|protocol|ramp|schema|semantics|spec(?:ification)?|standard|test data|these|UAX|RFC|ISO|IEC|ECMA|CSS)\b/i;
const INDEPENDENT_STANDARD_MODEL_PATTERN =
  /\b(?:exactly|same as)\s+(?:the\s+)?[A-Za-z][A-Za-z0-9_.-]*(?:['’]s)?\s+(?:contract|convention|data model|design|format|model|pattern|protocol|schema|specification|standard)\b.{0,240}\band\s*$/i;
const IMPLEMENTATION_CONTEXT_PATTERN =
  /\b(?:codebase|external code|external implementation|implementation|repository|source code|source file|third-party code|upstream)\b/i;
const IMPLEMENTATION_ROLE_PATTERN =
  /\b[A-Za-z_$][A-Za-z0-9_$]*(?:Adapter|Animator|Builder|Compiler|Controller|Decoder|Encoder|Factory|Interpreter|Loader|Manager|Module|Parser|Plugin|Reader|Renderer|Runtime|Writer)\b/;
const IMPLEMENTATION_CALL_PATTERN = /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\s*\(/;
const IMPLEMENTATION_FILE_PATTERN = /\b[A-Za-z0-9_$./-]+\.(?:c|cc|cpp|cxx|h|hh|hpp|js|jsx|mjs|rs|ts|tsx)\b/i;
const IMPLEMENTATION_MEMBER_PATTERN = /\b[A-Z][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*\b/;
const LICENSE_NON_COPY_REASON_PATTERN =
  /\bbecause\b.{0,120}\blicen[cs]es?\b.{0,120}(?:(?:make|made|render)\b.{0,80}\bcopy(?:ing)?\b.{0,80}\b(?:problem|prohibited|forbidden|incompatible)\b|\b(?:forbid|prevent|prohibit)\w*\b.{0,80}\bcopy(?:ing)?\b)/i;
const NON_COPY_CLAIM_PATTERN =
  /\b(?:no|not|never|without)\b[^.!?;—]{0,160}\b(?:code|implementation|naming|structure)\b[^.!?;—]{0,160}\b(?:copied|taken|used|adapted|ported|transcribed|translated)\b/i;
const PROJECT_POLICY_OBLIGATION_PATTERN = new RegExp(
  `\\bNo work may attach an ${escapeRegExp(words('attribution', 'obligation'))}\\b`,
  'i',
);
const IMPLEMENTATION_ARTIFACT_PATTERN = new RegExp(
  `(?:${IMPLEMENTATION_ROLE_PATTERN.source}|${IMPLEMENTATION_CALL_PATTERN.source}|${IMPLEMENTATION_FILE_PATTERN.source}|${IMPLEMENTATION_MEMBER_PATTERN.source})`,
);
const EXTERNAL_OBJECT_PATTERN = /\bExternal[A-Z][A-Za-z0-9]*\b|https?:\/\/|<(?:file|path|url)>/i;
const IMPLEMENTATION_ARTIFACT_SOURCE = `\`?(?:${IMPLEMENTATION_ROLE_PATTERN.source}|${IMPLEMENTATION_CALL_PATTERN.source}|${IMPLEMENTATION_FILE_PATTERN.source}|${IMPLEMENTATION_MEMBER_PATTERN.source})`;
const THIRD_PERSON_IMPLEMENTATION_PATTERN = new RegExp(`\\btheir\\b[^{.!?;—}]*${IMPLEMENTATION_ARTIFACT_SOURCE}`, 'i');
const BRAND_IMPLEMENTATION_PATTERN = new RegExp(
  `^\\s+(?:(?:a|an|the)\\s+)?[A-Z][A-Za-z0-9]*(?:['’]s)?[^.!?;—]{0,120}${IMPLEMENTATION_ARTIFACT_SOURCE}`,
);

function main(): void {
  const report = checkLicenseProvenance(getTrackedTextInputs(root));
  console.log(formatLicenseProvenanceReport(report));
  if (report.violations.length > 0) process.exitCode = 1;
}

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
