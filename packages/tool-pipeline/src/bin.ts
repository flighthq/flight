#!/usr/bin/env node
import { runToolPipeline } from './pipelineTool';

process.exitCode = await runToolPipeline(process.argv.slice(2), {
  writeError: (message) => process.stderr.write(message),
  writeOutput: (message) => process.stdout.write(message),
});
