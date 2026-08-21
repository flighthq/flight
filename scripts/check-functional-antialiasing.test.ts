import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  analyzeFunctionalAntialiasing,
  formatFunctionalAntialiasingReport,
  getFunctionalAntialiasingExitCode,
  readFunctionalAntialiasingRatchet,
  sourceDrawsOnlyAxisAlignedFills,
} from './check-functional-antialiasing';

let root: string;
let scenes: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'functional-antialiasing-'));
  scenes = join(root, 'functional', 'scenes');
  mkdirSync(scenes, { recursive: true });
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('analyzeFunctionalAntialiasing', () => {
  it('accepts exactly one top-level literal declaration', () => {
    writeScene('declared.ts', "declareAntialiasingPolicy('aa');");

    const report = analyzeFunctionalAntialiasing(root, []);

    expect(report.validDeclarations).toBe(1);
    expect(report.unexpectedMissing).toEqual([]);
    expect(getFunctionalAntialiasingExitCode(report)).toBe(0);
  });

  it('ratchets existing omissions but fails a new omission', () => {
    writeScene('legacy.ts', 'createFunctionalTarget({});');
    writeScene('new.ts', 'createFunctionalTarget({});');

    const report = analyzeFunctionalAntialiasing(root, ['legacy.ts']);

    expect(report.ratchetedMissing).toEqual(['legacy.ts']);
    expect(report.unexpectedMissing).toEqual([
      {
        file: 'new.ts',
        problem: "missing top-level declareAntialiasingPolicy('aa' | 'no-aa')",
      },
    ]);
    expect(getFunctionalAntialiasingExitCode(report)).toBe(1);
  });

  it('rejects invalid, nested, and duplicate declarations', () => {
    writeScene('invalid.ts', "declareAntialiasingPolicy('mixed');");
    writeScene('nested.ts', "function configure() { declareAntialiasingPolicy('aa'); }");
    writeScene('duplicate.ts', "declareAntialiasingPolicy('aa'); declareAntialiasingPolicy('aa');");

    const report = analyzeFunctionalAntialiasing(root, []);

    expect(report.unexpectedMissing).toEqual([
      { file: 'duplicate.ts', problem: '2 declareAntialiasingPolicy calls; expected exactly one' },
      { file: 'invalid.ts', problem: "declareAntialiasingPolicy needs the literal 'aa' or 'no-aa'" },
      { file: 'nested.ts', problem: 'declareAntialiasingPolicy must be a top-level statement' },
    ]);
  });

  it('makes a repaired omission a stale ratchet failure', () => {
    writeScene('repaired.ts', "declareAntialiasingPolicy('aa');");

    const report = analyzeFunctionalAntialiasing(root, ['repaired.ts']);

    expect(report.staleRatchet).toEqual(['repaired.ts']);
    expect(getFunctionalAntialiasingExitCode(report)).toBe(1);
  });

  it('names both sibling modules and both values on disagreement', () => {
    writeScene('family.canvas.ts', "declareAntialiasingPolicy('aa');");
    writeScene('family.webgpu.ts', "declareAntialiasingPolicy('no-aa');");

    const report = analyzeFunctionalAntialiasing(root, []);
    const formatted = formatFunctionalAntialiasingReport(report);

    expect(report.familyMismatches).toEqual([
      {
        left: { file: 'family.canvas.ts', policy: 'aa' },
        right: { file: 'family.webgpu.ts', policy: 'no-aa' },
        scene: 'family',
      },
    ]);
    expect(formatted).toContain('family.canvas.ts declares aa; family.webgpu.ts declares no-aa');
    expect(getFunctionalAntialiasingExitCode(report)).toBe(1);
  });

  it('reports backend defaults and WebGPU normalization per generic cell without gating mismatches', () => {
    writeScene('generic.ts', "declareAntialiasingPolicy('aa'); createFunctionalTarget({});");

    const report = analyzeFunctionalAntialiasing(root, []);
    const byRenderer = Object.fromEntries(report.cells.map((cell) => [cell.renderer, cell]));

    expect(byRenderer.dom?.effective).toBe('aa');
    expect(byRenderer.canvas?.effective).toBe('aa');
    expect(byRenderer.webgl?.effective).toBe('aa');
    expect(byRenderer.webgpu).toMatchObject({ declared: 'aa', effective: 'no-aa', matches: false });
    expect(formatFunctionalAntialiasingReport(report)).toContain(
      'Cleanup baseline: 140 mismatch cell(s) (canvas 9, webgl 66, webgpu 65).',
    );
    expect(formatFunctionalAntialiasingReport(report)).toContain(
      'Current mismatches by renderer: canvas 0, dom 0, webgl 0, webgpu 1.',
    );
    expect(getFunctionalAntialiasingExitCode(report)).toBe(0);
  });

  it('recomputes Canvas AA from the current picture when antialiasable geometry appears', () => {
    writeScene('geometry.canvas.ts', "declareAntialiasingPolicy('no-aa'); appendShapeRectangle(path, 0, 0, 10, 10);");

    expect(analyzeFunctionalAntialiasing(root, []).cells[0]).toMatchObject({
      declared: 'no-aa',
      effective: 'no-aa',
      matches: true,
    });

    writeScene(
      'geometry.canvas.ts',
      "declareAntialiasingPolicy('no-aa'); appendShapeRectangle(path, 0, 0, 10, 10); " +
        'appendShapeCurve(path, 0, 0, 5, 10, 10, 0);',
    );

    expect(analyzeFunctionalAntialiasing(root, []).cells[0]).toMatchObject({
      declared: 'no-aa',
      effective: 'aa',
      matches: false,
    });
  });

  it('treats a final multisample GL target as AA when context AA is off', () => {
    writeScene(
      'multisample.webgl.ts',
      "declareAntialiasingPolicy('aa'); createGlRenderState(canvas, { antialias: false }); " +
        'createGlRenderEffectPipeline(state, { sampleCount: 4 });',
    );

    const [cell] = analyzeFunctionalAntialiasing(root, []).cells;

    expect(cell).toMatchObject({ declared: 'aa', effective: 'aa', matches: true });
    expect(cell?.reason).toContain('resolves sampleCount 4');
  });

  it('treats an explicitly single-sampled GL path as no-AA', () => {
    writeScene(
      'single.webgl.ts',
      "declareAntialiasingPolicy('no-aa'); createGlRenderState(canvas, { contextAttributes: { antialias: false } }); " +
        'createGlRenderEffectPipeline(state, { sampleCount: 1 });',
    );

    const [cell] = analyzeFunctionalAntialiasing(root, []).cells;

    expect(cell).toMatchObject({ declared: 'no-aa', effective: 'no-aa', matches: true });
  });

  it('reports a dynamic effective GL setting as unknown without hard-gating it yet', () => {
    writeScene(
      'dynamic.webgl.ts',
      "declareAntialiasingPolicy('aa'); createGlRenderState(canvas, { antialias: enabled });",
    );

    const report = analyzeFunctionalAntialiasing(root, []);

    expect(report.cells[0]).toMatchObject({ declared: 'aa', effective: 'unknown', matches: null });
    expect(getFunctionalAntialiasingExitCode(report)).toBe(0);
  });
});

