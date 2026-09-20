import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

const RENDERER_PACKAGES = [
  'scene3d-gl',
  'scene3d-wgpu',
  'scene2d-gl',
  'scene2d-wgpu',
  'scene2d-canvas',
  'scene2d-dom',
  'effects-gl',
  'effects-wgpu',
  'effects-canvas',
];

const USER_FACING_PATTERNS = [
  /^default\w+Renderer$/,
  /^default\w+RenderRegistries$/,
  /\w+MeshMaterialRenderer$/,
  /^standard\w+MaterialRenderer$/,
  /^register\w+Material\w*$/,
  /^register\w+Effect\w*$/,
  /^register\w+Extension$/,
  /^registerBuiltIn\w+/,
  /^register\w+MeshMaterialRenderer$/,
  /^register\w+ModifierSnippet$/,
  /^register\w+RenderEffect$/,
  /^register\w+MaterialRenderer$/,
  /^enable\w+Guards$/,
  /^are\w+GuardsEnabled$/,
  /^explain\w+/,
  /^has\w+Coverage$/,
  /\w+ModifierSnippet$/,
  /^get\w+MeshMaterialRenderer$/,
  /^resolve\w+MeshMaterialRenderer$/,
  /^get\w+RenderEffectRunner$/,
  /^has\w+RenderEffectRunner$/,
  /^is\w+Resolvable$/,
  /^get\w+MaterialRenderer$/,
  /^resolve\w+MaterialRenderer$/,
  /^get\w+CustomMaterialShaderSource$/,
  /^resolve\w+ModifierSnippet$/,
  /^present\w+Scene\d+D$/,
];

function getContractExportedNames(pkgDir: string): Set<string> {
  const contractPath = join(pkgDir, 'contract.ts');
  const contractSource = readFileSync(contractPath, 'utf8');
  const names = new Set<string>();

  const moduleRe = /export \* from '\.\/([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = moduleRe.exec(contractSource)) !== null) {
    const moduleName = match[1];
    const filePath = join(pkgDir, `${moduleName}.ts`);
    try {
      const source = readFileSync(filePath, 'utf8');
      const exportRe = /export (?:const|function|let) (\w+)/g;
      let exportMatch: RegExpExecArray | null;
      while ((exportMatch = exportRe.exec(source)) !== null) {
        names.add(exportMatch[1]);
      }
    } catch {
      // file might not exist or be a directory re-export
    }
  }
  return names;
}

function getIndexExportedNames(pkgDir: string): Set<string> {
  const indexPath = join(pkgDir, 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');
  const names = new Set<string>();

  const namedRe = /\b([a-zA-Z_]\w+)\b(?=\s*[,}])/g;
  let match: RegExpExecArray | null;
  while ((match = namedRe.exec(indexSource)) !== null) {
    const name = match[1];
    if (name !== 'export' && name !== 'from' && name !== 'contract') {
      names.add(name);
    }
  }
  return names;
}

function isUserFacing(name: string): boolean {
  return USER_FACING_PATTERNS.some((p) => p.test(name));
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const violations: { pkg: string; name: string }[] = [];

  for (const pkg of RENDERER_PACKAGES) {
    const pkgDir = join(root, 'packages', pkg, 'src');

    let contractNames: Set<string>;
    let indexNames: Set<string>;
    try {
      contractNames = getContractExportedNames(pkgDir);
      indexNames = getIndexExportedNames(pkgDir);
    } catch {
      continue;
    }

    for (const name of contractNames) {
      if (isUserFacing(name) && !indexNames.has(name)) {
        violations.push({ pkg, name });
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      pc.green('OK'),
      `User-facing renderer exports are public across all ${RENDERER_PACKAGES.length} renderer packages`,
    );
    return;
  }

  console.log(pc.red(`${violations.length} user-facing export(s) are contract-only but should be public:`));
  for (const v of violations) {
    console.log(`  ${pc.red('✗')} ${v.pkg} ${pc.dim('·')} ${v.name}`);
  }
  console.log();
  console.log(pc.dim('Add the missing names to the package index.ts cherry-pick from contract.ts.'));
  process.exitCode = 1;
}

main();
