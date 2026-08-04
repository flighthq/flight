import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptPath);
const root = resolve(__dirname, '..');
const packagesDir = resolve(root, 'packages');

/**
 * Removes generated distributions and build metadata together so the next build cannot trust one
 * without the other.
 */
export function cleanPackageBuildOutputs(directories: readonly string[]): void {
  for (const directory of directories) {
    const packageDir = resolve(directory);
    rmSync(join(packageDir, 'dist'), { recursive: true, force: true });
    for (const entry of readdirSync(packageDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) rmSync(join(packageDir, entry.name), { force: true });
    }
  }
}

function isPackageDirectory(directory: string): boolean {
  const pathFromPackages = relative(packagesDir, directory);
  return (
    pathFromPackages !== '' &&
    pathFromPackages !== '..' &&
    !pathFromPackages.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromPackages)
  );
}

function main(): void {
  const cwd = resolve(process.cwd());
  if (cwd === root) {
    const directories = readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(packagesDir, entry.name));
    cleanPackageBuildOutputs(directories);
    return;
  }
  if (!isPackageDirectory(cwd)) {
    throw new Error(`clean-package-dist must be run from the repository root or a package under ${packagesDir}`);
  }
  if (!existsSync(join(cwd, 'package.json'))) {
    throw new Error(`clean-package-dist must be run from a package directory with package.json`);
  }
  cleanPackageBuildOutputs([cwd]);
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
