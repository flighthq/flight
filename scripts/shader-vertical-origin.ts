// Reports backend shader pairs that read an absolute vertical coordinate the SAME way, which means
// they read it differently in image space.
//
// THE INVARIANT, AND WHY IT IS CHECKABLE AT ALL. A GL render target is bottom-left origin and a WebGPU
// one is top-left, so for any effect whose output depends on WHERE a fragment sits vertically, exactly
// ONE side of the pair has to invert its row. Two shaders containing the same expression are therefore
// not agreeing — they are the defect. That makes this a source-level check rather than a rendering one:
// no browser, no capture, no GPU, and it catches the case before a pixel is ever compared.
//
// It exists because the pixel-level detectors could not catch this class. The same root cause reaches
// the screen as an inverted gradient, as mirrored bands, as a phase shift, and — where a parameter is
// symmetric — as nothing at all at the value the tests happen to use. Five instances were found in
// this repository and four were invisible to a mirror comparison; the sixth would have been too. The
// source, unlike the output, states the intent directly.
//
// WHAT IT CANNOT SEE, so a zero is not read as proof:
//   - an effect present on only one backend has no pair and is skipped, not judged;
//   - a conversion written some other way than subtracting from one is not recognised;
//   - an effect whose vertical dependence is indirect (through a uniform computed on the CPU, say)
//     leaves no trace in the shader text and is invisible here.
// It REPORTS and never gates: a pair flagged here is a claim about a shader that a person should read.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ShaderVerticalOriginFinding {
  effect: string;
  glConverts: boolean;
  wgpuConverts: boolean;
}

export interface ShaderVerticalOriginReport {
  comparedPairs: number;
  findings: readonly ShaderVerticalOriginFinding[];
  unpairedOrVerticalFree: number;
}

/**
 * Whether a shader source reads an absolute vertical coordinate in a way an origin can change.
 *
 * A bounds test — `uv.y < 0.0 || uv.y > 1.0` — reads the row but is symmetric about the frame, so it
 * means the same thing whichever edge y counts from. Counting it would report three false positives
 * for every real one, since almost every sampling helper guards its reads that way.
 */
export function readsAbsoluteVerticalCoordinate(source: string): boolean {
  const withoutBoundsTests = source.replace(/\b(?:v_texCoord|uv)\.y\s*[<>]=?\s*[0-9.]+/g, '');
  return /v_texCoord\.y|\buv\.y|gl_FragCoord\.y/.test(withoutBoundsTests);
}

/** Whether a shader source inverts a row, i.e. converts between the two vertical origins. */
export function convertsVerticalOrigin(source: string): boolean {
  return /1\.0\s*-\s*(?:v_texCoord\.y|uv\.y)/.test(source);
}

/**
 * Compares each effect's two backend shaders.
 *
 * A pair is reported when BOTH read a vertical coordinate and they agree on whether to convert it —
 * agreement in the source is disagreement on screen. Exactly one of the two must invert.
 */
export function findShaderVerticalOriginMismatches(
  sources: ReadonlyMap<string, Readonly<{ gl: string; wgpu: string }>>,
): ShaderVerticalOriginReport {
  const findings: ShaderVerticalOriginFinding[] = [];
  let comparedPairs = 0;
  let unpairedOrVerticalFree = 0;
  for (const effect of [...sources.keys()].sort()) {
    const { gl, wgpu } = sources.get(effect)!;
    if (!readsAbsoluteVerticalCoordinate(gl) || !readsAbsoluteVerticalCoordinate(wgpu)) {
      unpairedOrVerticalFree++;
      continue;
    }
    comparedPairs++;
    const glConverts = convertsVerticalOrigin(gl);
    const wgpuConverts = convertsVerticalOrigin(wgpu);
    if (glConverts === wgpuConverts) findings.push({ effect, glConverts, wgpuConverts });
  }
  return { comparedPairs, findings, unpairedOrVerticalFree };
}

/** Reads every effect that exists on both backends, keyed by the name they share. */
export function readShaderPairs(glDirectory: string, wgpuDirectory: string): Map<string, { gl: string; wgpu: string }> {
  const pairs = new Map<string, { gl: string; wgpu: string }>();
  if (!existsSync(glDirectory) || !existsSync(wgpuDirectory)) return pairs;
  for (const entry of readdirSync(glDirectory).sort()) {
    const match = /^gl(.+)Effect\.ts$/.exec(entry);
    if (match === null || entry.endsWith('.test.ts')) continue;
    const counterpart = join(wgpuDirectory, `wgpu${match[1]}Effect.ts`);
    if (!existsSync(counterpart)) continue;
    pairs.set(match[1]!, {
      gl: readFileSync(join(glDirectory, entry), 'utf8'),
      wgpu: readFileSync(counterpart, 'utf8'),
    });
  }
  return pairs;
}

/** Formats the report, printing the compared total beside the findings. */
export function formatShaderVerticalOriginReport(report: Readonly<ShaderVerticalOriginReport>): string {
  const lines = report.findings.map(
    (finding) =>
      `  ${finding.effect}: both ${finding.glConverts ? 'convert' : 'read the row directly'}` +
      ' — one of the two must invert, so these disagree on screen',
  );
  return [
    `${report.findings.length} of ${report.comparedPairs} vertical-dependent effect pair(s) treat the row the same way`,
    ...lines,
    `${report.unpairedOrVerticalFree} pair(s) do not depend on an absolute row and were not compared`,
    'A zero here finds no SOURCE-level agreement; a vertical dependence expressed through a uniform or',
    'written some other way than subtracting from one leaves nothing for this to read.',
  ].join('\n');
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  const packages = join(resolve(dirname(SCRIPT_PATH), '..'), 'packages');
  const pairs = readShaderPairs(join(packages, 'effects-gl', 'src'), join(packages, 'effects-wgpu', 'src'));
  process.stdout.write(`${formatShaderVerticalOriginReport(findShaderVerticalOriginMismatches(pairs))}\n`);
}
