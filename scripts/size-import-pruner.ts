import { dirname, resolve } from 'path';
import { Node, Project } from 'ts-morph';
import { fileURLToPath } from 'url';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

import { workspacePackages } from './workspaces';

interface ExportTarget {
  importedName: string;
  sourcePath: string;
}

export function createSizeImportPruner(): Plugin {
  // Package checks enforce side-effect-free workspace modules, so the size harness can
  // preserve each named SDK binding while skipping barrels that Rollup would otherwise
  // parse again for every fixture/renderer pair.
  const exportTargets = getSdkExportTargets();

  return {
    name: 'size-import-pruner',
    enforce: 'pre',
    resolveId(id) {
      if (!id.startsWith(DIRECT_IMPORT_PREFIX)) return null;
      return normalizePath(decodeURIComponent(id.slice(DIRECT_IMPORT_PREFIX.length)));
    },
    transform(code) {
      if (!code.includes(SDK_IMPORT_SOURCE)) return null;

      const rewritten = code.replace(
        SDK_IMPORT_PATTERN,
        (_statement, typeKeyword: string | undefined, specifierText: string) =>
          rewriteSdkImport(specifierText, typeKeyword !== undefined, exportTargets),
      );

      return rewritten === code ? null : { code: rewritten, map: null };
    },
  };
}

function getSdkExportTargets(): ReadonlyMap<string, Readonly<ExportTarget>> {
  if (sdkExportTargets) return sdkExportTargets;

  const sdk = workspacePackages.find((pkg) => pkg.name === SDK_IMPORT_SOURCE);
  if (!sdk) throw new Error(`Could not find ${SDK_IMPORT_SOURCE} in the workspace`);

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tsconfig.json'),
  });
  const sdkBarrel = project.addSourceFileAtPath(sdk.src);
  const targets = new Map<string, Readonly<ExportTarget>>();

  for (const [exportedName, declarations] of sdkBarrel.getExportedDeclarations()) {
    const declaration = declarations[0];
    if (!declaration) continue;

    const importedName = Node.hasName(declaration) ? declaration.getName() : declaration.getSymbol()?.getName();
    if (typeof importedName !== 'string') continue;

    targets.set(exportedName, {
      importedName,
      sourcePath: declaration.getSourceFile().getFilePath(),
    });
  }

  sdkExportTargets = targets;
  return targets;
}

function rewriteSdkImport(
  specifierText: string,
  isTypeOnlyImport: boolean,
  exportTargets: ReadonlyMap<string, Readonly<ExportTarget>>,
): string {
  const importsByTarget = new Map<string, { isTypeOnly: boolean; specifiers: string[] }>();

  for (const rawSpecifier of specifierText.split(',')) {
    const trimmed = rawSpecifier.trim();
    if (!trimmed) continue;

    const hasTypeKeyword = trimmed.startsWith('type ');
    const isTypeOnlySpecifier = isTypeOnlyImport || hasTypeKeyword;
    const specifier = hasTypeKeyword ? trimmed.slice('type '.length).trim() : trimmed;
    const [exportedName, localName = exportedName] = specifier.split(/\s+as\s+/);
    const target = exportTargets.get(exportedName);
    if (!target) {
      throw new Error(`Could not resolve ${exportedName} from ${SDK_IMPORT_SOURCE} in import { ${specifierText} }`);
    }

    const key = `${isTypeOnlySpecifier ? 'type' : 'value'}:${target.sourcePath}`;
    const group = importsByTarget.get(key) ?? { isTypeOnly: isTypeOnlySpecifier, specifiers: [] };
    group.specifiers.push(
      target.importedName === localName ? target.importedName : `${target.importedName} as ${localName}`,
    );
    importsByTarget.set(key, group);
  }

  return [...importsByTarget.entries()]
    .map(([key, group]) => {
      const sourcePath = key.slice(key.indexOf(':') + 1);
      const directImportId = DIRECT_IMPORT_PREFIX + encodeURIComponent(sourcePath);
      return `import${group.isTypeOnly ? ' type' : ''} { ${group.specifiers.join(', ')} } from ${JSON.stringify(
        directImportId,
      )};`;
    })
    .join('\n');
}

const DIRECT_IMPORT_PREFIX = 'virtual:flight-size-export:';
const SDK_IMPORT_PATTERN = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+(['"])@flighthq\/sdk\3\s*;?/g;
const SDK_IMPORT_SOURCE = '@flighthq/sdk';

let sdkExportTargets: ReadonlyMap<string, Readonly<ExportTarget>> | null = null;
