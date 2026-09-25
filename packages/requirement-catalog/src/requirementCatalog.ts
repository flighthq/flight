import type {
  Kind,
  NonEntityCreateResult,
  RequirementCatalog,
  RequirementCatalogEntry,
  RequirementFacet,
  RequirementTranslation,
} from '@flighthq/types/contract';

/**
 * Builds a catalog from ownership rows and the format-to-render implications that go with them.
 *
 * ★ TRANSLATIONS ARE A PARAMETER, NOT AN AFTERTHOUGHT. They used to be omitted here, so a caller doing
 * the obvious `createRequirementCatalog(BUILT_IN_REQUIREMENT_CATALOG_ENTRIES)` got a catalog that
 * resolved parser handlers and returned an EMPTY fragment for every render backend — no error, no
 * warning, just nothing drawn. Anything that decides what a build omits has to fail loudly or not at
 * all, and dropping a field the caller never mentioned fails the other way.
 */
export function createRequirementCatalog(
  entries: readonly Readonly<RequirementCatalogEntry>[] = [],
  translations: readonly Readonly<RequirementTranslation>[] = [],
): NonEntityCreateResult<RequirementCatalog, 'descriptor'> {
  return { entries: entries.map(copyCatalogEntry), translations: translations.map(copyCatalogTranslation) };
}

function copyCatalogTranslation(translation: Readonly<RequirementTranslation>): RequirementTranslation {
  return {
    from: { facet: translation.from.facet, key: translation.from.key },
    to: translation.to.map((requirement) => ({ facet: requirement.facet, key: requirement.key })),
  };
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
