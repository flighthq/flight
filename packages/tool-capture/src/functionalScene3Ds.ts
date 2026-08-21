// Functional scene discovery — the single source of truth shared by the functional Vite harness
// (tools/functional/vite.config.ts) and the capture pipeline (discoverEntries).
//
// A scene is a file under functional/scenes/. Its filename encodes its backend set:
//   <name>.ts               backend-agnostic — one file that runs on every default backend.
//   <name>.<backend>.ts     backend-specific — a self-contained target for that one backend.
// A backend-specific file may override one leg of a backend-agnostic scene without removing the other
// default backends; with no backend-agnostic file, the specific files are the scene's complete backend set.
// The backend a comparison groups by is the `<name>`; the set of backends a name runs on is simply
// which files exist. There is no package.json and no renderers[] field: existence is the manifest.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const FUNCTIONAL_BACKENDS = ['canvas', 'dom', 'webgl', 'webgpu'] as const;
export type FunctionalBackend = (typeof FUNCTIONAL_BACKENDS)[number];

export interface FunctionalScene3D {
  name: string;
  renderers: string[];
}

// Every scene grouped by name, each with the sorted backend set it runs on. A no-suffix file supplies all
// default backends even when one or more have a specific-file override. Without it, the specific files are
// the complete backend set.
export function discoverFunctionalScene3Ds(scenesDir: string): FunctionalScene3D[] {
  if (!existsSync(scenesDir)) return [];
  const agnostic = new Set<string>();
  const specific = new Map<string, Set<string>>();

  for (const file of readdirSync(scenesDir)) {
    const parsed = parseScene3DFile(file);
    if (parsed === null) continue;
    if (parsed.backend === null) {
      agnostic.add(parsed.name);
    } else {
      if (!specific.has(parsed.name)) specific.set(parsed.name, new Set());
      specific.get(parsed.name)!.add(parsed.backend);
    }
  }

  const scenes: FunctionalScene3D[] = [];
  for (const name of agnostic) scenes.push({ name, renderers: [...DEFAULT_BACKENDS] });
  for (const [name, backends] of specific) {
    if (agnostic.has(name)) continue; // a no-suffix file wins if both somehow exist
    scenes.push({ name, renderers: DEFAULT_BACKENDS.filter((b) => backends.has(b)) });
  }
  return scenes.sort((a, b) => a.name.localeCompare(b.name));
}

export type FunctionalTestRouteResult =
  | { readonly kind: 'serve'; readonly test: Readonly<FunctionalScene3D> }
  | { readonly kind: 'unavailable'; readonly scene: Readonly<FunctionalScene3D> }
  | { readonly kind: 'unknown' };

// The scene file backing one capture target: the backend-specific file when it exists, else the
// backend-agnostic file.
export function functionalScene3DFile(scenesDir: string, name: string, backend: string): string {
  const specific = join(scenesDir, `${name}.${backend}.ts`);
  return existsSync(specific) ? specific : join(scenesDir, `${name}.ts`);
}

export function resolveFunctionalTestRoute(
  tests: readonly Readonly<FunctionalScene3D>[],
  name: string,
  renderer: string,
): FunctionalTestRouteResult {
  const test = tests.find((t) => t.name === name && t.renderers.includes(renderer));
  if (test) return { kind: 'serve', test };
  const scene = tests.find((t) => t.name === name);
  if (scene) return { kind: 'unavailable', scene };
  return { kind: 'unknown' };
}

function parseScene3DFile(file: string): { name: string; backend: FunctionalBackend | null } | null {
  if (!file.endsWith('.ts')) return null;
  const stem = file.slice(0, -'.ts'.length);
  const dot = stem.lastIndexOf('.');
  if (dot !== -1) {
    const suffix = stem.slice(dot + 1);
    if ((FUNCTIONAL_BACKENDS as readonly string[]).includes(suffix)) {
      return { name: stem.slice(0, dot), backend: suffix as FunctionalBackend };
    }
  }
  return { name: stem, backend: null };
}

// The backends a backend-agnostic (no-suffix) scene runs on, in capture order.
const DEFAULT_BACKENDS: FunctionalBackend[] = ['dom', 'canvas', 'webgl', 'webgpu'];
