use crate::types::*;

/// Restores `snapshot` into the live mutable `target` in place: `target` keeps its own identity and
/// receives a mutable, unaliased copy of the captured value (`Clone::clone_from`, which reuses
/// `target`'s existing allocations where the type supports it, and resizes vectors to the
/// snapshot's length).
pub fn restore_snapshot<T: Clone>(snapshot: &Snapshot<T>, target: &mut T) {
    target.clone_from(snapshot);
}
