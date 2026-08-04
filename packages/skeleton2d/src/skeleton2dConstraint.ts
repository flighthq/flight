import type {
  Skeleton2D,
  Skeleton2DConstraint,
  Skeleton2DConstraintKind,
  Skeleton2DConstraintSolver,
} from '@flighthq/types/contract';

// The solver registered for a constraint kind, or null when nothing claims it — the sentinel an unsolved
// constraint is skipped on.
export function getSkeleton2DConstraintSolver(kind: Skeleton2DConstraintKind): Skeleton2DConstraintSolver | null {
  return _solvers.get(kind) ?? null;
}

// Claims a constraint kind for a solver. Unlike the animation binders, NOTHING is registered here by
// default and each family has its own `register*` — that is the whole point of the registry rather than a
// switch: a rig that uses only IK never bundles the transform solver, and a vendor's own constraint solves
// in the same pass as the built-in ones. Last write wins, so a caller can replace a built-in solver.
export function registerSkeleton2DConstraintSolver(
  kind: Skeleton2DConstraintKind,
  solve: Skeleton2DConstraintSolver,
): void {
  _solvers.set(kind, solve);
}

// Applies every constraint in order, which is the order the authoring tool declared them in and is
// load-bearing: a constraint that reads a bone a previous one moved must run after it.
//
// Requires `computeSkeleton2DWorldTransforms` to have filled `skeleton.worldMatrices`. Each solver writes
// bone LOCAL transforms and refreshes the world matrices of the bones it moved, so the next constraint in
// this pass reads current values — but DESCENDANTS of a constrained bone are left stale on purpose. The
// caller re-runs `computeSkeleton2DWorldTransforms` once after this returns, which is one walk of the
// skeleton rather than one per constraint.
//
// A constraint whose kind has no registered solver is skipped rather than throwing: an unregistered family
// is an expected condition (the bundle shed a solver nobody opted into), not API misuse.
export function solveSkeleton2DConstraints(
  skeleton: Skeleton2D,
  constraints: readonly Readonly<Skeleton2DConstraint>[],
): void {
  for (let i = 0; i < constraints.length; i++) {
    const constraint = constraints[i];
    const solve = _solvers.get(constraint.kind);
    if (solve === undefined) continue;
    solve(skeleton, constraint);
  }
}

export function unregisterSkeleton2DConstraintSolver(kind: Skeleton2DConstraintKind): void {
  _solvers.delete(kind);
}

const _solvers = new Map<Skeleton2DConstraintKind, Skeleton2DConstraintSolver>();
