use std::any::Any;
use std::collections::HashSet;
use std::sync::Arc;

/// Which numeric leaf fields `interpolate_snapshots` may interpolate (TS `SnapshotSchema`), as
/// dot-separated paths from the state root; array elements use their numeric index, e.g.
/// `"players.0.health"`. A listed numeric leaf is lerped; every other numeric leaf snaps to the
/// destination. Passing no schema interpolates all numeric leaves.
pub type SnapshotSchema = Vec<String>;

/// An immutable point-in-time capture of a plain state value `T` (TS `Snapshot<T>` =
/// `DeepReadonly<T>`). `capture_snapshot` stores an owned clone behind an `Arc`, which exposes only
/// shared (`&T`) access, so the captured value cannot be written through the snapshot. Cloning a
/// `Snapshot` shares the same capture (`Arc::ptr_eq` identity).
///
/// The guarantee covers owned data. A field holding a shared mutable handle (`Ref<_>`) is cloned
/// shallowly by `Clone` and stays writable through the handle, so such state is outside the typed
/// snapshot contract.
pub type Snapshot<T> = Arc<T>;

/// The capture-time inspection hook (TS `setSnapshotCaptureGuard` argument). It receives the
/// capture source itself, before cloning.
// flight-lint: allow(contract-vocabulary) the TS guard receives the capture source as `unknown`; a borrowed `&dyn Any` passes that exact source without cloning or boxing it
pub type SnapshotCaptureGuard = Arc<dyn Fn(&dyn Any) + Send + Sync>;

/// Caller-owned snapshot guard state (D5). It replaces the source's module-level `_captureGuard`
/// slot: the guard is installed per state, never process-wide.
#[derive(Clone, Default)]
pub struct SnapshotGuardState {
    pub capture_guard: Option<SnapshotCaptureGuard>,
}

/// One interpolation call's settings, passed down the walk: the clamped `t` and the compiled schema.
/// `paths: None` (no schema) interpolates every numeric leaf; an empty set interpolates none.
pub struct SnapshotInterpolation {
    pub(crate) paths: Option<HashSet<String>>,
    pub(crate) t: f32,
}

/// How a state type interpolates between two snapshots (the typed form of the source's recursive
/// walk). `out` is written from `a` and `b`; `path` is the dotted path of this value from the state
/// root, consulted only when a schema is present.
///
/// Numeric leaves (`f32`, `f64`) lerp when the schema allows `path` and snap to `b` otherwise. Every
/// other leaf snaps to `b`. Containers (`Vec`, arrays, tuples, `Option`, `Record`) walk their
/// elements. A user state type implements the trait by calling `interpolate_snapshot_field` for each
/// field and returning `true` from `is_snapshot_container`.
pub trait SnapshotInterpolate: Clone {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    );

    /// Whether this type is an object or array in the source's sense. `interpolate_snapshots` is a
    /// no-op for a top-level non-container, as the source is for a top-level primitive.
    fn is_snapshot_container() -> bool {
        return false;
    }
}
