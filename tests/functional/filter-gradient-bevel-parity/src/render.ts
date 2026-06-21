// Barrel so TypeScript resolves the `./render` import in app.ts. The functional vite harness overrides
// this at runtime, routing `./render` to the per-backend render.<renderer>.ts of the active renderer.
export * from './render.canvas';
