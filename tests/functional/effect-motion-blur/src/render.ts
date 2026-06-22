// Gl + Wgpu: both have a screen-space velocity G-buffer producer (renderGlVelocity /
// renderWgpuVelocity), so motion blur has a parity column on each. Canvas has no velocity producer
// yet. The harness routes each backend to its own render.<backend>.ts; this barrel only needs to
// resolve ./render for TypeScript.
export * from './render.webgl';
