use std::ffi::c_void;
use std::sync::atomic::{AtomicUsize, Ordering};

// G4 through the generated C-shaped path: nodes and option values are built in Rust (Item B will
// supply C node production), and every interaction step goes through the generated wrappers. The
// manager is created tracked-subscribers-only, so only flight_connect_interaction_signal can arm
// dispatch; no subscriber count is ever seeded by hand.

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
        } = scene;
        unsafe { crate::flight_free_interaction_manager_ref(manager.cast()) };
        assert_eq!(
            probe.releases.load(Ordering::SeqCst),
            0,
            "the slot stays on the node's signal after the manager is freed"
        );
        drop((root, child));
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
            (&scene.child as *const flight_sdk::NodeRef).cast(),
            flight_sdk::InteractionSignalName::OnPointerDown as u32,
            z_on_pointer_down,
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
    let mut options = flight_sdk::interaction::contract::create_interaction_manager_options();
    options.tracked_subscribers_only = Some(true);
    let manager = unsafe {
        crate::flight_create_interaction_manager(
            (&root as *const flight_sdk::NodeRef).cast(),
            &options,
        )
    };
    unsafe {
        crate::flight_capture_interaction_pointer(
            manager,
            0,
            (&child as *const flight_sdk::NodeRef).cast(),
        )
    };
    return Scene {
        manager,
        root,
        child,
    };
}

fn z_disconnect(scene: &Scene, id: *const flight_sdk::SlotId) {
    unsafe {
        crate::flight_disconnect_interaction_signal(
            scene.manager,
            (&scene.child as *const flight_sdk::NodeRef).cast(),
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
        unsafe {
            crate::flight_disconnect_interaction_signal(
                probe.manager as *const c_void,
                (&target as *const flight_sdk::NodeRef).cast(),
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
        unsafe {
            crate::flight_capture_interaction_pointer(
                probe.manager as *const c_void,
                9,
                (&target as *const flight_sdk::NodeRef).cast(),
            )
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
