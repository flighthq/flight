import type {
  NonEntityCreateResult,
  PathBooleanKernel,
  RiveImportOptions,
  RiveImportRegistry,
  RivePathBooleanRegistrar,
  RiveRegistrar,
} from '@flighthq/types/contract';

import { registerRiveAnimationHandlers } from './riveAnimation.ts';
import { registerRiveAssetHandlers } from './riveAssets.ts';
import { registerRiveClippingHandlers } from './riveClipping.ts';
import { registerRiveDrawOrderHandlers } from './riveDrawOrder.ts';
import { createRiveImportRegistry } from './riveImportRegistry.ts';
import { registerRiveLayoutHandlers } from './riveLayout.ts';
import { registerRiveShapeHandlers } from './riveShapeNode.ts';
import { registerRivePaintHandlers } from './riveShapePaint.ts';
import { registerRivePathHandlers } from './riveShapePath.ts';
import { registerRiveSkeletonHandlers } from './riveSkeleton.ts';
import { registerRiveSoloHandlers } from './riveSolo.ts';
import { registerRiveStateMachineHandlers } from './riveStateMachine.ts';
import { registerRiveTextHandlers } from './riveText.ts';

/**
 * Every Rive family registrar that needs only the registry, in the order `registerAllRiveHandlers` applies
 * them.
 *
 * ★ ORDER IS PART OF THE IMPORT. `RiveImportRegistry` documents that insertion order is the order
 * `applyArtboard` and `applyDocument` run in, so a family's place in this list fixes its place in the passes.
 * It matches `registerAllRiveHandlers` exactly, which is what makes naming the full preset equivalent to
 * calling that function.
 */
export const riveAllRegistrars: readonly RiveRegistrar[] = [
  registerRivePathHandlers,
  registerRivePaintHandlers,
  registerRiveTextHandlers,
  registerRiveAssetHandlers,
  registerRiveDrawOrderHandlers,
  registerRiveSoloHandlers,
  registerRiveShapeHandlers,
  registerRiveSkeletonHandlers,
  registerRiveLayoutHandlers,
  registerRiveStateMachineHandlers,
  // Last, matching `registerAllRiveHandlers`: a keyframe composes a delta from the skeleton's setup pose and the clip
  // reader reads the shape rebuilds, so both must already be in the context when this pass runs.
  registerRiveAnimationHandlers,
];

/**
 * Every Rive family registrar that also needs a path-boolean kernel.
 *
 * Only clipping needs one today, and it is still a list rather than a single value: the kernel-dependent set is
 * a category, and a second family needing one should extend a list rather than change a signature.
 */
export const riveAllPathBooleanRegistrars: readonly RivePathBooleanRegistrar[] = [registerRiveClippingHandlers];

/**
 * The full-support preset, as plain options data.
 *
 * Naming this is equivalent to calling `registerAllRiveHandlers`, and it is what a caller who wants every
 * family passes instead of assembling the two lists. A caller who wants a subset names the registrars they
 * want; the families they leave out — and the packages behind them — never link.
 */
export const riveFullImportOptions: Readonly<RiveImportOptions> = {
  pathBooleanRegistrars: riveAllPathBooleanRegistrars,
  registrars: riveAllRegistrars,
};

/**
 * Applies one set of import options to a registry.
 *
 * ★ THE SEAM IS EXPLICIT AND NOTHING REGISTERS ON IMPORT. Rive's options are a list of function references, so
 * SOMETHING has to call them; doing that at module scope would make importing a manifest mutate a registry,
 * which is the pattern this repository bans outright (`sideEffects: false`). So the options stay inert data and
 * this function is the one place they are applied — a caller can see, in their own code, the moment their
 * registry gains handlers.
 *
 * The kernel is a separate argument rather than a field of the options, mirroring
 * `registerRiveClippingHandlers` itself: it is a dependency the host supplies, not a choice about which
 * families to install, and keeping it out of the options is what lets the options be a static literal a
 * generated module can state.
 *
 * ★ KERNEL-DEPENDENT REGISTRARS ARE APPLIED FIRST, and that order is not arbitrary. Insertion order IS pass
 * order, and in `registerAllRiveHandlers` the clipping family's artboard pass runs FIRST of all the artboard
 * passes — before draw order, solo, shape, skeleton, layout and the state machine. Applying the registry-only
 * list first would move clipping to last, so every other pass would see an unclipped artboard and clipping
 * would then run after draw order had already resolved. That is a silent behaviour change, and I only found it
 * by comparing the two insertion orders rather than assuming a subset was a reordering of the same parse.
 *
 * The invariant the test locks is PASS order, not raw insertion order — the two differ here and only the
 * first is observable. Kernel-first puts ClippingShape's key ahead of the others in the map, where
 * `registerAllRiveHandlers` inserts it fifth; but the families registered before it there contribute no
 * artboard pass, so both registries run the same artboard sequence and the same document sequence. I checked
 * insertion order first, saw it differ, and had to look at what the registry contract actually governs.
 *
 * Today the rule works because clipping is the earliest pass. A future kernel-dependent family belonging
 * elsewhere in the sequence will fail that equivalence test rather than quietly land in the wrong place.
 */
export function applyRiveImportOptions(
  options: Readonly<RiveImportOptions>,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  registry: RiveImportRegistry,
): void {
  for (const registrar of options.pathBooleanRegistrars ?? []) registrar(pathBooleanKernel, registry);
  for (const registrar of options.registrars ?? []) registrar(registry);
}

/**
 * Builds a registry from one set of import options.
 *
 * The convenience half of the seam, for the common case where a caller wants a registry carrying exactly the
 * families their content needs and nothing else.
 *
 * Returns a `descriptor` rather than an Entity, matching `createRiveImportRegistry`: a registry is dispatch
 * infrastructure — a plain table of handlers — and this repository keeps that outside the Entity boundary.
 */
export function createRiveImportRegistryFromOptions(
  options: Readonly<RiveImportOptions>,
  pathBooleanKernel: Readonly<PathBooleanKernel>,
): NonEntityCreateResult<RiveImportRegistry, 'descriptor'> {
  const registry: RiveImportRegistry = createRiveImportRegistry();
  applyRiveImportOptions(options, pathBooleanKernel, registry);
  return registry;
}
