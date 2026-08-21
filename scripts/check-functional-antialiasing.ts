// Ratcheted functional-scene AA policy gate and effective-configuration census.
//
// Hard today: a new source module must declare exactly one literal policy, the committed missing set
// may only shrink deliberately, and backend-specific siblings must agree. Report-only today: whether
// each cell's effective backend configuration matches that policy. The latter becomes a hard failure
// only after WebGPU has a real AA path; until then, reporting every mismatch is the requested answer,
// not a suppressed red.
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import ts from 'typescript';

import { discoverEntries } from '../packages/tool-capture/src/captureEntries';
import { functionalScene3DFile } from '../packages/tool-capture/src/functionalScene3Ds';

const scriptPath = fileURLToPath(import.meta.url);
const POLICY_CALL = 'declareAntialiasingPolicy';
const POLICIES = new Set(['aa', 'no-aa']);

export interface FunctionalAntialiasingCellAnalysis {
  declared: 'aa' | 'no-aa' | null;
  effective: 'aa' | 'no-aa' | 'unknown';
  entry: string;
  matches: boolean | null;
  reason: string;
  renderer: string;
  source: string;
}

export interface FunctionalAntialiasingFamilyMismatch {
  left: { file: string; policy: 'aa' | 'no-aa' };
  right: { file: string; policy: 'aa' | 'no-aa' };
  scene: string;
}

export interface FunctionalAntialiasingReport {
  cells: FunctionalAntialiasingCellAnalysis[];
  familyMismatches: FunctionalAntialiasingFamilyMismatch[];
  modules: number;
  ratchetedMissing: string[];
  staleRatchet: string[];
  unexpectedMissing: Array<{ file: string; problem: string }>;
  validDeclarations: number;
}

interface SourceAnalysis {
  backend: string | null;
  file: string;
  policy: 'aa' | 'no-aa' | null;
  problem: string;
  scene: string;
  source: string;
}

export function analyzeFunctionalAntialiasing(
  root: string,
  ratchetedMissing: readonly string[],
): FunctionalAntialiasingReport {
  const scenesDirectory = join(root, 'functional', 'scenes');
  const sources = readSources(scenesDirectory);
  const sourceByFile = new Map(sources.map((source) => [source.file, source]));
  const missing = sources.filter((source) => source.policy === null);
  const missingFiles = new Set(missing.map((source) => source.file));
  const ratchet = new Set(ratchetedMissing);
  const unexpectedMissing = missing
    .filter((source) => !ratchet.has(source.file))
    .map((source) => ({ file: source.file, problem: source.problem }));
  const staleRatchet = [...ratchet].filter((file) => !missingFiles.has(file)).sort();

  const families = new Map<string, SourceAnalysis[]>();
  for (const source of sources) {
    const family = families.get(source.scene) ?? [];
    family.push(source);
    families.set(source.scene, family);
  }
  const familyMismatches: FunctionalAntialiasingFamilyMismatch[] = [];
  for (const [scene, family] of families) {
    const declared = family.filter(
      (source): source is SourceAnalysis & { policy: 'aa' | 'no-aa' } => source.policy !== null,
    );
    for (let leftIndex = 0; leftIndex < declared.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < declared.length; rightIndex++) {
        const left = declared[leftIndex]!;
        const right = declared[rightIndex]!;
        if (left.policy === right.policy) continue;
        familyMismatches.push({
          left: { file: left.file, policy: left.policy },
          right: { file: right.file, policy: right.policy },
          scene,
        });
      }
    }
  }

  const cells: FunctionalAntialiasingCellAnalysis[] = [];
  for (const entry of discoverEntries('functional', root)) {
    for (const renderer of entry.renderers) {
      const path = functionalScene3DFile(scenesDirectory, entry.name, renderer);
      const file = basename(path);
      const source = sourceByFile.get(file);
      if (source === undefined) {
        cells.push({
          declared: null,
          effective: 'unknown',
          entry: entry.name,
          matches: null,
          reason: `resolved source ${file} was not discovered`,
          renderer,
          source: file,
        });
        continue;
      }
      const effective = getEffectivePolicy(renderer, source);
      cells.push({
        declared: source.policy,
        effective: effective.policy,
        entry: entry.name,
        matches: source.policy === null || effective.policy === 'unknown' ? null : source.policy === effective.policy,
        reason: effective.reason,
        renderer,
        source: file,
      });
    }
  }

  return {
    cells,
    familyMismatches,
    modules: sources.length,
    ratchetedMissing: missing.filter((source) => ratchet.has(source.file)).map((source) => source.file),
    staleRatchet,
    unexpectedMissing,
    validDeclarations: sources.length - missing.length,
  };
}

