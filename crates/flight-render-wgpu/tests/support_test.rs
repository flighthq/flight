//! The source's `wgpuHost.test.ts` and `wgpuTestHelper.test.ts`, ported against the Rust test
//! doubles in `support.rs` (the test host, test surface and the real noop device that replaces the
//! source's GPU mock).

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use flight_host::WgpuDevice;
use flight_render::RenderProxies2D;
use flight_render_wgpu::*;
use flight_surface::{
    GpuCanvasAlphaMode, HostWgpuCapability, SurfaceRef, WgpuHostAcquisition,
    WgpuHostAcquisitionOptions, WgpuHostAcquisitionOwnership, WgpuSurfaceAttachment,
    create_wgpu_host_acquisition,
};

use crate::support::*;

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .unwrap_or_else(String::new);
}

fn count(counter: &AtomicU32) -> u32 {
    return counter.load(Ordering::SeqCst);
}

fn acquire_for_test(host: &HostWgpuCapability, surface: &SurfaceRef) -> WgpuHostAcquisition {
    return block_on((host.acquire)(surface, &test_default())).expect("the test host acquires");
}

fn native_of(acquisition: &WgpuHostAcquisition) -> WgpuNativeDevice {
    return acquisition
        .device
        .handle
        .downcast_ref::<WgpuNativeDevice>()
        .expect("the test host acquires native devices")
        .clone();
}

// TS spied on device.destroy; a real device reports its destroy through its loss callback once
// polled, so the record holds every loss reason the device reported.
fn record_device_losses(native: &WgpuNativeDevice) -> Arc<Mutex<Vec<wgpu::DeviceLostReason>>> {
    let losses = Arc::new(Mutex::new(Vec::new()));
    let sink = losses.clone();
    native
        .device
        .set_device_lost_callback(move |reason, _| sink.lock().unwrap().push(reason));
    return losses;
}

fn poll_device(native: &WgpuNativeDevice) {
    let _ = native.device.poll(wgpu::PollType::wait_indefinitely());
}

// Copies an acquisition's handles into a fresh entity, as `Object.assign(allocateEntity(), acquired)`.
fn copy_acquisition(
    acquired: &WgpuHostAcquisition,
    ownership: WgpuHostAcquisitionOwnership,
) -> WgpuHostAcquisition {
    let mut out = create_wgpu_host_acquisition();
    out.context = acquired.context.clone();
    out.device = acquired.device.clone();
    out.format = acquired.format.clone();
    out.ownership = ownership;
    out.surface = acquired.surface.clone();
    return out;
}

fn validation_error(native: &WgpuNativeDevice, body: impl FnOnce()) -> Option<String> {
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    body();
    return block_on(scope.pop()).map(|error| error.to_string());
}

fn create_buffer_for_test(
    native: &WgpuNativeDevice,
    size: u64,
    usage: wgpu::BufferUsages,
) -> wgpu::Buffer {
    return native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size,
        usage,
        mapped_at_creation: false,
    });
}

mod create_test_wgpu_host {
    use super::*;

    // TS spied on context.unconfigure and device.destroy.
    #[test]
    fn acquires_flight_owned_browser_handles_and_releases_each_native_handle() {
        let (host, record) = create_test_wgpu_host();
        let canvas = create_test_canvas(300, 150);
        let target = create_test_wgpu_surface(&canvas);
        let acquisition = acquire_for_test(&host, &target);
        let native = native_of(&acquisition);
        let losses = record_device_losses(&native);

        assert_eq!(acquisition.ownership, WgpuHostAcquisitionOwnership::Flight);
        (host.release)(&acquisition);
        poll_device(&native);

        assert_eq!(count(&canvas.context.unconfigure_count), 1);
        assert_eq!(count(&record.release_count), 1);
        assert_eq!(
            *losses.lock().unwrap(),
            vec![wgpu::DeviceLostReason::Destroyed]
        );
    }

    #[test]
    fn tears_down_whatever_it_is_handed_leaving_the_ownership_decision_to_the_caller() {
        let (host, _) = create_test_wgpu_host();
        let canvas = create_test_canvas(300, 150);
        let target = create_test_wgpu_surface(&canvas);
        let acquired = acquire_for_test(&host, &target);
        let acquisition = copy_acquisition(&acquired, WgpuHostAcquisitionOwnership::Caller);
        let native = native_of(&acquisition);
        let losses = record_device_losses(&native);

        (host.release)(&acquisition);
        poll_device(&native);

        assert_eq!(count(&canvas.context.unconfigure_count), 1);
        assert_eq!(
            *losses.lock().unwrap(),
            vec![wgpu::DeviceLostReason::Destroyed]
        );
    }

