// Claim-guarded HitTestContext wrappers contain SDK panics: a node whose lock a panic poisoned makes
// the SDK's hit test panic, and the wrapper returns its failure value with the claim released.

use std::ffi::c_void;
use std::sync::atomic::{AtomicUsize, Ordering};

static CALLS: AtomicUsize = AtomicUsize::new(0);

extern "C" fn z_always_hit(
    _ctx: *mut c_void,
    _node: *const crate::FlightNode,
    _x: f64,
    _y: f64,
) -> bool {
    CALLS.fetch_add(1, Ordering::SeqCst);
    return true;
}

#[test]
fn a_panic_inside_a_claimed_call_returns_the_failure_value_and_releases_the_claim() {
    let ctx = unsafe { crate::flight_create_hit_test_context() };
    let node = unsafe { crate::flight_create_display_object() };
    let kind = c"vendor.Poisoned";
    assert!(unsafe { crate::flight_set_node_kind(node, kind.as_ptr()) });
    unsafe { crate::flight_set_node_hit_test_enabled(node, true) };
    unsafe {
        crate::flight_register_hit_test(
            ctx,
            kind.as_ptr(),
            Some(z_always_hit),
            std::ptr::null_mut(),
            None,
        )
    };
    assert!(unsafe { crate::flight_hit_test_graph_point(ctx, node, 1.0, 1.0) });

    let shared = unsafe { &*node }.node.clone();
    let poisoner = std::thread::spawn(move || {
        let _guard = shared.write().unwrap();
        panic!("poison the node lock");
    });
    assert!(poisoner.join().is_err());

    assert!(
        !unsafe { crate::flight_hit_test_graph_point(ctx, node, 1.0, 1.0) },
        "a contained panic returns false"
    );
    // The claim was released while unwinding: the context is usable again.
    unsafe { crate::flight_register_default_hit_tests(ctx) };
    unsafe { crate::flight_free_hit_test_context(ctx) };
    unsafe { crate::flight_free_node(node) };
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
}
