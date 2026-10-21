use std::sync::{Arc, Mutex};

use flight_entity::{AnySlot, FlightError, FlightErrorKind};
use flight_ipc::*;

use crate::block_on;

fn any_slot<T: Send + Sync + 'static>(value: T) -> AnySlot {
    return Some(Box::new(value));
}

fn slot_ref<T: 'static>(value: &AnySlot) -> &T {
    return value.as_ref().unwrap().downcast_ref::<T>().unwrap();
}

struct MessageSubscription {
    active: bool,
    channel: String,
    id: usize,
    listener: IpcMessageListener,
}

struct MessageState {
    next_id: usize,
    subscriptions: Vec<MessageSubscription>,
}

type SharedMessageState = Arc<Mutex<MessageState>>;

fn deliver_message(state: &SharedMessageState, channel: &str, args: &[AnySlot]) {
    let listeners: Vec<IpcMessageListener> = state
        .lock()
        .unwrap()
        .subscriptions
        .iter()
        .filter(|subscription| subscription.active && subscription.channel == channel)
        .map(|subscription| subscription.listener.clone())
        .collect();
    for listener in listeners {
        listener(args);
    }
}

fn message_capability() -> (HostIpcMessageCapability, SharedMessageState) {
    let state = Arc::new(Mutex::new(MessageState {
        next_id: 0,
        subscriptions: Vec::new(),
    }));
    let provider_state = state.clone();
    let subscribe: IpcSubscribe = Arc::new(move |channel, listener| {
        let id = {
            let mut state = provider_state.lock().unwrap();
            let id = state.next_id;
            state.next_id += 1;
            state.subscriptions.push(MessageSubscription {
                active: true,
                channel,
                id,
                listener,
            });
            id
        };
        let release_state = provider_state.clone();
        return Arc::new(move || {
            let mut state = release_state.lock().unwrap();
            if let Some(subscription) = state
                .subscriptions
                .iter_mut()
                .find(|subscription| subscription.id == id)
            {
                subscription.active = false;
            }
        });
    });
    return (HostIpcMessageCapability { subscribe }, state);
}

fn subscriber_count(state: &SharedMessageState, channel: &str) -> usize {
    return state
        .lock()
        .unwrap()
        .subscriptions
        .iter()
        .filter(|subscription| subscription.active && subscription.channel == channel)
        .count();
}

struct InvokeRegistration {
    active: bool,
    channel: String,
    handler: IpcInvokeHandler,
    id: usize,
}

struct InvokeState {
    next_id: usize,
    registrations: Vec<InvokeRegistration>,
}

type SharedInvokeState = Arc<Mutex<InvokeState>>;

fn find_handler(state: &SharedInvokeState, channel: &str) -> Option<IpcInvokeHandler> {
    return state
        .lock()
        .unwrap()
        .registrations
        .iter()
        .find(|registration| registration.active && registration.channel == channel)
        .map(|registration| registration.handler.clone());
}

fn handle_capability() -> (HostIpcHandleCapability, SharedInvokeState) {
    let state = Arc::new(Mutex::new(InvokeState {
        next_id: 0,
        registrations: Vec::new(),
    }));
    let provider_state = state.clone();
    let handle: IpcHandle = Arc::new(move |channel, handler| {
        let id = {
            let mut state = provider_state.lock().unwrap();
            let id = state.next_id;
            state.next_id += 1;
            state.registrations.push(InvokeRegistration {
                active: true,
                channel,
                handler,
                id,
            });
            id
        };
        let release_state = provider_state.clone();
        return Arc::new(move || {
            let mut state = release_state.lock().unwrap();
            if let Some(registration) = state
                .registrations
                .iter_mut()
                .find(|registration| registration.id == id)
            {
                registration.active = false;
            }
        });
    });
    return (HostIpcHandleCapability { handle }, state);
}

#[derive(Debug, PartialEq)]
struct InvokeResponse {
    args: Vec<i32>,
    channel: String,
}

#[derive(Debug)]
struct TestIpcTarget {
    id: i32,
}

mod invoke_ipc {
    use super::*;

    #[test]
    fn preserves_a_rejected_request() {
        let invoke: IpcInvoke = Arc::new(|_channel, _args| {
            let future: IpcInvokeFuture = Box::pin(async {
                Err(FlightError {
                    kind: FlightErrorKind::Error,
                    message: "rejected".to_string(),
                })
            });
            return future;
        });
        let error = block_on(flight_ipc::invoke_ipc(
            &HostIpcInvokeCapability { invoke },
            "compute",
            Vec::new(),
        ))
        .unwrap_err();

        assert_eq!(error.kind, FlightErrorKind::Error);
        assert_eq!(error.message, "rejected");
    }

