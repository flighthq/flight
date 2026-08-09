// Reports import diagnostics whose `origin` names a function other than the one that emitted them.
//
// WHY A CHECK RATHER THAN A REVIEW NOTE. `reportImportDiagnostic` states that `origin` is "the
// emitting function's own name (the true origin, not a wrapper)", and `formatImportDiagnostic` prints
// it, so a wrong value sends a reader chasing a loss to a function that never produced it. The value
// is a plain string sitting in the argument list beside the branch logic a reviewer is actually
// reading, which is a good explanation for why it survives careful review: nothing about a wrong name
// looks wrong. It is, however, trivially checkable, because the correct answer is written at the top
// of the enclosing function.
//
// WHAT IT CANNOT SEE, stated so a zero is not read as proof of correctness:
//   - an origin passed as a variable (a wrapper relaying its caller's name) is SKIPPED, not judged —
//     that is the shape the contract asks for, and its correctness lives at the call site;
//   - a call whose fourth argument is not a plain string literal is skipped;
//   - a function nested inside another is attributed to the outer one, since the enclosing name is
//     tracked by declaration order rather than by parsing scope.
// It reports and never gates: several packages carry pre-existing mismatches, and correcting another
// package's diagnostics is that package's call, not this script's.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ImportDiagnosticOriginMismatch {
  emittedIn: string;
  file: string;
  origin: string;
}

export interface ImportDiagnosticOriginReport {
  checked: number;
  mismatches: readonly ImportDiagnosticOriginMismatch[];
  relayed: number;
}

/**
 * Finds `reportImportDiagnostic` calls whose literal origin disagrees with the enclosing function.
 *
 * `relayed` counts calls whose origin is not a literal — a wrapper passing its caller's name. Those
 * are the contract's preferred shape rather than a gap, and they are reported beside the mismatches
 * so a low mismatch count cannot be mistaken for wide coverage.
 */
export function findImportDiagnosticOriginMismatches(file: string, source: string): ImportDiagnosticOriginReport {
  const mismatches: ImportDiagnosticOriginMismatch[] = [];
  let checked = 0;
  let relayed = 0;
  let enclosing = '';
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const declaration = /^(?:export )?(?:async )?function ([A-Za-z0-9_]+)/.exec(lines[index]!);
    if (declaration !== null) enclosing = declaration[1]!;
    if (!lines[index]!.includes('reportImportDiagnostic(')) continue;
    // The call may wrap over several lines; join enough of them to reach the fourth argument.
    const call = lines.slice(index, index + 8).join(' ');
    const opened = call.indexOf('reportImportDiagnostic(');
    const args = splitCallArguments(call.slice(opened + 'reportImportDiagnostic('.length));
    if (args === null || args.length < 4) continue;
    const origin = /^'([^']*)'$/.exec(args[3]!.trim());
    if (origin === null) {
      relayed++;
      continue;
    }
    checked++;
    // A helper whose callers all sit inside the named function is reporting the TRUE origin, which is
    // exactly what "not a wrapper" asks for — so a literal that names a caller of the emitter is
    // correct, not a mismatch. Only a name with no calling relationship to the emitter is wrong.
    if (origin[1] !== enclosing && !callsFunction(source, origin[1]!, enclosing)) {
      mismatches.push({ emittedIn: enclosing, file, origin: origin[1]! });
    }
  }
  return { checked, mismatches, relayed };
}

/** Whether `caller`'s body, as declared in this source, contains a call to `callee`. */
function callsFunction(source: string, caller: string, callee: string): boolean {
  if (callee === '') return true;
  const lines = source.split('\n');
  let inside = false;
  for (const line of lines) {
    const declaration = /^(?:export )?(?:async )?function ([A-Za-z0-9_]+)/.exec(line);
    if (declaration !== null) inside = declaration[1] === caller;
    if (inside && new RegExp(`\\b${callee}\\(`).test(line)) return true;
  }
  return false;
}

/** Splits a call's argument list at top-level commas, or null when the closing paren is not reached. */
function splitCallArguments(text: string): string[] | null {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (quote !== null) {
      if (character === quote && text[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth++;
    else if (character === ')' && depth === 0) {
      args.push(text.slice(start, index));
      return args;
    } else if (character === ')' || character === ']' || character === '}') depth--;
    else if (character === ',' && depth === 0) {
      args.push(text.slice(start, index));
      start = index + 1;
    }
  }
  return null;
}

/** Formats the report, printing the checked total beside the findings. */
export function formatImportDiagnosticOriginReport(reports: ReadonlyMap<string, ImportDiagnosticOriginReport>): string {
  const lines: string[] = [];
  let checked = 0;
  let relayed = 0;
  let wrong = 0;
  for (const name of [...reports.keys()].sort()) {
    const report = reports.get(name)!;
    checked += report.checked;
    relayed += report.relayed;
    wrong += report.mismatches.length;
    if (report.mismatches.length === 0) continue;
    lines.push(`  ${name}: ${report.mismatches.length} of ${report.checked}`);
    for (const mismatch of report.mismatches) {
      lines.push(`    ${mismatch.file}: origin ${mismatch.origin} emitted in ${mismatch.emittedIn}`);
    }
  }
  return [
    `${wrong} of ${checked} literal origins name a function that did not emit them`,
    ...lines,
    `${relayed} origin(s) are relayed through a parameter and are judged at their call site, not here`,
  ].join('\n');
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  const packages = join(resolve(dirname(SCRIPT_PATH), '..'), 'packages');
  const reports = new Map<string, ImportDiagnosticOriginReport>();
  for (const entry of readdirSync(packages).sort()) {
    const directory = join(packages, entry, 'src');
    if (!existsSync(directory)) continue;
    let checked = 0;
    let relayed = 0;
    const mismatches: ImportDiagnosticOriginMismatch[] = [];
    for (const file of readdirSync(directory).sort()) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      const report = findImportDiagnosticOriginMismatches(file, readFileSync(join(directory, file), 'utf8'));
      checked += report.checked;
      relayed += report.relayed;
      mismatches.push(...report.mismatches);
    }
    if (checked > 0 || relayed > 0) reports.set(entry, { checked, mismatches, relayed });
  }
  process.stdout.write(`${formatImportDiagnosticOriginReport(reports)}\n`);
}
