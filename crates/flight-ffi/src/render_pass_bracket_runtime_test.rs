use std::cell::RefCell;
use std::ffi::c_void;
use std::future::Future;
use std::ptr::{NonNull, null, null_mut};
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_sdk::entity::contract::get_entity_id;
use flight_sdk::render_wgpu::contract::{
    WgpuRenderPass, WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_native_device,
    create_wgpu_render_state, create_wgpu_texture_render_target, end_wgpu_render_pass,
    get_wgpu_render_state_runtime,
};

use crate::*;

mod flight_begin_wgpu_render_pass {
    use super::*;

    #[test]
    fn opens_an_owned_open_handle_naming_the_state_and_its_pushed_record() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        assert!(!pass.is_null());
        let handle = unsafe { &*pass };
        assert_eq!(handle.phase, FfiWgpuRenderPassPhase::Open);
        assert_eq!(handle.state.as_ptr(), scene.state);
        assert_eq!(handle.state_id, get_entity_id(scene_state(&scene)));
        assert_eq!(handle.index, 0);
        assert_eq!(scene_record_ids(&scene), [handle.record_id]);
        assert!(scene_runtime(&scene).command_encoder.is_some());
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn accepts_a_null_clear_as_load() {
        let scene = create_scene();
        let pass = unsafe { flight_begin_wgpu_render_pass(scene.state, &scene.target, null()) };
        assert!(!pass.is_null());
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn returns_null_for_a_null_state_or_target_without_touching_the_state() {
        let scene = create_scene();
        let clear = flight_sdk::RenderTargetClear::default();
        assert!(
            unsafe { flight_begin_wgpu_render_pass(null_mut(), &scene.target, &clear) }.is_null()
        );
        assert!(unsafe { flight_begin_wgpu_render_pass(scene.state, null(), &clear) }.is_null());
        assert!(scene_record_ids(&scene).is_empty());
        assert!(scene_runtime(&scene).command_encoder.is_none());
        assert!(scene_runtime(&scene).current_render_target.is_none());
    }

    #[test]
    fn returns_null_for_a_second_begin_on_the_same_state_and_changes_nothing() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        let before = scene_snapshot(&scene);
        assert!(scene_begin(&scene).is_null());
        assert_eq!(scene_snapshot(&scene), before);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn returns_null_while_a_native_pass_is_open_and_leaves_it_untouched() {
        let scene = create_scene();
        let native = begin_wgpu_render_pass(scene_state_mut(&scene), &scene.target, None);
        let index = native.index;
        let before = scene_snapshot(&scene);
        assert!(scene_begin(&scene).is_null());
        assert_eq!(scene_snapshot(&scene), before);
        end_wgpu_render_pass(WgpuRenderPass {
            state: scene_state_mut(&scene),
            index,
        });
        assert!(scene_record_ids(&scene).is_empty());
    }
}

mod flight_end_wgpu_render_pass {
    use super::*;

    #[test]
    fn ends_once_and_leaves_an_ended_tombstone_for_the_one_free() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(scene_record_ids(&scene).is_empty());
        assert!(scene_runtime(&scene).command_encoder.is_none());
        assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Ended);
        assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(!scene_render_2d(&scene, pass));
        assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Ended);
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        let next = scene_begin(&scene);
        assert!(!next.is_null());
        assert!(unsafe { flight_end_wgpu_render_pass(next) });
        unsafe { flight_free_wgpu_render_pass_handle(next) };
    }

    #[test]
    fn returns_false_for_a_null_handle() {
        assert!(!unsafe { flight_end_wgpu_render_pass(null_mut()) });
    }

    #[test]
    fn validates_state_identity_before_any_pass_stack_inspection() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        take_wgpu_render_pass_validation_trace();
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        assert_eq!(
            take_wgpu_render_pass_validation_trace(),
            ["state_id", "pass_stack", "record_id", "top"]
        );
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn waits_below_a_native_inner_pass_then_ends_after_it_closes() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        let outer = unsafe { (*pass).record_id };
        let inner = begin_wgpu_render_pass(scene_state_mut(&scene), &scene.target, None).index;
        let nested = scene_record_ids(&scene);
        assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(!scene_render_2d(&scene, pass));
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Open);
        assert_eq!(scene_record_ids(&scene), nested);
        end_wgpu_render_pass(WgpuRenderPass {
            state: scene_state_mut(&scene),
            index: inner,
        });
        assert_eq!(scene_record_ids(&scene), [outer]);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(scene_record_ids(&scene).is_empty());
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }
}

