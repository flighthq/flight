import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');

interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TsConfigBase {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
}

interface TsConfigBuild {
  references?: { path: string }[];
}

function stripJsonComments(text: string): string {
  let result = '';
  let i = 0;
  const len = text.length;
  while (i < len) {
    if (text[i] === '"') {
      result += text[i++];
      while (i < len) {
        if (text[i] === '\\') { result += text[i] + text[i + 1]; i += 2; }
        else if (text[i] === '"') { result += text[i++]; break; }
        else { result += text[i++]; }
      }
    } else if (text[i] === '/' && text[i + 1] === '/') {
      while (i < len && text[i] !== '\n') i++;
    } else if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < len && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += text[i++];
    }
  }
  return result;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(stripJsonComments(readFileSync(path, 'utf-8'))) as T;
  } catch {
    return null;
  }
}

function check(label: string, ok: boolean, detail?: string): boolean {
  if (ok) {
    console.log(`  ${pc.green('✓')} ${label}`);
  } else {
    console.log(`  ${pc.red('✗')} ${label}${detail ? pc.dim(` — ${detail}`) : ''}`);
  }
  return ok;
}

// --- load tsconfig.base.json paths ---

const tsconfigPath = join(root, 'tsconfig.base.json');
const tsconfig = readJson<TsConfigBase>(tsconfigPath);
const tsconfigPaths = tsconfig?.compilerOptions?.paths ?? {};

// --- load tsconfig.build.json references ---

const tsconfigBuildPath = join(root, 'tsconfig.build.json');
const tsconfigBuild = readJson<TsConfigBuild>(tsconfigBuildPath);
const buildRefs = new Set(
  (tsconfigBuild?.references ?? []).map((r) => r.path.replace(/^\.\/packages\//, '')),
);

// --- discover workspace packages ---

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join(packagesDir, e.name));

let totalErrors = 0;

for (const pkgDir of packageDirs) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  const pkg = readJson<PackageJson>(pkgJsonPath);

  if (!pkg || !pkg.name) {
    console.log(pc.yellow(`\nskip ${pkgDir} — no package.json or missing name`));
    continue;
  }

  const name = pkg.name;
  console.log(`\n${pc.bold(name)}`);

  let errors = 0;

  // required files
  const requiredFiles = ['vitest.config.ts', 'tsconfig.json', 'src/index.ts'];
  for (const rel of requiredFiles) {
    const ok = existsSync(join(pkgDir, rel));
    if (!check(rel, ok, `missing ${join(pkgDir, rel)}`)) errors++;
  }

  // tsconfig.base.json paths entries
  const pathKey = name;
  const pathWildKey = `${name}/*`;
  const hasPath = check(`${pathKey} in tsconfig.base.json paths`, pathKey in tsconfigPaths);
  const hasWildPath = check(`${pathWildKey} in tsconfig.base.json paths`, pathWildKey in tsconfigPaths);
  if (!hasPath) errors++;
  if (!hasWildPath) errors++;

  // tsconfig.build.json references
  const dirName = pkgDir.split(/[\\/]/).at(-1)!;
  const inBuild = check(`${dirName} in tsconfig.build.json references`, buildRefs.has(dirName));
  if (!inBuild) errors++;

  // workspace dependency version convention
  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.devDependencies,
  };
  for (const [dep, version] of Object.entries(allDeps)) {
    if (!dep.startsWith('@flighthq/')) continue;
    const ok = version === '*';
    if (!check(`${dep} uses "*"`, ok, `got "${version}"`)) errors++;
  }

  // exports / main (optional warning, not an error)
  const hasExports = pkg.exports !== undefined || pkg.main !== undefined || pkg.module !== undefined;
  if (!hasExports) {
    console.log(`  ${pc.dim('·')} ${pc.dim('no exports/main/module (optional)')}`);
  }

  totalErrors += errors;
}

console.log('');

if (totalErrors === 0) {
  console.log(pc.green(`✓ All packages valid`));
  process.exit(0);
} else {
  console.log(pc.red(`✗ ${totalErrors} error${totalErrors === 1 ? '' : 's'} found`));
  process.exit(1);
}
