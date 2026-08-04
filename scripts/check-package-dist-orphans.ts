import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const packagesDir = join(root, 'packages');

/** Finds generated distributions whose package manifest no longer exists. */
export function findOrphanedPackageDistDirectories(packagesDirectory: string): string[] {
  return readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDirectory, entry.name))
    .filter((packageDirectory) => {
      const distDirectory = join(packageDirectory, 'dist');
      return (
        !existsSync(join(packageDirectory, 'package.json')) &&
        existsSync(distDirectory) &&
        statSync(distDirectory).isDirectory()
      );
    })
    .map((packageDirectory) => join(packageDirectory, 'dist'))
    .sort();
}

export function formatOrphanedPackageDistError(directories: readonly string[], repositoryRoot: string): string {
  const paths = directories.map((directory) => `  - ${relative(repositoryRoot, directory)}`).join('\n');
  return [
    'Orphaned package build output detected:',
    paths,
    '',
    'These directories have dist/ output but no package.json. They can masquerade as live APIs',
    'in tools such as plain recursive grep (rg ignores generated output through .gitignore).',
    'Run `npm run clean` to remove dist and sibling TypeScript build metadata together.',
  ].join('\n');
}

function main(): void {
  const directories = findOrphanedPackageDistDirectories(packagesDir);
  if (directories.length === 0) return;
  console.error(formatOrphanedPackageDistError(directories, root));
  process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