describe('sourceDrawsOnlyAxisAlignedFills', () => {
  it('fails safe when there is no recognized axis-aligned fill', () => {
    expect(sourceDrawsOnlyAxisAlignedFills('customDrawingPrimitive(path);')).toBe(false);
  });

  it.each([
    'rotation = Math.PI / 4;',
    'appendShapeCircle(path, 5, 5, 5);',
    'appendShapeLineStyle(path, 1);',
    'appendShapeMoveTo(path, 0, 0); appendShapeLineTo(path, 10, 10);',
    "createTextLabel('AA');",
    'context.arc(5, 5, 5, 0, Math.PI * 2);',
  ])('does not structurally exempt an AA-capable picture containing %s', (antialiasableGeometry) => {
    expect(sourceDrawsOnlyAxisAlignedFills(`appendShapeRectangle(path, 0, 0, 10, 10); ${antialiasableGeometry}`)).toBe(
      false,
    );
  });
});

describe('readFunctionalAntialiasingRatchet', () => {
  it('reads and sorts the committed missing set', () => {
    const path = join(root, 'ratchet.json');
    writeFileSync(path, JSON.stringify({ missing: ['z.ts', 'a.ts', 'z.ts'] }));

    expect(readFunctionalAntialiasingRatchet(path)).toEqual(['a.ts', 'z.ts']);
  });

  it('rejects a truncated generated file before trusting its contents', () => {
    const path = join(root, 'ratchet.json');
    writeFileSync(path, '{}');

    expect(() => readFunctionalAntialiasingRatchet(path)).toThrow('too small');
  });
});

function writeScene(file: string, source: string): void {
  writeFileSync(join(scenes, file), source);
}
