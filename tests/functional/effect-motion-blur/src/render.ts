// WebGL-only: the velocity producer this test relies on (renderWebGLVelocity, the screen-space
// velocity G-buffer pass) has no Canvas or WebGPU counterpart yet, so motion blur has no parity
// column. Add render.canvas.ts / render.webgpu.ts once a cross-backend velocity pass exists.
export * from './render.webgl';
