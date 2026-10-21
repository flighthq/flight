//! The constraint solver registry (TS `skeleton2dConstraint.ts`).

use crate::types::*;

/// Caller-owned constraint solver registry (D5): the source's module-global map becomes explicit
/// state. Insertion order is preserved, and last write wins while keeping the original position.
#[derive(Clone, Default)]
pub struct Skeleton2DConstraintRegistry {
    pub entries: Vec<(String, Skeleton2DConstraintSolver)>,
}

/// Allocates an empty constraint registry (Rust-only D5 constructor replacing the source's module map).
// flight-lint: allow(conform-extra) D5: caller-owned registry replaces the source module-global Map
pub fn create_skeleton_2d_constraint_registry() -> Skeleton2DConstraintRegistry {
    return Skeleton2DConstraintRegistry {
        entries: Vec::new(),
    };
}

/// The solver registered for `kind`, or `None` (TS `getSkeleton2DConstraintSolver`).
// flight-lint: allow(conform-params) D5: caller-owned constraint registry replaces the source module-global Map
pub fn get_skeleton_2d_constraint_solver(
    registry: &Skeleton2DConstraintRegistry,
    kind: &str,
) -> Option<Skeleton2DConstraintSolver> {
    return registry
        .entries
        .iter()
        .find(|entry| entry.0 == kind)
        .map(|entry| entry.1.clone());
}

/// Claims a constraint kind for a solver; last write wins (TS `registerSkeleton2DConstraintSolver`).
// flight-lint: allow(conform-params) D5: caller-owned constraint registry replaces the source module-global Map
pub fn register_skeleton_2d_constraint_solver(
    registry: &mut Skeleton2DConstraintRegistry,
    kind: &str,
    solve: Skeleton2DConstraintSolver,
) {
    if let Some(entry) = registry.entries.iter_mut().find(|entry| entry.0 == kind) {
        entry.1 = solve;
        return;
    }
    registry.entries.push((String::from(kind), solve));
}

/// Applies every constraint in order, skipping kinds with no registered solver (TS
/// `solveSkeleton2DConstraints`).
// flight-lint: allow(conform-params) D5: caller-owned constraint registry replaces the source module-global Map
pub fn solve_skeleton_2d_constraints(
    registry: &Skeleton2DConstraintRegistry,
    skeleton: &mut Skeleton2D,
    constraints: &[Skeleton2DConstraintRef],
) {
    for constraint in constraints {
        let loaded = constraint.read().unwrap();
        let Some(solve) = get_skeleton_2d_constraint_solver(registry, loaded.kind()) else {
            continue;
        };
        drop(loaded);
        solve(skeleton, &*constraint.read().unwrap());
    }
}

/// Drops a constraint kind's solver (TS `unregisterSkeleton2DConstraintSolver`).
// flight-lint: allow(conform-params) D5: caller-owned constraint registry replaces the source module-global Map
pub fn unregister_skeleton_2d_constraint_solver(
    registry: &mut Skeleton2DConstraintRegistry,
    kind: &str,
) {
    registry.entries.retain(|entry| entry.0 != kind);
}
