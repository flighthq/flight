import { createEntity } from '@flighthq/entity/contract';
import type { Kind, RegistryCatalog, RegistryCatalogEntry, RequirementFacet } from '@flighthq/types/contract';

export function createRegistryCatalog(entries: readonly Readonly<RegistryCatalogEntry>[] = []): RegistryCatalog {
  return createEntity({ entries: entries.map(copyCatalogEntry) });
}

export function findRegistryCatalogEntries(
  catalog: Readonly<RegistryCatalog>,
  backend: string,
  facet: RequirementFacet,
  kind: Kind,
): readonly RegistryCatalogEntry[] {
  return catalog.entries
    .filter((entry) => entry.backend === backend && entry.facet === facet && entry.kind === kind)
    .map(copyCatalogEntry);
}

export function getRegistryCatalogEntries(catalog: Readonly<RegistryCatalog>): readonly RegistryCatalogEntry[] {
  return catalog.entries.map(copyCatalogEntry);
}

// The row identity includes the registrar. One requirement may need multiple registrations, so adding a
// distinct registrar appends instead of replacing another call for the same backend/facet/kind.
export function registerRegistryCatalogEntry(catalog: RegistryCatalog, entry: Readonly<RegistryCatalogEntry>): void {
  const index = catalog.entries.findIndex(
    (candidate) => registryCatalogEntryIdentity(candidate) === registryCatalogEntryIdentity(entry),
  );
  const copy = copyCatalogEntry(entry);
  if (index === -1) catalog.entries.push(copy);
  else catalog.entries[index] = copy;
}

export function unregisterRegistryCatalogEntry(
  catalog: RegistryCatalog,
  entry: Readonly<RegistryCatalogEntry>,
): boolean {
  const identity = registryCatalogEntryIdentity(entry);
  const index = catalog.entries.findIndex((candidate) => registryCatalogEntryIdentity(candidate) === identity);
  if (index === -1) return false;
  catalog.entries.splice(index, 1);
  return true;
}

function copyCatalogEntry(entry: Readonly<RegistryCatalogEntry>): RegistryCatalogEntry {
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

function registryCatalogEntryIdentity(entry: Readonly<RegistryCatalogEntry>): string {
  return [entry.backend, entry.facet, entry.kind, entry.registrarImport, entry.registrarSymbol].join('\0');
}
