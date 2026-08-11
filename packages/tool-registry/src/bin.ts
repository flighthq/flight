#!/usr/bin/env node
import { runRegistryTool } from './registryTool';

process.exitCode = runRegistryTool(process.argv.slice(2), {
  writeError: (message) => process.stderr.write(message),
  writeOutput: (message) => process.stdout.write(message),
});
