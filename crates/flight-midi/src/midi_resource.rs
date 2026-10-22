use std::sync::{Arc, RwLock};

use flight_entity::{Entity, Ref, allocate_entity, attach_entity_binding, get_entity_binding_as};
use flight_host::ProviderRef;
use flight_stream::SharedFuture;

use crate::types::*;

// flight-lint: allow(conform-extra) D12: provider mocks need a constructor for the source MidiEventAttachment Entity whose only operation is release
pub fn create_midi_event_attachment(
    provider: ProviderRef,
    release: Arc<dyn Fn() -> MidiEventReleaseFuture + Send + Sync>,
) -> Ref<MidiEventAttachment> {
    let mut out: MidiEventAttachment = allocate_entity();
    initialize_midi_event_attachment(&mut out, provider, release);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-extra) D12: construction initializer for the Rust provider-facing MidiEventAttachment factory
pub fn initialize_midi_event_attachment(
    out: &mut MidiEventAttachment,
    provider: ProviderRef,
    release: Arc<dyn Fn() -> MidiEventReleaseFuture + Send + Sync>,
) {
    attach_entity_binding(
        out,
        Box::new(MidiEventAttachmentRuntime { provider, release }),
    );
}

pub fn get_midi_access_resource_state(
    access: &Ref<MidiAccess>,
) -> Option<Ref<MidiAccessResourceState>> {
    let access = access.read().unwrap();
    return get_entity_binding_as::<Ref<MidiAccessResourceState>, MidiAccess>(&access).cloned();
}

pub(crate) fn get_midi_event_attachment_runtime(
    attachment: &Ref<MidiEventAttachment>,
) -> Option<MidiEventAttachmentRuntime> {
    let attachment = attachment.read().unwrap();
    return get_entity_binding_as::<MidiEventAttachmentRuntime, MidiEventAttachment>(&attachment)
        .cloned();
}

pub(crate) fn get_midi_input_port_resource_state(
    port: &Ref<MidiInputPort>,
) -> Option<Ref<MidiPortResourceState>> {
    let port = port.read().unwrap();
    return get_entity_binding_as::<Ref<MidiPortResourceState>, MidiInputPort>(&port).cloned();
}

pub(crate) fn get_midi_output_port_resource_state(
    port: &Ref<MidiOutputPort>,
) -> Option<Ref<MidiPortResourceState>> {
    let port = port.read().unwrap();
    return get_entity_binding_as::<Ref<MidiPortResourceState>, MidiOutputPort>(&port).cloned();
}

pub fn get_midi_port_resource_state(port: &MidiPort) -> Option<Ref<MidiPortResourceState>> {
    return match port {
        MidiPort::Input(port) => get_midi_input_port_resource_state(port),
        MidiPort::Output(port) => get_midi_output_port_resource_state(port),
    };
}

pub(crate) fn get_midi_subscription_runtime<T: Entity>(
    subscription: &Ref<T>,
) -> Option<Ref<MidiSubscriptionRuntime>> {
    let subscription = subscription.read().unwrap();
    return get_entity_binding_as::<Ref<MidiSubscriptionRuntime>, T>(&subscription).cloned();
}

// flight-lint: allow(conform-extra) D18: the source declares release as a MidiEventAttachment method; this free function is its transpilable operation
pub async fn release_midi_event_attachment(
    attachment: &Ref<MidiEventAttachment>,
) -> MidiEventReleaseProviderResult {
    let Some(runtime) = get_midi_event_attachment_runtime(attachment) else {
        return Ok(MidiEventReleaseOutcome {
            reason: MidiEventReleaseReason::OperationFailed,
        });
    };
    let _provider = runtime.provider.clone();
    return (runtime.release)().await;
}

pub fn retain_midi_access_resource_state(
    access: &mut MidiAccess,
    operations: MidiAccessResourceOperations,
) {
    attach_entity_binding(
        access,
        Box::new(Arc::new(RwLock::new(MidiAccessResourceState {
            dispose_completed: false,
            dispose_pending: None,
            disposed: false,
            known_ports: Vec::new(),
            operations,
            subscriptions: Vec::new(),
            dispose_generation: 0,
        }))),
    );
}

