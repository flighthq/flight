use std::ffi::c_void;
use std::sync::atomic::{AtomicUsize, Ordering};

// G4 through the generated C-shaped path: nodes use Item B's unified handles, and every interaction
// step goes through the generated wrappers. The manager is created tracked-subscribers-only, so
// only flight_connect_interaction_signal can arm dispatch; no subscriber count is ever seeded by
// hand.

struct Probe {
    calls: AtomicUsize,
    releases: AtomicUsize,
    manager: usize,
    // Taken by the lifetime test to drop the last outside handle to the node.
    target: std::sync::Mutex<Option<flight_sdk::NodeRef>>,
    // The registration the callback disconnects from its own call, when set.
    disconnect_from_callback: std::sync::Mutex<Option<flight_sdk::SlotId>>,
}

struct Scene {
    manager: *mut c_void,
    root: flight_sdk::NodeRef,
    child: flight_sdk::NodeRef,
    root_handle: crate::FlightNode,
    child_handle: crate::FlightNode,
}

#[test]
fn a_callback_may_disconnect_itself_and_its_release_may_reenter_the_manager() {
    z_run_within_deadline(|| {
        let scene = z_create_scene();
        let probe = z_create_probe(&scene);
        let id = z_connect(&scene, probe, None);
        *probe.disconnect_from_callback.lock().unwrap() = Some(unsafe { *id });
        z_dispatch_pointer_down(&scene);
        z_dispatch_pointer_down(&scene);
        assert_eq!(probe.calls.load(Ordering::SeqCst), 1);
        assert_eq!(probe.releases.load(Ordering::SeqCst), 1);
        let manager = z_get_manager(&scene).read().unwrap();
        assert!(
            manager.pointer_captures.contains_key(&9),
            "the release re-entered the manager"
        );
        assert!(manager.tracked_signal_slots.is_empty());
        drop(manager);
        unsafe { crate::flight_free_slot_id(id) };
        z_free_scene(scene);
    });
}

#[test]
fn a_once_connection_calls_once_and_releases_after_its_call() {
    z_run_within_deadline(|| {
        let scene = z_create_scene();
        let probe = z_create_probe(&scene);
        let once = flight_sdk::SignalConnectOptions {
            priority: None,
            once: Some(true),
        };
        let id = z_connect(&scene, probe, Some(&once));
        z_dispatch_pointer_down(&scene);
        z_dispatch_pointer_down(&scene);
        assert_eq!(probe.calls.load(Ordering::SeqCst), 1);
        assert_eq!(probe.releases.load(Ordering::SeqCst), 1);
        assert_eq!(z_get_subscriber_count(&scene), 0);
        z_disconnect(&scene, id);
        unsafe { crate::flight_free_slot_id(id) };
        z_free_scene(scene);
        assert_eq!(probe.releases.load(Ordering::SeqCst), 1);
    });
}

#[test]
fn connect_arms_dispatch_without_seeding_and_disconnect_releases_exactly_once() {
    z_run_within_deadline(|| {
        let scene = z_create_scene();
        let probe = z_create_probe(&scene);
        assert_eq!(z_get_subscriber_count(&scene), 0);
        z_dispatch_pointer_down(&scene);
        let id = z_connect(&scene, probe, None);
        assert_eq!(z_get_subscriber_count(&scene), 1);
        z_dispatch_pointer_down(&scene);
        z_dispatch_pointer_down(&scene);
        assert_eq!(probe.calls.load(Ordering::SeqCst), 2);
        assert_eq!(probe.releases.load(Ordering::SeqCst), 0);
        z_disconnect(&scene, id);
        assert_eq!(probe.releases.load(Ordering::SeqCst), 1);
        assert_eq!(z_get_subscriber_count(&scene), 0);
        z_dispatch_pointer_down(&scene);
        z_disconnect(&scene, id);
        unsafe { crate::flight_free_slot_id(id) };
        z_free_scene(scene);
        assert_eq!(probe.calls.load(Ordering::SeqCst), 2);
        assert_eq!(probe.releases.load(Ordering::SeqCst), 1);
    });
}

