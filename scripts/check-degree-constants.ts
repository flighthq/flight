// Guards the one conversion constant. `DEG_TO_RAD` and `RAD_TO_DEG` live in `@flighthq/math` and
// nowhere else, and this check exists because they had lived in fifteen other places at once.
//
// ★ WHY A PRIVATE COPY IS NOT HARMLESS. Every copy retired by this rule was spelled `Math.PI / 180` or
// `180 / Math.PI`, bit-identical to the shared export, so removing them changed no output. The danger is
// the NEXT copy: `(x * Math.PI) / 180` and `x * DEG_TO_RAD` are NOT the same number. Multiply-first and
// divide-first disagree by about 1 ULP on roughly 29 per cent of values — 588,798 of 2,000,000 sampled —
// which is enough to move a rasterization decision and stale a committed fingerprint with no error
// anywhere. One constant means that question gets asked once.
//
// ★ THE CHECK IS NARROW AND SAYS SO. It matches a local BINDING whose initializer is a degree/radian
// ratio. It does not see an inline `x * Math.PI / 180` at a call site, and its silence is not evidence
// that none exists — that population is counted separately and is not what this guards. Test files
// are out of scope for a different reason, given at the skip itself.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DegreeConstantViolation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Every local degree/radian constant defined outside `@flighthq/math`.
 *
 * `sources` maps a repository-relative path to its text, so the scan is a pure function of what it was
 * handed and the caller owns which files that is.
 */
export function findDegreeConstantRedefinitions(
  sources: ReadonlyMap<string, string>,
): readonly DegreeConstantViolation[] {
  const violations: DegreeConstantViolation[] = [];
  for (const path of [...sources.keys()].sort()) {
    if (path.startsWith('packages/math/')) continue;
    // ★ TESTS ARE EXEMPT ON PURPOSE, and this is a scope decision rather than a loophole. A test that
    // imports the same constant as the code it checks is comparing the code against itself; spelling
    // the ratio out locally is what makes it an independent oracle. Two such copies exist today —
    // transform2d.test.ts and nodeTransform2d.test.ts — and both are correct as written.
    if (path.endsWith('.test.ts')) continue;
    const lines = sources.get(path)!.split('\n');
    for (let index = 0; index < lines.length; index++) {
      const text = lines[index]!;
      if (BINDING.test(text)) violations.push({ file: path, line: index + 1, text: text.trim() });
    }
  }
  return violations;
}

/**
 * Formats the report.
 *
 * The scanned count sits beside the verdict so an empty result cannot be read as an all-clear from a
 * scan that had nothing to look at — zero violations over zero files is a different fact from zero over
 * two thousand.
 */
export function formatDegreeConstantReport(violations: readonly DegreeConstantViolation[], scanned: number): string {
  if (violations.length === 0) {
    return `OK One degree/radian constant (${scanned} TypeScript files scanned, 0 local redefinitions)`;
  }
  return [
    `✗ ${violations.length} local degree/radian constant(s) outside @flighthq/math (${scanned} files scanned):`,
    ...violations.map((violation) => `  - ${violation.file}:${violation.line} — ${violation.text}`),
    '  Import DEG_TO_RAD / RAD_TO_DEG from @flighthq/math instead.',
  ].join('\n');
}

/** Reads every tracked `.ts` file, keyed by repository-relative path. */
export function readTrackedTypeScriptSources(root: string): Map<string, string> {
  const listing = execFileSync('git', ['ls-files', '-z', '--', '*.ts'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const sources = new Map<string, string>();
  for (const path of listing.split('\0')) {
    if (path === '' || path.endsWith('.d.ts')) continue;
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    sources.set(path, readFileSync(absolutePath, 'utf8'));
  }
  return sources;
}

const BINDING = /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:Math\.PI\s*\/\s*180|180\s*\/\s*Math\.PI)\s*;/;

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sources = readTrackedTypeScriptSources(root);
  const violations = findDegreeConstantRedefinitions(sources);
  console.log(formatDegreeConstantReport(violations, sources.size));
  if (violations.length > 0) process.exitCode = 1;
}
