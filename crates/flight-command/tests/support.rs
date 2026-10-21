use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_command::contract::*;
use flight_entity::{EntityRuntimeSlot, Ref, Unknown};
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

    fn as_any_mut(&mut self) -> &mut dyn Any {
        return self;
    }
}

flight_entity::impl_entity!(TestNode);

pub fn node() -> NodeRef {
    return Arc::new(RwLock::new(create_node::<TestNode>(String::from(
        "test.CommandTarget",
    ))));
}

pub fn history_with_defaults() -> Ref<CommandHistory> {
    let access = create_command_property_access();
    return history_with_property_access(&access);
}

pub fn history_with_property_access(access: &CommandPropertyAccessRef) -> Ref<CommandHistory> {
    let history = create_command_history(None);
    register_default_command_bindings(&history, access);
    return history;
}

/// A deterministic test store for kind-owned node properties: `(target identity, property, value)`.
/// It stands in for the kind's typed fields; it is NOT a dynamic node field store.
/// Slot values keep the command carrier exactly: `None` is TS `undefined`, `Some(Unknown::None)` is
/// explicit null, `Some(Some(..))` is a present value.
pub type TestPropertyStore = Arc<std::sync::Mutex<Vec<(usize, String, Option<Unknown>)>>>;

pub fn property_store() -> TestPropertyStore {
    return Arc::new(std::sync::Mutex::new(Vec::new()));
}

fn target_identity(target: &NodeRef) -> usize {
    return Arc::as_ptr(target) as *const () as usize;
}

pub fn property_access(
    kind: &str,
    property: &str,
    store: &TestPropertyStore,
) -> CommandPropertyAccessRef {
    let access = create_command_property_access();
    register_property(&access, kind, property, store);
    return access;
}

pub fn register_property(
    access: &CommandPropertyAccessRef,
    kind: &str,
    property: &str,
    store: &TestPropertyStore,
) {
    let read_store = store.clone();
    let read_property = String::from(property);
    let write_store = store.clone();
    let write_property = String::from(property);
    register_command_property_access(
        access,
        kind,
        property,
        CommandPropertyAccessor {
            read: Arc::new(move |target: &NodeRef| {
                let identity = target_identity(target);
                let values = read_store.lock().unwrap();
                return values
                    .iter()
                    .find(|(owner, name, _)| *owner == identity && name == &read_property)
                    .and_then(|(_, _, value)| value.clone());
            }),
            write: Arc::new(move |target: &NodeRef, value: Option<Unknown>| {
                let identity = target_identity(target);
                let mut values = write_store.lock().unwrap();
                match values
                    .iter_mut()
                    .find(|(owner, name, _)| *owner == identity && name == &write_property)
                {
                    Some((_, _, current)) => *current = value,
                    None => values.push((identity, write_property.clone(), value)),
                }
            }),
        },
    );
}

pub fn store_set(
    store: &TestPropertyStore,
    target: &NodeRef,
    property: &str,
    value: Option<Unknown>,
) {
    let identity = target_identity(target);
    let mut values = store.lock().unwrap();
    match values
        .iter_mut()
        .find(|(owner, name, _)| *owner == identity && name == property)
    {
        Some((_, _, current)) => *current = value,
        None => values.push((identity, String::from(property), value)),
    }
}

pub fn store_get(store: &TestPropertyStore, target: &NodeRef, property: &str) -> Option<Unknown> {
    let identity = target_identity(target);
    let values = store.lock().unwrap();
    return values
        .iter()
        .find(|(owner, name, _)| *owner == identity && name == property)
        .and_then(|(_, _, value)| value.clone());
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
