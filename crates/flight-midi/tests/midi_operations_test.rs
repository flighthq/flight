use std::sync::{Arc, Mutex};

use flight_midi::contract::*;

use crate::block_on;

fn attach_outcome() -> MidiEventBackendAttachOutcome {
    return MidiEventBackendAttachOutcome {
        attachment: None,
        reason: MidiEventBackendAttachReason::Ok,
        release_failed: None,
    };
}

fn access_operations() -> MidiAccessResourceOperations {
    return MidiAccessResourceOperations {
        attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
        get_input_ports: Arc::new(|| Ok(Vec::new())),
        get_output_ports: Arc::new(|| Ok(Vec::new())),
        provider: Arc::new("access".to_string()),
    };
}

fn input_operations() -> MidiInputPortResourceOperations {
    return MidiInputPortResourceOperations {
        attach_message: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
        attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
        close: Arc::new(|| Box::pin(async { Ok(()) })),
        get_connection: Arc::new(|| Ok(MidiPortConnection::Closed)),
        get_state: Arc::new(|| Ok(MidiPortState::Connected)),
        open: Arc::new(|| Box::pin(async { Ok(()) })),
        provider: Arc::new("input".to_string()),
    };
}

fn output_operations() -> MidiOutputPortResourceOperations {
    return MidiOutputPortResourceOperations {
        attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
        close: Arc::new(|| Box::pin(async { Ok(()) })),
        get_connection: Arc::new(|| Ok(MidiPortConnection::Open)),
        get_state: Arc::new(|| Ok(MidiPortState::Disconnected)),
        open: Arc::new(|| Box::pin(async { Ok(()) })),
        provider: Arc::new("output".to_string()),
        send: Arc::new(|_data, _timestamp| Ok(())),
    };
}

fn port_operations() -> MidiPortResourceOperations {
    return MidiPortResourceOperations {
        attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
        close: Arc::new(|| Box::pin(async { Ok(()) })),
        get_connection: Arc::new(|| Ok(MidiPortConnection::Pending)),
        get_state: Arc::new(|| Ok(MidiPortState::Connected)),
        open: Arc::new(|| Box::pin(async { Ok(()) })),
        provider: Arc::new("port".to_string()),
    };
}

mod attach_midi_access_resource_state_change {
    use super::*;
    #[test]
    fn invokes_the_access_callback() {
        assert_eq!(
            block_on(attach_midi_access_resource_state_change(
                &access_operations(),
                Arc::new(|_port| {})
            ))
            .unwrap(),
            attach_outcome()
        );
    }
}

mod attach_midi_input_port_resource_message {
    use super::*;
    #[test]
    fn invokes_the_input_message_callback() {
        assert_eq!(
            block_on(attach_midi_input_port_resource_message(
                &input_operations(),
                Arc::new(|_data, _timestamp| {})
            ))
            .unwrap(),
            attach_outcome()
        );
    }
}

mod attach_midi_input_port_resource_state_change {
    use super::*;
    #[test]
    fn invokes_the_input_state_callback() {
        assert_eq!(
            block_on(attach_midi_input_port_resource_state_change(
                &input_operations(),
                Arc::new(|| {})
            ))
            .unwrap(),
            attach_outcome()
        );
    }
}

mod attach_midi_output_port_resource_state_change {
    use super::*;
    #[test]
    fn invokes_the_output_state_callback() {
        assert_eq!(
            block_on(attach_midi_output_port_resource_state_change(
                &output_operations(),
                Arc::new(|| {})
            ))
            .unwrap(),
            attach_outcome()
        );
    }
}

mod attach_midi_port_resource_state_change {
    use super::*;
    #[test]
    fn invokes_the_base_port_state_callback() {
        assert_eq!(
            block_on(attach_midi_port_resource_state_change(
                &port_operations(),
                Arc::new(|| {})
            ))
            .unwrap(),
            attach_outcome()
        );
    }
}

