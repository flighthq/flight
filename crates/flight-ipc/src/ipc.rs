use std::sync::{Arc, Mutex};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use flight_entity::AnySlot;
    use std::sync::{Arc, Mutex};

    fn int_slot(value: i32) -> AnySlot {
        return Some(Box::new(value));
    }

    fn slot_int(value: AnySlot) -> i32 {
        return *value.unwrap().downcast::<i32>().unwrap();
    }

    #[derive(Debug)]
    struct Target {
        id: i32,
    }

    #[test]
    fn invoke_method_matches_invoke_ipc() {
        let invoke: IpcInvoke = Arc::new(|_channel, _args| {
            let future: IpcInvokeFuture = Box::pin(async { Ok(int_slot(7)) });
            return future;
        });
        let capability = HostIpcInvokeCapability { invoke };
        let via_method = block_on(capability.invoke("compute", Vec::new())).unwrap();
        let via_free = block_on(invoke_ipc(&capability, "compute", Vec::new())).unwrap();
        assert_eq!(slot_int(via_method), slot_int(via_free));
    }

    #[test]
    fn on_invoke_method_matches_on_ipc_invoke() {
        let releases = Arc::new(Mutex::new(0));
        let captured = releases.clone();
        let handle: IpcHandle = Arc::new(move |_channel, _handler| {
            let captured = captured.clone();
            return Arc::new(move || *captured.lock().unwrap() += 1);
        });
        let capability = HostIpcHandleCapability { handle };
        let handler: IpcInvokeHandler = Arc::new(|_args| {
            let future: IpcInvokeFuture = Box::pin(async { Ok(None) });
            return future;
        });
        let via_method = capability.on_invoke("compute", handler.clone());
        let via_free = on_ipc_invoke(&capability, "compute", handler);
        via_method();
        let method_releases = *releases.lock().unwrap();
        via_free();
        assert_eq!(method_releases, *releases.lock().unwrap() - 1);
    }

    #[test]
    fn on_message_method_matches_on_ipc_message() {
        let subscribe: IpcSubscribe = Arc::new(|_channel, listener| {
            listener(&[]);
            return Arc::new(|| {});
        });
        let capability = HostIpcMessageCapability { subscribe };
        let method_count = Arc::new(Mutex::new(0));
        let captured = method_count.clone();
        let method_listener: IpcMessageListener =
            Arc::new(move |_args| *captured.lock().unwrap() += 1);
        capability.on_message("event", method_listener);
        let free_count = Arc::new(Mutex::new(0));
        let captured = free_count.clone();
        let free_listener: IpcMessageListener =
            Arc::new(move |_args| *captured.lock().unwrap() += 1);
        on_ipc_message(&capability, "event", free_listener);
        assert_eq!(*method_count.lock().unwrap(), *free_count.lock().unwrap());
    }

    #[test]
    fn once_message_method_matches_once_ipc_message() {
        let subscribe: IpcSubscribe = Arc::new(|_channel, listener| {
            listener(&[]);
            return Arc::new(|| {});
        });
        let capability = HostIpcMessageCapability { subscribe };
        let method_count = Arc::new(Mutex::new(0));
        let captured = method_count.clone();
        let method_listener: IpcMessageListener =
            Arc::new(move |_args| *captured.lock().unwrap() += 1);
        capability.once_message("event", method_listener);
        let free_count = Arc::new(Mutex::new(0));
        let captured = free_count.clone();
        let free_listener: IpcMessageListener =
            Arc::new(move |_args| *captured.lock().unwrap() += 1);
        once_ipc_message(&capability, "event", free_listener);
        assert_eq!(*method_count.lock().unwrap(), *free_count.lock().unwrap());
    }

    #[test]
    fn send_message_method_matches_send_ipc_message() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let send: IpcSend = Arc::new(move |channel, _args| {
            captured.lock().unwrap().push(channel.to_string());
        });
        let capability = HostIpcSendCapability { send };
        capability.send_message("event", Vec::new());
        send_ipc_message(&capability, "event", Vec::new());
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["event".to_string(), "event".to_string()]
        );
    }

    #[test]
    fn send_message_to_method_matches_send_ipc_message_to() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let send: IpcTargetedSend<Target> = Arc::new(move |target, channel, _args| {
            captured
                .lock()
                .unwrap()
                .push((target.id, channel.to_string()));
        });
        let capability = create_host_ipc_targeted_send_capability(send);
        let target = Target { id: 4 };
        capability.send_message_to(&target, "event", Vec::new());
        send_ipc_message_to(&capability, &target, "event", Vec::new());
        assert_eq!(
            *seen.lock().unwrap(),
            vec![(4, "event".to_string()), (4, "event".to_string())]
        );
    }
}

