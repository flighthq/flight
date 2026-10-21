//! Command-owned declarations (TS `types/src/Command.ts`): the data-only kind-tagged command family,
//! the binding record and table, the history entity, and the dispatch explanation.
//!
//! D16: the built-in kinds compose the shared `CommandFields` and dereference to it. Behaviour is
//! never stored on a command — a `CommandBinding` registered per kind supplies execute/undo/merge at
//! dispatch time, which keeps a history stack free of closures.

// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 structural command family accessors and Deref composition are contract dispatch, not convenience methods

use std::any::Any;
use std::sync::Arc;

use flight_entity::{Entity, EntityRuntimeSlot, Kind, Ref, Unknown};
use flight_node::contract::{Node, NodeFields, NodeRef};
use flight_registry::KindMap;
use flight_signals::Signal;

/// The `AddNodeChildCommand` kind (TS string union member).
pub const ADD_NODE_CHILD_COMMAND_KIND: &str = "AddNodeChildCommand";
/// The `CompositeCommand` kind.
pub const COMPOSITE_COMMAND_KIND: &str = "CompositeCommand";
/// The `RemoveNodeChildCommand` kind.
pub const REMOVE_NODE_CHILD_COMMAND_KIND: &str = "RemoveNodeChildCommand";
/// The `ReorderNodeChildCommand` kind.
pub const REORDER_NODE_CHILD_COMMAND_KIND: &str = "ReorderNodeChildCommand";
/// The `SetNodePropertyCommand` kind.
pub const SET_NODE_PROPERTY_COMMAND_KIND: &str = "SetNodePropertyCommand";

/// A shared command identity (TS `Command` object identity).
pub type CommandRef = Ref<dyn Command>;

/// The behaviour registered for one command kind (TS `CommandBinding.execute`).
pub type CommandExecute = Arc<dyn Fn(&dyn Command) + Send + Sync>;

/// Folds `next` into `previous`, returning the combined command or `None` to keep them separate
/// (TS `CommandBinding.merge`).
pub type CommandMerge = Arc<dyn Fn(&dyn Command, &dyn Command) -> Option<CommandRef> + Send + Sync>;

/// The behaviour bound to one command kind. `execute` and `undo` are required together: a command
/// kind that cannot be reversed is not a command.
#[derive(Clone)]
pub struct CommandBinding {
    pub execute: CommandExecute,
    pub merge: Option<CommandMerge>,
    pub undo: CommandExecute,
}

/// A shared binding, so a registry lookup returns the exact registered object (TS object identity).
pub type CommandBindingRef = Arc<CommandBinding>;

/// The per-history dispatch table (TS `ReadonlyMap<Kind, CommandBinding>`).
pub type CommandBindingTable = KindMap<CommandBindingRef>;

/// The fields every command has (TS `Command`): an open kind name and a human-readable label. The
/// entity runtime slot lives here so every concrete command is an Entity.
pub struct CommandFields {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub label: String,
}

/// Any command (TS `Command`, an open base contract). Concrete kinds compose `CommandFields`.
pub trait Command: Entity + Any + Send + Sync {
    fn command_fields(&self) -> &CommandFields;
    fn command_fields_mut(&mut self) -> &mut CommandFields;
    fn as_any(&self) -> &dyn Any;

    fn as_composite(&self) -> Option<&CompositeCommand> {
        return None;
    }
}

/// One entry of a property change (TS `CommandPropertyEntry`): the target, the field, and the values
/// on both sides. `after` keeps the canonical `Unknown` identity. `before` is `Option<Unknown>` so
/// an absent read (TS `undefined`) stays distinct from an explicit null (`Some(Unknown::None)`); a
/// TS `undefined` passed as `after` cannot occur through the typed signature (structural
/// non-representable, no source test passes one).
#[derive(Clone)]
pub struct CommandPropertyEntry {
    pub after: Unknown,
    pub before: Option<Unknown>,
    pub property: String,
    pub target: NodeRef,
}

/// One requested assignment for `create_set_node_property_command_batch` (TS inline record): the
/// field, its target, and the value to apply.
#[derive(Clone)]
pub struct CommandPropertyAssignment {
    pub property: String,
    pub target: NodeRef,
    pub value: Unknown,
}