    // TS made navigator.gpu's getter throw; the Rust test host's support answer is its record flag.
    #[test]
    fn reports_unsupported_instead_of_propagating_a_throwing_navigator_gpu_getter() {
        let (host, record) = create_test_wgpu_host();
        assert!(is_wgpu_supported(&host));

        record.supported.store(false, Ordering::SeqCst);

        assert!(!(host.is_supported)());
        assert!(!is_wgpu_supported(&host));
    }

    #[test]
    fn rejects_an_acquisition_the_adapter_refuses() {
        let (host, record) = create_test_wgpu_host();
        record.refuse_acquire.store(true, Ordering::SeqCst);
        let target = create_test_wgpu_surface(&create_test_canvas(4, 4));

        let result = block_on((host.acquire)(&target, &test_default()));

        assert!(result.is_err_and(|error| error.message.contains("adapter")));
        assert!(block_on(create_wgpu_acquisition(&host, &target, None)).is_none());
        assert_eq!(count(&record.acquire_count), 2);
    }

    // TS used vi.fn for every backend member; the Rust backend's closures record their calls.
    #[test]
    fn routes_acquisition_and_release_through_a_caller_provided_backend() {
        let (web, _) = create_test_wgpu_host();
        let canvas = create_test_canvas(300, 150);
        let target = create_test_wgpu_surface(&canvas);
        let acquired = acquire_for_test(&web, &target);
        let template = Arc::new(copy_acquisition(
            &acquired,
            WgpuHostAcquisitionOwnership::Caller,
        ));
        let acquire_calls: Arc<Mutex<Vec<(SurfaceRef, WgpuHostAcquisitionOptions)>>> =
            Arc::new(Mutex::new(Vec::new()));
        let release_calls: Arc<Mutex<Vec<WgpuDevice>>> = Arc::new(Mutex::new(Vec::new()));
        let acquire_sink = acquire_calls.clone();
        let release_sink = release_calls.clone();
        let acquire_template = template.clone();
        let backend = HostWgpuCapability {
            provider: test_provider(),
            acquire: Arc::new(move |surface, options| {
                acquire_sink
                    .lock()
                    .unwrap()
                    .push((surface.clone(), options.clone()));
                let acquisition =
                    copy_acquisition(&acquire_template, WgpuHostAcquisitionOwnership::Caller);
                return Box::pin(async move { Ok(acquisition) });
            }),
            attach_surface: Arc::new(|_, _| None),
            create: Arc::new(|_, _, _| None),
            is_supported: Arc::new(|| true),
            release: Arc::new(move |acquisition| {
                release_sink
                    .lock()
                    .unwrap()
                    .push(acquisition.device.clone());
            }),
        };
        let route_target = create_test_wgpu_surface(&create_test_canvas(300, 150));

        let routed = block_on(create_wgpu_acquisition(&backend, &route_target, None))
            .expect("the backend acquires");
        {
            let calls = acquire_calls.lock().unwrap();
            assert_eq!(calls.len(), 1);
            assert!(Arc::ptr_eq(&calls[0].0, &route_target));
            assert_eq!(calls[0].1, test_default::<WgpuHostAcquisitionOptions>());
        }
        assert!(Arc::ptr_eq(&routed.device.handle, &template.device.handle));
        assert_eq!(routed.format, template.format);

        release_wgpu_acquisition(&backend, &template);
        {
            let calls = release_calls.lock().unwrap();
            assert_eq!(calls.len(), 1);
            assert!(Arc::ptr_eq(&calls[0].handle, &template.device.handle));
        }

        (web.release)(&acquired);
    }

    // TS spied on destroy/unconfigure; here the canvas context's counter stays at zero and the
    // device still accepts work without a validation error.
    #[test]
    fn never_releases_host_handles_when_a_state_built_on_the_device_is_destroyed() {
        let (web, record) = create_test_wgpu_host();
        let canvas = create_test_canvas(300, 150);
        let target = create_test_wgpu_surface(&canvas);
        let acquired = acquire_for_test(&web, &target);
        let native = native_of(&acquired);

        let mut state = create_wgpu_render_state(&acquired.device, None);
        let mut proxies: RenderProxies2D<WgpuRenderState> = test_default();
        destroy_wgpu_render_state(&mut state, &mut proxies);

        assert_eq!(count(&canvas.context.unconfigure_count), 0);
        assert_eq!(count(&record.release_count), 0);
        let mut size = 0;
        let error = validation_error(&native, || {
            let buffer = create_buffer_for_test(&native, 4, wgpu::BufferUsages::COPY_DST);
            native.queue.write_buffer(&buffer, 0, &[0, 0, 0, 0]);
            native.queue.submit([]);
            size = buffer.size();
        });
        assert_eq!(error, None);
        assert_eq!(size, 4);

        (web.release)(&acquired);
    }
}

