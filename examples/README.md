# Flight examples

Examples are grouped by implementation and launched by host-oriented runners:

- `packages/` contains TypeScript implementations.
- `crates/` contains Rust implementations.
- `runners/web/` loads the TypeScript implementations in a browser.
- `runners/electron/` hosts that same web runner in Electron.
- `runners/native/` runs Rust implementations through the native winit host.
- `runners/wasm/` adapts Rust implementations to browser APIs with `wasm-bindgen`; its generated module is loaded by both the web and Electron runners.

Run the current cells from the repository root. The bare command defaults to the web runner:

```bash
npm run examples
npm run examples:web
npm run examples:electron
npm run examples:wasm
npm run examples:native
```

The equivalent explicit development commands are `dev:examples`, `dev:examples:web`, `dev:examples:electron`, `dev:examples:wasm`, and `dev:examples:native`.

There are currently 17 TypeScript examples and one Rust example. `drawingshapes` is the only example available in every runner: TypeScript in web and Electron, and the shared Rust implementation through Wasm in web/Electron and winit natively. `examples:wasm` opens that Rust/Wasm cell directly.

The current Wasm adapter draws through browser Canvas2D; moving that adapter to Flight's WebGPU renderer requires a Rust browser graphics host and does not change the example crate.