/// Reads one registered node property (TS `NodeAny[property]`); `None` is TS `undefined`.
pub type CommandPropertyRead = Arc<dyn Fn(&NodeRef) -> Option<Unknown> + Send + Sync>;

/// Writes one registered node property (TS `NodeAny[property] = value`).
pub type CommandPropertyWrite = Arc<dyn Fn(&NodeRef, Unknown) + Send + Sync>;

/// The typed accessors for one `(Kind, property)` entry (Principal db87e24b).
#[derive(Clone)]
pub struct CommandPropertyAccessor {
    pub read: CommandPropertyRead,
    pub write: CommandPropertyWrite,
}

/// Caller-owned explicit-context property-access registry (D5), keyed by `(Kind, property)` in
/// deterministic registration order. A missing entry reads as `undefined` and writes as a NO-OP;
/// the JS ad-hoc create-new-field family is non-representable under D16.
pub struct CommandPropertyAccess {
    pub(crate) entries: Vec<(Kind, String, CommandPropertyAccessor)>,
}

/// A shared property-access registry, so bindings resolve accessors at call time.
pub type CommandPropertyAccessRef = Ref<CommandPropertyAccess>;

/// Adds `child` to `parent`; `index` of `-1` appends.
pub struct AddNodeChildCommand {
    pub(crate) fields: CommandFields,
    pub child: NodeRef,
    pub index: i32,
    pub parent: NodeRef,
}

/// Several commands applied as one history entry.
pub struct CompositeCommand {
    pub(crate) fields: CommandFields,
    pub children: Vec<CommandRef>,
}

/// Removes `child` from `parent`, remembering the index it occupied at creation.
pub struct RemoveNodeChildCommand {
    pub(crate) fields: CommandFields,
    pub child: NodeRef,
    pub index: i32,
    pub parent: NodeRef,
}

/// Moves `child` to `to_index`, remembering where it started.
pub struct ReorderNodeChildCommand {
    pub(crate) fields: CommandFields,
    pub child: NodeRef,
    pub from_index: i32,
    pub parent: NodeRef,
    pub to_index: i32,
}

/// One or more property assignments applied together.
// flight-lint: allow(f64) D1: the merge window and caller-supplied timestamp are JS numbers (durations/timestamps precedent, flight-signals)
pub struct SetNodePropertyCommand {
    pub(crate) fields: CommandFields,
    pub entries: Vec<CommandPropertyEntry>,
    pub merge_window: f64,
    pub time: f64,
}

/// An undo/redo stack over commands plus the bindings that give its entries behaviour (TS
/// `CommandHistory`). Held behind `Ref<CommandHistory>` so bindings that need the history (the
/// composite binding) can hold a weak handle without a cycle.
pub struct CommandHistory {
    runtime: EntityRuntimeSlot,
    pub bindings: CommandBindingTable,
    pub entries: Vec<CommandRef>,
    pub index: usize,
    pub max_size: i32,
    pub on_change: Option<Signal<()>>,
    pub transaction_depth: u32,
    pub transaction_index: usize,
    pub transaction_label: Option<String>,
}

/// Why a dispatch would not happen (TS `CommandDispatchExplanation`), as plain data.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CommandDispatchExplanation {
    pub missing_kind: Option<Kind>,
    pub resolved: bool,
}

/// The empty node a `Default` command holds before `initialize_*` supplies the real target. Commands
/// are always constructed through `create_*`/`initialize_*`, so this node is never observed or
/// dispatched; it only satisfies the D12 allocation hook.
struct UnboundTarget {
    runtime: EntityRuntimeSlot,
    node: NodeFields,
}

fn default_node_ref() -> NodeRef {
    return Arc::new(std::sync::RwLock::new(UnboundTarget {
        runtime: EntityRuntimeSlot::default(),
        node: NodeFields::default(),
    }));
}

impl Default for CommandFields {
    fn default() -> Self {
        return CommandFields {
            runtime: EntityRuntimeSlot::default(),
            kind: String::new(),
            label: String::new(),
        };
    }
}

impl Default for AddNodeChildCommand {
    fn default() -> Self {
        return AddNodeChildCommand {
            fields: CommandFields::default(),
            child: default_node_ref(),
            index: -1,
            parent: default_node_ref(),
        };
    }
}

