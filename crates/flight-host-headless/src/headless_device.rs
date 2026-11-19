// flight-lint: allow-file(contract-vocabulary) native host: adapter discovery runs on native wgpu values
//! Adapter choice and device request: the one implementation `create_headless_host` and
//! `explain_headless_host` both run, so the explanation can never disagree with the outcome.

use crate::types::*;

/// A device on the chosen adapter, or the explanation of why there is none.
pub(crate) struct HeadlessDevice {
    pub(crate) adapter_backend: String,
    pub(crate) adapter_name: String,
    pub(crate) device: wgpu::Device,
    pub(crate) queue: wgpu::Queue,
    pub(crate) software_adapter: bool,
}

fn create_failure(
    reason: HeadlessHostExplanationReason,
    adapter: Option<&wgpu::AdapterInfo>,
    message: &str,
) -> HeadlessHostExplanation {
    return HeadlessHostExplanation {
        adapter_backend: adapter
            .map(|info| info.backend.to_string())
            .unwrap_or_default(),
        adapter_name: adapter.map(|info| info.name.clone()).unwrap_or_default(),
        message: message.to_string(),
        reason,
    };
}

// Hardware adapters rank ahead of software ones; among hardware, the power preference picks the
// first kind, then enumeration order decides, so the choice is stable for one machine.
fn choose_headless_adapter(
    adapters: Vec<wgpu::Adapter>,
    options: &HeadlessHostOptions,
) -> Option<wgpu::Adapter> {
    let rank = |device_type: wgpu::DeviceType| -> Option<u32> {
        return match (device_type, options.power_preference) {
            (wgpu::DeviceType::Cpu, _) if !options.allow_software_adapter => None,
            (wgpu::DeviceType::Cpu, _) => Some(4),
            (wgpu::DeviceType::DiscreteGpu, HeadlessHostPowerPreference::LowPower) => Some(1),
            (wgpu::DeviceType::DiscreteGpu, _) => Some(0),
            (wgpu::DeviceType::IntegratedGpu, HeadlessHostPowerPreference::LowPower) => Some(0),
            (wgpu::DeviceType::IntegratedGpu, _) => Some(1),
            (wgpu::DeviceType::VirtualGpu, _) => Some(2),
            (wgpu::DeviceType::Other, _) => Some(3),
        };
    };
    let mut ranked: Vec<(u32, usize, wgpu::Adapter)> = adapters
        .into_iter()
        .enumerate()
        .filter_map(|(index, adapter)| {
            return rank(adapter.get_info().device_type).map(|value| (value, index, adapter));
        })
        .collect();
    ranked.sort_by_key(|(value, index, _)| (*value, *index));
    return ranked.into_iter().next().map(|(_, _, adapter)| adapter);
}

fn get_wgpu_backends(options: &HeadlessHostOptions) -> wgpu::Backends {
    let mut out = wgpu::Backends::empty();
    if options.allow_dx12 {
        out |= wgpu::Backends::DX12;
    }
    if options.allow_metal {
        out |= wgpu::Backends::METAL;
    }
    if options.allow_vulkan {
        out |= wgpu::Backends::VULKAN;
    }
    return out;
}

/// Opens an instance on the allowed backends, chooses an adapter by `options`, and requests a
/// device enabling the texture-compression families that adapter offers.
pub(crate) fn request_headless_device(
    options: &HeadlessHostOptions,
) -> Result<HeadlessDevice, HeadlessHostExplanation> {
    let backends = get_wgpu_backends(options);
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = backends;
    // The release-build instance flags in every build: debug object naming and validation layers
    // only when WGPU_DEBUG / WGPU_VALIDATION ask for them. Debug naming through the Vulkan loader
    // has crashed (SIGSEGV in vkSetDebugUtilsObjectNameEXT) while hosts are created concurrently
    // on Mesa lavapipe.
    descriptor.flags = wgpu::InstanceFlags::VALIDATION_INDIRECT_CALL.with_env();
    let instance = wgpu::Instance::new(descriptor);
    let adapters = pollster::block_on(instance.enumerate_adapters(backends));
    if adapters.is_empty() {
        return Err(create_failure(
            HeadlessHostExplanationReason::NoAdapter,
            None,
            "no adapter is available on the allowed backends",
        ));
    }
    let first = adapters[0].get_info();
    let Some(adapter) = choose_headless_adapter(adapters, options) else {
        return Err(create_failure(
            HeadlessHostExplanationReason::SoftwareAdapterRejected,
            Some(&first),
            "only software adapters are available and the options do not accept one",
        ));
    };
    let info = adapter.get_info();
    let wanted = wgpu::Features::TEXTURE_COMPRESSION_BC
        | wgpu::Features::TEXTURE_COMPRESSION_ETC2
        | wgpu::Features::TEXTURE_COMPRESSION_ASTC;
    let requested = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("flight-host-headless"),
        required_features: adapter.features() & wanted,
        ..wgpu::DeviceDescriptor::default()
    }));
    return match requested {
        Ok((device, queue)) => Ok(HeadlessDevice {
            adapter_backend: info.backend.to_string(),
            adapter_name: info.name.clone(),
            device,
            queue,
            software_adapter: info.device_type == wgpu::DeviceType::Cpu,
        }),
        Err(error) => Err(create_failure(
            HeadlessHostExplanationReason::DeviceRequestFailed,
            Some(&info),
            &error.to_string(),
        )),
    };
}
