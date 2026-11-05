/** Plain-data result of `explainInteractionHitEligibility`. */
export interface InteractionHitEligibility {
  // Whether the node itself has opted into hit testing.
  eligible: boolean;
  // Whether the node or any descendant is a hit candidate (so a bubbled listener on it can fire).
  hasEligibleInSubtree: boolean;
}
