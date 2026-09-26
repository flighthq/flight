import type {
  Kind,
  NonEntityCreateResult,
  RequirementCatalog,
  RequirementCatalogEntry,
  RequirementDisposition,
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
  dispositions: readonly Readonly<RequirementDisposition>[] = [],
): NonEntityCreateResult<RequirementCatalog, 'descriptor'> {
  return {
    dispositions: dispositions.map(copyCatalogDisposition),
    entries: entries.map(copyCatalogEntry),
    translations: translations.map(copyCatalogTranslation),
  };
}

// Flat plain data like an entry, so it is copied the same way and for the same reason — it named all four
// of its fields, which is exactly the state the entry copier was in before a fifth field arrived.
function copyCatalogDisposition(disposition: Readonly<RequirementDisposition>): RequirementDisposition {
  return { ...disposition };
}

// A translation is the one NESTED shape here, so a single spread would copy the outer object and alias
// `from` and every element of `to`. It spreads at each level instead: structural like the two above, and
// still a real detach rather than a shared reference the caller could mutate afterwards.
function copyCatalogTranslation(translation: Readonly<RequirementTranslation>): RequirementTranslation {
  return {
    from: { ...translation.from },
    to: translation.to.map((requirement) => ({ ...requirement })),
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

/**
 * Detaches one row from the caller's object, so the catalog owns its data rather than aliasing theirs.
 *
 * ★ STRUCTURAL, NOT FIELD BY FIELD, AND THAT IS THE WHOLE POINT. This was a hand-written field list, and
 * a list silently drops whatever it was never told about: when `familyOrder` joined the contract the row
 * still copied, the generated modules still looked well-formed, and the only symptom was parser options
 * emitted in alphabetical instead of family order. Nothing failed, because nothing was asked. A spread
 * cannot have that bug — it copies what the object HAS rather than what this function remembers.
 *
 * Value semantics are unaffected: every field of RequirementCatalogEntry is a primitive, so one level of
 * copying is a complete copy and the result shares nothing with the input. If a nested field is ever
 * added, this must copy that level too — `copyCatalogTranslation` below shows the shape for that.
 *
 * The trade is that a key outside the contract now rides along instead of being stripped. That is the
 * better failure: carrying a caller's stray field is visible in the row, while dropping a real one was
 * invisible for as long as nobody compared the emitted order.
 */
function copyCatalogEntry(entry: Readonly<RequirementCatalogEntry>): RequirementCatalogEntry {
  return { ...entry };
}

function requirementCatalogEntryIdentity(entry: Readonly<RequirementCatalogEntry>): string {
  return [entry.backend, entry.facet, entry.kind, entry.registrarImport, entry.registrarSymbol].join('\0');
}
