import type {
  Kind,
  NonEntityCreateResult,
  RequirementCatalog,
  RequirementCatalogEntry,
  RequirementFacet,
} from '@flighthq/types/contract';

export function createRequirementCatalog(
  entries: readonly Readonly<RequirementCatalogEntry>[] = [],
): NonEntityCreateResult<RequirementCatalog, 'descriptor'> {
  return { entries: entries.map(copyCatalogEntry) };
}

export function findRequirementCatalogEntries(
  catalog: Readonly<RequirementCatalog>,
  backend: string,
  facet: RequirementFacet,
  kind: Kind,
): readonly RequirementCatalogEntry[] {
  return catalog.entries
    .filter((entry) => entry.backend === backend && entry.facet === facet && entry.kind === kind)
    .map(copyCatalogEntry);
}

export function getRequirementCatalogEntries(
  catalog: Readonly<RequirementCatalog>,
): readonly RequirementCatalogEntry[] {
  return catalog.entries.map(copyCatalogEntry);
}

// The row identity includes the registrar. One requirement may need multiple registrations, so adding a
// distinct registrar appends instead of replacing another call for the same backend/facet/kind.
export function registerRequirementCatalogEntry(
  catalog: RequirementCatalog,
  entry: Readonly<RequirementCatalogEntry>,
): void {
  const index = catalog.entries.findIndex(
    (candidate) => requirementCatalogEntryIdentity(candidate) === requirementCatalogEntryIdentity(entry),
  );
  const copy = copyCatalogEntry(entry);
  if (index === -1) catalog.entries.push(copy);
  else catalog.entries[index] = copy;
}

export function unregisterRequirementCatalogEntry(
  catalog: RequirementCatalog,
  entry: Readonly<RequirementCatalogEntry>,
): boolean {
  const identity = requirementCatalogEntryIdentity(entry);
  const index = catalog.entries.findIndex((candidate) => requirementCatalogEntryIdentity(candidate) === identity);
  if (index === -1) return false;
  catalog.entries.splice(index, 1);
  return true;
}

function copyCatalogEntry(entry: Readonly<RequirementCatalogEntry>): RequirementCatalogEntry {
  return {
    backend: entry.backend,
    facet: entry.facet,
    implementationImport: entry.implementationImport,
    implementationSymbol: entry.implementationSymbol,
    kind: entry.kind,
    registrarImport: entry.registrarImport,
    registrarSymbol: entry.registrarSymbol,
  };
}

function requirementCatalogEntryIdentity(entry: Readonly<RequirementCatalogEntry>): string {
  return [entry.backend, entry.facet, entry.kind, entry.registrarImport, entry.registrarSymbol].join('\0');
}
