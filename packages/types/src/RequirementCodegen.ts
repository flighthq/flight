import type { Requirement } from './Requirement.ts';
import type { RequirementCatalogEntry } from './RequirementCatalog.ts';

// Emission-neutral input to a future source writer. The kernel resolves factual ownership rows and
// reports gaps, but does not choose arguments, source expressions, or an ambient/caller-filled module.
export interface RequirementCodegenPlan {
  readonly backend: string;
  /**
   * Requirements this backend deliberately does not implement, with the reason each was declined.
   *
   * Kept apart from `unresolved` because they mean opposite things to a caller: an unresolved
   * requirement is a gap to report, a declined one is a decision to record. Collapsing them into one
   * list is what made a deliberate omission indistinguishable from an oversight.
   */
  readonly declined: readonly Readonly<RequirementDeclination>[];
  readonly entries: readonly Readonly<RequirementCatalogEntry>[];
  readonly unresolved: readonly Readonly<Requirement>[];
}

/** One requirement a backend declined, paired with the reason the catalog gave. */
export interface RequirementDeclination {
  readonly reason: string;
  readonly requirement: Requirement;
}
