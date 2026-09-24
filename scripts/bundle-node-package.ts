import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
//
// ★ THIS MUST RUN IN THE ROOT BUILD, NOT ONLY IN THE PACKAGE BUILD. Wiring it solely into each
// package's own `build`/`prepack` is not enough to make it reach the REGISTRY, and the difference is
// invisible locally: `npm pack` runs `prepack`, so a hand-built tarball is always correct. CI never
// takes that path. The root `build` is `tsc -b` alone, every publishing workflow feeds on its output,
// and `publish-packages.ts` publishes with `--ignore-scripts` — deliberately — so `prepack` never
// fires. A package bundled only by its own script therefore ships raw `tsc` output with extensionless
// relative specifiers, and every Node consumer gets ERR_MODULE_NOT_FOUND from a graph that builds,
// tests and packs green. That shipped: the fix was present in the repo for an entire release channel
// while every published artifact still carried the defect. Hence `--all`, invoked from the root build.
import { build } from 'esbuild';

/** Bundles one package's `index`/`contract`/`bin` entries in place. Returns the entries it wrote. */
export async function bundleNodePackage(packageRoot: string): Promise<readonly string[]> {
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
  return entries;
}

/**
 * The packages that need Node bundling, discovered from the one place that already declares it: their
 * own `build` script naming this file. Derived rather than listed so a fifth package cannot be added
 * to the build and silently left out of the sweep — the list and the truth cannot drift apart.
 */
export function findNodeBundledPackages(repoRoot: string): readonly string[] {
  const packagesDir = resolve(repoRoot, 'packages');
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(packagesDir, entry.name))
    .filter((dir) => {
      const manifestPath = resolve(dir, 'package.json');
      if (!existsSync(manifestPath)) return false;
      const scripts = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { scripts?: Record<string, string> }).scripts;
      return scripts?.build?.includes('bundle-node-package') === true;
    })
    .sort();
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.includes('--all')) {
    const packages = findNodeBundledPackages(repoRoot);
    // Sequential: esbuild already parallelizes each package's entries, and a serial outer loop keeps
    // the failing package obvious in the log rather than interleaved with three others.
    for (const packageRoot of packages) {
      const entries = await bundleNodePackage(packageRoot);
      process.stdout.write(`bundled ${entries.join(', ')} for Node in ${packageRoot.slice(repoRoot.length + 1)}\n`);
    }
    process.stdout.write(`bundled ${packages.length} Node-loaded package(s)\n`);
  } else {
    const entries = await bundleNodePackage(process.cwd());
    process.stdout.write(`bundled ${entries.join(', ')} for Node\n`);
  }
}
