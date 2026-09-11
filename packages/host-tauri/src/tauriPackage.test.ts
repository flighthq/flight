import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { rollup } from 'rollup';
import type { OutputChunk } from 'rollup';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import * as publicApi from './index';

const ROOT = resolve(__dirname, '../../..');
const PACKAGE_ROOT = resolve(__dirname, '..');
const DIST_ROOT = resolve(PACKAGE_ROOT, 'dist');
const PACK_TIMEOUT_MS = 120_000;

const PACKED_MODULES = [
  'contract',
  'index',
  'tauriApp',
  'tauriClipboard',
  'tauriDialog',
  'tauriHost',
  'tauriMenu',
  'tauriNotification',
  'tauriPlatform',
  'tauriShell',
  'tauriShortcut',
  'tauriTray',
  'tauriUnsupportedHostGroups',
  'tauriWindow',
] as const;

const ENTITY_CONSTRUCTORS = [
  'tauriHost',
  'tauriHostApp',
  'tauriHostAppHide',
  'tauriHostAppLocale',
  'tauriHostAppName',
  'tauriHostAppQuit',
  'tauriHostAppRelaunch',
  'tauriHostAppShow',
  'tauriHostAppVersion',
  'tauriHostClipboardText',
  'tauriHostDirectoryOpenDialog',
  'tauriHostFileOpenDialog',
  'tauriHostFileSaveDialog',
  'tauriHostMenu',
  'tauriHostMenuApplication',
  'tauriHostMenuPopup',
  'tauriHostMenuSelect',
  'tauriHostMessageDialog',
  'tauriHostNotification',
  'tauriHostPlatform',
  'tauriHostShellExternal',
  'tauriHostShellPathOpen',
  'tauriHostShellPathReveal',
  'tauriHostShortcutQuery',
  'tauriHostShortcutTrigger',
  'tauriHostTray',
  'tauriHostTrayImage',
  'tauriHostTrayInteractionEvents',
  'tauriHostTrayLifecycle',
  'tauriHostTrayMenu',
  'tauriHostTrayMenuSelectionEvents',
  'tauriHostTrayTemplateImage',
  'tauriHostTrayTitle',
  'tauriHostTrayTooltip',
  'tauriHostWindow',
] as const;

const LEAF_MODULE_BY_EXPORT = {
  tauriHostAppHide: 'tauriApp.js',
  tauriHostAppLocale: 'tauriApp.js',
  tauriHostAppName: 'tauriApp.js',
  tauriHostAppQuit: 'tauriApp.js',
  tauriHostAppRelaunch: 'tauriApp.js',
  tauriHostAppShow: 'tauriApp.js',
  tauriHostAppVersion: 'tauriApp.js',
  tauriHostClipboardText: 'tauriClipboard.js',
  tauriHostDirectoryOpenDialog: 'tauriDialog.js',
  tauriHostFileOpenDialog: 'tauriDialog.js',
  tauriHostFileSaveDialog: 'tauriDialog.js',
  tauriHostMenuApplication: 'tauriMenu.js',
  tauriHostMenuPopup: 'tauriMenu.js',
  tauriHostMenuSelect: 'tauriMenu.js',
  tauriHostMessageDialog: 'tauriDialog.js',
  tauriHostNotificationDelivery: 'tauriNotification.js',
  tauriHostNotificationLifecycle: 'tauriNotification.js',
  tauriHostNotificationPermission: 'tauriNotification.js',
  tauriHostPlatform: 'tauriPlatform.js',
  tauriHostShellExternal: 'tauriShell.js',
  tauriHostShellPathOpen: 'tauriShell.js',
  tauriHostShellPathReveal: 'tauriShell.js',
  tauriHostShortcutQuery: 'tauriShortcut.js',
  tauriHostShortcutTrigger: 'tauriShortcut.js',
  tauriHostTrayImage: 'tauriTray.js',
  tauriHostTrayInteractionEvents: 'tauriTray.js',
  tauriHostTrayLifecycle: 'tauriTray.js',
  tauriHostTrayMenu: 'tauriTray.js',
  tauriHostTrayMenuSelectionEvents: 'tauriTray.js',
  tauriHostTrayTemplateImage: 'tauriTray.js',
  tauriHostTrayTitle: 'tauriTray.js',
  tauriHostTrayTooltip: 'tauriTray.js',
  tauriHostWindow: 'tauriWindow.js',
} as const;

interface PackedFile {
  path: string;
}

interface PackResult {
  files: PackedFile[];
}

let packedFiles: string[];

beforeAll(() => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
  const packed = JSON.parse(output) as PackResult[];
  packedFiles = packed[0]!.files.map((file) => file.path).sort();
}, PACK_TIMEOUT_MS);

