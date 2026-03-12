import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const packagesDir = path.join(root, 'packages');

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const results: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const pkgJson = path.join(full, 'package.json');

      if (fs.existsSync(pkgJson)) {
        results.push(full);
      }

      results.push(...walk(full));
    }
  }

  return results;
}

export const packageDirs = walk(packagesDir);

export const workspacePackages = packageDirs.map((dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));

  return {
    name: pkg.name,
    dir,
    src: path.join(dir, 'src/index.ts'),
  };
});
