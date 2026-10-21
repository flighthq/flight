//! D18 sugar for a shared command history: thin delegates over the free-function contract.

use flight_entity::Ref;

use crate::command_binding::{
    get_command_binding, has_command_binding, register_command_binding,
    register_default_command_bindings,
};
use crate::command_history::{
    can_redo_command, can_undo_command, clear_command_history, execute_command,
    get_command_history_entries, get_command_history_index, get_command_history_redo_label,
    get_command_history_undo_label, notify_command_history_changed, redo_command, undo_command,
};
use crate::command_history_signals::{enable_command_history_signals, get_command_history_signals};
use crate::command_transaction::{
    abort_command_transaction, begin_command_transaction, end_command_transaction,
    is_command_transaction_open,
};
use crate::explain_command_dispatch::explain_command_dispatch;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use crate::command::{create_add_node_child_command, create_composite_command};
    use crate::command_property_access::create_command_property_access;
    use crate::types::Command;

    use super::*;

    fn history() -> Ref<CommandHistory> {
        return crate::command_history::create_command_history(None);
    }

    fn inert_binding() -> CommandBindingRef {
        return Arc::new(CommandBinding {
            execute: Arc::new(|_command: &dyn Command| {}),
            merge: None,
            undo: Arc::new(|_command: &dyn Command| {}),
        });
    }

    fn command(kind: &str, label: &str) -> CommandRef {
        // A composite with no children carries its own kind and label without a node target.
        let composite = create_composite_command(label, &[]);
        let mut guard = composite.write().unwrap();
        guard.fields.kind = String::from(kind);
        drop(guard);
        return composite;
    }

    #[test]
    fn abort_transaction_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        via_method.register_binding("test.Kind", inert_binding());
        via_free.register_binding("test.Kind", inert_binding());
        via_method.begin_transaction("T");
        via_free.begin_transaction("T");
        let _ = abort_command_transaction(&via_free);
        assert_eq!(via_method.abort_transaction(), true);
        assert_eq!(via_method.entries().len(), via_free.entries().len());
    }

    #[test]
    fn begin_transaction_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        via_method.begin_transaction("T");
        begin_command_transaction(&via_free, "T");
        assert_eq!(
            is_command_transaction_open(&via_method),
            is_command_transaction_open(&via_free)
        );
    }

    #[test]
    fn can_redo_matches_the_free_function() {
        let history = history();
        assert_eq!(history.can_redo(), can_redo_command(&history));
    }

    #[test]
    fn can_undo_matches_the_free_function() {
        let history = history();
        assert_eq!(history.can_undo(), can_undo_command(&history));
    }

    #[test]
    fn clear_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        via_method.clear();
        clear_command_history(&via_free);
        assert_eq!(via_method.entries().len(), via_free.entries().len());
    }

    #[test]
    fn enable_signals_matches_the_free_function() {
        let history = history();
        let method_signal = history.enable_signals();
        let free_signal = enable_command_history_signals(&history);
        assert!(Arc::ptr_eq(&method_signal.data, &free_signal.data));
    }

    #[test]
    fn end_transaction_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        via_method.begin_transaction("T");
        begin_command_transaction(&via_free, "T");
        assert_eq!(
            via_method.end_transaction(),
            end_command_transaction(&via_free)
        );
    }

    #[test]
    fn entries_matches_the_free_function() {
        let history = history();
        let mut out = Vec::new();
        get_command_history_entries(&mut out, &history);
        assert_eq!(history.entries().len(), out.len());
    }

    #[test]
    fn execute_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        via_method.register_binding("test.Kind", inert_binding());
        via_free.register_binding("test.Kind", inert_binding());
        assert_eq!(
            via_method.execute(&command("test.Kind", "A")),
            execute_command(&via_free, &command("test.Kind", "A"))
        );
        assert_eq!(via_method.entries().len(), via_free.entries().len());
    }

    #[test]
    fn explain_matches_the_free_function() {
        let history = history();
        let subject = command("test.Missing", "A");
        assert_eq!(
            history.explain(&subject),
            explain_command_dispatch(&history, &subject)
        );
    }

    #[test]
    fn get_binding_matches_the_free_function() {
        let history = history();
        let binding = inert_binding();
        register_command_binding(&history, "test.Kind", binding.clone());
        let method = history.get_binding("test.Kind").expect("binding");
        let free = get_command_binding(&history, "test.Kind").expect("binding");
        assert!(Arc::ptr_eq(&method, &free));
    }

    #[test]
    fn get_signals_matches_the_free_function() {
        let history = history();
        assert_eq!(
            history.get_signals().is_some(),
            get_command_history_signals(&history).is_some()
        );
    }

    #[test]
    fn has_binding_matches_the_free_function() {
        let history = history();
        assert_eq!(
            history.has_binding("test.Kind"),
            has_command_binding(&history, "test.Kind")
        );
    }

    #[test]
    fn index_matches_the_free_function() {
        let history = history();
        assert_eq!(history.index(), get_command_history_index(&history));
    }

    #[test]
    fn is_transaction_open_matches_the_free_function() {
        let history = history();
        assert_eq!(
            history.is_transaction_open(),
            is_command_transaction_open(&history)
        );
    }

    #[test]
    fn notify_changed_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        let method_signal = via_method.enable_signals();
        let free_signal = enable_command_history_signals(&via_free);
        via_method.notify_changed();
        notify_command_history_changed(&via_free);
        assert_eq!(
            Arc::strong_count(&method_signal.data),
            Arc::strong_count(&free_signal.data)
        );
    }

    #[test]
    fn redo_matches_the_free_function() {
        let history = history();
        assert_eq!(history.redo(), redo_command(&history));
    }

    #[test]
    fn redo_label_matches_the_free_function() {
        let history = history();
        assert_eq!(
            history.redo_label(),
            get_command_history_redo_label(&history)
        );
    }

    #[test]
    fn register_binding_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        let binding = inert_binding();
        via_method.register_binding("test.Kind", binding.clone());
        register_command_binding(&via_free, "test.Kind", binding.clone());
        assert_eq!(
            via_method.has_binding("test.Kind"),
            via_free.has_binding("test.Kind")
        );
    }

    #[test]
    fn register_default_bindings_matches_the_free_function() {
        let via_method = history();
        let via_free = history();
        let access = create_command_property_access();
        via_method.register_default_bindings(&access);
        register_default_command_bindings(&via_free, &access);
        assert_eq!(
            via_method.has_binding("AddNodeChildCommand"),
            via_free.has_binding("AddNodeChildCommand")
        );
    }

    #[test]
    fn undo_matches_the_free_function() {
        let history = history();
        assert_eq!(history.undo(), undo_command(&history));
    }

    #[test]
    fn undo_label_matches_the_free_function() {
        let history = history();
        assert_eq!(
            history.undo_label(),
            get_command_history_undo_label(&history)
        );
    }

    #[test]
    fn create_add_node_child_command_matches_initialize() {
        let node = || -> flight_node::contract::NodeRef {
            return std::sync::Arc::new(std::sync::RwLock::new(
                flight_node::contract::create_node::<TestNode>(String::from("test.CommandTarget")),
            ));
        };
        let parent = node();
        let child = node();
        let factory = create_add_node_child_command("Add", &parent, &child, Some(3));
        let mut direct: AddNodeChildCommand = flight_entity::allocate_entity();
        crate::command::initialize_add_node_child_command(&mut direct, "Add", &parent, &child, 3);
        assert_eq!(factory.read().unwrap().index, direct.index);
        assert_eq!(factory.read().unwrap().label, direct.label);
    }

    #[derive(Default)]
    struct TestNode {
        runtime: flight_entity::EntityRuntimeSlot,
        node: flight_node::contract::NodeFields,
    }

    impl flight_node::contract::Node for TestNode {
        fn node_fields(&self) -> &flight_node::contract::NodeFields {
            return &self.node;
        }

        fn node_fields_mut(&mut self) -> &mut flight_node::contract::NodeFields {
            return &mut self.node;
        }

        fn as_any(&self) -> &dyn std::any::Any {
            return self;
        }

        fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
            return self;
        }
    }

    flight_entity::impl_entity!(TestNode);
}
/// Convenience methods for a shared history. Each delegates to its free function.
pub trait CommandHistoryMethods {
    fn abort_transaction(&self) -> bool;
    fn begin_transaction(&self, label: &str);
    fn can_redo(&self) -> bool;
    fn can_undo(&self) -> bool;
    fn clear(&self);
    fn enable_signals(&self) -> flight_signals::Signal<()>;
    fn end_transaction(&self) -> bool;
    fn entries(&self) -> Vec<CommandRef>;
    fn execute(&self, command: &CommandRef) -> bool;
    fn explain(&self, command: &CommandRef) -> CommandDispatchExplanation;
    fn get_binding(&self, kind: &str) -> Option<CommandBindingRef>;
    fn get_signals(&self) -> Option<flight_signals::Signal<()>>;
    fn has_binding(&self, kind: &str) -> bool;
    fn index(&self) -> usize;
    fn is_transaction_open(&self) -> bool;
    fn notify_changed(&self);
    fn redo(&self) -> bool;
    fn redo_label(&self) -> Option<String>;
    fn register_binding(&self, kind: &str, binding: CommandBindingRef);
    fn register_default_bindings(&self, access: &CommandPropertyAccessRef);
    fn undo(&self) -> bool;
    fn undo_label(&self) -> Option<String>;
}