mod flight_free_wgpu_render_pass_handle {
    use super::*;

    #[test]
    fn ends_an_open_top_pass_submitting_its_frame_before_releasing_it() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        assert!(scene_runtime(&scene).command_encoder.is_some());
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert!(scene_record_ids(&scene).is_empty());
        assert!(scene_runtime(&scene).command_encoder.is_none());
        assert!(scene_runtime(&scene).render_pass.is_none());
        assert!(scene_runtime(&scene).current_render_target.is_none());
        let next = scene_begin(&scene);
        assert!(!next.is_null());
        unsafe { flight_free_wgpu_render_pass_handle(next) };
    }

    #[test]
    fn ignores_a_null_handle() {
        unsafe { flight_free_wgpu_render_pass_handle(null_mut()) };
    }
}

mod flight_render_wgpu_scene2d {
    use super::*;

    #[test]
    fn aborts_instead_of_unwinding_a_panic_back_to_c() {
        const CHILD: &str = "FLIGHT_FFI_E3_PANIC_CHILD";
        if std::env::var_os(CHILD).is_some() {
            let scene = create_scene();
            let pass = scene_begin(&scene);
            set_probe(Probe::Panic);
            scene_render_2d(&scene, pass);
            unreachable!("a panic inside a bracket consumer must abort");
        }
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "render_pass_bracket_runtime_test::flight_render_wgpu_scene2d::aborts_instead_of_unwinding_a_panic_back_to_c",
                "--exact",
                "--nocapture",
                "--test-threads=1",
            ])
            .env(CHILD, "1")
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(!output.status.success(), "{stderr}");
        #[cfg(unix)]
        {
            use std::os::unix::process::ExitStatusExt;
            assert_eq!(output.status.signal(), Some(6), "{stderr}");
        }
        assert!(stderr.contains("probe panic"), "{stderr}");
        assert!(
            stderr.contains("panic in a function that cannot unwind"),
            "{stderr}"
        );
        assert!(!stderr.contains("unreachable"), "{stderr}");
    }

    #[test]
    fn balances_a_native_nested_pass_back_to_the_original_top_record() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        let original = unsafe { (*pass).record_id };
        set_probe(Probe::Nest(scene.target.clone()));
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(take_probe_calls(), 1);
        assert_eq!(take_nested_depth(), 2);
        assert_eq!(scene_record_ids(&scene), [original]);
        assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Open);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn draws_through_an_open_top_pass_and_returns_to_open() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_probe(Probe::Count);
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(take_probe_calls(), 1);
        assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Open);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn rejects_same_handle_reentry_while_busy_and_completes_the_outer_call() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_probe(Probe::Reenter(pass));
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(
            take_reentry(),
            Some(Reentry {
                phase: FfiWgpuRenderPassPhase::Busy,
                render: false,
                end: false,
                freed_phase: FfiWgpuRenderPassPhase::Busy
            })
        );
        assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Open);
        assert_eq!(scene_record_ids(&scene).len(), 1);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn returns_false_for_a_null_required_argument_without_changing_the_pass() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_probe(Probe::Count);
        let before = scene_snapshot(&scene);
        let proxies = scene_proxies_ptr(&scene);
        let source = scene_source_ptr(&scene);
        assert!(!unsafe { flight_render_wgpu_scene2d(null_mut(), proxies, source, null()) });
        assert!(!unsafe { flight_render_wgpu_scene2d(pass, null_mut(), source, null()) });
        assert!(!unsafe { flight_render_wgpu_scene2d(pass, proxies, null(), null()) });
        assert_eq!(take_probe_calls(), 0);
        assert_eq!(scene_snapshot(&scene), before);
        assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Open);
        let transform = flight_sdk::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(unsafe { flight_render_wgpu_scene2d(pass, proxies, source, &transform) });
        assert_eq!(take_probe_calls(), 1);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }
}

