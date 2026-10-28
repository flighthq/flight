//! The numeric entity id (D12, Principal c92ee207): a process-wide sequence assigned when an
//! entity's runtime slot is allocated. It is identity, not data: never reused, never persisted
//! or serialized, and independent of the string uid.
//! flight-compiler: rust-only
//! Rust-only because the numeric allocation id is native identity machinery, not a TypeScript package export.

use std::sync::atomic::{AtomicU64, Ordering};

use crate::throw::throw_range_error;
use crate::types::Entity;

/// The exclusive upper bound of entity ids: TS carries them as `number`, exact below 2^53.
// flight-lint: allow(contract-vocabulary) D1 range declaration: entity ids are 1..2^53, exact as TS numbers
pub const ENTITY_ID_LIMIT: u64 = 1 << 53;

/// Takes the next id from the one process-wide sequence. Called only by slot allocation.
pub(crate) fn allocate_entity_id() -> u64 {
    let id = NEXT_ENTITY_ID.fetch_add(1, Ordering::Relaxed);
    if id >= ENTITY_ID_LIMIT {
        throw_range_error("entity id sequence exhausted the 2^53 range");
    }
    return id;
}

/// The numeric id `source` received at allocation (read-only). Distinct for every allocation,
/// including a clone; stable for the same allocation through initialize, binding and uid use.
// flight-lint: allow(conform-extra) D12 numeric entity id (Principal c92ee207): the TS mirror adds getEntityId with this transpile
// flight-lint: allow(contract-vocabulary) D1 range declaration: entity ids are 1..2^53, exact as TS numbers
pub fn get_entity_id<T: Entity + ?Sized>(source: &T) -> u64 {
    return source.entity_runtime().id;
}

// flight-lint: allow(hidden-state) D12 numeric entity id (Principal c92ee207): one process-wide allocation sequence so ids stay unique across threads; it only mints identities and never changes any other result
static NEXT_ENTITY_ID: AtomicU64 = AtomicU64::new(1);