export function formatFunctionalAntialiasingReport(report: Readonly<FunctionalAntialiasingReport>): string {
  const lines = [
    `Functional AA policy: ${report.validDeclarations}/${report.modules} source module(s) declare aa or no-aa; ` +
      `${report.ratchetedMissing.length} ratcheted legacy omission(s).`,
  ];

  if (report.unexpectedMissing.length > 0) {
    lines.push('', pc.red(`${report.unexpectedMissing.length} unratcheted source module(s) lack a valid declaration:`));
    for (const missing of report.unexpectedMissing) {
      lines.push(`  ${pc.red('✗')} ${missing.file} — ${missing.problem}`);
    }
  }
  if (report.staleRatchet.length > 0) {
    lines.push(
      '',
      pc.red(`${report.staleRatchet.length} stale ratchet entr${report.staleRatchet.length === 1 ? 'y' : 'ies'}:`),
    );
    for (const file of report.staleRatchet) {
      lines.push(`  ${pc.red('✗')} ${file} — no longer missing; remove it from the committed ratchet`);
    }
  }
  if (report.familyMismatches.length > 0) {
    lines.push('', pc.red(`${report.familyMismatches.length} sibling policy disagreement(s):`));
    for (const mismatch of report.familyMismatches) {
      lines.push(
        `  ${pc.red('✗')} ${mismatch.scene}: ${mismatch.left.file} declares ${mismatch.left.policy}; ` +
          `${mismatch.right.file} declares ${mismatch.right.policy}`,
      );
    }
  }

  const compared = report.cells.filter((cell) => cell.matches !== null);
  const matched = compared.filter((cell) => cell.matches === true);
  const mismatched = compared.filter((cell) => cell.matches === false);
  const pending = report.cells.filter((cell) => cell.declared === null);
  const unknown = report.cells.filter((cell) => cell.declared !== null && cell.effective === 'unknown');
  lines.push(
    '',
    'Effective-AA comparison (REPORT ONLY until WebGPU has an AA path):',
    '  This per-cell census is the answer to the requirement that each test explicitly name aa or no-aa;',
    '  mismatches are reported rather than suppressed, but do not set the process exit code yet.',
    `  ${report.cells.length} cell(s): ${matched.length} match, ${mismatched.length} mismatch, ` +
      `${pending.length} awaiting declaration, ${unknown.length} unknown effective configuration.`,
  );
  for (const cell of mismatched) {
    lines.push(
      `  ${pc.yellow('≠')} ${cell.entry}/${cell.renderer} — ${cell.source} declares ${cell.declared}; ` +
        `effective ${cell.effective} (${cell.reason})`,
    );
  }
  for (const cell of unknown) {
    lines.push(
      `  ${pc.yellow('?')} ${cell.entry}/${cell.renderer} — ${cell.source} declares ${cell.declared}; ` +
        `effective policy unknown (${cell.reason})`,
    );
  }

  if (getFunctionalAntialiasingExitCode(report) === 0) {
    lines.push('', pc.green('✓ declaration ratchet and sibling agreement pass'));
  }
  return lines.join('\n');
}

export function getFunctionalAntialiasingExitCode(report: Readonly<FunctionalAntialiasingReport>): 0 | 1 {
  return report.unexpectedMissing.length === 0 &&
    report.staleRatchet.length === 0 &&
    report.familyMismatches.length === 0
    ? 0
    : 1;
}

