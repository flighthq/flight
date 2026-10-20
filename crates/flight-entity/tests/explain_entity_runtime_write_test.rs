use flight_entity::*;

mod explain_entity_runtime_write_tests {
    use super::*;

    #[test]
    fn names_both_binding_helpers_for_a_binding_slot_write() {
        let explanation = explain_entity_runtime_write(EntityRuntimeWriteSlot::BindingSlot);
        assert_eq!(explanation.slot, EntityRuntimeWriteSlot::BindingSlot);
        assert_eq!(
            explanation.use_instead,
            vec!["attachEntityBinding", "detachEntityBinding"]
        );
    }

    #[test]
    fn names_the_allocating_helper_for_a_runtime_slot_write() {
        let explanation = explain_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);
        assert_eq!(explanation.slot, EntityRuntimeWriteSlot::RuntimeSlot);
        assert_eq!(explanation.use_instead, vec!["attachEntityBinding"]);
    }

    #[test]
    fn distinguishes_the_two_slots_by_message_not_only_by_name() {
        assert_ne!(
            explain_entity_runtime_write(EntityRuntimeWriteSlot::BindingSlot).message,
            explain_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot).message,
        );
    }
}
