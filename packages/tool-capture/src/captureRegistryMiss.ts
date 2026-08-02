import { RenderRegistry } from '@flighthq/types/contract';

// Finds the registry misses a captured page reported that mean something did not draw.
//
// The render guards already emit an exact, actionable diagnostic for every miss — naming the kind, the
// registry, and the call that fixes it. But they emit at LogLevel.Warn, and a capture verdict counts
// only `pageerror` and `error`, so a miss has been structurally incapable of failing a render check.
// That gap is not hypothetical: a shape rasterizer became an explicit registration, all but one example
// went unmigrated, and the suite reported the resulting blank renders as warnings on green runs until a
// human noticed the pictures were wrong. The diagnostic was right and nothing read it.
//
// Only the registries whose absence MEANS UNDRAWN OUTPUT are collected, which is the distinction the
// guard messages already draw. `ShapeRasterizer` and `MaterialRenderer` both say "so it does not draw";
// `NodeRenderer` says only that a kind has no renderer, which is the ordinary case for a container that
// has no visual of its own — every example reports it for `DisplayObject`, correctly and harmlessly.
// Gating on that one would fail every target in the suite, so the filter is what makes this safe to
// gate rather than a second source of noise.
export interface CaptureRegistryMiss {
  kind: string;
  registry: RenderRegistry;
}

export function findUndrawnRegistryMisses(logs: readonly unknown[]): CaptureRegistryMiss[] {
  const misses: CaptureRegistryMiss[] = [];
  const seen = new Set<string>();
  for (const entry of logs) {
    // The log stream is whatever the page serialized, so an entry is not guaranteed to be an object at
    // all. This runs inside a failure verdict; throwing here would turn a reportable defect into a
    // crash that loses the rest of the run.
    const data = (entry as { data?: { kind?: unknown; registry?: unknown } } | null)?.data;
    if (data === undefined || data === null) continue;
    const { kind, registry } = data;
    if (typeof kind !== 'string' || typeof registry !== 'number') continue;
    if (!UNDRAWN_REGISTRIES.has(registry)) continue;
    // The page already dedupes with logOnce per state, but a target can drive more than one state, and
    // the same miss reported twice is one defect to report once.
    const key = `${registry}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    misses.push({ kind, registry: registry as RenderRegistry });
  }
  return misses;
}

export function formatUndrawnRegistryMisses(misses: readonly Readonly<CaptureRegistryMiss>[]): string {
  const described = misses.map((miss) => `${REGISTRY_NAMES[miss.registry] ?? miss.registry} for ${miss.kind}`);
  return `nothing drew: ${described.join(', ')} — the page log carries the exact call that registers it`;
}

const UNDRAWN_REGISTRIES: ReadonlySet<number> = new Set([
  RenderRegistry.MaterialRenderer,
  RenderRegistry.ShapeRasterizer,
]);

// The enum is numeric, so a raw value in a failure line would send a reader to the enum declaration to
// learn what failed.
const REGISTRY_NAMES: Readonly<Record<number, string>> = {
  [RenderRegistry.MaterialRenderer]: 'no material renderer',
  [RenderRegistry.ShapeRasterizer]: 'no shape rasterizer',
};
