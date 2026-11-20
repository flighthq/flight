use std::ffi::CString;
use std::future::Future;
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::task::{Context, Poll, Waker};

use flight_sdk::render_wgpu::contract::{create_wgpu_native_device, create_wgpu_render_state};

use crate::*;

mod flight_free_wgpu_quad_material_renderer {
    use super::*;

    // The owned quad material free releases owned copies, and refuses every built-in's address even
    // when C casts a borrowed handle to the owned type: the static is never freed.
    #[test]
    fn frees_owned_copies_and_refuses_every_built_in_address() {
        let built_in = unsafe { flight_get_standard_wgpu_quad_material_renderer() };
        unsafe { flight_free_wgpu_quad_material_renderer(built_in.cast_mut().cast()) };
        unsafe { flight_free_wgpu_quad_material_renderer(built_in.cast_mut().cast()) };
        assert!(ffi_resolve_wgpu_quad_material_renderer(built_in).is_some());
        let mut state = noop_render_state();
        let kind = CString::new("vendor.Quad").unwrap();
        unsafe { flight_register_wgpu_quad_material_renderer(&mut state, kind.as_ptr(), built_in) };
        assert!(
            flight_sdk::get_wgpu_quad_material_renderer(&state, &"vendor.Quad".to_string())
                .is_some()
        );
        let survivor = &flight_sdk::scene2d_wgpu::contract::STANDARD_WGPU_QUAD_MATERIAL_RENDERER;
        let owned = Box::into_raw(Box::new(survivor.clone()));
        unsafe { flight_free_wgpu_quad_material_renderer(owned) };
        unsafe { flight_free_wgpu_quad_material_renderer(null_mut()) };
    }

    // Every producer's result, of every backend and family, forced through the owned free by a cast
    // is counted by the census and returns without freeing anything; each producer then still lends
    // the same live static.
    #[test]
    fn refuses_the_result_of_every_producer_of_every_family() {
        let producers = ffi_builtin_renderer_producers();
        let families: std::collections::BTreeSet<&str> =
            producers.iter().map(|(_, family, _)| *family).collect();
        assert_eq!(families.len(), 7, "{families:?}");
        for (producer, family, address) in producers {
            assert!(
                ffi_is_builtin_renderer(address),
                "{producer} ({family}) is missing from the built-in census"
            );
        }
        for (_, _, address) in producers {
            let forced: *mut flight_sdk::WgpuQuadMaterialRenderer =
                std::ptr::with_exposed_provenance_mut(address);
            unsafe { flight_free_wgpu_quad_material_renderer(forced) };
            unsafe { flight_free_wgpu_quad_material_renderer(forced) };
        }
        assert_eq!(ffi_builtin_renderer_producers(), producers);
        let preset = unsafe { flight_get_wgpu_scene2d_render_preset() };
        assert!(
            !ffi_resolve_wgpu_render_preset(preset)
                .unwrap()
                .node_renderers
                .entries
                .is_empty()
        );
        assert!(!ffi_is_builtin_renderer(0));
        assert!(!ffi_is_builtin_renderer(producers[0].2 + 1));
    }
}

mod flight_get_wgpu_scene2d_render_preset {
    use super::*;

    #[test]
    fn lends_each_wgpu_preset_static_by_address() {
        let two = unsafe { flight_get_wgpu_scene2d_render_preset() };
        let three = unsafe { flight_get_wgpu_scene3d_render_preset() };
        assert!(is_address_of(
            two,
            &*flight_sdk::scene2d_wgpu::contract::WGPU_SCENE2D_RENDER_PRESET
        ));
        assert!(is_address_of(
            three,
            &*flight_sdk::scene3d_wgpu::contract::WGPU_SCENE3D_RENDER_PRESET
        ));
        assert_ne!(two, three);
    }
}

mod flight_get_wgpu_sprite_renderer {
    use super::*;

    // Producers lend the statics themselves; an alias lends the static it names.
    #[test]
    fn lends_the_built_in_statics_themselves() {
        assert!(is_address_of(
            unsafe { flight_get_wgpu_sprite_renderer() },
            &flight_sdk::scene2d_wgpu::contract::WGPU_SPRITE_RENDERER
        ));
        assert!(is_address_of(
            unsafe { flight_get_gl_sprite_renderer() },
            &flight_sdk::scene2d_gl::contract::GL_SPRITE_RENDERER
        ));
        assert!(std::ptr::eq(
            unsafe { flight_get_wgpu_morph_shape_renderer() },
            unsafe { flight_get_wgpu_shape_renderer() }
        ));
        assert!(is_address_of(
            unsafe { flight_get_wgpu_blinn_phong_mesh_material_renderer() },
            &flight_sdk::scene3d_wgpu::contract::WGPU_BLINN_PHONG_MESH_MATERIAL_RENDERER
        ));
        assert!(is_address_of(
            unsafe { flight_get_standard_wgpu_quad_material_renderer() },
            &flight_sdk::scene2d_wgpu::contract::STANDARD_WGPU_QUAD_MATERIAL_RENDERER
        ));
    }
}

