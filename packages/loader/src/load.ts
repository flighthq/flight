import { sendNetRequest } from '@flighthq/net/contract';
import { connectSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type { HostNetProvider, LoadOptions, LoadProgress, NetProgress } from '@flighthq/types/contract';
function requestOptions(url: string, input?: Readonly<LoadOptions>) {
  if (!input) return undefined;
  if (!input.progress) return { signal: input.signal };
  const progress = createSignal<(p: Readonly<NetProgress>) => void>();
  connectSignal(progress, (event) =>
    emitSignal(input.progress!, {
      url,
      loaded: event.loaded,
      total: event.total,
      phase: event.phase,
    } satisfies LoadProgress),
  );
  return { signal: input.signal, progress };
}
export async function loadBytes(
  hostNet: Readonly<HostNetProvider>,
  url: string,
  input?: Readonly<LoadOptions>,
): Promise<Uint8Array | null> {
  try {
    const response = await sendNetRequest(
      hostNet,
      { method: 'GET', responseType: 'arraybuffer', url },
      requestOptions(url, input),
    );
    return response.ok && response.body instanceof ArrayBuffer ? new Uint8Array(response.body) : null;
  } catch {
    return null;
  }
}
export async function loadText(
  hostNet: Readonly<HostNetProvider>,
  url: string,
  input?: Readonly<LoadOptions>,
): Promise<string | null> {
  try {
    const response = await sendNetRequest(
      hostNet,
      { method: 'GET', responseType: 'text', url },
      requestOptions(url, input),
    );
    return response.ok && typeof response.body === 'string' ? response.body : null;
  } catch {
    return null;
  }
}
