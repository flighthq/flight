use std::sync::{Arc, Mutex};

use flight_entity::{get_entity_uid, set_entity_uid};
use flight_ipc::*;

#[derive(Debug)]
struct TestTarget {
    id: i32,
}

mod create_host_ipc_targeted_send_capability {
    use super::*;

    #[test]
    fn creates_an_entity_backed_targeted_send_capability() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&seen);
        let send: IpcTargetedSend<TestTarget> = Arc::new(move |target, channel, _args| {
            captured
                .lock()
                .unwrap()
                .push((target.id, channel.to_string()));
        });
        let mut capability = flight_ipc::contract::create_host_ipc_targeted_send_capability(send);
        set_entity_uid(&mut capability, "targeted-send".to_string());
        send_ipc_message_to(&capability, &TestTarget { id: 7 }, "log", Vec::new());
        let mut cloned = Clone::clone(&capability);
        let capabilities: HostIpcCapabilities = HostIpcCapabilities {
            handle: None,
            invoke: None,
            message: None,
            send: None,
            targeted_send: None,
        };

        assert_eq!(get_entity_uid(&mut capability), "targeted-send");
        assert_ne!(get_entity_uid(&mut cloned), "targeted-send");
        assert_eq!(capability, cloned);
        assert!(capabilities.targeted_send.is_none());
        assert_eq!(*seen.lock().unwrap(), vec![(7, "log".to_string())]);
    }
}

mod initialize_host_ipc_targeted_send_capability {
    use super::*;

    #[test]
    fn replaces_the_send_callback_without_replacing_the_entity() {
        let first_count = Arc::new(Mutex::new(0));
        let captured = Arc::clone(&first_count);
        let first: IpcTargetedSend<TestTarget> = Arc::new(move |_target, _channel, _args| {
            *captured.lock().unwrap() += 1;
        });
        let mut capability = flight_ipc::contract::create_host_ipc_targeted_send_capability(first);
        set_entity_uid(&mut capability, "kept".to_string());

        let second_count = Arc::new(Mutex::new(0));
        let captured = Arc::clone(&second_count);
        let second: IpcTargetedSend<TestTarget> = Arc::new(move |_target, _channel, _args| {
            *captured.lock().unwrap() += 1;
        });
        flight_ipc::contract::initialize_host_ipc_targeted_send_capability(&mut capability, second);
        send_ipc_message_to(&capability, &TestTarget { id: 1 }, "event", Vec::new());

        assert_eq!(*first_count.lock().unwrap(), 0);
        assert_eq!(*second_count.lock().unwrap(), 1);
        assert_eq!(get_entity_uid(&mut capability), "kept");
    }
}