mod flight_register_gl_node_renderer {
    use super::*;

    // GL render states cannot be created in a unit test, so the GL registrar's guard is exercised
    // through the resolver it calls before anything else.
    #[test]
    fn resolves_only_gl_node_renderer_handles() {
        let gl = unsafe { flight_get_gl_sprite_renderer() };
        assert!(
            ffi_resolve_gl_node_renderer(gl).is_some_and(|renderer| is_address_of(gl, renderer))
        );
        let wgpu = unsafe { flight_get_wgpu_sprite_renderer() };
        for foreign in [
            wgpu.cast::<FfiBuiltinGlNodeRenderer>(),
            null(),
            std::ptr::without_provenance(8),
            gl.wrapping_byte_add(1),
        ] {
            assert!(ffi_resolve_gl_node_renderer(foreign).is_none());
        }
        unsafe { flight_register_gl_node_renderer(null_mut(), null(), gl) };
    }

    // Every producer's result: only the GL node family resolves, and the registrar refuses each one
    // on the NULL state a C caller can pass.
    #[test]
    fn resolves_only_producers_of_its_own_family() {
        let kind = CString::new("probe.Gl").unwrap();
        for (producer, own, handle) in
            every_producer_as::<FfiBuiltinGlNodeRenderer>("gl_node_renderer")
        {
            assert_eq!(
                ffi_resolve_gl_node_renderer(handle)
                    .is_some_and(|renderer| is_address_of(handle, renderer)),
                own,
                "{producer}"
            );
            unsafe { flight_register_gl_node_renderer(null_mut(), kind.as_ptr(), handle) };
        }
    }

    // C cannot build a GL render state, so NULL is the state a C caller can pass: it is refused
    // before the state is read, with a valid kind and a valid GL handle alike.
    #[test]
    fn refuses_a_null_state_before_reading_it() {
        let kind = CString::new("probe.Gl").unwrap();
        let gl = unsafe { flight_get_gl_sprite_renderer() };
        unsafe { flight_register_gl_node_renderer(null_mut(), kind.as_ptr(), gl) };
        unsafe {
            flight_register_gl_node_renderer(
                null_mut(),
                kind.as_ptr(),
                flight_get_wgpu_sprite_renderer().cast(),
            )
        };
        unsafe { flight_register_gl_node_renderer(null_mut(), INVALID_KIND.as_ptr().cast(), gl) };
    }
}

mod flight_register_wgpu_mesh_material_renderer {
    use super::*;

    #[test]
    fn registers_a_built_in_mesh_material_and_refuses_any_other_handle() {
        let mut state = noop_render_state();
        let kind = CString::new("vendor.Mesh").unwrap();
        let built_in = unsafe { flight_get_wgpu_unlit_mesh_material_renderer() };
        for foreign in [
            unsafe { flight_get_gl_unlit_mesh_material_renderer() }.cast(),
            unsafe { flight_get_wgpu_sprite_renderer() }.cast(),
            null(),
            std::ptr::without_provenance(8),
        ] {
            unsafe {
                flight_register_wgpu_mesh_material_renderer(&mut state, kind.as_ptr(), foreign)
            };
            assert!(
                flight_sdk::scene3d_wgpu::contract::get_wgpu_mesh_material_renderer(
                    &state,
                    "vendor.Mesh"
                )
                .is_none()
            );
        }
        unsafe { flight_register_wgpu_mesh_material_renderer(&mut state, null(), built_in) };
        unsafe { flight_register_wgpu_mesh_material_renderer(&mut state, kind.as_ptr(), built_in) };
        let registered = flight_sdk::scene3d_wgpu::contract::get_wgpu_mesh_material_renderer(
            &state,
            "vendor.Mesh",
        )
        .unwrap();
        assert!(is_address_of(built_in, registered));
    }