mod same_index_record_replacement {
    use super::*;

    #[test]
    fn makes_a_stale_handle_that_never_draws_ends_or_pops_the_replacement() {
        for operation in [Operation::Render, Operation::End, Operation::Free] {
            let scene = create_scene();
            let pass = scene_begin(&scene);
            let original = unsafe { (*pass).record_id };
            end_wgpu_render_pass(WgpuRenderPass {
                state: scene_state_mut(&scene),
                index: 0,
            });
            let replacement =
                begin_wgpu_render_pass(scene_state_mut(&scene), &scene.target, None).index;
            assert_eq!(replacement, 0);
            let replaced = scene_record_ids(&scene);
            assert_ne!(replaced, [original]);
            set_probe(Probe::Count);
            take_wgpu_render_pass_validation_trace();
            match operation {
                Operation::Render => assert!(!scene_render_2d(&scene, pass)),
                Operation::End => assert!(!unsafe { flight_end_wgpu_render_pass(pass) }),
                Operation::Free => unsafe { flight_free_wgpu_render_pass_handle(pass) },
            }
            assert_eq!(
                take_wgpu_render_pass_validation_trace(),
                ["state_id", "pass_stack", "record_id"]
            );
            assert_eq!(take_probe_calls(), 0);
            assert_eq!(scene_record_ids(&scene), replaced, "{operation:?}");
            if operation != Operation::Free {
                assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Stale);
                assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
                assert!(!scene_render_2d(&scene, pass));
                unsafe { flight_free_wgpu_render_pass_handle(pass) };
                assert_eq!(scene_record_ids(&scene), replaced);
            }
            end_wgpu_render_pass(WgpuRenderPass {
                state: scene_state_mut(&scene),
                index: 0,
            });
        }
    }
}

mod same_address_state_replacement {
    use super::*;

    #[test]
    fn rejects_the_old_handle_by_state_id_before_reading_the_replacement_pass_stack() {
        for operation in [Operation::Render, Operation::End, Operation::Free] {
            let scene = create_scene();
            let pass = scene_begin(&scene);
            let old_id = unsafe { (*pass).state_id };
            let target = scene_replace_state(&scene);
            assert_ne!(get_entity_id(scene_state(&scene)), old_id);
            // The replacement has its own pass at the old index, so only the state identity
            // separates it from the original.
            let replacement = begin_wgpu_render_pass(scene_state_mut(&scene), &target, None).index;
            assert_eq!(replacement, unsafe { (*pass).index });
            let replaced = scene_snapshot(&scene);
            set_probe(Probe::Count);
            take_wgpu_render_pass_validation_trace();
            match operation {
                Operation::Render => assert!(!scene_render_2d(&scene, pass)),
                Operation::End => assert!(!unsafe { flight_end_wgpu_render_pass(pass) }),
                Operation::Free => unsafe { flight_free_wgpu_render_pass_handle(pass) },
            }
            assert_eq!(
                take_wgpu_render_pass_validation_trace(),
                ["state_id"],
                "{operation:?}"
            );
            assert_eq!(take_probe_calls(), 0);
            assert_eq!(scene_snapshot(&scene), replaced, "{operation:?}");
            if operation != Operation::Free {
                assert_eq!(unsafe { (*pass).phase }, FfiWgpuRenderPassPhase::Stale);
                unsafe { flight_free_wgpu_render_pass_handle(pass) };
                assert_eq!(take_wgpu_render_pass_validation_trace(), Vec::<&str>::new());
            }
            end_wgpu_render_pass(WgpuRenderPass {
                state: scene_state_mut(&scene),
                index: replacement,
            });
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Operation {
    Render,
    End,
    Free,
}

enum Probe {
    Count,
    Nest(WgpuRenderTarget),
    Panic,
    Reenter(*mut FfiWgpuRenderPassHandle),
}

#[derive(Debug, PartialEq, Eq)]
struct Reentry {
    phase: FfiWgpuRenderPassPhase,
    render: bool,
    end: bool,
    freed_phase: FfiWgpuRenderPassPhase,
}

// A heap render state on wgpu's noop backend with a texture target, a probe-rendered display
// object, the FlightNode handle a C caller would hold for it, and its proxies. The state lives
// behind one raw pointer every access derives from, as a C caller's would, so the FFI handle and the
// test's native calls never hold competing borrows.
struct Scene {
    state: *mut flight_sdk::WgpuRenderState,
    target: WgpuRenderTarget,
    proxies: *mut WgpuProxies,
    source: flight_sdk::NodeRef,
    source_handle: Box<FlightNode>,
}

fn create_scene() -> Scene {
    take_probe_calls();
    take_wgpu_render_pass_validation_trace();
    let state = Box::into_raw(Box::new(noop_render_state()));
    let target = create_texture_target(unsafe { &*state });
    let source: flight_sdk::NodeRef = flight_sdk::create_display_object();
    let proxies = Box::into_raw(Box::new(WgpuProxies::default()));
    flight_sdk::prepare_scene_2d_render(unsafe { &mut *state }, unsafe { &mut *proxies }, &source);
    let source_handle = Box::new(ffi_node_from_node_ref(source.clone()));
    return Scene {
        state,
        target,
        proxies,
        source,
        source_handle,
    };
}

fn create_texture_target(state: &flight_sdk::WgpuRenderState) -> WgpuRenderTarget {
    return WgpuRenderTarget::Texture(Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state, 8.0, 8.0, None, None, None,
    ))));
}

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
        std::thread::yield_now();
    }
}