mod close_midi_input_port_resource {
    use super::*;
    #[test]
    fn invokes_the_input_close_callback() {
        assert!(block_on(close_midi_input_port_resource(&input_operations())).is_ok());
    }
}

mod close_midi_output_port_resource {
    use super::*;
    #[test]
    fn invokes_the_output_close_callback() {
        assert!(block_on(close_midi_output_port_resource(&output_operations())).is_ok());
    }
}

mod close_midi_port_resource {
    use super::*;
    #[test]
    fn invokes_the_base_close_callback() {
        assert!(block_on(close_midi_port_resource(&port_operations())).is_ok());
    }
}

mod get_midi_access_resource_input_ports {
    use super::*;
    #[test]
    fn invokes_the_access_input_callback() {
        assert!(
            get_midi_access_resource_input_ports(&access_operations())
                .unwrap()
                .is_empty()
        );
    }
}

mod get_midi_access_resource_output_ports {
    use super::*;
    #[test]
    fn invokes_the_access_output_callback() {
        assert!(
            get_midi_access_resource_output_ports(&access_operations())
                .unwrap()
                .is_empty()
        );
    }
}

mod get_midi_input_port_resource_connection {
    use super::*;
    #[test]
    fn invokes_the_input_connection_callback() {
        assert_eq!(
            get_midi_input_port_resource_connection(&input_operations()).unwrap(),
            MidiPortConnection::Closed
        );
    }
}

mod get_midi_output_port_resource_connection {
    use super::*;
    #[test]
    fn invokes_the_output_connection_callback() {
        assert_eq!(
            get_midi_output_port_resource_connection(&output_operations()).unwrap(),
            MidiPortConnection::Open
        );
    }
}

mod get_midi_port_resource_connection {
    use super::*;
    #[test]
    fn invokes_the_base_connection_callback() {
        assert_eq!(
            get_midi_port_resource_connection(&port_operations()).unwrap(),
            MidiPortConnection::Pending
        );
    }
}

mod open_midi_input_port_resource {
    use super::*;
    #[test]
    fn invokes_the_input_open_callback() {
        assert!(block_on(open_midi_input_port_resource(&input_operations())).is_ok());
    }
}

mod open_midi_output_port_resource {
    use super::*;
    #[test]
    fn invokes_the_output_open_callback() {
        assert!(block_on(open_midi_output_port_resource(&output_operations())).is_ok());
    }
}

mod open_midi_port_resource {
    use super::*;
    #[test]
    fn invokes_the_base_open_callback() {
        assert!(block_on(open_midi_port_resource(&port_operations())).is_ok());
    }
}

mod read_midi_input_port_resource_state {
    use super::*;
    #[test]
    fn invokes_the_input_state_callback() {
        assert_eq!(
            read_midi_input_port_resource_state(&input_operations()).unwrap(),
            MidiPortState::Connected
        );
    }
}

mod read_midi_output_port_resource_state {
    use super::*;
    #[test]
    fn invokes_the_output_state_callback() {
        assert_eq!(
            read_midi_output_port_resource_state(&output_operations()).unwrap(),
            MidiPortState::Disconnected
        );
    }
}

mod read_midi_port_resource_state {
    use super::*;
    #[test]
    fn invokes_the_base_state_callback() {
        assert_eq!(
            read_midi_port_resource_state(&port_operations()).unwrap(),
            MidiPortState::Connected
        );
    }
}

mod send_midi_output_port_resource {
    use super::*;
    #[test]
    fn copies_bytes_and_preserves_the_timestamp() {
        let sent = Arc::new(Mutex::new(Vec::new()));
        let captured = sent.clone();
        let mut operations = output_operations();
        operations.send = Arc::new(move |data, timestamp| {
            captured.lock().unwrap().push((data, timestamp));
            Ok(())
        });
        let mut data = vec![0x90, 60, 127];
        assert!(send_midi_output_port_resource(&operations, &data, Some(42.5)).is_ok());
        data[1] = 1;
        assert_eq!(
            *sent.lock().unwrap(),
            vec![(vec![0x90, 60, 127], Some(42.5))]
        );
    }
}
