mod midi_access_test;
mod midi_operations_test;
mod midi_permission_test;
mod midi_port_test;
mod midi_resource_test;
mod midi_subscription_test;
mod types_test;

use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_midi::contract::*;

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

fn error() -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: "provider failed".to_string(),
    };
}

fn metadata(id: &str) -> MidiPortMetadata {
    return MidiPortMetadata {
        id: id.to_string(),
        manufacturer: Some("Flight".to_string()),
        name: Some(format!("Port {id}")),
        version: Some("1".to_string()),
    };
}

fn successful_attachment() -> Ref<MidiEventAttachment> {
    return create_midi_event_attachment(
        Arc::new("attachment".to_string()),
        Arc::new(|| {
            Box::pin(async {
                Ok(MidiEventReleaseOutcome {
                    reason: MidiEventReleaseReason::Ok,
                })
            })
        }),
    );
}

fn input_port(id: &str) -> Ref<MidiInputPort> {
    return create_midi_input_port_resource(
        &metadata(id),
        MidiInputPortResourceOperations {
            attach_message: Arc::new(|_listener| {
                Box::pin(async {
                    Ok(MidiEventBackendAttachOutcome {
                        attachment: Some(successful_attachment()),
                        reason: MidiEventBackendAttachReason::Ok,
                        release_failed: None,
                    })
                })
            }),
            attach_state_change: Arc::new(|_listener| {
                Box::pin(async {
                    Ok(MidiEventBackendAttachOutcome {
                        attachment: Some(successful_attachment()),
                        reason: MidiEventBackendAttachReason::Ok,
                        release_failed: None,
                    })
                })
            }),
            close: Arc::new(|| Box::pin(async { Ok(()) })),
            get_connection: Arc::new(|| Ok(MidiPortConnection::Closed)),
            get_state: Arc::new(|| Ok(MidiPortState::Connected)),
            open: Arc::new(|| Box::pin(async { Ok(()) })),
            provider: Arc::new(format!("input-{id}")),
        },
    );
}

fn output_port(id: &str) -> Ref<MidiOutputPort> {
    return create_midi_output_port_resource(
        &metadata(id),
        MidiOutputPortResourceOperations {
            attach_state_change: Arc::new(|_listener| {
                Box::pin(async {
                    Ok(MidiEventBackendAttachOutcome {
                        attachment: Some(successful_attachment()),
                        reason: MidiEventBackendAttachReason::Ok,
                        release_failed: None,
                    })
                })
            }),
            close: Arc::new(|| Box::pin(async { Ok(()) })),
            get_connection: Arc::new(|| Ok(MidiPortConnection::Closed)),
            get_state: Arc::new(|| Ok(MidiPortState::Connected)),
            open: Arc::new(|| Box::pin(async { Ok(()) })),
            provider: Arc::new(format!("output-{id}")),
            send: Arc::new(|_data, _timestamp| Ok(())),
        },
    );
}

struct Deferred<T> {
    value: Arc<Mutex<Option<T>>>,
}

struct DeferredResolver<T> {
    value: Arc<Mutex<Option<T>>>,
}

fn deferred<T>() -> (Deferred<T>, DeferredResolver<T>) {
    let value = Arc::new(Mutex::new(None));
    return (
        Deferred {
            value: value.clone(),
        },
        DeferredResolver { value },
    );
}

impl<T> Future for Deferred<T> {
    type Output = T;

    fn poll(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<Self::Output> {
        return match self.value.lock().unwrap().take() {
            Some(value) => Poll::Ready(value),
            None => Poll::Pending,
        };
    }
}

impl<T> DeferredResolver<T> {
    fn resolve(&self, value: T) {
        *self.value.lock().unwrap() = Some(value);
    }
}
