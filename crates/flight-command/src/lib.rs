//! Reversible command history: D16 data-only kind-tagged commands, behaviour bound per kind through a
//! caller-owned registry, an undo/redo stack with fork/prune/merge, and transaction brackets. The
//! package stores no closures on the history stack and reads no clock of its own.

mod command;
mod command_binding;
mod command_history;
mod command_history_signals;
mod command_property_access;
mod command_transaction;
mod explain_command_dispatch;
mod sugar;
mod types;

pub mod contract;

pub use contract::create_add_node_child_command;
pub use contract::create_command_binding_table;
pub use contract::create_command_history;
pub use contract::create_command_property_access;
pub use contract::create_composite_command;
pub use contract::create_remove_node_child_command;
pub use contract::create_reorder_node_child_command;
pub use contract::get_command_binding;
pub use contract::get_command_property_access;
pub use contract::has_command_binding;
pub use contract::read_command_property;
pub use contract::register_command_binding;
pub use contract::register_command_property_access;
pub use contract::register_default_command_bindings;
pub use contract::write_command_property;

pub use contract::can_redo_command;
pub use contract::can_undo_command;
pub use contract::clear_command_history;
pub use contract::execute_command;
pub use contract::get_command_history_entries;
pub use contract::get_command_history_index;
pub use contract::get_command_history_redo_label;
pub use contract::get_command_history_undo_label;
pub use contract::redo_command;
pub use contract::undo_command;

pub use contract::abort_command_transaction;
pub use contract::begin_command_transaction;
pub use contract::enable_command_history_signals;
pub use contract::end_command_transaction;
pub use contract::explain_command_dispatch;
pub use contract::get_command_history_signals;
pub use contract::is_command_transaction_open;

pub use contract::CommandHistoryMethods;

pub use contract::ADD_NODE_CHILD_COMMAND_KIND;
pub use contract::AddNodeChildCommand;
pub use contract::COMPOSITE_COMMAND_KIND;
pub use contract::Command;
pub use contract::CommandBinding;
pub use contract::CommandBindingRef;
pub use contract::CommandBindingTable;
pub use contract::CommandDispatchExplanation;
pub use contract::CommandExecute;
pub use contract::CommandFields;
pub use contract::CommandHistory;
pub use contract::CommandMerge;
pub use contract::CommandPropertyAccess;
pub use contract::CommandPropertyAccessRef;
pub use contract::CommandPropertyAccessor;
pub use contract::CommandPropertyAssignment;
pub use contract::CommandPropertyEntry;
pub use contract::CommandPropertyRead;
pub use contract::CommandPropertyWrite;
pub use contract::CommandRef;
pub use contract::CompositeCommand;
pub use contract::REMOVE_NODE_CHILD_COMMAND_KIND;
pub use contract::REORDER_NODE_CHILD_COMMAND_KIND;
pub use contract::RemoveNodeChildCommand;
pub use contract::ReorderNodeChildCommand;
pub use contract::SET_NODE_PROPERTY_COMMAND_KIND;
pub use contract::SetNodePropertyCommand;
