import { writeFileSync } from 'fs';
import { resolve } from 'path';
import pc from 'picocolors';
import { afterAll, describe, expect, test } from 'vitest';

import type { SizeResult } from '../../scripts/size-runner';
import {
  buildSample,
  collectSizeCases,
  formatSizeResult,
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
let lastPrintedExample = '';

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
    const last = results[results.length - 1];
    if (last.name === lastPrintedExample) return;
    const expected = testCases.filter((tc) => tc.name === last.name).length;
    const completed = results.filter((r) => r.name === last.name).length;
    if (completed === expected) {
      printGroup(last.name);
      lastPrintedExample = last.name;
    }
  });

  test.each(testCases)('$name ($render)', async ({ name, render }) => {
    const root = resolve(examplesDir, name);
    const code = await buildSample(root, render);
    const gzipSize = getGzipSize(code);
    const key = `${name}:${render}`;
    const baselineSize = baseline[key] ?? null;
    const { gzipKB, baselineKB, baselineKBStr, delta, passed, threshold } = formatSizeResult(gzipSize, baselineSize);

    pendingBaseline[key] = gzipSize;
    results.push({ name, render, gzipSize, gzipKB, baselineKB, baselineKBStr, delta, passed, threshold, key });

    if (!updateBaseline && threshold != null) {
      const thresholdKB = (threshold / 1024).toFixed(2);
      expect(gzipSize, `${name} (${render}) exceeded limit (${gzipKB} KB > ${thresholdKB} KB)`).toBeLessThan(threshold);
    }
  });

  test('write baseline', () => {});
});