impl CommandHistoryMethods for Ref<CommandHistory> {
    fn abort_transaction(&self) -> bool {
        return abort_command_transaction(self);
    }

    fn begin_transaction(&self, label: &str) {
        begin_command_transaction(self, label);
    }

    fn can_redo(&self) -> bool {
        return can_redo_command(self);
    }

    fn can_undo(&self) -> bool {
        return can_undo_command(self);
    }

    fn clear(&self) {
        clear_command_history(self);
    }

    fn enable_signals(&self) -> flight_signals::Signal<()> {
        return enable_command_history_signals(self);
    }

    fn end_transaction(&self) -> bool {
        return end_command_transaction(self);
    }

    fn entries(&self) -> Vec<CommandRef> {
        let mut out = Vec::new();
        get_command_history_entries(&mut out, self);
        return out;
    }

    fn execute(&self, command: &CommandRef) -> bool {
        return execute_command(self, command);
    }

    fn explain(&self, command: &CommandRef) -> CommandDispatchExplanation {
        return explain_command_dispatch(self, command);
    }

    fn get_binding(&self, kind: &str) -> Option<CommandBindingRef> {
        return get_command_binding(self, kind);
    }

    fn get_signals(&self) -> Option<flight_signals::Signal<()>> {
        return get_command_history_signals(self);
    }

    fn has_binding(&self, kind: &str) -> bool {
        return has_command_binding(self, kind);
    }

    fn index(&self) -> usize {
        return get_command_history_index(self);
    }

    fn is_transaction_open(&self) -> bool {
        return is_command_transaction_open(self);
    }

    fn notify_changed(&self) {
        notify_command_history_changed(self);
    }

    fn redo(&self) -> bool {
        return redo_command(self);
    }

    fn redo_label(&self) -> Option<String> {
        return get_command_history_redo_label(self);
    }

    fn register_binding(&self, kind: &str, binding: CommandBindingRef) {
        register_command_binding(self, kind, binding);
    }

    fn register_default_bindings(&self, access: &CommandPropertyAccessRef) {
        register_default_command_bindings(self, access);
    }

    fn undo(&self) -> bool {
        return undo_command(self);
    }

    fn undo_label(&self) -> Option<String> {
        return get_command_history_undo_label(self);
    }
}
