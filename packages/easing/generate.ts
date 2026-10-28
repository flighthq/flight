import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageRoot, '../..');
const sourceRoot = join(packageRoot, 'src');
const tsx = join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const formatter = join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt');

execFileSync(
  tsx,
  [join(repositoryRoot, 'scripts', 'generate-rust-package.ts'), '--crate', 'flight-easing', '--package', 'easing'],
  { cwd: repositoryRoot, stdio: 'inherit' },
);

normalizeFile('easingTypes.ts', (source) =>
  replaceRequired(
    replaceRequired(
      source,
      'export type EasingFunction = (arg0: number) => number;',
      'export type EasingFunction = (t: number) => number;',
    ),
    'export type ScalarRemap = (arg0: number) => number;',
    'export type ScalarRemap = (x: number) => number;',
  ),
);

normalizeFile('easePiecewise.ts', (source) =>
  replaceRequired(
    replaceRequired(source, '  ease: EasingFunction;', '  readonly ease: EasingFunction;'),
    '  weight: number | undefined;',
    '  readonly weight?: number;',
  ),
);

normalizeFile('easeSteps.ts', (source) => {
  source = replaceRequired(
    source,
    /export enum StepPosition \{\s+JumpStart = ['"]jumpStart['"],\s+JumpEnd = ['"]jumpEnd['"],\s+JumpNone = ['"]jumpNone['"],\s+JumpBoth = ['"]jumpBoth['"],\s+\}/,
    `export const StepPosition = {
  JumpBoth: 'jumpBoth',
  JumpEnd: 'jumpEnd',
  JumpNone: 'jumpNone',
  JumpStart: 'jumpStart',
} as const;

export type StepPosition = (typeof StepPosition)[keyof typeof StepPosition];`,
  );
  source = replaceRequired(
    source,
    'export type EasingStepsGuard = (arg0: number, arg1: StepPosition) => void;',
    'export type EasingStepsGuard = (count: number, position: StepPosition) => void;',
  );
  source = replaceRequired(
    source,
    'const STEPS_GUARD: { value: EasingStepsGuard | undefined } = { value: undefined };',
    'const STEPS_GUARD: { value: EasingStepsGuard | null } = { value: null };',
  );
  source = replaceRequired(
    source,
    'export function easeSteps(count: number, position?: StepPosition): EasingFunction {\n  position = position ?? StepPosition.JumpEnd;',
    'export function easeSteps(\n  count: number,\n  position: StepPosition = StepPosition.JumpEnd,\n): EasingFunction {',
  );
  source = replaceRequired(source, 'if (guard !== undefined) {', 'if (guard !== null) {');
  source = replaceRequired(source, 'Pass `undefined` to uninstall the guard.', 'Pass `null` to uninstall the guard.');
  return replaceRequired(
    source,
    'export function setEasingStepsGuard(guard?: EasingStepsGuard): void {',
    'export function setEasingStepsGuard(guard: EasingStepsGuard | null): void {',
  );
});

normalizeCallbackType('getEasingDerivative.ts', 'getEasingDerivative(ease: (arg0: number) => number');
normalizeCallbackType('writeEasingSamples.ts', 'writeEasingSamples(out: Float32Array, ease: (arg0: number) => number');

normalizeFile('easePiecewise.test.ts', (source) => source.replace(/^\s*EasingSegment,\r?\n/m, ''));

normalizeFile('writeEasingSamples.test.ts', (source) => {
  source = source.replaceAll('new Array(', 'new Float32Array(');
  source = replaceRequired(source, 'let result = [99.0];', 'let result = new Float32Array([99.0]);');
  source = replaceRequired(source, 'let out = [-7.0];', 'let out = new Float32Array([-7.0]);');
  source = replaceRequired(source, 'let out = [];', 'let out = new Float32Array();');
  source = replaceRequired(
    source,
    'expect(calls.value).toEqual([0.0, 0.5, 1.0, 0.0, 1.0]);',
    'expect(calls.value).toEqual(new Float32Array([0.0, 0.5, 1.0, 0.0, 1.0]));',
  );
  source = replaceRequired(
    source,
    'expect(out).toEqual([10.0, 10.5, 11.0]);',
    'expect(out).toEqual(new Float32Array([10.0, 10.5, 11.0]));',
  );
  return replaceRequired(source, 'expect(out).toEqual([0.5]);', 'expect(out).toEqual(new Float32Array([0.5]));');
});

execFileSync(tsx, [join(repositoryRoot, 'scripts', 'order.ts'), '--fix', sourceRoot], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
execFileSync(formatter, ['--write', sourceRoot], { cwd: repositoryRoot, stdio: 'inherit' });

function normalizeCallbackType(fileName: string, generatedSignature: string): void {
  normalizeFile(fileName, (source) => {
    const generatedHeader = '// Rust is authoritative; run `npm run generate` after changing it.\n\n';
    source = replaceRequired(
      source,
      generatedHeader,
      `${generatedHeader}import type { EasingFunction } from './easingTypes.ts';\n\n`,
    );
    return replaceRequired(
      source,
      generatedSignature,
      generatedSignature.replace('(arg0: number) => number', 'EasingFunction'),
    );
  });
}

function normalizeFile(fileName: string, normalize: (source: string) => string): void {
  const path = join(sourceRoot, fileName);
  const source = readFileSync(path, 'utf8');
  const normalized = normalize(source);
  if (normalized === source) throw new Error(`${fileName}: expected Easing-owned normalization was not applied`);
  writeFileSync(path, normalized);
}

function replaceRequired(source: string, generated: string | RegExp, normalized: string): string {
  const result = source.replace(generated, normalized);
  if (result === source) throw new Error(`generated Easing output did not contain ${String(generated)}`);
  return result;
}
