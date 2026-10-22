use std::sync::{Arc, Mutex};

use flight_scene3d_resources::contract::*;
use flight_signals::{connect_signal, emit_signal};

use crate::mock_host::MockHost;
use crate::support::{attach_texture, context, embedded_reference, host_image};

mod create_scene3d_resource_signals {
    use super::*;

    #[test]
    fn creates_a_connectable_emittable_signal_group() {
        let signals = create_scene3d_resource_signals();
        assert!(!flight_entity::get_entity_uid(&mut *signals.write().unwrap()).is_empty());
        let received = Arc::new(Mutex::new(0));
        let counter = received.clone();
        let reference = embedded_reference(None);
        let texture = attach_texture(&reference);
        let signal = signals.read().unwrap().on_resource_resolved.clone();
        connect_signal(&signal, Arc::new(move |_| *counter.lock().unwrap() += 1), None);
        emit_signal(&signal, &Scene3DResourceEvent { reference, texture });
        assert_eq!(*received.lock().unwrap(), 1);
    }
}

mod enable_scene3d_resource_signals {
    use super::*;

    #[test]
    fn stores_the_group_on_the_resolver_and_is_idempotent() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let first = enable_scene3d_resource_signals(&resolver);
        let second = enable_scene3d_resource_signals(&resolver);
        assert!(Arc::ptr_eq(&first, &second));
        assert!(Arc::ptr_eq(&get_scene3d_resource_signals(&resolver).unwrap(), &first));
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod get_scene3d_resource_signals {
    use super::*;

    #[test]
    fn returns_none_until_enabled_then_the_enabled_group() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        assert!(get_scene3d_resource_signals(&resolver).is_none());
        let signals = enable_scene3d_resource_signals(&resolver);
        assert!(Arc::ptr_eq(&get_scene3d_resource_signals(&resolver).unwrap(), &signals));
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod initialize_scene3d_resource_signals {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_scene3d_resource_signals() {
        let signals = create_scene3d_resource_signals();
        let mut out = signals.write().unwrap();
        flight_entity::set_entity_uid(&mut *out, "signals".to_string());
        let stale = out.on_resource_failed.clone();
        initialize_scene3d_resource_signals(&mut out);
        assert_eq!(flight_entity::get_entity_uid(&mut *out), "signals");
        // Fresh signals: a slot on the replaced one no longer hears the group's emissions.
        let heard = Arc::new(Mutex::new(0));
        let counter = heard.clone();
        connect_signal(&stale, Arc::new(move |_| *counter.lock().unwrap() += 1), None);
        let reference = embedded_reference(None);
        let texture = attach_texture(&reference);
        emit_signal(&out.on_resource_failed, &Scene3DResourceEvent { reference, texture });
        assert_eq!(*heard.lock().unwrap(), 0);
    }
}
