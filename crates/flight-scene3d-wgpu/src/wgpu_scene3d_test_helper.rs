// TODO: port makeWgpuScene3DState test helper from TS
// The TS version creates a recording fake GPU device for JSDOM-based unit tests.
// The Rust equivalent would need a wgpu test adapter (wgpu::Instance::new with Backends::empty
// or a mock backend), which is a more involved setup.
