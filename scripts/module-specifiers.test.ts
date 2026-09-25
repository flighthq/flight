import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';

import {
  getTypeScriptSpecifierReplacement,
  inspectTypeScriptModuleSpecifiers,
  rewriteTypeScriptModuleSpecifiers,
} from './module-specifiers.ts';

const root = resolve('/fixture');
const containingFile = resolve(root, 'src/main.ts');
const existing = new Set([
  resolve(root, 'src/direct.ts'),
  resolve(root, 'src/existing.ts'),
  resolve(root, 'src/lazy.ts'),
  resolve(root, 'src/nested/index.ts'),
  resolve(root, 'src/render.webgpu.ts'),
  resolve(root, 'src/types.ts'),
]);
const fileExists = (path: string): boolean => existing.has(path);

describe('repository compiler wiring', () => {
  it('rewrites explicit TypeScript source paths to JavaScript output paths', () => {
    const repositoryRoot = resolve(import.meta.dirname, '..');
    const config = ts.readConfigFile(resolve(repositoryRoot, 'tsconfig.base.json'), (path) =>
      readFileSync(path, 'utf8'),
    );
    expect(config.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot);

    expect(parsed.options.rewriteRelativeImportExtensions).toBe(true);
    expect(
      ts.transpileModule("export * from './source.ts';", {
        compilerOptions: parsed.options,
        fileName: resolve(repositoryRoot, 'source.ts'),
      }).outputText,
    ).toContain('./source.js');
  });
});

describe('getTypeScriptSpecifierReplacement', () => {
  it('names direct and index TypeScript source files', () => {
    expect(getTypeScriptSpecifierReplacement(containingFile, './direct', fileExists)).toBe('./direct.ts');
    expect(getTypeScriptSpecifierReplacement(containingFile, './nested', fileExists)).toBe('./nested/index.ts');
    expect(getTypeScriptSpecifierReplacement(containingFile, './existing.js', fileExists)).toBe('./existing.ts');
    expect(getTypeScriptSpecifierReplacement(containingFile, './render.webgpu', fileExists)).toBe('./render.webgpu.ts');
  });

  it('keeps package, asset, query, and explicit TypeScript specifiers unchanged', () => {
    expect(getTypeScriptSpecifierReplacement(containingFile, '@flighthq/types/contract', fileExists)).toBeUndefined();
    expect(getTypeScriptSpecifierReplacement(containingFile, './data.json', fileExists)).toBeUndefined();
    expect(getTypeScriptSpecifierReplacement(containingFile, './direct.ts', fileExists)).toBeUndefined();
    expect(getTypeScriptSpecifierReplacement(containingFile, './shader?raw', fileExists)).toBeUndefined();
  });

  it('rejects an unresolved extensionless module edge without inventing a target', () => {
    expect(getTypeScriptSpecifierReplacement(containingFile, './missing', fileExists)).toBeNull();
  });
});

describe('inspectTypeScriptModuleSpecifiers', () => {
  it('covers static, dynamic, type, export, and import-equals module edges', () => {
    const source = [
      "import value from './direct';",
      "export * from './existing.js';",
      "const lazy = import('./lazy');",
      "type Shape = import('./types').Shape;",
      "import nested = require('./nested');",
      "import data from './data.json';",
    ].join('\n');

    expect(
      inspectTypeScriptModuleSpecifiers(containingFile, source, fileExists).map(({ replacement, specifier }) => ({
        replacement,
        specifier,
      })),
    ).toEqual([
      { replacement: './direct.ts', specifier: './direct' },
      { replacement: './existing.ts', specifier: './existing.js' },
      { replacement: './lazy.ts', specifier: './lazy' },
      { replacement: './types.ts', specifier: './types' },
      { replacement: './nested/index.ts', specifier: './nested' },
    ]);
  });
});

describe('rewriteTypeScriptModuleSpecifiers', () => {
  it('changes only relative module edges backed by TypeScript source', () => {
    const source = [
      "import value from './direct';",
      "export * from './existing.js';",
      "import data from './data.json';",
      "import { external } from '@flighthq/example';",
    ].join('\n');

    expect(rewriteTypeScriptModuleSpecifiers(containingFile, source, fileExists)).toBe(
      [
        "import value from './direct.ts';",
        "export * from './existing.ts';",
        "import data from './data.json';",
        "import { external } from '@flighthq/example';",
      ].join('\n'),
    );
  });
});