// A render state on wgpu's noop backend whose display objects draw through the probe renderer.
fn noop_render_state() -> flight_sdk::WgpuRenderState {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::NOOP;
    descriptor.backend_options.noop.enable = true;
    let instance = wgpu::Instance::new(descriptor);
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
        .expect("the noop adapter");
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
        .expect("the noop device");
    let spawn = flight_sdk::HostSpawnCapability {
        provider: Arc::new("flight-ffi-test"),
        spawn: Arc::new(|_future| {}),
    };
    let device = flight_sdk::WgpuDevice {
        provider: Arc::new("flight-ffi-test"),
        handle: Arc::new(create_wgpu_native_device(device, queue, spawn)),
    };
    let mut state = create_wgpu_render_state(&device, None);
    flight_sdk::register_node_renderer(
        &mut state,
        flight_sdk::DISPLAY_OBJECT_KIND.to_string(),
        &PROBE_RENDERER,
    );
    return state;
}

fn scene_begin(scene: &Scene) -> *mut FfiWgpuRenderPassHandle {
    let clear = flight_sdk::RenderTargetClear::default();
    return unsafe { flight_begin_wgpu_render_pass(scene.state, &scene.target, &clear) };
}

fn scene_proxies_ptr(scene: &Scene) -> *mut c_void {
    return scene.proxies.cast();
}

fn scene_record_ids(scene: &Scene) -> Vec<u64> {
    return scene_runtime(scene)
        .pass_stack
        .iter()
        .map(|record| get_entity_id(record))
        .collect();
}

fn scene_render_2d(scene: &Scene, pass: *mut FfiWgpuRenderPassHandle) -> bool {
    return unsafe {
        flight_render_wgpu_scene2d(
            pass,
            scene_proxies_ptr(scene),
            scene_source_ptr(scene),
            null(),
        )
    };
}

// Drops the state in place and writes a newly identified one at the same address, returning a
// target on the replacement's own device.
fn scene_replace_state(scene: &Scene) -> WgpuRenderTarget {
    let replacement = noop_render_state();
    unsafe {
        std::ptr::drop_in_place(scene.state);
        std::ptr::write(scene.state, replacement);
    }
    flight_sdk::prepare_scene_2d_render(
        scene_state_mut(scene),
        unsafe { &mut *scene.proxies },
        &scene.source,
    );
    return create_texture_target(scene_state(scene));
}

fn scene_runtime(scene: &Scene) -> &flight_sdk::render_wgpu::contract::WgpuRenderStateRuntime {
    return get_wgpu_render_state_runtime(scene_state(scene));
}