#[test]
fn rejects_every_non_pointer_and_invalid_name_without_retaining_or_releasing() {
    z_run_within_deadline(|| {
        for name in (0..=18).chain([99, u32::MAX]) {
            let scene = z_create_scene();
            let probe = z_create_probe(&scene);
            let had_signals = flight_sdk::get_interaction_signals(&scene.child).is_some();
            let child_handles = std::sync::Arc::strong_count(&scene.child);
            let id = unsafe {
                crate::flight_connect_interaction_signal(
                    scene.manager,
                    &scene.child_handle,
                    name,
                    Some(z_on_pointer_down),
                    probe as *const Probe as *mut c_void,
                    Some(z_release_probe),
                    std::ptr::null(),
                )
            };
            let accepted = z_rust_accepts(name);
            assert_eq!(
                !id.is_null(),
                accepted,
                "the C wrapper and the SDK disagree on {name}"
            );
            if accepted {
                unsafe { crate::flight_free_slot_id(id) };
            } else {
                assert_eq!(
                    probe.releases.load(Ordering::SeqCst),
                    0,
                    "{name} released a context it never took"
                );
                assert_eq!(
                    flight_sdk::get_interaction_signals(&scene.child).is_some(),
                    had_signals,
                    "{name} touched the target"
                );
                assert_eq!(
                    std::sync::Arc::strong_count(&scene.child),
                    child_handles,
                    "{name}"
                );
                let manager = z_get_manager(&scene).read().unwrap();
                assert!(manager.signal_subscriber_counts.is_empty(), "{name}");
                assert!(manager.tracked_signal_slots.is_empty(), "{name}");
            }
            z_dispatch_pointer_down(&scene);
            assert_eq!(
                probe.calls.load(Ordering::SeqCst),
                usize::from(accepted && name == 9),
                "{name}"
            );
            z_free_scene(scene);
        }
    });
}

#[test]
fn rejects_null_inputs_without_releasing() {
    let scene = z_create_scene();
    let probe = z_create_probe(&scene);
    let child = &scene.child_handle as *const crate::FlightNode;
    let ctx = probe as *const Probe as *mut c_void;
    let down = flight_sdk::InteractionSignalName::OnPointerDown as u32;
    for (manager, target, slot_fn) in [
        (
            std::ptr::null(),
            child,
            Some(
                z_on_pointer_down
                    as extern "C" fn(*mut c_void, *const flight_sdk::PointerEventData),
            ),
        ),
        (
            scene.manager as *const c_void,
            std::ptr::null(),
            Some(z_on_pointer_down),
        ),
        (scene.manager as *const c_void, child, None),
    ] {
        let id = unsafe {
            crate::flight_connect_interaction_signal(
                manager,
                target,
                down,
                slot_fn,
                ctx,
                Some(z_release_probe),
                std::ptr::null(),
            )
        };
        assert!(id.is_null());
    }
    assert_eq!(probe.releases.load(Ordering::SeqCst), 0);
    assert_eq!(z_get_subscriber_count(&scene), 0);
    z_free_scene(scene);
}

#[test]
fn the_connection_lives_with_the_node_not_the_manager() {
    z_run_within_deadline(|| {
        let scene = z_create_scene();
        let probe = z_create_probe(&scene);
        let id = z_connect(&scene, probe, None);
        unsafe { crate::flight_free_slot_id(id) };
        let Scene {
            manager,
            root,
            child,
            root_handle,
            child_handle,
        } = scene;
        unsafe { crate::flight_free_interaction_manager_ref(manager.cast()) };
        assert_eq!(
            probe.releases.load(Ordering::SeqCst),
            0,
            "the slot stays on the node's signal after the manager is freed"
        );
        drop((root, child, root_handle, child_handle));
        assert_eq!(
            probe.releases.load(Ordering::SeqCst),
            0,
            "the probe still holds the target node"
        );
        // Taken before dropping: the node's teardown runs the release, which locks `target`.
        let target = probe.target.lock().unwrap().take();
        drop(target);
        assert_eq!(probe.releases.load(Ordering::SeqCst), 1);
    });
}

fn z_connect(
    scene: &Scene,
    probe: &'static Probe,
    options: Option<&flight_sdk::SignalConnectOptions>,
) -> *mut flight_sdk::SlotId {
    let id = unsafe {
        crate::flight_connect_interaction_signal(
            scene.manager,
            &scene.child_handle,
            flight_sdk::InteractionSignalName::OnPointerDown as u32,
            Some(z_on_pointer_down),
            probe as *const Probe as *mut c_void,
            Some(z_release_probe),
            options.map_or(std::ptr::null(), |options| options as *const _),
        )
    };
    assert!(!id.is_null());
    return id;
}

// Leaked so the callback context outlives every slot that may still reference it.
fn z_create_probe(scene: &Scene) -> &'static Probe {
    return Box::leak(Box::new(Probe {
        calls: AtomicUsize::new(0),
        releases: AtomicUsize::new(0),
        manager: scene.manager as usize,
        target: std::sync::Mutex::new(Some(scene.child.clone())),
        disconnect_from_callback: std::sync::Mutex::new(None),
    }));
}

