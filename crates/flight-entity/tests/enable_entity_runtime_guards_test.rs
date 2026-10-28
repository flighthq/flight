//! flight-compiler: target-native

use std::cell::RefCell;

use flight_entity::*;

thread_local! {
    static RECORDED_SLOTS: RefCell<Vec<EntityRuntimeWriteSlot>> = RefCell::new(Vec::new());
}

fn record_slot(slot: EntityRuntimeWriteSlot) {
    RECORDED_SLOTS.with(|s| s.borrow_mut().push(slot));
}

fn take_recorded_slots() -> Vec<EntityRuntimeWriteSlot> {
    RECORDED_SLOTS.with(|s| s.borrow_mut().drain(..).collect())
}

mod disable_entity_runtime_guards_tests {
    use super::*;

    #[test]
    fn uninstalls_the_guard_mode_and_the_reporter() {
        enable_entity_runtime_guards(record_slot);
        disable_entity_runtime_guards();

        // After disabling, report_entity_runtime_write should be silent.
        report_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);
        let slots = take_recorded_slots();
        assert!(slots.is_empty());
        assert_eq!(are_entity_runtime_guards_enabled(), false);
    }
}

mod enable_entity_runtime_guards_tests {
    use super::*;

    #[test]
    fn enables_guard_mode_and_installs_reporter() {
        enable_entity_runtime_guards(record_slot);

        // Manually trigger a report (in TS, this would happen via Proxy interception
        // on a direct runtime-slot write).
        report_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);
        let slots = take_recorded_slots();
        assert_eq!(slots, vec![EntityRuntimeWriteSlot::RuntimeSlot]);

        disable_entity_runtime_guards();
    }

    #[test]
    fn reports_binding_slot_write_separately() {
        enable_entity_runtime_guards(record_slot);

        report_entity_runtime_write(EntityRuntimeWriteSlot::BindingSlot);
        let slots = take_recorded_slots();
        assert_eq!(slots, vec![EntityRuntimeWriteSlot::BindingSlot]);

        disable_entity_runtime_guards();
    }

    #[test]
    fn stays_silent_without_the_guard_the_production_default() {
        // Without enabling guards, report_entity_runtime_write is a no-op.
        report_entity_runtime_write(EntityRuntimeWriteSlot::RuntimeSlot);
        let slots = take_recorded_slots();
        assert!(slots.is_empty());
        assert_eq!(are_entity_runtime_guards_enabled(), false);
    }
}
