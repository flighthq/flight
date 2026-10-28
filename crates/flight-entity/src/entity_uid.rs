//! flight-compiler: target-native

use std::sync::atomic::{AtomicU64, Ordering};

use crate::runtime::ensure_entity_runtime;
use crate::types::Entity;

fn generate_entity_uid() -> String {
    let id = NEXT_ENTITY_UID_COUNTER.fetch_add(1, Ordering::Relaxed);
    return format!("entity-{}", id);
}

pub fn get_entity_uid<T: Entity>(source: &mut T) -> String {
    let runtime = ensure_entity_runtime(source);
    if let Some(ref uid) = runtime.uid {
        return uid.clone();
    }
    let uid = generate_entity_uid();
    runtime.uid = Some(uid.clone());
    return uid;
}

pub fn set_entity_uid<T: Entity>(source: &mut T, uid: String) {
    let runtime = ensure_entity_runtime(source);
    runtime.uid = Some(uid);
}

// flight-lint: allow(hidden-state) TS module-level uid counter (entityUid.ts): one process-wide sequence so uids stay unique across threads; it only mints identifiers and never changes any other result
static NEXT_ENTITY_UID_COUNTER: AtomicU64 = AtomicU64::new(1);
