use std::future::Future;
use std::sync::Arc;
use std::task::{Context, Poll, Waker};

use flight_sdk::render_wgpu::contract::{create_wgpu_native_device, create_wgpu_render_state};

use crate::*;

mod flight_create_wgpu_scene_2d_render_proxies {
    use super::*;

    #[test]
    fn creates_an_empty_owned_carrier_released_by_its_paired_free() {
        let carrier = unsafe { flight_create_wgpu_scene_2d_render_proxies() };
        assert!(!carrier.is_null());
        let proxies = unsafe { &*(carrier as *const WgpuProxies) };
        assert!(proxies.entries.is_empty());
        assert!(proxies.by_uid.is_empty());
        unsafe { flight_free_wgpu_scene_2d_render_proxies(carrier as *mut WgpuProxies) };
    }
}

mod flight_destroy_wgpu_scene_2d_render {
    use super::*;

    #[test]
    fn tears_down_every_prepared_proxy_like_the_rust_destroy() {
        let mut state = noop_render_state();
        let scene = two_node_scene();
        let carrier = unsafe { flight_create_wgpu_scene_2d_render_proxies() };
        assert!(unsafe {
            flight_prepare_wgpu_scene_2d_render(&mut state, carrier, node_handle(&scene))
        });
        unsafe { flight_destroy_wgpu_scene_2d_render(&mut state, carrier) };
        let proxies = unsafe { &*(carrier as *const WgpuProxies) };
        assert!(proxies.entries.iter().all(Option::is_none));

        let mut expected = WgpuProxies::default();
        flight_sdk::prepare_scene_2d_render(&mut state, &mut expected, &scene);
        flight_sdk::destroy_render_state(&mut state, &mut expected);
        assert_eq!(proxies.entries.len(), expected.entries.len());
        assert!(expected.entries.iter().all(Option::is_none));
        unsafe { flight_free_wgpu_scene_2d_render_proxies(carrier as *mut WgpuProxies) };
    }
}

mod flight_free_wgpu_scene_2d_render_proxies {
    use super::*;

    #[test]
    fn ignores_a_null_carrier() {
        unsafe { flight_free_wgpu_scene_2d_render_proxies(std::ptr::null_mut()) };
    }
}

mod flight_prepare_wgpu_scene_2d_render {
    use super::*;

    #[test]
    fn prepares_the_same_proxies_as_the_rust_generic_call() {
        let mut state = noop_render_state();
        let scene = two_node_scene();
        let carrier = unsafe { flight_create_wgpu_scene_2d_render_proxies() };
        let prepared = unsafe {
            flight_prepare_wgpu_scene_2d_render(&mut state, carrier, node_handle(&scene))
        };

        let mut expected = WgpuProxies::default();
        let expected_prepared =
            flight_sdk::prepare_scene_2d_render(&mut state, &mut expected, &scene);
        let proxies = unsafe { &*(carrier as *const WgpuProxies) };
        assert_eq!(prepared, expected_prepared);
        assert_eq!(live_uids(proxies), live_uids(&expected));
        assert_eq!(live_uids(proxies).len(), 2);

        flight_sdk::destroy_render_state(&mut state, &mut expected);
        unsafe { flight_destroy_wgpu_scene_2d_render(&mut state, carrier) };
        unsafe { flight_free_wgpu_scene_2d_render_proxies(carrier as *mut WgpuProxies) };
    }
}

type WgpuProxies = flight_sdk::RenderProxies2D<flight_sdk::WgpuRenderState>;

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

fn live_uids(proxies: &WgpuProxies) -> Vec<u64> {
    let mut uids: Vec<u64> = proxies
        .by_uid
        .iter()
        .filter(|(_, index)| proxies.entries[**index].is_some())
        .map(|(uid, _)| *uid)
        .collect();
    uids.sort();
    return uids;
}

// The generated wrapper reads `source` as a pointer to the caller's `NodeRef` handle.
fn node_handle(node: &flight_sdk::NodeRef) -> *const std::ffi::c_void {
    return (node as *const flight_sdk::NodeRef).cast();
}

// A render state on wgpu's noop backend, so the declared instantiations run against a real
// WgpuRenderState without a GPU, with the standard 2D preset a consumer registers first.
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
    flight_sdk::register_wgpu_scene2d_render_preset(&mut state);
    return state;
}

// A display object holding a sprite, so preparation visits a parent and a child.
fn two_node_scene() -> flight_sdk::NodeRef {
    let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
    let child: flight_sdk::NodeRef = flight_sdk::create_sprite();
    flight_sdk::add_node_child(&root, &child);
    return root;
}
