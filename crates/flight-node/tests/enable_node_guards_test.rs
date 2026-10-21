use std::sync::{Arc, Mutex};

use flight_log::{LogData, LogEntry, LogStateRef, create_log_state, set_log_sink};
use flight_node::contract::*;

use crate::support::create_test_node_2d;

struct GuardFixture {
    log_state: LogStateRef,
    guards: NodeGuardState,
    entries: Arc<Mutex<Vec<LogEntry>>>,
}

fn fixture() -> GuardFixture {
    let log_state = Arc::new(std::sync::RwLock::new(create_log_state()));
    let entries = Arc::new(Mutex::new(Vec::new()));
    let captured = entries.clone();
    set_log_sink(
        &log_state,
        Some(Arc::new(move |entry: &LogEntry| {
            captured.lock().unwrap().push(entry.clone());
        })),
    );
    return GuardFixture {
        log_state,
        guards: NodeGuardState {
            enabled: false,
            reparent_node_guard: None,
        },
        entries,
    };
}

fn enable(fixture: &mut GuardFixture) {
    let log_state = fixture.log_state.clone();
    let clock: NodeGuardClock = Arc::new(|| 0.0);
    enable_node_guards(&mut fixture.guards, &log_state, clock);
}

fn collapsed_parent(name: &str) -> NodeRef {
    let parent = create_test_node_2d("Test");
    {
        let mut guard = parent.write().unwrap();
        guard.node_fields_mut().name = Some(String::from(name));
        guard
            .as_transform2d_node_mut()
            .expect("test node has a transform")
            .transform2d_mut()
            .scale_x = 0.0;
    }
    invalidate_node_local_transform(&parent);
    return parent;
}

mod are_node_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_the_guards_are_installed() {
        let mut fixture = fixture();
        assert!(!are_node_guards_enabled(&fixture.guards));
        enable(&mut fixture);
        assert!(are_node_guards_enabled(&fixture.guards));
        disable_node_guards(&mut fixture.guards);
        assert!(!are_node_guards_enabled(&fixture.guards));
    }
}

mod disable_node_guards {
    use super::*;

    #[test]
    fn leaves_the_core_silent_again_once_removed() {
        let mut fixture = fixture();
        enable(&mut fixture);
        disable_node_guards(&mut fixture.guards);
        let mut revisions = NodeRevisionState {
            world_transform_revision: 0,
        };
        assert!(!reparent_node(
            &create_test_node_2d("Test"),
            &collapsed_parent("gone"),
            &mut revisions,
            Some(&fixture.guards)
        ));
        assert!(fixture.entries.lock().unwrap().is_empty());
    }
}

mod enable_node_guards {
    use super::*;

    #[test]
    fn warns_naming_both_nodes_when_a_reparent_is_declined() {
        let mut fixture = fixture();
        enable(&mut fixture);
        let child = create_test_node_2d("Test");
        child.write().unwrap().node_fields_mut().name = Some(String::from("child"));
        let mut revisions = NodeRevisionState {
            world_transform_revision: 0,
        };
        assert!(!reparent_node(
            &child,
            &collapsed_parent("collapsed-warns"),
            &mut revisions,
            Some(&fixture.guards)
        ));
        let entries = fixture.entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        match &entries[0].data {
            LogData::Record(fields) => {
                assert_eq!(format!("{:?}", fields.get("child")), "Some(Str(\"child\"))");
                assert_eq!(
                    format!("{:?}", fields.get("newParent")),
                    "Some(Str(\"collapsed-warns\"))"
                );
            }
            other => panic!("expected a record, got {other:?}"),
        }
    }

    #[test]
    fn stays_silent_when_the_reparent_succeeds() {
        let mut fixture = fixture();
        enable(&mut fixture);
        let healthy = create_test_node_2d("Test");
        let mut revisions = NodeRevisionState {
            world_transform_revision: 0,
        };
        assert!(reparent_node(
            &create_test_node_2d("Test"),
            &healthy,
            &mut revisions,
            Some(&fixture.guards)
        ));
        assert!(fixture.entries.lock().unwrap().is_empty());
    }
}
