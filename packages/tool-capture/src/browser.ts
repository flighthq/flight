// Browser condition for the package's single public root. Keep this entry limited to the page-side
// protocol and adapters: importing it from Vite must never make Rollup parse Node/Playwright runners.
export * from './capturePage';
export * from './captureProtocol';
export * from './functionalVerify';
