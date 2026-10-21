use std::fmt;
use std::sync::Arc;

use flight_entity::{Record, Ref, Unknown};

/// Which numeric leaf fields `interpolate_snapshots` may interpolate (TS `SnapshotSchema`), as
/// dot-separated paths from the state root; array elements use their numeric index, e.g.
/// `"players.0.health"`. A listed numeric leaf is lerped; every other numeric leaf snaps to the
/// destination. Passing no schema interpolates all numeric leaves.
pub type SnapshotSchema = Vec<String>;

/// The plain, structured-cloneable state the package captures (the source's `unknown` values),
/// as a snapshot-owned dynamic graph. Containers are shared handles, so `===` identity, shared
/// subtrees and cycles are representable; cloning a `SnapshotValue` copies a reference, as a JS
/// assignment does.
// flight-lint: allow(f64) Principal 6077f3c7: snapshot numbers are JS doubles
#[derive(Clone)]
pub enum SnapshotValue {
    Undefined,
    Null,
    Bool(bool),
    /// A JS number.
    Number(f64),
    String(String),
    Array(SnapshotArrayRef),
    Object(SnapshotObjectRef),
    /// A structured-cloneable built-in that is not plain data (`Map`, `Set`, `Date`, ...), kept as
    /// its kind plus the original opaque value.
    NonPlain(SnapshotNonPlain),
}

/// A JS array: elements in index order (an absent element reads as `Undefined`). `frozen` is
/// `Object.isFrozen`; a frozen array rejects every write.
pub struct SnapshotArray {
    pub(crate) frozen: bool,
    pub(crate) items: Vec<SnapshotValue>,
}

/// A plain JS object: own enumerable properties in JS key order (the canonical `Record`). `frozen`
/// is `Object.isFrozen`; a frozen object rejects every write.
pub struct SnapshotObject {
    pub(crate) entries: Record<SnapshotValue>,
    pub(crate) frozen: bool,
}

pub type SnapshotArrayRef = Ref<SnapshotArray>;

pub type SnapshotObjectRef = Ref<SnapshotObject>;

/// A non-plain built-in: which kind, and the original opaque value (identity preserved).
#[derive(Clone)]
pub struct SnapshotNonPlain {
    pub kind: SnapshotNonPlainKind,
    pub value: Unknown,
}

/// The non-plain built-ins `structuredClone` accepts that break the snapshot contracts.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum SnapshotNonPlainKind {
    ArrayBuffer,
    Date,
    Map,
    RegExp,
    Set,
    TypedArray,
}

/// An immutable point-in-time capture (TS `Snapshot<T>` = `DeepReadonly<T>`): a value whose every
/// reachable container is frozen, so the ordinary mutation paths reject writes into it.
pub type Snapshot = SnapshotValue;

/// The capture-time inspection hook (TS `setSnapshotCaptureGuard` argument). It receives the
/// capture source itself, before cloning.
pub type SnapshotCaptureGuard = Arc<dyn Fn(&SnapshotValue) + Send + Sync>;

/// Caller-owned snapshot guard state (D5). It replaces the source's module-level `_captureGuard`
/// slot: the guard is installed per state, never process-wide.
#[derive(Clone, Default)]
pub struct SnapshotGuardState {
    pub capture_guard: Option<SnapshotCaptureGuard>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: containers may be cyclic, so Debug prints one level and container sizes only
impl fmt::Debug for SnapshotValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return match self {
            SnapshotValue::Undefined => write!(f, "undefined"),
            SnapshotValue::Null => write!(f, "null"),
            SnapshotValue::Bool(value) => write!(f, "{}", value),
            SnapshotValue::Number(value) => write!(f, "{}", value),
            SnapshotValue::String(value) => write!(f, "{:?}", value),
            SnapshotValue::Array(array) => {
                write!(f, "Array({})", array.read().unwrap().items.len())
            }
            SnapshotValue::Object(object) => {
                let mut keys = Vec::new();
                flight_entity::get_record_keys(&mut keys, &object.read().unwrap().entries);
                write!(f, "Object({:?})", keys)
            }
            SnapshotValue::NonPlain(non_plain) => write!(f, "{:?}", non_plain.kind),
        };
    }
}