pub fn retain_midi_input_port_resource_state(
    port: &mut MidiInputPort,
    operations: MidiInputPortResourceOperations,
) {
    attach_entity_binding(
        port,
        Box::new(Arc::new(RwLock::new(MidiPortResourceState::Input(
            MidiInputPortResourceState {
                dispose_completed: false,
                dispose_pending: None,
                disposed: false,
                flight_opened: false,
                message_subscriptions: Vec::new(),
                operations,
                state_subscriptions: Vec::new(),
                dispose_generation: 0,
            },
        )))),
    );
}

pub fn retain_midi_output_port_resource_state(
    port: &mut MidiOutputPort,
    operations: MidiOutputPortResourceOperations,
) {
    attach_entity_binding(
        port,
        Box::new(Arc::new(RwLock::new(MidiPortResourceState::Output(
            MidiOutputPortResourceState {
                dispose_completed: false,
                dispose_pending: None,
                disposed: false,
                flight_opened: false,
                operations,
                state_subscriptions: Vec::new(),
                dispose_generation: 0,
            },
        )))),
    );
}

pub(crate) fn retain_midi_subscription_runtime<T: Entity>(subscription: &mut T) {
    attach_entity_binding(
        subscription,
        Box::new(Arc::new(RwLock::new(MidiSubscriptionRuntime {
            attachment: None,
            attaching: None,
            attaching_generation: None,
            dispose_completed: false,
            disposed: false,
            generation: 0,
            untrack: None,
        }))),
    );
}

// flight-lint: allow(sugar-delegates) internal lifecycle-state accessors keep enum matching centralized and are not public contract sugar
impl MidiPortResourceState {
    pub(crate) fn dispose_completed(&self) -> bool {
        return match self {
            MidiPortResourceState::Input(state) => state.dispose_completed,
            MidiPortResourceState::Output(state) => state.dispose_completed,
        };
    }

    pub(crate) fn dispose_generation(&self) -> u64 {
        return match self {
            MidiPortResourceState::Input(state) => state.dispose_generation,
            MidiPortResourceState::Output(state) => state.dispose_generation,
        };
    }

    pub(crate) fn dispose_pending(&self) -> Option<SharedFuture<MidiPortDisposeOutcome>> {
        return match self {
            MidiPortResourceState::Input(state) => state.dispose_pending.clone(),
            MidiPortResourceState::Output(state) => state.dispose_pending.clone(),
        };
    }

    pub(crate) fn disposed(&self) -> bool {
        return match self {
            MidiPortResourceState::Input(state) => state.disposed,
            MidiPortResourceState::Output(state) => state.disposed,
        };
    }

    pub(crate) fn flight_opened(&self) -> bool {
        return match self {
            MidiPortResourceState::Input(state) => state.flight_opened,
            MidiPortResourceState::Output(state) => state.flight_opened,
        };
    }

    pub(crate) fn set_dispose_completed(&mut self, value: bool) {
        match self {
            MidiPortResourceState::Input(state) => state.dispose_completed = value,
            MidiPortResourceState::Output(state) => state.dispose_completed = value,
        }
    }

    pub(crate) fn set_dispose_pending(
        &mut self,
        value: Option<SharedFuture<MidiPortDisposeOutcome>>,
    ) {
        match self {
            MidiPortResourceState::Input(state) => state.dispose_pending = value,
            MidiPortResourceState::Output(state) => state.dispose_pending = value,
        }
    }

    pub(crate) fn set_disposed(&mut self, value: bool) {
        match self {
            MidiPortResourceState::Input(state) => state.disposed = value,
            MidiPortResourceState::Output(state) => state.disposed = value,
        }
    }

    pub(crate) fn set_flight_opened(&mut self, value: bool) {
        match self {
            MidiPortResourceState::Input(state) => state.flight_opened = value,
            MidiPortResourceState::Output(state) => state.flight_opened = value,
        }
    }

    pub(crate) fn start_dispose_generation(&mut self) -> u64 {
        return match self {
            MidiPortResourceState::Input(state) => {
                state.dispose_generation += 1;
                state.dispose_generation
            }
            MidiPortResourceState::Output(state) => {
                state.dispose_generation += 1;
                state.dispose_generation
            }
        };
    }
}
