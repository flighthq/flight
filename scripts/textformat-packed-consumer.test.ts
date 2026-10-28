import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const TYPESCRIPT = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const TIMEOUT_MS = 120_000;

interface PackResult {
  filename: string;
}

let consumerRoot: string;
let packedTypesManifest: Readonly<{ dependencies?: Readonly<Record<string, string>> }>;

function packIntoExternalNodeModules(packageName: string, packageDirectory: string, tarballDirectory: string): void {
  const output = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tarballDirectory], {
    cwd: packageDirectory,
    encoding: 'utf8',
  });
  const [packed] = JSON.parse(output) as PackResult[];
  if (packed === undefined) throw new Error(`npm pack returned no artifact for ${packageName}`);

  const destination = resolve(consumerRoot, 'node_modules', ...packageName.split('/'));
  mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xzf', resolve(tarballDirectory, packed.filename), '-C', destination, '--strip-components=1']);
}

beforeAll(() => {
  consumerRoot = mkdtempSync(join(tmpdir(), 'flight-textformat-consumer-'));
  const tarballDirectory = resolve(consumerRoot, 'tarballs');
  mkdirSync(tarballDirectory);

  execFileSync(
    process.execPath,
    [
      TYPESCRIPT,
      '-b',
      resolve(ROOT, 'packages/textformat/tsconfig.json'),
      resolve(ROOT, 'packages/types/tsconfig.json'),
      '--force',
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
  packIntoExternalNodeModules('@flighthq/textformat', resolve(ROOT, 'packages/textformat'), tarballDirectory);
  packIntoExternalNodeModules('@flighthq/types', resolve(ROOT, 'packages/types'), tarballDirectory);

  const typesManifestPath = resolve(consumerRoot, 'node_modules/@flighthq/types/package.json');
  packedTypesManifest = JSON.parse(readFileSync(typesManifestPath, 'utf8')) as typeof packedTypesManifest;

  writeFileSync(
    resolve(consumerRoot, 'index.ts'),
    `import type {
  FontVariation as CompatibilityFontVariation,
  TextFormat as CompatibilityTextFormat,
  TextFormatRange as CompatibilityTextFormatRange,
} from '@flighthq/types/contract';
import type {
  FontVariation,
  TextFormat,
  TextFormatRangeRaw,
} from '@flighthq/textformat/contract';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;

const fontVariationOwner: Equal<CompatibilityFontVariation, FontVariation> = true;
const textFormatOwner: Equal<CompatibilityTextFormat, TextFormat> = true;
const textFormatRangeOwner: Equal<CompatibilityTextFormatRange, TextFormatRangeRaw> = true;
void [fontVariationOwner, textFormatOwner, textFormatRangeOwner];
`,
  );
  writeFileSync(
    resolve(consumerRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: 'ES2022',
        types: [],
      },
      include: ['index.ts'],
    }),
  );
}, TIMEOUT_MS);

afterAll(() => {
  if (consumerRoot !== undefined) rmSync(consumerRoot, { force: true, recursive: true });
});

describe('packed Types Textformat compatibility', { timeout: TIMEOUT_MS }, () => {
  it('publishes Textformat as the dependency backing its compatibility aliases', () => {
    expect(packedTypesManifest.dependencies?.['@flighthq/textformat']).toBe('*');
  });

  it('typechecks exact owner aliases from an external packed-package consumer', () => {
    expect(() => {
      execFileSync(process.execPath, [TYPESCRIPT, '--project', resolve(consumerRoot, 'tsconfig.json')], {
        cwd: dirname(consumerRoot),
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  it('keeps workspace consumers off deprecated Types compatibility aliases', () => {
    const ownedTypes = new Set([
      'FontVariation',
      'TextFormat',
      'TextFormatAlign',
      'TextFormatListMarker',
      'TextFormatRange',
    ]);
    const files = execFileSync('rg', ['--files', 'packages', '-g', '*.ts'], { cwd: ROOT, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    const staleImports: string[] = [];

    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(resolve(ROOT, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const isTypesBarrel = statement.moduleSpecifier.text === '@flighthq/types/contract';
        const isTypesLocalCompatibility =
          file.startsWith('packages/types/src/') &&
          ['./FontVariation.ts', './TextFormat.ts', './TextFormatRange.ts'].includes(statement.moduleSpecifier.text);
        if (!isTypesBarrel && !isTypesLocalCompatibility) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
        for (const element of bindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          if (ownedTypes.has(imported)) staleImports.push(`${file}: ${imported}`);
        }
      }
    }

    expect(staleImports).toEqual([]);
  });
});