    // Every producer's result bound to a kind of its own: only the wgpu mesh material family
    // registers, and the lookup lends that very static back as the family's carrier.
    #[test]
    fn registers_only_producers_of_its_own_family() {
        let mut state = noop_render_state();
        for (index, (producer, own, handle)) in
            every_producer_as::<FfiBuiltinWgpuMeshMaterialRenderer>("wgpu_mesh_material_renderer")
                .into_iter()
                .enumerate()
        {
            let kind = CString::new(format!("vendor.Matrix{index}")).unwrap();
            unsafe {
                flight_register_wgpu_mesh_material_renderer(&mut state, kind.as_ptr(), handle)
            };
            let bound: *const FfiBuiltinWgpuMeshMaterialRenderer =
                unsafe { flight_get_wgpu_mesh_material_renderer(&state, kind.as_ptr()) };
            if own {
                assert_eq!(bound, handle, "{producer}");
            } else {
                assert!(bound.is_null(), "{producer}");
            }
        }
    }

    // Bytes that are not UTF-8 never become the empty kind: nothing registers, and a lookup of them
    // returns NULL; the empty kind is a kind of its own that a caller may bind on purpose.
    #[test]
    fn refuses_a_kind_that_is_not_utf8_and_keeps_the_empty_kind_distinct() {
        let mut state = noop_render_state();
        let built_in = unsafe { flight_get_wgpu_unlit_mesh_material_renderer() };
        let empty = CString::new("").unwrap();
        unsafe {
            flight_register_wgpu_mesh_material_renderer(
                &mut state,
                INVALID_KIND.as_ptr().cast(),
                built_in,
            )
        };
        assert!(
            flight_sdk::scene3d_wgpu::contract::get_wgpu_mesh_material_renderer(&state, "")
                .is_none()
        );
        assert!(
            unsafe { flight_get_wgpu_mesh_material_renderer(&state, empty.as_ptr()) }.is_null()
        );
        unsafe {
            flight_register_wgpu_mesh_material_renderer(&mut state, empty.as_ptr(), built_in)
        };
        let bound = unsafe { flight_get_wgpu_mesh_material_renderer(&state, empty.as_ptr()) };
        assert!(is_address_of(built_in, unsafe { &*bound }));
        assert!(
            unsafe { flight_get_wgpu_mesh_material_renderer(&state, INVALID_KIND.as_ptr().cast()) }
                .is_null()
        );
        assert!(unsafe { flight_get_wgpu_mesh_material_renderer(&state, null()) }.is_null());
    }
}

mod flight_register_wgpu_node_renderer {
    use super::*;

    // One built-in renderer bound to its standard kind and to a caller's own kind: both kinds then
    // resolve to the very same static.
    #[test]
    fn binds_a_built_in_renderer_to_its_standard_kind_and_to_a_custom_kind() {
        let mut state = noop_render_state();
        let shape = unsafe { flight_get_wgpu_shape_renderer() };
        let standard = CString::new(flight_sdk::shape::contract::SHAPE_KIND).unwrap();
        let custom = CString::new("vendor.Outline").unwrap();
        unsafe { flight_register_wgpu_node_renderer(&mut state, standard.as_ptr(), shape) };
        unsafe { flight_register_wgpu_node_renderer(&mut state, custom.as_ptr(), shape) };
        let renderers = &flight_sdk::RenderState::render_registries(&state).node_renderers;
        assert!(is_address_of(
            shape,
            *renderers
                .entries
                .get(flight_sdk::shape::contract::SHAPE_KIND)
                .unwrap()
        ));
        assert!(is_address_of(
            shape,
            *renderers.entries.get("vendor.Outline").unwrap()
        ));
        let before = renderers.clone();
        unsafe { flight_register_wgpu_node_renderer(&mut state, custom.as_ptr(), shape) };
        assert_eq!(
            flight_sdk::RenderState::render_registries(&state)
                .node_renderers
                .key_order,
            before.key_order
        );
    }

    // A custom-kind node is prepared with the renderer bound to its kind, and without a binding it has
    // none: binding the custom kind is what makes the node drawable.
    #[test]
    fn makes_a_node_of_the_custom_kind_draw_with_the_bound_renderer() {
        let custom = CString::new("vendor.Outline").unwrap();
        let shape = unsafe { flight_get_wgpu_shape_renderer() };
        for bound in [false, true] {
            let mut state = noop_render_state();
            let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
            let node: flight_sdk::NodeRef = flight_sdk::create_shape();
            node.write().unwrap().node_fields_mut().kind = "vendor.Outline".to_string();
            flight_sdk::add_node_child(&root, &node);
            if bound {
                unsafe { flight_register_wgpu_node_renderer(&mut state, custom.as_ptr(), shape) };
            }
            let mut proxies = flight_sdk::RenderProxies2D::<flight_sdk::WgpuRenderState>::default();
            flight_sdk::prepare_scene_2d_render(&mut state, &mut proxies, &root);
            let proxy =
                flight_sdk::get_render_proxy_2d(&proxies, &node).expect("the node has a proxy");
            let renderer = proxy.renderer;
            assert_eq!(
                renderer.is_some_and(|renderer| is_address_of(shape, renderer)),
                bound,
                "bound: {bound}"
            );
        }
    }

