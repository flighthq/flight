use std::cell::RefCell;

use flight_entity::*;

fn create_test_entity() -> Entity {
    return allocate_entity();
}

thread_local! {
    static RECORDED_SLOTS: RefCell<Vec<EntityRuntimeWriteSlot>> = RefCell::new(Vec::new());
}

fn record_slot(slot: EntityRuntimeWriteSlot) {
    RECORDED_SLOTS.with(|s| s.borrow_mut().push(slot));
}

fn take_recorded_slots() -> Vec<EntityRuntimeWriteSlot> {
    RECORDED_SLOTS.with(|s| s.borrow_mut().drain(..).collect())
}

mod are_entity_runtime_guards_enabled {
    use super::*;

    #[test]
    fn returns_false_before_guard_mode_is_switched_on() {
        assert_eq!(are_entity_runtime_guards_enabled(), false);
    }
}

mod create_guarded_entity_tests {
    use super::*;

    #[test]
    fn returns_the_entity_when_guards_are_not_enabled() {
        let entity = create_test_entity();
        // In Rust, create_guarded_entity always returns the entity as-is
        // since there is no Proxy mechanism.
        let guarded = create_guarded_entity(entity);
        assert!(guarded.runtime.data.is_none());
    }
}

mod create_guarded_entity_runtime_tests {
    use super::*;

    #[test]
    fn returns_the_runtime_when_guards_are_not_enabled() {
        let runtime = create_entity_runtime();
        let guarded = create_guarded_entity_runtime(runtime);
        assert!(guarded.binding.is_none());
    }
}

mod set_entity_runtime_guard_mode_tests {
    use super::*;

    #[test]
    fn switches_the_guard_mode_on_and_back_off() {
        set_entity_runtime_guard_mode(true);
        assert!(are_entity_runtime_guards_enabled());

        // Guarded entity and runtime are returned as-is in Rust.
        let entity = create_test_entity();
        let guarded = create_guarded_entity(entity);
        assert!(guarded.runtime.data.is_none());

        let runtime = create_entity_runtime();
        let guarded_runtime = create_guarded_entity_runtime(runtime);
        assert!(guarded_runtime.binding.is_none());

        set_entity_runtime_guard_mode(false);
        assert!(!are_entity_runtime_guards_enabled());
    }
}

mod set_entity_runtime_write_guard_tests {
    use super::*;

    #[test]
    fn report_entity_runtime_write_fires_when_guard_is_installed() {
        set_entity_runtime_guard_mode(true);
        set_entity_runtime_write_guard(Some(record_slot));

        // Manually report writes (in TS, these would be triggered by Proxy interception).
        report_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);
        report_entity_runtime_write(EntityRuntimeWriteSlot::BindingSlot);

        let slots = take_recorded_slots();
        assert_eq!(
            slots,
            vec![
                EntityRuntimeWriteSlot::RuntimeSlot,
                EntityRuntimeWriteSlot::BindingSlot,
            ]
        );

        set_entity_runtime_write_guard(None);
        set_entity_runtime_guard_mode(false);
    }

    #[test]
    fn is_silent_once_uninstalled() {
        set_entity_runtime_guard_mode(true);
        set_entity_runtime_write_guard(Some(record_slot));
        set_entity_runtime_write_guard(None);

        report_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);

        let slots = take_recorded_slots();
        assert!(slots.is_empty());

        set_entity_runtime_guard_mode(false);
    }

    #[test]
    fn does_not_fire_when_guard_mode_is_disabled() {
        set_entity_runtime_write_guard(Some(record_slot));

        // Guard mode is off, so report does nothing.
        report_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);

        let slots = take_recorded_slots();
        assert!(slots.is_empty());

        set_entity_runtime_write_guard(None);
    }

    #[test]
    fn is_silent_after_guard_mode_is_disabled() {
        set_entity_runtime_guard_mode(true);
        set_entity_runtime_write_guard(Some(record_slot));

        set_entity_runtime_guard_mode(false);

        report_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);
        report_entity_runtime_write(EntityRuntimeWriteSlot::BindingSlot);

        let slots = take_recorded_slots();
        assert!(slots.is_empty());

        set_entity_runtime_write_guard(None);
    }
}