// What a lifecycle rejection must leave unchanged: the pass records, the encoder, the open
// pass encoder and the current target.
fn scene_snapshot(scene: &Scene) -> (Vec<u64>, bool, bool, bool) {
    let runtime = scene_runtime(scene);
    return (
        scene_record_ids(scene),
        runtime.command_encoder.is_some(),
        runtime.render_pass.is_some(),
        runtime.current_render_target.is_some(),
    );
}

fn scene_source_ptr(scene: &Scene) -> *const FlightNode {
    return &*scene.source_handle;
}

fn scene_state(scene: &Scene) -> &flight_sdk::WgpuRenderState {
    return unsafe { &*scene.state };
}

#[allow(clippy::mut_from_ref)]
fn scene_state_mut(scene: &Scene) -> &mut flight_sdk::WgpuRenderState {
    return unsafe { &mut *scene.state };
}

fn set_probe(probe: Probe) {
    PROBE.with(|slot| *slot.borrow_mut() = Some(probe));
}

// The display-object renderer the bracket consumer reaches: it counts calls and, per the probe,
// nests a native pass, re-enters the bracket through the same handle, or panics.
fn submit_probe(
    state: &mut flight_sdk::WgpuRenderState,
    _proxy: &flight_sdk::RenderProxy2D<flight_sdk::WgpuRenderState>,
) {
    PROBE_CALLS.with(|calls| *calls.borrow_mut() += 1);
    let probe = PROBE.with(|probe| probe.borrow_mut().take());
    match probe {
        Some(Probe::Nest(target)) => {
            let inner = begin_wgpu_render_pass(state, &target, None).index;
            NESTED_DEPTH.with(|depth| {
                *depth.borrow_mut() = get_wgpu_render_state_runtime(state).pass_stack.len()
            });
            end_wgpu_render_pass(WgpuRenderPass {
                state,
                index: inner,
            });
        }
        Some(Probe::Panic) => panic!("probe panic"),
        Some(Probe::Reenter(pass)) => {
            let phase = unsafe { (*pass).phase };
            let dangling = NonNull::<u8>::dangling().as_ptr().cast::<c_void>();
            let render =
                unsafe { flight_render_wgpu_scene2d(pass, dangling, dangling.cast(), null()) };
            let end = unsafe { flight_end_wgpu_render_pass(pass) };
            unsafe { flight_free_wgpu_render_pass_handle(pass) };
            let freed_phase = unsafe { (*pass).phase };
            REENTRY.with(|reentry| {
                *reentry.borrow_mut() = Some(Reentry {
                    phase,
                    render,
                    end,
                    freed_phase,
                });
            });
        }
        Some(Probe::Count) | None => {}
    }
}

fn take_nested_depth() -> usize {
    return NESTED_DEPTH.with(|depth| std::mem::take(&mut *depth.borrow_mut()));
}

fn take_probe_calls() -> usize {
    return PROBE_CALLS.with(|calls| std::mem::take(&mut *calls.borrow_mut()));
}

fn take_reentry() -> Option<Reentry> {
    return REENTRY.with(|reentry| reentry.borrow_mut().take());
}

static PROBE_RENDERER: flight_sdk::NodeRenderer<flight_sdk::WgpuRenderState> =
    flight_sdk::NodeRenderer {
        format: None,
        create_data: flight_sdk::noop_renderer_data,
        destroy_data: None,
        is_dirty: None,
        submit: submit_probe,
    };

// flight-lint: allow(hidden-state) test probe: the renderer submit is a plain fn pointer, so the probe action and its observations reach it per test thread
thread_local! {
    static NESTED_DEPTH: RefCell<usize> = const { RefCell::new(0) };
    static PROBE: RefCell<Option<Probe>> = const { RefCell::new(None) };
    static PROBE_CALLS: RefCell<usize> = const { RefCell::new(0) };
    static REENTRY: RefCell<Option<Reentry>> = const { RefCell::new(None) };
}

type WgpuProxies = flight_sdk::RenderProxies2D<flight_sdk::WgpuRenderState>;

impl Drop for Scene {
    fn drop(&mut self) {
        set_probe(Probe::Count);
        unsafe {
            drop(Box::from_raw(self.proxies));
            drop(Box::from_raw(self.state));
        }
    }
}