export function readFunctionalAntialiasingRatchet(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).size < 16) throw new Error(`${path} is too small to be a valid AA-policy ratchet`);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { missing?: unknown };
  if (!Array.isArray(parsed.missing) || !parsed.missing.every((value) => typeof value === 'string')) {
    throw new Error(`${path} must contain a string-array 'missing' field`);
  }
  return [...new Set(parsed.missing)].sort();
}

function analyzeSource(file: string, source: string): SourceAnalysis {
  const parsedName = parseSourceFileName(file);
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: ts.CallExpression[] = [];
  let nestedCall = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === POLICY_CALL) {
      calls.push(node);
      if (!ts.isExpressionStatement(node.parent) || node.parent.parent !== sourceFile) nestedCall = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let policy: 'aa' | 'no-aa' | null = null;
  let problem = `missing top-level ${POLICY_CALL}('aa' | 'no-aa')`;
  if (calls.length > 1) {
    problem = `${calls.length} ${POLICY_CALL} calls; expected exactly one`;
  } else if (calls.length === 1 && nestedCall) {
    problem = `${POLICY_CALL} must be a top-level statement`;
  } else if (calls.length === 1) {
    const argument = calls[0]!.arguments[0];
    if (argument === undefined || !ts.isStringLiteral(argument) || !POLICIES.has(argument.text)) {
      problem = `${POLICY_CALL} needs the literal 'aa' or 'no-aa'`;
    } else {
      policy = argument.text as 'aa' | 'no-aa';
      problem = '';
    }
  }
  return { ...parsedName, file, policy, problem, source };
}

function findNamedProperties(node: ts.Node, name: string, values: ts.Expression[]): void {
  if (
    ts.isPropertyAssignment(node) &&
    ((ts.isIdentifier(node.name) && node.name.text === name) ||
      (ts.isStringLiteral(node.name) && node.name.text === name))
  ) {
    values.push(node.initializer);
  }
  ts.forEachChild(node, (child) => findNamedProperties(child, name, values));
}