    #[test]
    fn refuses_other_backend_family_forged_and_null_handles_and_a_null_kind() {
        let mut state = noop_render_state();
        let kind = CString::new("vendor.Refused").unwrap();
        let before = flight_sdk::RenderState::render_registries(&state)
            .node_renderers
            .clone();
        for foreign in [
            unsafe { flight_get_gl_sprite_renderer() }.cast(),
            unsafe { flight_get_wgpu_unlit_mesh_material_renderer() }.cast(),
            unsafe { flight_get_wgpu_scene2d_render_preset() }.cast(),
            unsafe { flight_get_wgpu_sprite_renderer() }.wrapping_byte_add(1),
            std::ptr::without_provenance(8),
            null(),
        ] {
            unsafe { flight_register_wgpu_node_renderer(&mut state, kind.as_ptr(), foreign) };
        }
        unsafe {
            flight_register_wgpu_node_renderer(
                &mut state,
                null(),
                flight_get_wgpu_sprite_renderer(),
            )
        };
        unsafe {
            flight_register_wgpu_node_renderer(
                null_mut(),
                kind.as_ptr(),
                flight_get_wgpu_sprite_renderer(),
            )
        };
        let after = &flight_sdk::RenderState::render_registries(&state).node_renderers;
        assert_eq!(after.key_order, before.key_order);
        assert!(!after.entries.contains_key("vendor.Refused"));
    }

    // Every producer's result bound to a kind of its own: only the wgpu node family registers, and
    // every other family leaves the registry as it was.
    #[test]
    fn registers_only_producers_of_its_own_family() {
        let mut state = noop_render_state();
        for (index, (producer, own, handle)) in
            every_producer_as::<FfiBuiltinWgpuNodeRenderer>("wgpu_node_renderer")
                .into_iter()
                .enumerate()
        {
            let kind = format!("vendor.Matrix{index}");
            let kind_c = CString::new(kind.clone()).unwrap();
            let before = flight_sdk::RenderState::render_registries(&state)
                .node_renderers
                .key_order
                .clone();
            unsafe { flight_register_wgpu_node_renderer(&mut state, kind_c.as_ptr(), handle) };
            let renderers = &flight_sdk::RenderState::render_registries(&state).node_renderers;
            if own {
                assert!(
                    is_address_of(handle, *renderers.entries.get(&kind).unwrap()),
                    "{producer}"
                );
            } else {
                assert_eq!(renderers.key_order, before, "{producer}");
            }
        }
    }

    // Bytes that are not UTF-8 never become the empty kind: nothing registers and no node of the
    // empty kind draws; binding the empty kind on purpose is a registration of its own.
    #[test]
    fn refuses_a_kind_that_is_not_utf8_and_keeps_the_empty_kind_distinct() {
        let mut state = noop_render_state();
        let shape = unsafe { flight_get_wgpu_shape_renderer() };
        let before = flight_sdk::RenderState::render_registries(&state)
            .node_renderers
            .clone();
        unsafe {
            flight_register_wgpu_node_renderer(&mut state, INVALID_KIND.as_ptr().cast(), shape)
        };
        let after = &flight_sdk::RenderState::render_registries(&state).node_renderers;
        assert_eq!(after.key_order, before.key_order);
        assert!(!after.entries.contains_key(""));
        let empty = CString::new("").unwrap();
        unsafe { flight_register_wgpu_node_renderer(&mut state, empty.as_ptr(), shape) };
        let renderers = &flight_sdk::RenderState::render_registries(&state).node_renderers;
        assert!(is_address_of(shape, *renderers.entries.get("").unwrap()));
        assert_eq!(renderers.key_order.len(), before.key_order.len() + 1);
    }
}

mod flight_register_wgpu_quad_material_renderer {
    use super::*;

    // Every producer's result bound to a kind of its own: only the wgpu quad material family
    // registers.
    #[test]
    fn registers_only_producers_of_its_own_family() {
        let mut state = noop_render_state();
        for (index, (producer, own, handle)) in
            every_producer_as::<FfiBuiltinWgpuQuadMaterialRenderer>("wgpu_quad_material_renderer")
                .into_iter()
                .enumerate()
        {
            let kind = format!("vendor.Matrix{index}");
            let kind_c = CString::new(kind.clone()).unwrap();
            unsafe {
                flight_register_wgpu_quad_material_renderer(&mut state, kind_c.as_ptr(), handle)
            };
            assert_eq!(
                flight_sdk::get_wgpu_quad_material_renderer(&state, &kind).is_some(),
                own,
                "{producer}"
            );
        }
    }

