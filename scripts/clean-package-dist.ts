import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const packagesDir = resolve(root, 'packages');
const cwd = resolve(process.cwd());
const packageJsonPath = join(cwd, 'package.json');

if (!cwd.startsWith(packagesDir + '\\') && !cwd.startsWith(packagesDir + '/')) {
  throw new Error(`clean-package-dist must be run from a package under ${packagesDir}`);
}

if (!existsSync(packageJsonPath)) {
  throw new Error(`clean-package-dist must be run from a package directory with package.json`);
}

rmSync(join(cwd, 'dist'), { recursive: true, force: true });
