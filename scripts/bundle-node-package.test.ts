import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findNodeBundledPackages } from './bundle-node-package';

// These tests exist because of a defect that every other gate was blind to. `vite-plugin-manifest`
// and the three `tool-*` CLIs are loaded by NODE, so their built entries must carry no extensionless
// relative specifiers. The bundling step that guarantees that was wired ONLY into each package's own
// `build`/`prepack`. Locally that looks complete — `npm pack` runs `prepack`, so a hand-built tarball
// is always correct, and the packed artifact imports cleanly under Node.
//
// CI never takes that path. The root `build` was `tsc -b` alone, all three publishing workflows feed
// on its output, and `publish-packages.ts` publishes with `--ignore-scripts`, so `prepack` never runs.
// Every published artifact therefore shipped raw `tsc` output and failed with ERR_MODULE_NOT_FOUND in
// Node, while the repo built, tested and packed green for a whole release channel.
//
// So the assertions below pin the WIRING, not the output. A test that inspected `dist/` would need a
// build to have happened and would pass against a locally-built tree — the exact blind spot that let
// this ship.
const repoRoot = join(import.meta.dirname, '..');

function rootScripts(): Record<string, string> {
  return (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> })
    .scripts;
}

describe('bundleNodePackage wiring', () => {
  it('runs the sweep from the ROOT build, which is the only path CI takes', () => {
    const build = rootScripts().build;
    expect(build).toContain('bundle-node-package.ts --all');
    // Ordering matters: esbuild reads what `tsc -b` emitted, so a sweep placed first would bundle a
    // stale or absent dist.
    expect(build.indexOf('tsc -b')).toBeLessThan(build.indexOf('bundle-node-package.ts'));
  });

  it('cannot rely on prepack, because publishing deliberately ignores lifecycle scripts', () => {
    // The reason the assertion above is load-bearing. If this ever stops being true, the coupling has
    // changed and the root-build requirement should be re-argued rather than silently kept.
    const publish = readFileSync(join(repoRoot, 'scripts', 'publish-packages.ts'), 'utf8');
    expect(publish).toContain('--ignore-scripts');
  });

  it('discovers the Node-loaded packages from their own build scripts, finding a non-empty set', () => {
    const found = findNodeBundledPackages(repoRoot).map((dir) => dir.slice(join(repoRoot, 'packages').length + 1));
    expect(found.length).toBeGreaterThan(0);
    // Every package the sweep picks up must genuinely declare the bundler — no over-collection.
    for (const name of found) {
      const scripts = (
        JSON.parse(readFileSync(join(repoRoot, 'packages', name, 'package.json'), 'utf8')) as {
          scripts: Record<string, string>;
        }
      ).scripts;
      expect(scripts.build).toContain('bundle-node-package');
    }
  });

  // ★ GROUND TRUTH THE SWEEP DID NOT DERIVE. Discovery reads the `build` script, so a test that
  // re-derived the expected set the same way would agree with itself no matter what: delete the
  // declaration from a package and both sides shrink together, green. A `bin` is the independent
  // signal — it is npm's own statement that NODE EXECUTES this file, which is precisely the condition
  // that makes extensionless specifiers fatal. This is not hypothetical: it is how `tool-capture` was
  // caught shipping a `bin` that died with ERR_MODULE_NOT_FOUND.
  it('requires every package npm exposes as a bin to be bundled, since Node executes it directly', () => {
    const packagesDir = join(repoRoot, 'packages');
    const swept = new Set(findNodeBundledPackages(repoRoot).map((dir) => dir.slice(packagesDir.length + 1)));
    const binPackages = readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const manifest = join(packagesDir, entry.name, 'package.json');
        if (!existsSync(manifest)) return false;
        return (JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: unknown }).bin !== undefined;
      })
      .map((entry) => entry.name);

    expect(binPackages.length).toBeGreaterThan(0);
    expect(binPackages.filter((name) => !swept.has(name))).toEqual([]);
  });

  // The one member with no `bin` to betray it: Vite loads this from a `vite.config.ts`, which Node
  // executes before any bundling happens. Named explicitly because no manifest field marks it.
  it('bundles vite-plugin-manifest, which Node loads from a vite config rather than as a bin', () => {
    const swept = findNodeBundledPackages(repoRoot).map((dir) => dir.slice(join(repoRoot, 'packages').length + 1));
    expect(swept).toContain('vite-plugin-manifest');
  });
});
