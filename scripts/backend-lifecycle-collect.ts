import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// The census's file-walking collectors. They live here, beside the report builder, because BOTH the
// gate and the test need them: leaving them in the test file meant the only way to run this census was
// to run vitest, which is why it sat outside `npm run check` and a wrong slice could pass unnoticed.

// Every exported `set*Backend` in the repo, mapped to its body text.
export function collectSetterBodies(): ReadonlyMap<string, string> {
  const bodies = new Map<string, string>();
  for (const packageName of packageNames()) {
    for (const file of packageSourceFiles(packageName)) {
      const text = readFileSync(file, 'utf-8');
      const pattern = /^export function (set\w*Backend|destroy[A-Z]\w*)\([^)]*\)[^{]*\{/gm;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const open = text.indexOf('{', match.index);
        let depth = 0;
        let end = open;
        for (; end < text.length; end++) {
          if (text[end] === '{') depth++;
          else if (text[end] === '}' && --depth === 0) break;
        }
        bodies.set(match[1], text.slice(open + 1, end));
      }
    }
  }
  return bodies;
}
// Every top-level function body in the repo's package sources, so the census can follow a setter into the
// helper it delegates teardown to.
export function collectFunctionBodies(): ReadonlyMap<string, string> {
  const bodies = new Map<string, string>();
  for (const packageName of packageNames()) {
    for (const file of packageSourceFiles(packageName)) {
      const text = readFileSync(file, 'utf-8');
      const pattern = /^(?:export )?function (\w+)\([^)]*\)[^{]*\{/gm;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const open = text.indexOf('{', match.index);
        let depth = 0;
        let end = open;
        for (; end < text.length; end++) {
          if (text[end] === '{') depth++;
          else if (text[end] === '}' && --depth === 0) break;
        }
        bodies.set(match[1], text.slice(open + 1, end));
      }
    }
  }
  return bodies;
}
export function packageNames(): string[] {
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'packages', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}
export function packageSourceFiles(packageName: string): string[] {
  const sourceDir = join(ROOT, 'packages', packageName, 'src');
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => join(sourceDir, entry.name));
}
