import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementCatalog, RequirementFacet, RequirementSet } from '@flighthq/types/contract';

/** What a read reports: the parsed value, or the reasons the text is not one. */
export interface RequirementSetFileValidation {
  readonly problems: readonly string[];
  readonly requirementSet: RequirementSet | null;
}

/** What a catalog read reports: the parsed catalog, or the reasons the text is not one. */
export interface RequirementCatalogFileValidation {
  readonly catalog: RequirementCatalog | null;
  readonly problems: readonly string[];
}

/**
 * Reads a catalog as `{ entries: [{ backend, facet, kind, implementationImport, implementationSymbol, registrarImport, registrarSymbol }] }`.
 *
 * Unlike a requirement set, a catalog is authored by a person, so a malformed row is reported by index
 * rather than skipped: a silently dropped row would turn a typo into a missing registration much later.
 */
export function readRequirementCatalogFile(text: string): RequirementCatalogFileValidation {
  const parsed = parseJson(text);
  if (parsed.problems.length > 0) return { catalog: null, problems: parsed.problems };
  const value = parsed.value;
  if (!isRecord(value)) return { catalog: null, problems: ['catalog must be an object'] };
  if (!Array.isArray(value.entries)) return { catalog: null, problems: ['catalog.entries must be an array'] };

  const problems: string[] = [];
  const entries = [];
  for (const [index, raw] of value.entries.entries()) {
    if (!isRecord(raw)) {
      problems.push(`entries[${index}] must be an object`);
      continue;
    }
    const missing = CATALOG_ENTRY_FIELDS.filter((field) => typeof raw[field] !== 'string');
    if (missing.length > 0) {
      problems.push(`entries[${index}] needs string ${missing.join(', ')}`);
      continue;
    }
    entries.push({
      backend: raw.backend as string,
      facet: raw.facet as RequirementFacet,
      implementationImport: raw.implementationImport as string,
      implementationSymbol: raw.implementationSymbol as string,
      kind: raw.kind as string,
      // Absent for an options-driven lane, which has no `register*` to name. Copied only when present
      // so a row that never had one does not gain an empty string that reads like a lost value.
      ...(typeof raw.registrarImport === 'string' ? { registrarImport: raw.registrarImport } : {}),
      ...(typeof raw.registrarSymbol === 'string' ? { registrarSymbol: raw.registrarSymbol } : {}),
    });
  }

  // Dispositions: requirements a backend deliberately does not implement. Read here so the CLI lane
  // reaches the same verdict as the plugin — a build that reports a gap the catalog already settled,
  // only because the gap was stated in a file the CLI could not read, is a parity bug rather than a
  // finding. `reason` is REQUIRED and must be non-empty: a disposition with nothing to say is a
  // suppression list, and a malformed one is reported by index rather than skipped, because silently
  // dropping it would turn a typo into an unexplained warning much later.
  const dispositions = [];
  if (value.dispositions !== undefined) {
    if (!Array.isArray(value.dispositions)) {
      problems.push('catalog.dispositions must be an array');
    } else {
      for (const [index, raw] of value.dispositions.entries()) {
        if (!isRecord(raw)) {
          problems.push(`dispositions[${index}] must be an object`);
          continue;
        }
        const missing = CATALOG_DISPOSITION_FIELDS.filter((field) => typeof raw[field] !== 'string');
        if (missing.length > 0) {
          problems.push(`dispositions[${index}] needs string ${missing.join(', ')}`);
          continue;
        }
        if ((raw.reason as string).length === 0) {
          problems.push(`dispositions[${index}] needs a non-empty reason`);
          continue;
        }
        dispositions.push({
          backend: raw.backend as string,
          facet: raw.facet as RequirementFacet,
          kind: raw.kind as string,
          reason: raw.reason as string,
        });
      }
    }
  }

  if (problems.length > 0) return { catalog: null, problems };
  return { catalog: { dispositions, entries }, problems: [] };
}

/**
 * Reads a requirement set from the text `writeRequirementSetFile` produces.
 *
 * A requirement whose facet or key is not a string is a problem rather than a skipped row: an inventory
 * that quietly loses an entry is indistinguishable from one the content never had, which defeats the
 * point of `covers`.
 */
export function readRequirementSetFile(text: string): RequirementSetFileValidation {
  const parsed = parseJson(text);
  if (parsed.problems.length > 0) return { problems: parsed.problems, requirementSet: null };
  const value = parsed.value;
  if (!isRecord(value)) return { problems: ['requirement set must be an object'], requirementSet: null };
  if (!Array.isArray(value.covers)) return { problems: ['covers must be an array'], requirementSet: null };
  if (!Array.isArray(value.requirements)) {
    return { problems: ['requirements must be an array'], requirementSet: null };
  }

  const problems: string[] = [];
  const covers: RequirementFacet[] = [];
  for (const [index, facet] of value.covers.entries()) {
    if (typeof facet !== 'string') problems.push(`covers[${index}] must be a string`);
    else covers.push(facet as RequirementFacet);
  }
  const requirements: Requirement[] = [];
  for (const [index, raw] of value.requirements.entries()) {
    if (!isRecord(raw) || typeof raw.facet !== 'string' || typeof raw.key !== 'string') {
      problems.push(`requirements[${index}] needs string facet and key`);
      continue;
    }
    requirements.push({ facet: raw.facet as RequirementFacet, key: raw.key });
  }
  if (problems.length > 0) return { problems, requirementSet: null };
  return { problems: [], requirementSet: createRequirementSet(covers, requirements) };
}

/**
 * Serializes a requirement set as `{ covers, requirements }`.
 *
 * Only the two public fields are written. A `RequirementSet` is an Entity, so a structural clone would
 * also carry its runtime slot; naming the fields keeps the file a description of content rather than a
 * snapshot of one process's objects.
 */
export function writeRequirementSetFile(requirementSet: Readonly<RequirementSet>): string {
  return `${JSON.stringify(
    {
      covers: [...requirementSet.covers],
      requirements: requirementSet.requirements.map((requirement) => ({
        facet: requirement.facet,
        key: requirement.key,
      })),
    },
    null,
    2,
  )}\n`;
}

// The registrar pair is NOT required: a tag family is named in parse options and never registered, so
// every built-in row omits it. Requiring it here rejected the catalog this repo itself ships — a
// `tool-registry catalog --json` feeding `tool-manifest plan` failed on rows that were perfectly valid.
const CATALOG_ENTRY_FIELDS = ['backend', 'facet', 'kind', 'implementationImport', 'implementationSymbol'] as const;

const CATALOG_DISPOSITION_FIELDS = ['backend', 'facet', 'kind', 'reason'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): { problems: readonly string[]; value: unknown } {
  try {
    return { problems: [], value: JSON.parse(text) };
  } catch (error) {
    return { problems: [`not valid JSON: ${(error as Error).message}`], value: null };
  }
}
