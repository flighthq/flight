import { buildToolPipeline } from './pipelineBuild';

export interface ToolPipelineToolIO {
  readonly writeError: (message: string) => void;
  readonly writeOutput: (message: string) => void;
}

const USAGE = 'Usage: tool-pipeline build --config <file> --out <new-directory>\n';

export async function runToolPipeline(args: readonly string[], io: Readonly<ToolPipelineToolIO>): Promise<number> {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    io.writeOutput(USAGE);
    return 0;
  }
  const options = parseBuildArguments(args);
  if (options === null) {
    io.writeError(USAGE);
    return 1;
  }
  try {
    const result = await buildToolPipeline(options);
    io.writeOutput(`${result.manifestHash}  asset-manifest.json\n`);
    return 0;
  } catch (error) {
    io.writeError(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function parseBuildArguments(
  args: readonly string[],
): Readonly<{ configPath: string; outputDirectory: string }> | null {
  if (args.length !== 5 || args[0] !== 'build') return null;
  let configPath: string | null = null;
  let outputDirectory: string | null = null;
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined || value.length === 0) return null;
    if (flag === '--config' && configPath === null) configPath = value;
    else if (flag === '--out' && outputDirectory === null) outputDirectory = value;
    else return null;
  }
  return configPath === null || outputDirectory === null ? null : { configPath, outputDirectory };
}
