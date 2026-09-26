import { createRequirementSet } from '@flighthq/requirement/contract';
import type { ImportDiagnostic, Requirement, RequirementSet, RiveImportRegistry } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectRiveCoreTypeCounts } from './riveCoreTypeCensus.ts';
import { getRiveCoreTypeName, getRiveCoreTypeParent } from './riveCoreTypes.ts';
import { registerAllRiveHandlers } from './riveHandlers.ts';
import { createRiveImportRegistry } from './riveImportRegistry.ts';

/** The namespace every Rive `document.format` requirement key carries. */
export const RIVE_REQUIREMENT_KEY_NAMESPACE = 'riv';

/**
 * Build-time inventory of what one `.riv` file asks a build to support: one `document.format` requirement per
 * distinct handler family the file's objects actually resolve to.
 *
 * ★ KEYED BY THE FAMILY A TYPE RESOLVES TO, NOT BY THE TYPE PRESENT IN THE FILE. Rive behaviour is inherited
 * and `getRiveCoreObjectHandler` walks the ancestor chain, so the family that reads an object is usually not
 * named by the object's own type. Rectangle's chain is the one to keep in mind, because it is not the obvious
 * one: Rectangle -> ParametricPath -> Path -> Node -> ... , so a file full of Rectangles is read by the PATH
 * family, not by Shape. Emitting `riv.Rectangle` would name something no implementation claims and no row
 * could satisfy, turning a correctly-handled file into a reported gap. This resolves the chain the same way
 * the importer does, so the inventory answers the question a build actually has: which families to register.
 *
 * A type that reaches NO registered ancestor keeps its own name (`riv.<TypeName>`, or a stable
 * `Unknown(<key>)` label for a key this object model does not define). That is deliberate: such an object is
 * one this import does not read, and it must surface as a gap rather than resolve to a family that would not
 * have handled it.
 *
 * ★ THE FAMILY ROOTS COME FROM THE SHIPPED REGISTRARS, NEVER A TRANSCRIBED TABLE. `registerAllRiveHandlers`
 * installs them, so the set is read back off a throwaway registry — which means a family that gains or loses a
 * core type changes this inventory on the same edit, and a hand-copied list of 368 object-model keys never
 * exists to fall out of date. The kernel argument is irrelevant to WHICH keys are registered, so a stub stands
 * in for it: nothing here imports or runs a path-boolean implementation.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseRiveRequirements(source: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): RequirementSet {
  const counts = collectRiveCoreTypeCounts(source, diagnostics);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    const families = new Set<string>();
    for (const typeKey of counts.keys()) families.add(resolveRiveFamilyName(typeKey));
    for (const family of [...families].sort()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${RIVE_REQUIREMENT_KEY_NAMESPACE}.${family}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}

/**
 * The core type keys the shipped families register, read back off a throwaway registry.
 *
 * Built once per call rather than cached in module state: a module-level cache would be shared mutable state,
 * and building it is a handful of Map writes.
 */
function riveFamilyRootKeys(): ReadonlySet<number> {
  const registry: RiveImportRegistry = createRiveImportRegistry();
  // The clipping family takes a path-boolean kernel it stores for later use. Which KEYS get registered does not
  // depend on it, so a stub keeps this free of a real kernel and of the packages behind one.
  registerAllRiveHandlers(RIVE_KERNEL_STUB, registry);
  return new Set(registry.handlers.keys());
}

// Resolves one present core type to the family that would read it, by the same ancestor walk the registry does.
function resolveRiveFamilyName(typeKey: number): string {
  const roots = riveFamilyRootKeys();
  let current: number | undefined = typeKey;
  while (current !== undefined && current !== RIVE_NO_PARENT) {
    if (roots.has(current)) return getRiveCoreTypeName(current) ?? unknownRiveTypeName(current);
    current = getRiveCoreTypeParent(current);
  }
  return getRiveCoreTypeName(typeKey) ?? unknownRiveTypeName(typeKey);
}

function unknownRiveTypeName(typeKey: number): string {
  return `Unknown(${typeKey})`;
}

// Mirrors the object model's root marker, which `getRiveCoreTypeParent` returns for a type with no parent.
const RIVE_NO_PARENT = -1;

// Only stored by the clipping registrar, never invoked while collecting registrations.
const RIVE_KERNEL_STUB = {} as Parameters<typeof registerAllRiveHandlers>[0];