    #[test]
    fn requires_the_invoke_capability_and_returns_its_response() {
        let invocations = Arc::new(Mutex::new(Vec::new()));
        let captured = invocations.clone();
        let invoke: IpcInvoke = Arc::new(move |channel, args| {
            let values = args
                .iter()
                .map(|value| *slot_ref::<i32>(value))
                .collect::<Vec<_>>();
            captured
                .lock()
                .unwrap()
                .push((channel.clone(), values.clone()));
            let response = InvokeResponse {
                args: values,
                channel,
            };
            let future: IpcInvokeFuture = Box::pin(async move { Ok(any_slot(response)) });
            return future;
        });
        let response = block_on(flight_ipc::invoke_ipc(
            &HostIpcInvokeCapability { invoke },
            "compute",
            vec![any_slot(1_i32), any_slot(2_i32)],
        ))
        .unwrap()
        .unwrap()
        .downcast::<InvokeResponse>()
        .unwrap();

        assert_eq!(
            *response,
            InvokeResponse {
                args: vec![1, 2],
                channel: "compute".to_string(),
            }
        );
        assert_eq!(
            *invocations.lock().unwrap(),
            vec![("compute".to_string(), vec![1, 2])]
        );
    }
}

mod on_ipc_invoke {
    use super::*;

    #[test]
    fn spreads_arguments_and_returns_its_release() {
        let (capability, state) = handle_capability();
        let handler: IpcInvokeHandler = Arc::new(|args| {
            let value = *slot_ref::<i32>(&args[0]) * 2;
            let future: IpcInvokeFuture = Box::pin(async move { Ok(any_slot(value)) });
            return future;
        });
        let stop = flight_ipc::on_ipc_invoke(&capability, "double", handler);
        let registered = find_handler(&state, "double").unwrap();
        let response = block_on(registered(&[any_slot(4_i32)]))
            .unwrap()
            .unwrap()
            .downcast::<i32>()
            .unwrap();

        assert_eq!(*response, 8);
        stop();
        assert!(find_handler(&state, "double").is_none());
    }
}

mod on_ipc_message {
    use super::*;

    #[test]
    fn delivers_every_message_on_its_channel_with_the_sent_arguments() {
        let (capability, state) = message_capability();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let listener: IpcMessageListener = Arc::new(move |args| {
            let first = *slot_ref::<i32>(&args[0]);
            let second = args.get(1).map(|value| slot_ref::<String>(value).clone());
            captured.lock().unwrap().push((first, second));
        });
        flight_ipc::on_ipc_message(&capability, "ping", listener);
        deliver_message(
            &state,
            "ping",
            &[any_slot(1_i32), any_slot("two".to_string())],
        );
        deliver_message(&state, "ping", &[any_slot(3_i32)]);

        assert_eq!(
            *seen.lock().unwrap(),
            vec![(1, Some("two".to_string())), (3, None)]
        );
    }

    #[test]
    fn delivers_only_its_own_channel() {
        let (capability, state) = message_capability();
        let count = Arc::new(Mutex::new(0));
        let captured = count.clone();
        let listener: IpcMessageListener = Arc::new(move |_args| {
            *captured.lock().unwrap() += 1;
        });
        flight_ipc::on_ipc_message(&capability, "wanted", listener);
        deliver_message(&state, "other", &[any_slot(1_i32)]);

        assert_eq!(*count.lock().unwrap(), 0);
    }

    #[test]
    fn routes_each_subscription_to_the_host_it_was_given() {
        let (first_capability, first_state) = message_capability();
        let (second_capability, second_state) = message_capability();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let first_seen = seen.clone();
        let first_listener: IpcMessageListener = Arc::new(move |_args| {
            first_seen.lock().unwrap().push("first".to_string());
        });
        let second_seen = seen.clone();
        let second_listener: IpcMessageListener = Arc::new(move |_args| {
            second_seen.lock().unwrap().push("second".to_string());
        });
        flight_ipc::on_ipc_message(&first_capability, "c", first_listener);
        flight_ipc::on_ipc_message(&second_capability, "c", second_listener);
        deliver_message(&second_state, "c", &[]);
        deliver_message(&first_state, "c", &[]);

        assert_eq!(
            *seen.lock().unwrap(),
            vec!["second".to_string(), "first".to_string()]
        );
    }

    #[test]
    fn unsubscribes_exactly_its_own_subscription() {
        let (capability, state) = message_capability();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let dropped_seen = seen.clone();
        let dropped: IpcMessageListener = Arc::new(move |_args| {
            dropped_seen.lock().unwrap().push("dropped".to_string());
        });
        let stop_dropped = flight_ipc::on_ipc_message(&capability, "shared", dropped);
        let kept_seen = seen.clone();
        let kept: IpcMessageListener = Arc::new(move |_args| {
            kept_seen.lock().unwrap().push("kept".to_string());
        });
        flight_ipc::on_ipc_message(&capability, "shared", kept);
        stop_dropped();
        deliver_message(&state, "shared", &[]);

        assert_eq!(*seen.lock().unwrap(), vec!["kept".to_string()]);
        assert_eq!(subscriber_count(&state, "shared"), 1);
    }
}

