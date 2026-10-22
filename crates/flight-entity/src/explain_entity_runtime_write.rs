use crate::types::{EntityRuntimeWriteExplanation, EntityRuntimeWriteSlot};

/// Describes what a guarded direct write means, as plain data. The guard seam reports only
/// which slot was written; this turns that into the remedy, so a caller's reporter can phrase
/// a warning without core owning a message format or a logger.
pub fn explain_entity_runtime_write(slot: EntityRuntimeWriteSlot) -> EntityRuntimeWriteExplanation {
    if slot == EntityRuntimeWriteSlot::BindingSlot {
        return EntityRuntimeWriteExplanation {
            message: "EntityRuntime.binding was written directly. The write was allowed but is not tracked, so the binding and the runtime can disagree.".to_string(),
            slot,
            use_instead: vec![
                "attachEntityBinding".to_string(),
                "detachEntityBinding".to_string(),
            ],
        };
    }
    return EntityRuntimeWriteExplanation {
        message: "An entity's runtime slot was written directly. The write was allowed, but bypassing the helper is how a runtime ends up on the wrong entity.".to_string(),
        slot,
        use_instead: vec!["attachEntityBinding".to_string()],
    };
}
