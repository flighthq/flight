use crate::types::{Entity, EntityConstruction};

pub fn allocate_entity() -> EntityConstruction {
    let out = Entity {
        runtime: None,
    };
    return out;
}

pub fn finish_entity(out: EntityConstruction) -> Entity {
    return out;
}
