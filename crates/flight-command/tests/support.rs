use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_command::contract::*;
use flight_entity::{EntityRuntimeSlot, Ref};
use flight_node::contract::{Node, NodeFields, NodeRef, create_node};

#[derive(Default)]
pub struct TestNode {
    runtime: EntityRuntimeSlot,
    node: NodeFields,
}

impl Node for TestNode {
    fn node_fields(&self) -> &NodeFields {
        return &self.node;
    }

    fn node_fields_mut(&mut self) -> &mut NodeFields {
        return &mut self.node;
    }

    fn as_any(&self) -> &dyn Any {
        return self;
    }
}

flight_entity::impl_entity!(TestNode);

pub fn node() -> NodeRef {
    return Arc::new(RwLock::new(create_node::<TestNode>(
        String::from("test.CommandTarget"),
        None,
    )));
}

pub fn history_with_defaults() -> Ref<CommandHistory> {
    let history = create_command_history(None);
    register_default_command_bindings(&history);
    return history;
}

pub fn inert_binding() -> CommandBindingRef {
    return Arc::new(CommandBinding {
        execute: Arc::new(|_command: &dyn Command| {}),
        merge: None,
        undo: Arc::new(|_command: &dyn Command| {}),
    });
}

/// A custom vendor-prefixed command kind, exactly the open-family case the source describes.
#[derive(Default)]
pub struct VendorCommand {
    runtime: EntityRuntimeSlot,
    fields: CommandFields,
}

impl Command for VendorCommand {
    fn command_fields(&self) -> &CommandFields {
        return &self.fields;
    }

    fn command_fields_mut(&mut self) -> &mut CommandFields {
        return &mut self.fields;
    }

    fn as_any(&self) -> &dyn Any {
        return self;
    }
}

flight_entity::impl_entity!(VendorCommand);

pub fn command(kind: &str, label: &str) -> CommandRef {
    let mut out: VendorCommand = flight_entity::allocate_entity();
    initialize_command_fields(&mut out.fields, kind, label);
    return Arc::new(RwLock::new(out));
}

pub fn erased<T: Command + 'static>(command: Ref<T>) -> CommandRef {
    return command;
}