mod create_test_wgpu_surface {
    use super::*;

    // The drawable lives on the surface runtime, not the entity; the host is the only code that
    // narrows it back.
    #[test]
    fn builds_a_surface_the_test_host_backend_can_resolve_back_to_its_canvas() {
        let canvas = create_test_canvas(300, 150);
        let surface = create_test_wgpu_surface(&canvas);
        let (host, record) = create_test_wgpu_host();

        let resolved = get_test_canvas(&surface).expect("the surface resolves to its canvas");
        assert!(Arc::ptr_eq(&resolved, &canvas));
        let attached = (host.attach_surface)(
            &surface,
            &WgpuSurfaceAttachment {
                alpha_mode: GpuCanvasAlphaMode::Premultiplied,
                device: create_test_wgpu_device(create_test_native_device()),
                format: "bgra8unorm".to_string(),
            },
        );

        assert!(attached.is_some());
        assert_eq!(count(&record.attach_count), 1);
        assert_eq!(count(&canvas.context.configure_count), 1);
    }
}

mod create_wgpu_render_state_for_test {
    use super::*;

    // TS writes three u16 elements with an element-unit size of 2, i.e. 4 bytes; a native write takes
    // the byte slice directly.
    #[test]
    fn accepts_aligned_write_buffer_data_using_typed_array_element_units() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let buffer = create_buffer_for_test(&native, 8, wgpu::BufferUsages::COPY_DST);
        let data: Vec<u8> = [0u16, 1, 2]
            .iter()
            .flat_map(|value| value.to_ne_bytes())
            .collect();

        let error = validation_error(&native, || {
            native.queue.write_buffer(&buffer, 0, &data[0..4]);
        });

        assert_eq!(error, None);
    }

    #[test]
    fn rejects_write_buffer_content_whose_byte_length_is_not_a_multiple_of_four() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let buffer = create_buffer_for_test(&native, 8, wgpu::BufferUsages::COPY_DST);
        let data: Vec<u8> = [0u16, 1, 2]
            .iter()
            .flat_map(|value| value.to_ne_bytes())
            .collect();

        let error = validation_error(&native, || {
            native.queue.write_buffer(&buffer, 0, &data);
        })
        .expect("a 6-byte write is rejected");

        assert!(error.contains("COPY_BUFFER_ALIGNMENT"), "{error}");
    }

    // A native write takes a byte slice, so a source range outside the data cannot reach the device:
    // the slice itself refuses it. The destination offset is validated by the device.
    #[test]
    fn rejects_write_buffer_source_ranges_and_destination_offsets_outside_the_api_contract() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let buffer = create_buffer_for_test(&native, 8, wgpu::BufferUsages::COPY_DST);
        let data = 0u32.to_ne_bytes().to_vec();

        let source = catch_unwind(AssertUnwindSafe(|| {
            native.queue.write_buffer(&buffer, 0, &data[8..]);
        }));
        assert!(panic_message(source.unwrap_err()).contains("out of range"));

        let error = validation_error(&native, || {
            native.queue.write_buffer(&buffer, 2, &data);
        })
        .expect("an unaligned destination offset is rejected");
        assert!(error.contains("Buffer offset 2 is not aligned"), "{error}");
    }

    #[test]
    fn rejects_write_buffer_destinations_without_enough_copy_dst_storage() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let too_small = create_buffer_for_test(&native, 4, wgpu::BufferUsages::COPY_DST);
        let wrong_usage = create_buffer_for_test(&native, 8, wgpu::BufferUsages::VERTEX);

        let error = validation_error(&native, || {
            native.queue.write_buffer(&too_small, 0, &[0; 8]);
        })
        .expect("an overrunning write is rejected");
        assert!(error.contains("overrunning the bounds"), "{error}");

        let error = validation_error(&native, || {
            native.queue.write_buffer(&wrong_usage, 0, &[0; 4]);
        })
        .expect("a write without COPY_DST is rejected");
        assert!(error.contains("COPY_DST"), "{error}");
    }

    #[test]
    fn rejects_write_texture_data_smaller_than_an_rgba8_copy_requires() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let texture = native.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: 2,
                height: 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let write = |bytes: usize| {
            return validation_error(&native, || {
                native.queue.write_texture(
                    texture.as_image_copy(),
                    &vec![0u8; bytes],
                    wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(8),
                        rows_per_image: Some(2),
                    },
                    wgpu::Extent3d {
                        width: 2,
                        height: 2,
                        depth_or_array_layers: 1,
                    },
                );
            });
        };

        let error = write(15).expect("a short write is rejected");
        assert!(error.contains("overrunning the bounds"), "{error}");
        assert_eq!(write(16), None);
    }
}