struct OnceSubscriptionState {
    done: bool,
    unsubscribe: Option<IpcUnsubscribe>,
}

/// Invokes one channel through the exact supplied capability and returns its reply or rejection.
pub async fn invoke_ipc(
    host_ipc_invoke: &HostIpcInvokeCapability,
    channel: &str,
    args: IpcArguments,
) -> IpcInvokeResult {
    return (host_ipc_invoke.invoke)(channel.to_string(), args).await;
}

/// Registers one invoke handler and returns the release for that registration.
pub fn on_ipc_invoke(
    host_ipc_handle: &HostIpcHandleCapability,
    channel: &str,
    handler: IpcInvokeHandler,
) -> IpcUnsubscribe {
    return (host_ipc_handle.handle)(channel.to_string(), handler);
}

/// Subscribes to every message on one channel and returns this subscription's release.
pub fn on_ipc_message(
    host_ipc_message: &HostIpcMessageCapability,
    channel: &str,
    listener: IpcMessageListener,
) -> IpcUnsubscribe {
    return (host_ipc_message.subscribe)(channel.to_string(), listener);
}

/// Subscribes to the next message only. The returned release is idempotent and remains correct
/// when a provider delivers synchronously before `subscribe` returns its unsubscribe callback.
pub fn once_ipc_message(
    host_ipc_message: &HostIpcMessageCapability,
    channel: &str,
    listener: IpcMessageListener,
) -> IpcUnsubscribe {
    let state = Arc::new(Mutex::new(OnceSubscriptionState {
        done: false,
        unsubscribe: None,
    }));
    let release_state = state.clone();
    let release: IpcUnsubscribe = Arc::new(move || {
        let unsubscribe = {
            let mut state = release_state.lock().unwrap();
            if state.done {
                return;
            }
            state.done = true;
            state.unsubscribe.take()
        };
        if let Some(unsubscribe) = unsubscribe {
            unsubscribe();
        }
    });

    let listener_state = state.clone();
    let subscribed_listener: IpcMessageListener =
        Arc::new(move |args: &[flight_entity::AnySlot]| {
            let unsubscribe = {
                let mut state = listener_state.lock().unwrap();
                if state.done {
                    return;
                }
                state.done = true;
                state.unsubscribe.take()
            };
            if let Some(unsubscribe) = unsubscribe {
                unsubscribe();
            }
            listener(args);
        });

    let mut acquired = Some((host_ipc_message.subscribe)(
        channel.to_string(),
        subscribed_listener,
    ));
    let release_after_acquire = {
        let mut state = state.lock().unwrap();
        if state.done {
            acquired.take()
        } else {
            state.unsubscribe = acquired.take();
            None
        }
    };
    if let Some(unsubscribe) = release_after_acquire {
        unsubscribe();
    }
    return release;
}

/// Sends one message through the exact supplied capability.
pub fn send_ipc_message(host_ipc_send: &HostIpcSendCapability, channel: &str, args: IpcArguments) {
    (host_ipc_send.send)(channel, args);
}

/// Sends one message to the supplied target without cloning or replacing that target.
pub fn send_ipc_message_to<Target>(
    host_ipc_targeted_send: &HostIpcTargetedSendCapability<Target>,
    target: &Target,
    channel: &str,
    args: IpcArguments,
) {
    (host_ipc_targeted_send.send)(target, channel, args);
}

impl HostIpcHandleCapability {
    pub fn on_invoke(&self, channel: &str, handler: IpcInvokeHandler) -> IpcUnsubscribe {
        return on_ipc_invoke(self, channel, handler);
    }
}

impl HostIpcInvokeCapability {
    pub async fn invoke(&self, channel: &str, args: IpcArguments) -> IpcInvokeResult {
        return invoke_ipc(self, channel, args).await;
    }
}

impl HostIpcMessageCapability {
    pub fn on_message(&self, channel: &str, listener: IpcMessageListener) -> IpcUnsubscribe {
        return on_ipc_message(self, channel, listener);
    }

    pub fn once_message(&self, channel: &str, listener: IpcMessageListener) -> IpcUnsubscribe {
        return once_ipc_message(self, channel, listener);
    }
}

impl HostIpcSendCapability {
    pub fn send_message(&self, channel: &str, args: IpcArguments) {
        return send_ipc_message(self, channel, args);
    }
}

impl<Target> HostIpcTargetedSendCapability<Target> {
    pub fn send_message_to(&self, target: &Target, channel: &str, args: IpcArguments) {
        return send_ipc_message_to(self, target, channel, args);
    }
}