function getCallName(call: ts.CallExpression): string | null {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

function getEffectivePolicy(
  renderer: string,
  source: Readonly<SourceAnalysis>,
): { policy: 'aa' | 'no-aa' | 'unknown'; reason: string } {
  if (renderer === 'canvas') return { policy: 'aa', reason: 'Canvas 2D antialiases inherently' };
  if (renderer === 'dom') return { policy: 'aa', reason: 'DOM rasterization antialiases inherently' };
  if (renderer === 'webgpu') {
    // ★ THIS ANSWER NOW DEPENDS ON THE SOURCE, and saying otherwise was a stale fact reported as a
    // measurement. WebGPU normalised effect-target sampleCount above 1 down to 1 until `7260ece8b`, which
    // made it allocate a 2x-per-axis supersampled target instead. A census that keeps reciting the old
    // behaviour reports `no-aa` for every WebGPU cell including the ones that now genuinely antialias —
    // and it reports it in the column a reader consults precisely to find that kind of drift.
    const samples = readMaxEffectTargetSampleCount(source, 'createWgpuRenderEffectPipeline');
    if (samples === null)
      return { policy: 'unknown', reason: 'WebGPU effect-target sampleCount is not a static number' };
    return samples > 1
      ? { policy: 'aa', reason: `WebGPU supersamples a sampleCount ${samples} effect target 2x per axis` }
      : { policy: 'no-aa', reason: 'WebGPU does not antialias unless an effect target requests sampleCount > 1' };
  }
  if (renderer !== 'webgl') return { policy: 'unknown', reason: `unrecognized backend ${renderer}` };

  // Backend-agnostic sources use createFunctionalTarget, whose GL factory inherits the render-gl
  // context default (antialias:true). This is an applied default, not a textual guess.
  if (source.backend === null) {
    return { policy: 'aa', reason: 'functional WebGL harness applies the antialias:true context default' };
  }

  const sourceFile = ts.createSourceFile(source.file, source.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const antialiasValues: ts.Expression[] = [];
  const sampleCountValues: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callName = getCallName(node);
      if (callName === 'createGlRenderState' || callName === 'createGlApplicationRenderView') {
        for (const argument of node.arguments) findNamedProperties(argument, 'antialias', antialiasValues);
      }
      if (
        callName === 'createGlRenderEffectPipeline' ||
        callName === 'createGlRenderTarget' ||
        callName === 'createGlApplicationRenderView'
      ) {
        for (const argument of node.arguments) findNamedProperties(argument, 'sampleCount', sampleCountValues);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let contextAntialias = true;
  for (const value of antialiasValues) {
    if (value.kind === ts.SyntaxKind.FalseKeyword) contextAntialias = false;
    else if (value.kind !== ts.SyntaxKind.TrueKeyword) {
      return { policy: 'unknown', reason: 'WebGL context antialias setting is not a static boolean' };
    }
  }
  if (contextAntialias) return { policy: 'aa', reason: 'WebGL context effective antialias is true' };

  let maxSampleCount = 1;
  for (const value of sampleCountValues) {
    if (!ts.isNumericLiteral(value)) {
      return { policy: 'unknown', reason: 'WebGL final-target sampleCount is not a static number' };
    }
    maxSampleCount = Math.max(maxSampleCount, Number(value.text));
  }
  if (maxSampleCount > 1) {
    return {
      policy: 'aa',
      reason: `WebGL context AA is off but the final effect/render target resolves sampleCount ${maxSampleCount}`,
    };
  }
  return { policy: 'no-aa', reason: 'WebGL context AA is off and the final target is single-sampled' };
}

function readMaxEffectTargetSampleCount(
  source: Readonly<SourceAnalysis>,
  ...callNames: readonly string[]
): number | null {
  const sourceFile = ts.createSourceFile(source.file, source.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && callNames.includes(getCallName(node) ?? '')) {
      for (const argument of node.arguments) findNamedProperties(argument, 'sampleCount', values);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  let max = 1;
  for (const value of values) {
    if (!ts.isNumericLiteral(value)) return null;
    max = Math.max(max, Number(value.text));
  }
  return max;
}

function parseSourceFileName(file: string): { backend: string | null; scene: string } {
  const stem = file.replace(/\.ts$/, '');
  const match = /^(.*)\.(canvas|dom|webgl|webgpu)$/.exec(stem);
  return match === null ? { backend: null, scene: stem } : { backend: match[2]!, scene: match[1]! };
}

function readSources(scenesDirectory: string): SourceAnalysis[] {
  return readdirSync(scenesDirectory)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .sort()
    .map((file) => analyzeSource(file, readFileSync(join(scenesDirectory, file), 'utf8')));
}

function updateRatchet(path: string, missing: readonly string[]): void {
  const serialized = `${JSON.stringify({ missing: [...missing].sort() }, null, 2)}\n`;
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, serialized);
  if (statSync(temporary).size < 16) throw new Error(`refusing to trust undersized ratchet write at ${temporary}`);
  JSON.parse(readFileSync(temporary, 'utf8'));
  renameSync(temporary, path);
}

function main(): void {
  const root = resolve(dirname(scriptPath), '..');
  const ratchetPath = join(root, 'scripts', 'functional-antialiasing-ratchet.json');
  const existingRatchet = readFunctionalAntialiasingRatchet(ratchetPath);
  const report = analyzeFunctionalAntialiasing(root, existingRatchet);
  if (process.argv.includes('--update-ratchet')) {
    const missing = [...report.ratchetedMissing, ...report.unexpectedMissing.map(({ file }) => file)];
    updateRatchet(ratchetPath, missing);
    console.log(`Updated ${ratchetPath} with ${missing.length} missing source module(s).`);
    return;
  }
  console.log(formatFunctionalAntialiasingReport(report));
  if (process.argv.includes('--check')) process.exitCode = getFunctionalAntialiasingExitCode(report);
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
