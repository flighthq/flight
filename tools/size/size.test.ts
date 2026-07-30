import { writeFileSync } from 'fs';
import { resolve } from 'path';
import pc from 'picocolors';
import { afterAll, describe, expect, test } from 'vitest';

import { createSizeDebugStub } from '../../scripts/size-debug-stub';
import type { SizeResult } from '../../scripts/size-runner';
import {
  buildSamples,
  collectSizeCases,
  formatSizeResult,
  getFlightDiagnosticsSizeDelta,
  getGzipSize,
  parseFilter,
  readBaseline,
} from '../../scripts/size-runner';

const baselineFile = resolve(__dirname, 'size.baseline.json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';
const sizeReport = process.env.SIZE_REPORT?.toLowerCase() ?? '';
const sizeOutputPath = process.env.SIZE_OUTPUT_PATH;

const baseline: Record<string, number> = readBaseline(baselineFile);
const pendingBaseline: Record<string, number> = { ...baseline };

const examplesDir = resolve(__dirname, '../../examples/packages');
const sizeExampleFilter = parseFilter(process.env.SIZE_EXAMPLE_FILTER);
const sizeRenderFilter = parseFilter(process.env.SIZE_RENDER_FILTER);

const testCases = collectSizeCases(examplesDir, sizeExampleFilter, sizeRenderFilter);

const results: SizeResult[] = [];

const exampleNames = [...new Set(testCases.map((tc) => tc.name))];
const exampleBgColors = [pc.bgBlue, pc.bgMagenta, pc.bgCyan, pc.bgGreen];
const maxNameLen = Math.max(...exampleNames.map((n) => n.length));
const w = { name: maxNameLen + 5, render: 8, size: 10, base: 10 };

function printGroup(name: string): void {
  const group = results.filter((r) => r.name === name);
  const bgColor = exampleBgColors[exampleNames.indexOf(name) % exampleBgColors.length];

  const lines = group.map((r, i) => {
    const nameCell = i === 0 ? bgColor(' ' + r.name + ' ') + ''.padEnd(w.name - r.name.length - 2) : ''.padEnd(w.name);
    const deltaNum = r.delta != null ? parseFloat(r.delta) : null;
    const color = deltaNum == null ? pc.dim : deltaNum > 2 ? pc.red : deltaNum > 0 ? pc.yellow : pc.green;
    const deltaStr =
      r.delta == null ? pc.dim('—') : color(r.delta[0]) + color(r.delta.slice(1, -1)) + pc.dim(color('%'));
    const baselineStr = pc.dim((r.baselineKBStr ? '~' + r.baselineKBStr + ' KB' : '—').padEnd(w.base));
    const flag = r.passed ? '' : '  ' + pc.red('✗');

    return `${nameCell}  ${pc.dim(r.render.padEnd(w.render))}  ${(r.gzipKB + ' KB').padEnd(w.size)}  ${baselineStr}  ${deltaStr}${flag}`;
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
      gzipKB: parseFloat(r.gzipKB),
      baselineKB: r.baselineKB,
      deltaPercent: r.delta != null ? parseFloat(r.delta.replace('%', '')) : null,
      passed: r.passed,
    }));
    const report = {
      passed: results.every((r) => r.passed),
      cases,
    };

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
    const codeByCase = await buildSamples(testCases);

    for (const [index, { name, render }] of testCases.entries()) {
      const code = codeByCase[index];
      const gzipSize = getGzipSize(code);
      const key = `${name}:${render}`;
      const baselineSize = baseline[key] ?? null;
      const { gzipKB, baselineKB, baselineKBStr, delta, passed, threshold } = formatSizeResult(gzipSize, baselineSize);

      pendingBaseline[key] = gzipSize;
      results.push({ name, render, gzipSize, gzipKB, baselineKB, baselineKBStr, delta, passed, threshold, key });

      if (!updateBaseline && threshold != null) {
        const thresholdKB = (threshold / 1024).toFixed(2);
        expect
          .soft(gzipSize, `${name} (${render}) exceeded limit (${gzipKB} KB > ${thresholdKB} KB)`)
          .toBeLessThan(threshold);
      }
    }
  });

  test('keeps enabled flight diagnostics as an explicit positive delta over the release stub', () => {
    const includesDiagnosticsPair =
      testCases.some((item) => item.name === 'flight-diagnostics-release') &&
      testCases.some((item) => item.name === 'flight-diagnostics-enabled');
    if (!includesDiagnosticsPair) return;
    expect(getFlightDiagnosticsSizeDelta(results)).toBeGreaterThan(0);
  });

  test('replaces the authoring diagnostics call in release builds', () => {
    const plugin = createSizeDebugStub();
    const transform = plugin.transform as unknown as (code: string, id: string) => { code: string; map: null } | null;
    const result = transform('enableFlightDiagnostics(state);', 'render.canvas.ts');
    expect(result?.code).toBe('void (state);');
  });

  test('write baseline', () => {});
});
