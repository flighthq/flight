// WebGPU-only: this is a regression test for the WebGPU clip-contour stencil pipeline being keyed on the
// current color format (so it works inside an HDR rgba16float effect target). The barrel only needs to
// resolve ./render for TypeScript; the harness routes the webgpu backend to render.webgpu.ts at runtime.
export * from './render.webgpu';
