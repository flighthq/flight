import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import {
  createVitestTypeScriptConfig,
  resolveVitestTsconfigPathOptions,
  VITEST_ESBUILD_TSCONFIG_RAW,
} from './vitestTypeScriptConfig';

describe('base Vitest TypeScript configuration', () => {
  it('keeps aliases on the single root tsconfig project', () => {
    const rootTsconfig = path.resolve(__dirname, '..', 'tsconfig.json');

    expect(resolveVitestTsconfigPathOptions(path.dirname(rootTsconfig))).toEqual({
      projects: [rootTsconfig],
      root: path.dirname(rootTsconfig),
    });
    expect(createVitestTypeScriptConfig(path.dirname(rootTsconfig)).plugins[0].name).toBe('vite-tsconfig-paths');
  });

  it('uses a raw string so Vite does not discover package tsconfigs per transformed file', () => {
    const config = createVitestTypeScriptConfig(path.resolve(__dirname, '..'));

    expect(typeof config.esbuild.tsconfigRaw).toBe('string');
    expect(config.esbuild.tsconfigRaw).toBe(VITEST_ESBUILD_TSCONFIG_RAW);
  });

  it('pins the transform-relevant options to the shared root compiler settings', () => {
    const rootConfig = ts.readConfigFile(path.resolve(__dirname, '..', 'tsconfig.base.json'), ts.sys.readFile);
    expect(rootConfig.error).toBeUndefined();
    const rootCompilerOptions = rootConfig.config.compilerOptions;
    const rawCompilerOptions = JSON.parse(VITEST_ESBUILD_TSCONFIG_RAW).compilerOptions;

    expect(rawCompilerOptions).toEqual({
      target: rootCompilerOptions.target,
      useDefineForClassFields: rootCompilerOptions.useDefineForClassFields,
    });
  });

  it('does not hide package-specific esbuild transform settings', () => {
    const rootDir = path.resolve(__dirname, '..');
    const viteTransformFields = [
      'alwaysStrict',
      'experimentalDecorators',
      'importsNotUsedAsValues',
      'jsx',
      'jsxFactory',
      'jsxFragmentFactory',
      'jsxImportSource',
      'preserveValueImports',
      'target',
      'useDefineForClassFields',
      'verbatimModuleSyntax',
    ];
    const packageConfigs = readdirSync(path.resolve(rootDir, 'packages'))
      .map((directory) => path.resolve(rootDir, 'packages', directory, 'tsconfig.json'))
      .filter(existsSync);

    for (const configPath of packageConfigs) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      expect(config.error, configPath).toBeUndefined();
      expect(config.config.extends, configPath).toBe('../../tsconfig.base.json');
      expect(
        viteTransformFields.filter((field) => Object.hasOwn(config.config.compilerOptions ?? {}, field)),
        configPath,
      ).toEqual([]);
    }
  });
});
