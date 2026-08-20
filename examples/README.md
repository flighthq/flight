# Flight examples

Examples are grouped by implementation and launched by host-oriented runners:

- `packages/` contains the TypeScript implementations.
- `runners/web/` loads them in a browser.
- `runners/electron/` hosts that same web runner in Electron.

The Rust implementations, the winit native runner and the `wasm-bindgen` browser adapter were moved out of this repository in `57722ed4c` and now live in **flight-rs** / **flight-reference**. Nothing here builds or runs them, and the commands that did (`examples:wasm`, `examples:native`, and their `dev:` forms) went with them.

Run the current cells from the repository root. The bare command defaults to the web runner:

```bash
npm run examples
npm run examples:web
npm run examples:electron
```

The equivalent explicit development commands are `dev:examples`, `dev:examples:web` and `dev:examples:electron`.

There are currently 41 TypeScript examples under `packages/`, each available through the web and Electron runners.