impl Default for CompositeCommand {
    fn default() -> Self {
        return CompositeCommand {
            fields: CommandFields::default(),
            children: Vec::new(),
        };
    }
}

impl Default for RemoveNodeChildCommand {
    fn default() -> Self {
        return RemoveNodeChildCommand {
            fields: CommandFields::default(),
            child: default_node_ref(),
            index: -1,
            parent: default_node_ref(),
        };
    }
}

impl Default for ReorderNodeChildCommand {
    fn default() -> Self {
        return ReorderNodeChildCommand {
            fields: CommandFields::default(),
            child: default_node_ref(),
            from_index: -1,
            parent: default_node_ref(),
            to_index: -1,
        };
    }
}

impl Default for SetNodePropertyCommand {
    fn default() -> Self {
        return SetNodePropertyCommand {
            fields: CommandFields::default(),
            entries: Vec::new(),
            merge_window: 0.0,
            time: 0.0,
        };
    }
}

impl Default for CommandHistory {
    fn default() -> Self {
        return CommandHistory {
            runtime: EntityRuntimeSlot::default(),
            bindings: KindMap {
                entries: std::collections::HashMap::new(),
                key_order: Vec::new(),
            },
            entries: Vec::new(),
            index: 0,
            max_size: 0,
            on_change: None,
            transaction_depth: 0,
            transaction_index: 0,
            transaction_label: None,
        };
    }
}

impl std::ops::Deref for AddNodeChildCommand {
    type Target = CommandFields;

    fn deref(&self) -> &CommandFields {
        return &self.fields;
    }
}

impl std::ops::DerefMut for AddNodeChildCommand {
    fn deref_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl std::ops::Deref for CompositeCommand {
    type Target = CommandFields;

    fn deref(&self) -> &CommandFields {
        return &self.fields;
    }
}

impl std::ops::DerefMut for CompositeCommand {
    fn deref_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl std::ops::Deref for RemoveNodeChildCommand {
    type Target = CommandFields;

    fn deref(&self) -> &CommandFields {
        return &self.fields;
    }
}

impl std::ops::DerefMut for RemoveNodeChildCommand {
    fn deref_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl std::ops::Deref for ReorderNodeChildCommand {
    type Target = CommandFields;

    fn deref(&self) -> &CommandFields {
        return &self.fields;
    }
}

impl std::ops::DerefMut for ReorderNodeChildCommand {
    fn deref_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl std::ops::Deref for SetNodePropertyCommand {
    type Target = CommandFields;

    fn deref(&self) -> &CommandFields {
        return &self.fields;
    }
}

impl std::ops::DerefMut for SetNodePropertyCommand {
    fn deref_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl Command for AddNodeChildCommand {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn command_fields(&self) -> &CommandFields {
        return &self.fields;
    }

    fn command_fields_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl Command for CompositeCommand {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn as_composite(&self) -> Option<&CompositeCommand> {
        return Some(self);
    }

    fn command_fields(&self) -> &CommandFields {
        return &self.fields;
    }

    fn command_fields_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl Command for RemoveNodeChildCommand {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn command_fields(&self) -> &CommandFields {
        return &self.fields;
    }

    fn command_fields_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl Command for ReorderNodeChildCommand {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn command_fields(&self) -> &CommandFields {
        return &self.fields;
    }

    fn command_fields_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

impl Command for SetNodePropertyCommand {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn command_fields(&self) -> &CommandFields {
        return &self.fields;
    }

    fn command_fields_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }
}

flight_entity::impl_entity!(AddNodeChildCommand);
flight_entity::impl_entity!(CompositeCommand);
flight_entity::impl_entity!(RemoveNodeChildCommand);
flight_entity::impl_entity!(ReorderNodeChildCommand);
flight_entity::impl_entity!(SetNodePropertyCommand);
flight_entity::impl_entity!(CommandHistory);

impl Node for UnboundTarget {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn node_fields(&self) -> &NodeFields {
        return &self.node;
    }

    fn node_fields_mut(&mut self) -> &mut NodeFields {
        return &mut self.node;
    }
}

flight_entity::impl_entity!(UnboundTarget);
