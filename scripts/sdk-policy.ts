// Centralized inclusion/exclusion policy for the @flighthq/sdk barrel.
//
// Rule: every @flighthq/* workspace package is app-facing and must appear in the barrel,
// EXCEPT for the categories listed below.
//
// Consumed by:
//   - scripts/packages.ts (barrel sync check in packages:check)
//   - packages/sdk/src/completeness.test.ts (local completeness guard)

/**
 * Returns true for packages that must NOT appear in the @flighthq/sdk barrel.
 *
 * Excluded categories:
 *   - @flighthq/sdk itself (cannot re-export itself)
 *   - @flighthq/host-* adapter packages (not app-facing; installed in the host process)
 *   - @flighthq/tool-* harness/CI tooling packages (not app-facing; consumed by a build/test
 *     harness, may depend on Node/Playwright, never in a browser bundle — the dev/CI sibling
 *     of host-*: opt-in tooling primitives that a harness composes)
 *   - @flighthq/*-rs Rust wasm drop-ins (not TS API packages; mixable leaf crates)
 */
export function isSdkBarrelExcludedPackage(name: string): boolean {
  return (
    name === '@flighthq/sdk' ||
    name.startsWith('@flighthq/host-') ||
    name.startsWith('@flighthq/tool-') ||
    name.endsWith('-rs')
  );
}
