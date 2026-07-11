// Capture-subject vocabulary and discovery: the tool set, the renderer id helpers, and the per-tool
// enumeration of (entry, renderers) pairs the capture pipeline drives.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { discoverFunctionalScenes } from './functionalScenes.js';

export const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;
export type Tool = 'examples' | 'functional';

export interface Entry {
  name: string;
  renderers: string[];
}

// A backend the environment cannot provide or sustain: WebGPU with no adapter/device, or a software
// adapter that loses its device mid-run under sustained per-frame GPU load. These are the only
// null-fingerprint / page-error outcomes that may be skipped rather than failed — the gate verifies
// backends where they exist and stays green on machines without them. A real render bug still fails:
// a validation error (bad writeBuffer/copy) is logged before the device dies, and is matched first.
// Shared with compare-render.ts so the smoke gate and the parity/regression gate agree on what counts
// as "unavailable".
export const BACKEND_UNAVAILABLE =
  /WebGPU adapter|WebGPU device|requestAdapter|requestDevice|GPUAdapter|WebGPU is not supported|external Instance reference no longer exists|device (was )?lost|device is lost/i;

export function discoverEntries(tool: Tool, root: string): Entry[] {
  // Functional scenes are flat files under functional/scenes/; the shared discovery is the single
  // source of truth (also used by tools/functional/vite.config.ts).
  if (tool === 'functional') return discoverFunctionalScenes(join(root, 'functional', 'scenes'));

  const dir = join(root, 'examples', 'packages');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => {
      const testDir = join(dir, name);
      const customRenderers = (RENDERERS as readonly string[]).filter((r) =>
        existsSync(join(testDir, `src/render.${r}.ts`)),
      );
      return { name, renderers: customRenderers };
    })
    .filter((e) => e.renderers.length > 0);
}

export function rendererMatchesFilter(renderer: string, filter: readonly string[]): boolean {
  if (filter.length === 0) return true;
  const backend = renderer.includes(':') ? renderer.slice(renderer.indexOf(':') + 1) : renderer;
  return filter.includes(renderer) || filter.includes(backend);
}

// A column id may carry a `<library>:<renderer>` colon; map it to a URL/dir-safe
// segment. Colon-free ids (canvas, webgl, …) pass through unchanged.
export function routeSegment(renderer: string): string {
  return renderer.replace(':', '-');
}
