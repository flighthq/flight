use std::cell::Cell;

use crate::runtime::create_entity_runtime;
use crate::types::{Entity, EntityRuntime};

pub fn get_entity_uid(source: &mut Entity) -> String {
    let runtime = ensure_entity_runtime(source);
    if let Some(ref uid) = runtime.uid {
        return uid.clone();
    }
    let uid = generate_entity_uid();
    runtime.uid = Some(uid.clone());
    return uid;
}

pub fn set_entity_uid(source: &mut Entity, uid: String) {
    let runtime = ensure_entity_runtime(source);
    runtime.uid = Some(uid);
}

fn ensure_entity_runtime(source: &mut Entity) -> &mut EntityRuntime {
    if source.runtime.is_none() {
        source.runtime = Some(create_entity_runtime());
    }
    return source.runtime.as_mut().unwrap();
}

fn generate_entity_uid() -> String {
    NEXT_ENTITY_UID_COUNTER.with(|c| {
        let id = c.get();
        c.set(id + 1);
        return format!("entity-{}", id);
    })
}

thread_local! {
    static NEXT_ENTITY_UID_COUNTER: Cell<u64> = const { Cell::new(1) };
}
