import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Asset {
  url: string;
  path: string; // relative path under output directory
}

/**
 * Download a list of assets to the target directory.
 * Skips assets that already exist.
 * @param assets Array of {url, path} objects
 * @param targetDir Base directory to download files into
 */
export async function downloadAssets(assets: Asset[], targetDir: string) {
  for (const asset of assets) {
    const outPath = path.join(targetDir, asset.path);

    // Skip download if file exists
    try {
      await fs.access(outPath);
      console.log(`✔ Cached: ${asset.path}`);
      continue;
    } catch {
      // File does not exist → download
    }

    console.log(`↓ Downloading: ${asset.url}`);
    await download(asset.url, outPath);
  }
  console.log('Assets ready ✔');
}

async function download(url: string, outPath: string) {
  const buffer = await fetchDownload(url);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);
}

async function fetchDownload(url: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new DownloadHttpError(url, response);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === DOWNLOAD_ATTEMPTS || !isRetryableDownloadError(error)) throw error;
      const retryDelayMs = DOWNLOAD_RETRY_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `↻ Download attempt ${attempt}/${DOWNLOAD_ATTEMPTS} failed; retrying in ${retryDelayMs}ms: ${url} (${formatError(error)})`,
      );
      await delay(retryDelayMs);
    }
  }
  throw new Error(`Download attempts exhausted for ${url}`);
}

function isRetryableDownloadError(error: unknown): boolean {
  if (!(error instanceof DownloadHttpError)) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class DownloadHttpError extends Error {
  readonly status: number;

  constructor(url: string, response: Response) {
    const status = `${response.status}${response.statusText === '' ? '' : ` ${response.statusText}`}`;
    super(`Failed to download ${url}: ${status}`);
    this.status = response.status;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const exampleDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    const manifestPath = path.join(exampleDir, 'assets.manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    await downloadAssets(manifest.assets, path.join(exampleDir, 'public/assets'));
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

const DOWNLOAD_ATTEMPTS = 4;
const DOWNLOAD_RETRY_DELAY_MS = 500;