// A root with one child holding pointer 0's capture, under a tracked-subscribers-only manager made
// through the generated factory.
fn z_create_scene() -> Scene {
    let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
    let child: flight_sdk::NodeRef = flight_sdk::create_display_object();
    flight_sdk::add_node_child(&root, &child);
    let root_handle = crate::ffi_node_from_node_ref(root.clone());
    let child_handle = crate::ffi_node_from_node_ref(child.clone());
    let mut options = flight_sdk::interaction::contract::create_interaction_manager_options();
    options.tracked_subscribers_only = Some(true);
    let manager = unsafe { crate::flight_create_interaction_manager(&root_handle, &options) };
    unsafe { crate::flight_capture_interaction_pointer(manager, 0, &child_handle) };
    return Scene {
        manager,
        root,
        child,
        root_handle,
        child_handle,
    };
}

fn z_disconnect(scene: &Scene, id: *const flight_sdk::SlotId) {
    unsafe {
        crate::flight_disconnect_interaction_signal(
            scene.manager,
            &scene.child_handle,
            flight_sdk::InteractionSignalName::OnPointerDown as u32,
            id,
        )
    };
}

fn z_dispatch_pointer_down(scene: &Scene) {
    unsafe {
        crate::flight_dispatch_interaction_pointer_down(
            scene.manager,
            1.0,
            1.0,
            0,
            std::ptr::null(),
        )
    };
}

fn z_free_scene(scene: Scene) {
    unsafe { crate::flight_free_interaction_manager_ref(scene.manager.cast()) };
}

fn z_get_manager(scene: &Scene) -> &flight_sdk::Ref<flight_sdk::InteractionManager> {
    return unsafe { &*(scene.manager as *const flight_sdk::Ref<flight_sdk::InteractionManager>) };
}

fn z_get_subscriber_count(scene: &Scene) -> u32 {
    return z_get_manager(scene)
        .read()
        .unwrap()
        .signal_subscriber_counts
        .get(&flight_sdk::InteractionSignalName::OnPointerDown)
        .copied()
        .unwrap_or(0);
}

extern "C" fn z_on_pointer_down(ctx: *mut c_void, _event: *const flight_sdk::PointerEventData) {
    let probe = unsafe { &*(ctx as *const Probe) };
    probe.calls.fetch_add(1, Ordering::SeqCst);
    let id = *probe.disconnect_from_callback.lock().unwrap();
    let target = probe.target.lock().unwrap().clone();
    if let (Some(id), Some(target)) = (id, target) {
        let target = crate::ffi_node_from_node_ref(target);
        unsafe {
            crate::flight_disconnect_interaction_signal(
                probe.manager as *const c_void,
                &target,
                flight_sdk::InteractionSignalName::OnPointerDown as u32,
                &id,
            )
        };
    }
}

// Counts the release and, while the manager is alive, re-enters it with a capture, proving the
// release runs with no manager lock held.
extern "C" fn z_release_probe(ctx: *mut c_void) {
    let probe = unsafe { &*(ctx as *const Probe) };
    probe.releases.fetch_add(1, Ordering::SeqCst);
    let target = probe.target.lock().unwrap().clone();
    if probe.disconnect_from_callback.lock().unwrap().is_some()
        && let Some(target) = target
    {
        let target = crate::ffi_node_from_node_ref(target);
        unsafe {
            crate::flight_capture_interaction_pointer(probe.manager as *mut c_void, 9, &target)
        };
    }
}

// Runs `test` on its own thread and fails instead of hanging when it deadlocks.
fn z_run_within_deadline(test: impl FnOnce() + Send + 'static) {
    let (done, finished) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        test();
        done.send(()).unwrap();
    });
    if finished
        .recv_timeout(std::time::Duration::from_secs(5))
        .is_err()
    {
        panic!("interaction signal path deadlocked or panicked");
    }
    worker.join().unwrap();
}

// Whether the SDK itself accepts `name` (decoded by declaration order), connecting a Rust slot on a
// scene of its own: the oracle the C wrapper's accepted set is pinned against.
fn z_rust_accepts(name: u32) -> bool {
    use flight_sdk::InteractionSignalName::*;
    let names = [
        OnClick,
        OnContextMenu,
        OnDoubleClick,
        OnFocusIn,
        OnFocusOut,
        OnKeyDown,
        OnKeyUp,
        OnPointerCancel,
        OnPointerDoubleClick,
        OnPointerDown,
        OnPointerMove,
        OnPointerOut,
        OnPointerOver,
        OnPointerRollOut,
        OnPointerRollOver,
        OnPointerUp,
        OnReleaseOutside,
        OnWheel,
    ];
    let Some(decoded) = names
        .into_iter()
        .find(|candidate| *candidate as u32 == name)
    else {
        return false;
    };
    let scene = z_create_scene();
    let manager = z_get_manager(&scene).clone();
    let slot: flight_sdk::AnyInteractionSignalSlot = std::sync::Arc::new(|_| {});
    let accepted =
        flight_sdk::connect_interaction_signal(&manager, &scene.child, decoded, slot, None)
            .is_some();
    drop(manager);
    z_free_scene(scene);
    return accepted;
}