    // A built-in quad material crosses as a borrowed handle; registering it stores a copy and leaves
    // the static, which C never frees, untouched.
    #[test]
    fn registers_a_copy_of_a_built_in_and_refuses_any_other_handle() {
        let mut state = noop_render_state();
        let kind = CString::new("vendor.Quad").unwrap();
        for foreign in [
            unsafe { flight_get_standard_gl_quad_material_renderer() }.cast(),
            null(),
            std::ptr::without_provenance(8),
        ] {
            unsafe {
                flight_register_wgpu_quad_material_renderer(&mut state, kind.as_ptr(), foreign)
            };
            assert!(
                flight_sdk::get_wgpu_quad_material_renderer(&state, &"vendor.Quad".to_string())
                    .is_none()
            );
        }
        let built_in = unsafe { flight_get_standard_wgpu_quad_material_renderer() };
        unsafe { flight_register_wgpu_quad_material_renderer(&mut state, kind.as_ptr(), built_in) };
        unsafe { flight_register_wgpu_quad_material_renderer(&mut state, kind.as_ptr(), built_in) };
        let registered =
            flight_sdk::get_wgpu_quad_material_renderer(&state, &"vendor.Quad".to_string())
                .unwrap();
        assert_eq!(
            registered.instance_float_count,
            flight_sdk::scene2d_wgpu::contract::STANDARD_WGPU_QUAD_MATERIAL_RENDERER
                .instance_float_count
        );
    }
}

mod flight_register_wgpu_render_preset {
    use super::*;

    // Every producer's result offered as a preset: only the wgpu preset family registers, and every
    // other family leaves the node renderers as they were.
    #[test]
    fn registers_only_producers_of_its_own_family() {
        for (producer, own, handle) in
            every_producer_as::<FfiBuiltinWgpuRenderPreset>("wgpu_render_preset")
        {
            let mut state = noop_render_state();
            let before = flight_sdk::RenderState::render_registries(&state)
                .node_renderers
                .key_order
                .clone();
            unsafe { flight_register_wgpu_render_preset(&mut state, handle) };
            let after = &flight_sdk::RenderState::render_registries(&state)
                .node_renderers
                .key_order;
            assert_eq!(after == &before, !own, "{producer}");
        }
    }

    #[test]
    fn registers_a_built_in_preset_and_refuses_any_other_handle() {
        let mut state = noop_render_state();
        let before = flight_sdk::RenderState::render_registries(&state)
            .node_renderers
            .clone();
        for foreign in [
            unsafe { flight_get_wgpu_sprite_renderer() }.cast(),
            null(),
            std::ptr::without_provenance(8),
        ] {
            unsafe { flight_register_wgpu_render_preset(&mut state, foreign) };
        }
        assert_eq!(
            flight_sdk::RenderState::render_registries(&state)
                .node_renderers
                .key_order,
            before.key_order
        );
        unsafe {
            flight_register_wgpu_render_preset(&mut state, flight_get_wgpu_scene2d_render_preset())
        };
        let renderers = &flight_sdk::RenderState::render_registries(&state).node_renderers;
        let preset = &flight_sdk::scene2d_wgpu::contract::WGPU_SCENE2D_RENDER_PRESET.node_renderers;
        for (kind, renderer) in &preset.entries {
            assert!(
                std::ptr::eq(*renderers.entries.get(kind).unwrap(), *renderer),
                "{kind}"
            );
        }
        unsafe {
            flight_register_wgpu_render_preset(null_mut(), flight_get_wgpu_scene2d_render_preset())
        };
    }
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

// Every producer's result, typed as the carrier `T` a consumer takes, with whether it is of `family`.
fn every_producer_as<T>(family: &str) -> Vec<(&'static str, bool, *const T)> {
    return ffi_builtin_renderer_producers()
        .into_iter()
        .map(|(producer, of, address)| {
            (
                producer,
                of == family,
                std::ptr::with_exposed_provenance(address),
            )
        })
        .collect();
}

// Whether `handle` lends exactly the value `builtin` refers to, by address alone.
fn is_address_of<T, U>(handle: *const T, builtin: &U) -> bool {
    return handle.addr() == std::ptr::from_ref(builtin).addr();
}

// A render state on wgpu's noop backend with no renderer registered.
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
    return create_wgpu_render_state(&device, None);
}

// Bytes that are not UTF-8, NUL-terminated as a C kind.
const INVALID_KIND: &[u8] = b"\xff\xfe\0";
