import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Bundles a Node-LOADED package's entry points into self-contained ESM.
//
// WHY THIS EXISTS. Every other package in this repo is consumed by a BUNDLER — Vite, Rollup, esbuild —
// and bundlers resolve extensionless relative specifiers happily. That is why 12,000-odd of them across
// the workspace have never caused trouble, and why the repo's convention is to write imports without
// extensions.
//
// A handful of packages are loaded by NODE instead: the `tool-*` CLIs run as `bin` scripts, and
// `vite-plugin-manifest` is imported by a `vite.config.ts`, which Node executes before any bundling
// happens. Node's ESM resolver requires fully-specified paths, so it rejects the repo's own convention.
//
// Adding `.js` to those packages does NOT fix it: Node resolves the whole TRANSITIVE graph, so the
// failure just moves one hop into their dependencies. Making it work that way means converting the
// entire workspace. Bundling instead leaves no relative specifier for Node to resolve at all, so the
// source convention stays intact everywhere and only these few packages get a different build step.
//
// Type declarations are untouched: `tsc -b` writes the `.d.ts` files and this only replaces the `.js`.
import { build } from 'esbuild';

const packageRoot = process.cwd();
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

// Workspace packages are INLINED — they are the ones carrying extensionless specifiers, and inlining
// them is the whole point. Everything else stays external: a peer like `vite` must resolve to the
// host project's copy, not to a second one baked in here.
const external = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).filter(
  (name) => !name.startsWith('@flighthq/'),
);

// No shebang banner: esbuild preserves the one the entry file already carries, and adding a second
// leaves an invalid line 2 that Node rejects outright.
const entries = ['index', 'contract', 'bin'].filter((name) => existsSync(resolve(packageRoot, 'src', `${name}.ts`)));

await Promise.all(
  entries.map((name) =>
    build({
      bundle: true,
      entryPoints: [resolve(packageRoot, 'src', `${name}.ts`)],
      external,
      format: 'esm',
      // Match the repo's target rather than esbuild's default, so bundling changes reachability only.
      logLevel: 'warning',
      outfile: resolve(packageRoot, 'dist', `${name}.js`),
      platform: 'node',
      sourcemap: true,
      target: 'node20',
    }),
  ),
);

process.stdout.write(`bundled ${entries.join(', ')} for Node\n`);
