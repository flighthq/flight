import type { PathBooleanKernel } from './PathBooleanKernel.ts';
import type { RiveImportRegistry } from './RiveImportRegistry.ts';

/**
 * A Rive family registrar that needs nothing but the registry — the shape ten of the eleven shipped
 * registrars have.
 */
export type RiveRegistrar = (registry: RiveImportRegistry) => void;

/**
 * A Rive family registrar that also needs a path-boolean kernel.
 *
 * Separate from `RiveRegistrar` rather than folded into it with an optional argument, because the kernel is a
 * REAL DEPENDENCY the caller has to supply: a build that omits every registrar in this list never links a
 * path-boolean implementation, and that only stays true while the two kinds of registrar are told apart by
 * their type rather than by inspecting a function at run time.
 */
export type RivePathBooleanRegistrar = (
  pathBooleanKernel: Readonly<PathBooleanKernel>,
  registry: RiveImportRegistry,
) => void;

/**
 * Which Rive families an import installs.
 *
 * ★ TWO LISTS BECAUSE THE DEPENDENCIES DIFFER, NOT BECAUSE THE FAMILIES DO. Every entry here is one of the
 * shipped `registerRive*Handlers` functions, named by identity; what separates the lists is that
 * `pathBooleanRegistrars` are applied WITH a path-boolean kernel and `registrars` are applied without one. A
 * single list would either force every caller to supply a kernel they may not need, or hide the requirement
 * behind a run-time arity check — and the second is how a build ends up linking a path-boolean implementation
 * it never asked for.
 *
 * This is plain data: a list of function references and nothing else, so a generated manifest module can state
 * it as a literal. Applying it is a separate, explicit step (`applyRiveImportOptions`) — nothing is registered
 * by importing anything.
 *
 * Omitting a field runs no registrar of that kind. The full preset is `riveFullImportOptions`, which
 * reproduces what `registerAllRiveHandlers` installs.
 */
export interface RiveImportOptions {
  readonly pathBooleanRegistrars?: readonly RivePathBooleanRegistrar[];
  readonly registrars?: readonly RiveRegistrar[];
}
