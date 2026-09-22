#!/usr/bin/env node
// The specifier carries its `.js` extension because this file is EXECUTED by Node, not bundled: the
// repo compiles with moduleResolution "Bundler", which lets TypeScript accept an extensionless relative
// import that Node's ESM loader then refuses at runtime. TypeScript resolves this `.js` to the sibling
// `.ts`, so one spelling satisfies both the compiler and the shipped binary.
import { runManifestTool } from './manifestTool.js';

process.exitCode = await runManifestTool(process.argv.slice(2), {
  writeError: (message) => process.stderr.write(message),
  writeOutput: (message) => process.stdout.write(message),
});
