import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { findRequirementCatalogEntries } from '@flighthq/requirement-catalog/contract';
import type {
  Entity,
  EntityConstruction,
  RequirementCatalog,
  RequirementCatalogEntry,
  RequirementCodegenPlan,
  RequirementDeclination,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';

export function createRequirementCodegenPlan(
  catalog: Readonly<RequirementCatalog>,
  requirements: Readonly<RequirementSet>,
  backend: string,
): RequirementCodegenPlan & Entity {
  const out = allocateEntity<RequirementCodegenPlan & Entity>();
  initializeRequirementCodegenPlan(out, catalog, requirements, backend);
  return finishEntity(out);
}

// Resolve only facts here. A later emitter may choose how a row becomes source after the ownership lane
// is ruled; this kernel cannot encode that decision accidentally because it returns no source text.
export function initializeRequirementCodegenPlan(
  out: EntityConstruction<RequirementCodegenPlan & Entity>,
  catalog: Readonly<RequirementCatalog>,
  requirements: Readonly<RequirementSet>,
  backend: string,
): void {
  const entries: RequirementCatalogEntry[] = [];
  const declined: RequirementDeclination[] = [];
  const unresolved: Requirement[] = [];
  const seen = new Set<string>();
  for (const requirement of expandRequirements(catalog, requirements.requirements)) {
    const identity = requirementIdentity(requirement);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const matches = findRequirementCatalogEntries(catalog, backend, requirement.facet, requirement.key);
    if (matches.length > 0) {
      entries.push(...matches);
      continue;
    }
    // Nothing satisfies it HERE. A disposition says that is deliberate for this exact backend, facet
    // and kind, so the gap is recorded with its reason instead of reported as an oversight. Matched
    // exactly and per backend: a decision canvas made says nothing about gl, which still reports.
    const disposition = catalog.dispositions?.find(
      (candidate) =>
        candidate.backend === backend && candidate.facet === requirement.facet && candidate.kind === requirement.key,
    );
    if (disposition === undefined) {
      unresolved.push({ facet: requirement.facet, key: requirement.key });
    } else {
      declined.push({
        reason: disposition.reason,
        requirement: { facet: requirement.facet, key: requirement.key },
      });
    }
  }
  out.backend = backend;
  out.declined = declined;
  out.entries = entries;
  out.unresolved = unresolved;
}

/**
 * Adds the render requirements a format requirement implies, so one pass resolves both halves.
 *
 * A `document.format` requirement names a TAG and a renderer is keyed by a NODE KIND, so without this
 * a render backend resolves nothing and every fragment comes back empty while the parser fragment
 * fills — which is exactly what the per-file manifest is supposed to prevent. Expansion is ADDITIVE:
 * the original requirement stays, because the parser backend still has to resolve it.
 *
 * Two match shapes, both exact-string: a translation keyed on the full key applies to that requirement,
 * and one keyed on a bare format namespace applies to every requirement in it. The namespace form is
 * what carries the kinds a document produces regardless of its tags — a SWF's `MovieClip` root exists
 * even in a file whose only tag is `SetBackgroundColor`, which no per-tag row could state.
 */
function expandRequirements(
  catalog: Readonly<RequirementCatalog>,
  requirements: readonly Readonly<Requirement>[],
): readonly Readonly<Requirement>[] {
  const translations = catalog.translations;
  if (translations === undefined || translations.length === 0) return requirements;
  const expanded: Readonly<Requirement>[] = [...requirements];
  for (const requirement of requirements) {
    const namespace = requirement.key.includes('.') ? requirement.key.slice(0, requirement.key.indexOf('.')) : null;
    for (const translation of translations) {
      if (translation.from.facet !== requirement.facet) continue;
      const matches =
        translation.from.key === requirement.key || (namespace !== null && translation.from.key === namespace);
      if (matches) expanded.push(...translation.to);
    }
  }
  return expanded;
}

function requirementIdentity(requirement: Readonly<Requirement>): string {
  return `${requirement.facet}\0${requirement.key}`;
}
