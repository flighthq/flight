import { writeFileSync } from 'fs';
import { resolve } from 'path';
import pc from 'picocolors';
import { afterAll, describe, expect, test } from 'vitest';

import { createSizeDebugStub } from '../../scripts/size-debug-stub';
import type { SizeResult } from '../../scripts/size-runner';
import {
  buildSamples,
  collectSizeCases,
  didSizeChecksPass,
  formatSizeResult,
  getFlightDiagnosticsSizeDelta,
  getGzipSize,
  getSizeCaseKey,
  parseFilter,
  readBaseline,
  readSizeBaselineOrigins,
} from '../../scripts/size-runner';

const baselineFile = resolve(__dirname, 'size.baseline.json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';
const sizeReport = process.env.SIZE_REPORT?.toLowerCase() ?? '';
const sizeOutputPath = process.env.SIZE_OUTPUT_PATH;

const baseline: Record<string, number> = readBaseline(baselineFile);
const pendingBaseline: Record<string, number> = { ...baseline };
const root = resolve(__dirname, '../..');
const baselineOrigins = readSizeBaselineOrigins(root, baselineFile);

const examplesDir = resolve(root, 'examples/packages');
const sizeExampleFilter = parseFilter(process.env.SIZE_EXAMPLE_FILTER);
const sizeRenderFilter = parseFilter(process.env.SIZE_RENDER_FILTER);

const testCases = collectSizeCases(examplesDir, sizeExampleFilter, sizeRenderFilter);

const results: SizeResult[] = [];

const exampleNames = [...new Set(testCases.map((tc) => tc.name))];
const exampleBgColors = [pc.bgBlue, pc.bgMagenta, pc.bgCyan, pc.bgGreen];
const maxNameLen = Math.max(...exampleNames.map((n) => n.length));
const maxRenderLen = Math.max(
  8,
  ...testCases.map((sizeCase) => `${sizeCase.render}${sizeCase.variant === null ? '' : `:${sizeCase.variant}`}`.length),
);
const w = { name: maxNameLen + 5, render: maxRenderLen, size: 10, base: 34 };

function printGroup(name: string): void {
  const group = results.filter((r) => r.name === name);
  const bgColor = exampleBgColors[exampleNames.indexOf(name) % exampleBgColors.length];

  const lines = group.map((r, i) => {
    const nameCell = i === 0 ? bgColor(' ' + r.name + ' ') + ''.padEnd(w.name - r.name.length - 2) : ''.padEnd(w.name);
    const deltaNum = r.delta != null ? parseFloat(r.delta) : null;
    const color = deltaNum == null ? pc.dim : deltaNum > 2 ? pc.red : deltaNum > 0 ? pc.yellow : pc.green;
    const deltaStr =
      r.delta == null ? pc.dim('—') : color(r.delta[0]) + color(r.delta.slice(1, -1)) + pc.dim(color('%'));
    const baselineOrigin = r.baselineCommit
      ? ` @${r.baselineCommit.slice(0, 10)}${r.baselineCommitDate ? ` (${r.baselineCommitDate})` : ''}`
      : ' @unknown';
    const baselineStr = pc.dim(
      (r.baselineKBStr ? `~${r.baselineKBStr} KB${baselineOrigin}` : 'no baseline').padEnd(w.base),
    );
    const flag = r.passed ? '' : '  ' + pc.red('✗');

    const renderLabel = `${r.render}${r.variant === null ? '' : `:${r.variant}`}`;
    return `${nameCell}  ${pc.dim(renderLabel.padEnd(w.render))}  ${(r.gzipKB + ' KB').padEnd(w.size)}  ${baselineStr}  ${deltaStr}${flag}`;
  });

  console.log(lines.join('\n') + '\n');
}

describe('bundle size checks', () => {
  afterAll(() => {
    if (updateBaseline) {
      writeFileSync(baselineFile, JSON.stringify(pendingBaseline, null, 2) + '\n');
      if (!sizeOutputPath && sizeReport !== 'json') {
        console.log(`Baseline written to ${baselineFile}`);
      }
    }

    const shouldWriteJson = sizeReport === 'json' || Boolean(sizeOutputPath);
    if (!shouldWriteJson) return;

    const cases = results.map((r) => ({
      example: r.name,
      render: r.render,
      variant: r.variant,
      gzipKB: parseFloat(r.gzipKB),
      baselineKB: r.baselineKB,
      baselineCommit: r.baselineCommit,
      baselineCommitDate: r.baselineCommitDate,
      deltaPercent: r.delta != null ? parseFloat(r.delta.replace('%', '')) : null,
      passed: r.passed,
    }));
    const report = { passed: didSizeChecksPass(results), cases };

    if (sizeOutputPath) {
      const outputPath = resolve(process.cwd(), sizeOutputPath);
      writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
      console.log(`SIZE_REPORT_PATH:${outputPath}`);
    } else {
      console.log(`SIZE_REPORT_JSON:${JSON.stringify(report)}`);
    }
  });

  afterEach(() => {
    if (results.length === 0 || sizeReport === 'json' || sizeOutputPath) return;
    for (const exampleName of exampleNames) printGroup(exampleName);
  });

  test('build selected samples', async () => {
    expect(testCases.length, 'No matching size tests were found.').toBeGreaterThan(0);
    const codeByCase = await buildSamples(testCases);

    for (const [index, { name, render, variant }] of testCases.entries()) {
      const code = codeByCase[index];
      const gzipSize = getGzipSize(code);
      const key = getSizeCaseKey(testCases[index]);
      const baselineSize = baseline[key] ?? null;
      const baselineOrigin = baselineOrigins[key];
      const { gzipKB, baselineKB, baselineKBStr, delta, passed, threshold } = formatSizeResult(gzipSize, baselineSize);

      pendingBaseline[key] = gzipSize;
      results.push({
        name,
        render,
        variant,
        gzipSize,
        gzipKB,
        baselineCommit: baselineOrigin?.commit ?? null,
        baselineCommitDate: baselineOrigin?.commitDate ?? null,
        baselineKB,
        baselineKBStr,
        delta,
        passed,
        threshold,
        key,
      });

      if (!updateBaseline) {
        expect.soft(threshold, `${name} (${render}) has no size baseline`).not.toBeNull();
        if (threshold !== null) {
          const thresholdKB = (threshold / 1024).toFixed(2);
          expect
            .soft(gzipSize, `${name} (${render}) exceeded limit (${gzipKB} KB > ${thresholdKB} KB)`)
            .toBeLessThan(threshold);
        }
      }
    }
  });

  test('keeps enabled flight diagnostics as an explicit positive delta over the release stub', () => {
    const diagnosticsCases = testCases.filter((item) => item.name === 'flight-diagnostics');
    const includesDiagnosticsPair = diagnosticsCases.length === 2;
    if (!includesDiagnosticsPair) return;
    expect(getFlightDiagnosticsSizeDelta(results)).toBeGreaterThan(0);
  });

  test('orders the canonical release target before its diagnostics variant', () => {
    const diagnosticsCases = testCases.filter((item) => item.name === 'flight-diagnostics');
    if (diagnosticsCases.length !== 2) return;
    expect(diagnosticsCases.map((item) => item.variant)).toEqual([null, 'diagnostics']);
  });

  test('preserves the declared renderer order', () => {
    const adjustmentCases = testCases.filter((item) => item.name === 'adjustments');
    if (adjustmentCases.length === 0) return;
    expect(adjustmentCases.map((item) => item.render)).toEqual(['dom', 'canvas', 'webgl', 'webgpu']);
  });

  test('uses the canonical release key plus one diagnostics suffix', () => {
    expect(getSizeCaseKey({ name: 'flight-diagnostics', render: 'canvas', variant: null })).toBe(
      'flight-diagnostics:canvas',
    );
    expect(getSizeCaseKey({ name: 'flight-diagnostics', render: 'canvas', variant: 'diagnostics' })).toBe(
      'flight-diagnostics:canvas:diagnostics',
    );
  });

  test('replaces the authoring diagnostics call in release builds', () => {
    const plugin = createSizeDebugStub();
    const transform = plugin.transform as unknown as (code: string, id: string) => { code: string; map: null } | null;
    const result = transform('enableFlightDiagnostics(state);', 'render.canvas.ts');
    expect(result?.code).toBe('void (state);');
  });

  test('write baseline', () => {});
});
