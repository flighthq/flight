use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_stream::create_shared_future;

use crate::midi_resource::{
    get_midi_output_port_resource_state, get_midi_port_resource_state,
    retain_midi_input_port_resource_state, retain_midi_output_port_resource_state,
};
use crate::midi_subscription::{
    dispose_midi_input_message_subscription, dispose_midi_port_state_subscription,
};
use crate::types::*;

struct MidiPortOperationSnapshot {
    close: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
    get_connection: Arc<dyn Fn() -> MidiPortConnectionProviderResult + Send + Sync>,
    get_state: Arc<dyn Fn() -> MidiPortStateProviderResult + Send + Sync>,
    open: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
}

pub fn create_midi_input_port_resource(
    metadata: &MidiPortMetadata,
    operations: MidiInputPortResourceOperations,
) -> Ref<MidiInputPort> {
    let mut out: MidiInputPort = allocate_entity();
    initialize_midi_input_port_resource(&mut out, metadata);
    retain_midi_input_port_resource_state(&mut out, operations);
    return Arc::new(RwLock::new(out));
}

pub fn create_midi_output_port_resource(
    metadata: &MidiPortMetadata,
    operations: MidiOutputPortResourceOperations,
) -> Ref<MidiOutputPort> {
    let mut out: MidiOutputPort = allocate_entity();
    initialize_midi_output_port_resource(&mut out, metadata);
    retain_midi_output_port_resource_state(&mut out, operations);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_midi_input_port_resource(out: &mut MidiInputPort, metadata: &MidiPortMetadata) {
    out.id = metadata.id.clone();
    out.manufacturer = metadata.manufacturer.clone();
    out.name = metadata.name.clone();
    out.type_ = MidiPortType::Input;
    out.version = metadata.version.clone();
}

pub fn initialize_midi_output_port_resource(out: &mut MidiOutputPort, metadata: &MidiPortMetadata) {
    out.id = metadata.id.clone();
    out.manufacturer = metadata.manufacturer.clone();
    out.name = metadata.name.clone();
    out.type_ = MidiPortType::Output;
    out.version = metadata.version.clone();
}

pub async fn close_midi_port(port: &MidiPort) -> MidiPortCloseOutcome {
    let Some(state) = get_midi_port_resource_state(port) else {
        return MidiPortCloseOutcome {
            reason: MidiPortCloseReason::OperationFailed,
        };
    };
    let operations = {
        let state = state.read().unwrap();
        if state.disposed() {
            return MidiPortCloseOutcome {
                reason: MidiPortCloseReason::Disposed,
            };
        }
        midi_port_operation_snapshot(&state)
    };
    let connection = match (operations.get_connection)() {
        Ok(connection) => connection,
        Err(_) => {
            return MidiPortCloseOutcome {
                reason: MidiPortCloseReason::OperationFailed,
            };
        }
    };
    if connection == MidiPortConnection::Closed {
        return MidiPortCloseOutcome {
            reason: MidiPortCloseReason::AlreadyClosed,
        };
    }
    if (operations.close)().await.is_err() {
        return MidiPortCloseOutcome {
            reason: MidiPortCloseReason::OperationFailed,
        };
    }
    state.write().unwrap().set_flight_opened(false);
    return MidiPortCloseOutcome {
        reason: MidiPortCloseReason::Closed,
    };
}

pub async fn dispose_midi_port(port: &MidiPort) -> MidiPortDisposeOutcome {
    let Some(state) = get_midi_port_resource_state(port) else {
        return MidiPortDisposeOutcome {
            failures: None,
            reason: MidiPortDisposeReason::AlreadyDisposed,
        };
    };
    let (generation, pending) = {
        let mut state = state.write().unwrap();
        if state.dispose_completed() {
            return MidiPortDisposeOutcome {
                failures: None,
                reason: MidiPortDisposeReason::AlreadyDisposed,
            };
        }
        if let Some(pending) = state.dispose_pending() {
            (state.dispose_generation(), pending)
        } else {
            state.set_disposed(true);
            let generation = state.start_dispose_generation();
            let target = port.clone();
            let pending = create_shared_future(Box::pin(async move {
                return dispose_owned_midi_port(&target).await;
            }));
            state.set_dispose_pending(Some(pending.clone()));
            (generation, pending)
        }
    };
    let outcome = pending.await;
    let mut state = state.write().unwrap();
    if state.dispose_generation() == generation {
        state.set_dispose_pending(None);
    }
    return outcome;
}

async fn dispose_owned_midi_port(port: &MidiPort) -> MidiPortDisposeOutcome {
    let Some(state) = get_midi_port_resource_state(port) else {
        return MidiPortDisposeOutcome {
            failures: None,
            reason: MidiPortDisposeReason::AlreadyDisposed,
        };
    };
    let state_subscriptions = {
        let state = state.read().unwrap();
        match &*state {
            MidiPortResourceState::Input(state) => state.state_subscriptions.clone(),
            MidiPortResourceState::Output(state) => state.state_subscriptions.clone(),
        }
    };
    let mut failures = Vec::new();
    for subscription in state_subscriptions {
        let outcome = dispose_midi_port_state_subscription(&subscription).await;
        if outcome.reason == MidiSubscriptionDisposeReason::OperationFailed
            && outcome.release_failed == Some(true)
        {
            failures.push(MidiPortLifecycleFailure {
                operation: MidiPortLifecycleFailureOperation::StateSubscriptionRelease,
            });
        } else {
            let mut state = state.write().unwrap();
            match &mut *state {
                MidiPortResourceState::Input(state) => state
                    .state_subscriptions
                    .retain(|candidate| !Arc::ptr_eq(candidate, &subscription)),
                MidiPortResourceState::Output(state) => state
                    .state_subscriptions
                    .retain(|candidate| !Arc::ptr_eq(candidate, &subscription)),
            }
        }
    }
    let message_subscriptions = {
        let state = state.read().unwrap();
        match &*state {
            MidiPortResourceState::Input(state) => state.message_subscriptions.clone(),
            MidiPortResourceState::Output(_) => Vec::new(),
        }
    };
    for subscription in message_subscriptions {
        let outcome = dispose_midi_input_message_subscription(&subscription).await;
        if outcome.reason == MidiSubscriptionDisposeReason::OperationFailed
            && outcome.release_failed == Some(true)
        {
            failures.push(MidiPortLifecycleFailure {
                operation: MidiPortLifecycleFailureOperation::MessageSubscriptionRelease,
            });
        } else {
            let mut state = state.write().unwrap();
            if let MidiPortResourceState::Input(state) = &mut *state {
                state
                    .message_subscriptions
                    .retain(|candidate| !Arc::ptr_eq(candidate, &subscription));
            }
        }
    }
    let (flight_opened, operations) = {
        let state = state.read().unwrap();
        (state.flight_opened(), midi_port_operation_snapshot(&state))
    };
    if flight_opened {
        let connection_is_closed = matches!(
            (operations.get_connection)(),
            Ok(MidiPortConnection::Closed)
        );
        if !connection_is_closed {
            if (operations.close)().await.is_ok() {
                state.write().unwrap().set_flight_opened(false);
            } else {
                failures.push(MidiPortLifecycleFailure {
                    operation: MidiPortLifecycleFailureOperation::Close,
                });
            }
        }
    }
    if !failures.is_empty() {
        return MidiPortDisposeOutcome {
            failures: Some(failures),
            reason: MidiPortDisposeReason::OperationFailed,
        };
    }
    {
        let mut state = state.write().unwrap();
        state.set_flight_opened(false);
        state.set_dispose_completed(true);
    }
    return MidiPortDisposeOutcome {
        failures: None,
        reason: MidiPortDisposeReason::Ok,
    };
}

fn get_basic_midi_message_length(status: u8) -> Option<usize> {
    if status < 0x80 {
        return None;
    }
    if status < 0xf0 {
        return Some(if status < 0xc0 || status >= 0xe0 {
            3
        } else {
            2
        });
    }
    return match status {
        0xf1 | 0xf3 => Some(2),
        0xf2 => Some(3),
        0xf6 | 0xf8 | 0xfa | 0xfb | 0xfc | 0xfe | 0xff => Some(1),
        _ => None,
    };
}

pub fn get_midi_port_connection(port: &MidiPort) -> MidiPortConnectionOutcome {
    let Some(state) = get_midi_port_resource_state(port) else {
        return MidiPortConnectionOutcome {
            connection: None,
            reason: MidiPortConnectionOutcomeReason::OperationFailed,
        };
    };
    let operation = {
        let state = state.read().unwrap();
        if state.disposed() {
            return MidiPortConnectionOutcome {
                connection: None,
                reason: MidiPortConnectionOutcomeReason::Disposed,
            };
        }
        midi_port_operation_snapshot(&state).get_connection
    };
    return read_midi_port_connection(operation);
}

pub fn get_midi_port_state(port: &MidiPort) -> MidiPortStateOutcome {
    let Some(state) = get_midi_port_resource_state(port) else {
        return MidiPortStateOutcome {
            reason: MidiPortStateOutcomeReason::OperationFailed,
            state: None,
        };
    };
    let operation = {
        let state = state.read().unwrap();
        if state.disposed() {
            return MidiPortStateOutcome {
                reason: MidiPortStateOutcomeReason::Disposed,
                state: None,
            };
        }
        midi_port_operation_snapshot(&state).get_state
    };
    return match operation() {
        Ok(port_state) => MidiPortStateOutcome {
            reason: MidiPortStateOutcomeReason::Ok,
            state: Some(port_state),
        },
        Err(_) => MidiPortStateOutcome {
            reason: MidiPortStateOutcomeReason::OperationFailed,
            state: None,
        },
    };
}

fn midi_port_operation_snapshot(state: &MidiPortResourceState) -> MidiPortOperationSnapshot {
    return match state {
        MidiPortResourceState::Input(state) => MidiPortOperationSnapshot {
            close: state.operations.close.clone(),
            get_connection: state.operations.get_connection.clone(),
            get_state: state.operations.get_state.clone(),
            open: state.operations.open.clone(),
        },
        MidiPortResourceState::Output(state) => MidiPortOperationSnapshot {
            close: state.operations.close.clone(),
            get_connection: state.operations.get_connection.clone(),
            get_state: state.operations.get_state.clone(),
            open: state.operations.open.clone(),
        },
    };
}

pub async fn open_midi_port(port: &MidiPort) -> MidiPortOpenOutcome {
    let Some(state) = get_midi_port_resource_state(port) else {
        return MidiPortOpenOutcome {
            reason: MidiPortOpenReason::OperationFailed,
        };
    };
    let operations = {
        let state = state.read().unwrap();
        if state.disposed() {
            return MidiPortOpenOutcome {
                reason: MidiPortOpenReason::Disposed,
            };
        }
        midi_port_operation_snapshot(&state)
    };
    let port_state = match (operations.get_state)() {
        Ok(port_state) => port_state,
        Err(_) => {
            return MidiPortOpenOutcome {
                reason: MidiPortOpenReason::OperationFailed,
            };
        }
    };
    if port_state == MidiPortState::Disconnected {
        return MidiPortOpenOutcome {
            reason: MidiPortOpenReason::Disconnected,
        };
    }
    let connection = match (operations.get_connection)() {
        Ok(connection) => connection,
        Err(_) => {
            return MidiPortOpenOutcome {
                reason: MidiPortOpenReason::OperationFailed,
            };
        }
    };
    if connection == MidiPortConnection::Open {
        return MidiPortOpenOutcome {
            reason: MidiPortOpenReason::AlreadyOpen,
        };
    }
    if connection == MidiPortConnection::Pending {
        return MidiPortOpenOutcome {
            reason: MidiPortOpenReason::OperationFailed,
        };
    }
    if (operations.open)().await.is_err() {
        return MidiPortOpenOutcome {
            reason: MidiPortOpenReason::OperationFailed,
        };
    }
    state.write().unwrap().set_flight_opened(true);
    return MidiPortOpenOutcome {
        reason: MidiPortOpenReason::Opened,
    };
}

fn read_midi_port_connection(
    operation: Arc<dyn Fn() -> MidiPortConnectionProviderResult + Send + Sync>,
) -> MidiPortConnectionOutcome {
    return match operation() {
        Ok(connection) => MidiPortConnectionOutcome {
            connection: Some(connection),
            reason: MidiPortConnectionOutcomeReason::Ok,
        },
        Err(_) => MidiPortConnectionOutcome {
            connection: None,
            reason: MidiPortConnectionOutcomeReason::OperationFailed,
        },
    };
}

// flight-lint: allow(f64) D1: Web MIDI send timestamps are optional fractional millisecond values forwarded without rounding
pub fn send_midi_message(
    port: &Ref<MidiOutputPort>,
    data: &flight_entity::Uint8Array,
    timestamp: Option<f64>,
) -> MidiMessageSendOutcome {
    if let Some(reason) = validate_basic_midi_message(data, timestamp) {
        return MidiMessageSendOutcome { reason };
    }
    let Some(state) = get_midi_output_port_resource_state(port) else {
        return MidiMessageSendOutcome {
            reason: MidiMessageSendReason::OperationFailed,
        };
    };
    let (get_state, get_connection, send) = {
        let state = state.read().unwrap();
        let MidiPortResourceState::Output(state) = &*state else {
            return MidiMessageSendOutcome {
                reason: MidiMessageSendReason::OperationFailed,
            };
        };
        if state.disposed {
            return MidiMessageSendOutcome {
                reason: MidiMessageSendReason::Disposed,
            };
        }
        (
            state.operations.get_state.clone(),
            state.operations.get_connection.clone(),
            state.operations.send.clone(),
        )
    };
    let port_state = match get_state() {
        Ok(port_state) => port_state,
        Err(_) => {
            return MidiMessageSendOutcome {
                reason: MidiMessageSendReason::OperationFailed,
            };
        }
    };
    if port_state == MidiPortState::Disconnected {
        return MidiMessageSendOutcome {
            reason: MidiMessageSendReason::Disconnected,
        };
    }
    let connection = match get_connection() {
        Ok(connection) => connection,
        Err(_) => {
            return MidiMessageSendOutcome {
                reason: MidiMessageSendReason::OperationFailed,
            };
        }
    };
    if connection != MidiPortConnection::Open {
        return MidiMessageSendOutcome {
            reason: MidiMessageSendReason::NotOpen,
        };
    }
    return match send(data.to_vec(), timestamp) {
        Ok(()) => MidiMessageSendOutcome {
            reason: MidiMessageSendReason::Sent,
        },
        Err(_) => MidiMessageSendOutcome {
            reason: MidiMessageSendReason::OperationFailed,
        },
    };
}

// flight-lint: allow(f64) D1: Web MIDI send timestamps are fractional millisecond values validated without narrowing
fn validate_basic_midi_message(
    data: &flight_entity::Uint8Array,
    timestamp: Option<f64>,
) -> Option<MidiMessageSendReason> {
    if timestamp.is_some_and(|value| !value.is_finite() || value < 0.0) || data.is_empty() {
        return Some(MidiMessageSendReason::InvalidMessage);
    }
    let status = data[0];
    if status == 0xf0 {
        return Some(MidiMessageSendReason::SystemExclusiveNotEnabled);
    }
    let Some(expected_length) = get_basic_midi_message_length(status) else {
        return Some(MidiMessageSendReason::InvalidMessage);
    };
    if data.len() != expected_length || data[1..].iter().any(|byte| *byte > 0x7f) {
        return Some(MidiMessageSendReason::InvalidMessage);
    }
    return None;
}