describe('packed Tauri host surface', () => {
  it('ships exactly the clean canonical production modules', () => {
    const expected = PACKED_MODULES.flatMap((module) =>
      ['d.ts', 'd.ts.map', 'js', 'js.map'].map((extension) => `dist/${module}.${extension}`),
    ).sort();
    const emitted = packedFiles.filter((path) => path.startsWith('dist/'));

    expect(emitted).toEqual(expected);
    expect(emitted.some((path) => path.includes('.test.'))).toBe(false);
  });

  it('contains no retired Tauri constructors, backends, initializer, registrar, or module', () => {
    const retiredModule = ['tauri', 'Register'].join('');
    const backendSuffix = ['Back', 'end'].join('');
    const backendName = new RegExp(String.raw`\b[A-Za-z][A-Za-z0-9]*${backendSuffix}s?\b`, 'u');
    const packedText = packedFiles
      .filter((path) => /\.(?:[cm]?[jt]s|json|map)$/u.test(path))
      .map((path) => readFileSync(resolve(PACKAGE_ROOT, path), 'utf8'))
      .join('\n');

    expect(packedFiles.filter((path) => path.includes(retiredModule))).toEqual([]);
    expect(packedText).not.toMatch(/\b(?:create|initialize|register|make)Tauri[A-Z][A-Za-z0-9]*\b/u);
    expect(packedText).not.toMatch(backendName);
  });

  it('keeps emitted public and contract declarations exactly aligned', () => {
    const { checker, contractSource, publicSource } = declarationProgram();
    const runtimeNames = Object.keys(publicApi).sort();

    expect(moduleExportNames(checker, publicSource)).toEqual(runtimeNames);
    expect(moduleExportNames(checker, contractSource)).toEqual(runtimeNames);
    expect(runtimeNames).toHaveLength(59);
  });

  it('emits Entity return types for exactly the constructors that allocate entities', () => {
    const { checker, entitySource, publicSource } = declarationProgram();
    const entitySymbol = moduleExports(checker, entitySource).find((symbol) => symbol.name === 'Entity');
    expect(entitySymbol).toBeDefined();
    const entityType = checker.getDeclaredTypeOfSymbol(entitySymbol!);
    const entityConstructors = moduleExports(checker, publicSource)
      .filter((symbol) => {
        const declaration = resolvedSymbol(checker, symbol).declarations?.[0];
        if (declaration === undefined) return false;
        const signature = checker.getSignaturesOfType(
          checker.getTypeOfSymbolAtLocation(resolvedSymbol(checker, symbol), declaration),
          ts.SignatureKind.Call,
        )[0];
        return (
          signature !== undefined && checker.isTypeAssignableTo(checker.getReturnTypeOfSignature(signature), entityType)
        );
      })
      .map((symbol) => symbol.name)
      .sort();

    expect(entityConstructors).toEqual([...ENTITY_CONSTRUCTORS].sort());
  });
});

describe('packed Tauri leaf isolation', () => {
  const isolatedLeaves = [
    {
      exportName: 'tauriHostMenuApplication',
      module: 'tauriMenu.js',
      siblingTokens: ['LogicalPosition', '.popup(', '.subscribe('],
    },
    {
      exportName: 'tauriHostNotificationDelivery',
      module: 'tauriNotification.js',
      siblingTokens: ['already-destroyed', 'requestPermission'],
    },
    {
      exportName: 'tauriHostTrayTooltip',
      module: 'tauriTray.js',
      siblingTokens: ['TrayIcon.new', '.setIcon(', '.setMenu(', '.setTitle(', '.setIconAsTemplate('],
    },
  ] as const;

  it('retains exactly one Tauri implementation module for every supported leaf', async () => {
    const actual = Object.fromEntries(
      await Promise.all(
        Object.entries(LEAF_MODULE_BY_EXPORT).map(async ([exportName]) => {
          const modules = implementationModuleNames(await bundleLeaf(exportName));
          expect(modules, exportName).toHaveLength(1);
          return [exportName, modules[0]];
        }),
      ),
    );

    expect(actual).toEqual(LEAF_MODULE_BY_EXPORT);
  });

  for (const leaf of isolatedLeaves) {
    it(`${leaf.exportName} retains only its leaf implementation`, async () => {
      const chunk = await bundleLeaf(leaf.exportName);

      expect(implementationModuleNames(chunk)).toEqual([leaf.module]);
      for (const siblingToken of leaf.siblingTokens) expect(chunk.code).not.toContain(siblingToken);
    });
  }
});

function declarationProgram(): {
  checker: ts.TypeChecker;
  contractSource: ts.SourceFile;
  entitySource: ts.SourceFile;
  publicSource: ts.SourceFile;
} {
  const publicPath = resolve(DIST_ROOT, 'index.d.ts');
  const contractPath = resolve(DIST_ROOT, 'contract.d.ts');
  const entityPath = resolve(ROOT, 'packages/types/dist/Entity.d.ts');
  const program = ts.createProgram([publicPath, contractPath, entityPath], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
  });
  return {
    checker: program.getTypeChecker(),
    contractSource: program.getSourceFile(contractPath)!,
    entitySource: program.getSourceFile(entityPath)!,
    publicSource: program.getSourceFile(publicPath)!,
  };
}

function moduleExports(checker: ts.TypeChecker, source: ts.SourceFile): ts.Symbol[] {
  const symbol = checker.getSymbolAtLocation(source);
  expect(symbol).toBeDefined();
  return checker.getExportsOfModule(symbol!);
}

function moduleExportNames(checker: ts.TypeChecker, source: ts.SourceFile): string[] {
  return moduleExports(checker, source)
    .map((symbol) => symbol.name)
    .sort();
}

function resolvedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function implementationModuleNames(chunk: OutputChunk): string[] {
  return Object.keys(chunk.modules)
    .filter((id) => id.startsWith(DIST_ROOT) && !id.endsWith('/index.js'))
    .map((id) => id.slice(DIST_ROOT.length + 1));
}

async function bundleLeaf(exportName: string): Promise<OutputChunk> {
  const entry = `virtual:${exportName}`;
  const bundle = await rollup({
    input: entry,
    external: (id) => id.startsWith('@flighthq/'),
    plugins: [
      {
        name: 'tauri-leaf-entry',
        load(id) {
          return id === entry
            ? `export { ${exportName} } from ${JSON.stringify(resolve(DIST_ROOT, 'index.js'))};`
            : null;
        },
        resolveId(id) {
          return id === entry ? id : null;
        },
      },
    ],
    treeshake: { moduleSideEffects: false },
  });
  try {
    const { output } = await bundle.generate({ format: 'es' });
    return output.find((entry): entry is OutputChunk => entry.type === 'chunk')!;
  } finally {
    await bundle.close();
  }
}