mod once_ipc_message {
    use super::*;

    #[test]
    fn delivers_the_first_message_and_then_releases_the_subscription() {
        let (capability, state) = message_capability();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let listener: IpcMessageListener = Arc::new(move |args| {
            captured.lock().unwrap().push(*slot_ref::<i32>(&args[0]));
        });
        flight_ipc::once_ipc_message(&capability, "ping", listener);
        deliver_message(&state, "ping", &[any_slot(1_i32)]);
        deliver_message(&state, "ping", &[any_slot(2_i32)]);

        assert_eq!(*seen.lock().unwrap(), vec![1]);
        assert_eq!(subscriber_count(&state, "ping"), 0);
    }

    #[test]
    fn releases_even_when_the_provider_delivers_during_subscribe() {
        let released = Arc::new(Mutex::new(false));
        let provider_released = released.clone();
        let subscribe: IpcSubscribe = Arc::new(move |_channel, listener| {
            listener(&[any_slot(42_i32)]);
            let captured = provider_released.clone();
            return Arc::new(move || {
                *captured.lock().unwrap() = true;
            });
        });
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let listener: IpcMessageListener = Arc::new(move |args| {
            captured.lock().unwrap().push(*slot_ref::<i32>(&args[0]));
        });
        flight_ipc::once_ipc_message(&HostIpcMessageCapability { subscribe }, "ping", listener);

        assert_eq!(*seen.lock().unwrap(), vec![42]);
        assert!(*released.lock().unwrap());
    }

    #[test]
    fn releases_exactly_once_across_repeated_stop_calls() {
        let releases = Arc::new(Mutex::new(0));
        let provider_releases = releases.clone();
        let subscribe: IpcSubscribe = Arc::new(move |_channel, _listener| {
            let captured = provider_releases.clone();
            return Arc::new(move || {
                *captured.lock().unwrap() += 1;
            });
        });
        let listener: IpcMessageListener = Arc::new(|_args| {});
        let stop =
            flight_ipc::once_ipc_message(&HostIpcMessageCapability { subscribe }, "ping", listener);
        stop();
        stop();

        assert_eq!(*releases.lock().unwrap(), 1);
    }

    #[test]
    fn returns_an_unsubscribe_that_works_before_any_message_arrives() {
        let (capability, state) = message_capability();
        let count = Arc::new(Mutex::new(0));
        let captured = count.clone();
        let listener: IpcMessageListener = Arc::new(move |_args| {
            *captured.lock().unwrap() += 1;
        });
        let stop = flight_ipc::once_ipc_message(&capability, "ping", listener);
        stop();
        deliver_message(&state, "ping", &[]);

        assert_eq!(subscriber_count(&state, "ping"), 0);
        assert_eq!(*count.lock().unwrap(), 0);
    }
}

mod send_ipc_message {
    use super::*;

    #[test]
    fn requires_the_send_capability_and_forwards_the_arguments() {
        let sent = Arc::new(Mutex::new(Vec::new()));
        let captured = sent.clone();
        let send: IpcSend = Arc::new(move |channel, args| {
            let values = args
                .iter()
                .map(|value| {
                    if let Some(value) = value
                        .as_ref()
                        .and_then(|value| value.downcast_ref::<String>())
                    {
                        return value.clone();
                    }
                    return slot_ref::<i32>(value).to_string();
                })
                .collect::<Vec<_>>();
            captured.lock().unwrap().push((channel.to_string(), values));
        });
        flight_ipc::send_ipc_message(
            &HostIpcSendCapability { send },
            "log",
            vec![any_slot("hello".to_string()), any_slot(7_i32)],
        );

        assert_eq!(
            *sent.lock().unwrap(),
            vec![(
                "log".to_string(),
                vec!["hello".to_string(), "7".to_string()]
            )]
        );
    }
}

mod send_ipc_message_to {
    use super::*;

    #[test]
    fn forwards_the_target_unchanged_with_the_channel_and_arguments() {
        let sent = Arc::new(Mutex::new(Vec::new()));
        let captured = sent.clone();
        let send: IpcTargetedSend<TestIpcTarget> = Arc::new(move |target, channel, args| {
            captured.lock().unwrap().push((
                target as *const TestIpcTarget as usize,
                target.id,
                channel.to_string(),
                slot_ref::<String>(&args[0]).clone(),
            ));
        });
        let capability = flight_ipc::contract::create_host_ipc_targeted_send_capability(send);
        let target = TestIpcTarget { id: 7 };
        flight_ipc::send_ipc_message_to(
            &capability,
            &target,
            "log",
            vec![any_slot("hello".to_string())],
        );

        assert_eq!(
            *sent.lock().unwrap(),
            vec![(
                &target as *const TestIpcTarget as usize,
                7,
                "log".to_string(),
                "hello".to_string(),
            )]
        );
    }
}
