import type {
  HasNetHttp,
  NetGuard,
  NetRequest,
  NetRequestOptions,
  NetResponse,
  NetResponseExplanation,
  Signal,
} from '@flighthq/types/contract';

// Explains the sentinel encoded in a response without formatting or logging it. Status 0 takes
// precedence because every transport failure also carries a null body.
export function explainNetResponse(response: Readonly<NetResponse>): NetResponseExplanation | null {
  if (response.status === 0) {
    const statusText = response.statusText.trim().toLowerCase();
    const reason = statusText === 'aborted' ? 'aborted' : statusText === 'timeout' ? 'timeout' : 'transport-failure';
    return { reason, status: response.status, statusText: response.statusText, url: response.url };
  }
  if (response.body === null) {
    return {
      reason: 'decode-failure',
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    };
  }
  return null;
}

export function sendNetRequest(
  host: HasNetHttp,
  request: Readonly<NetRequest>,
  options?: Readonly<NetRequestOptions>,
): Promise<NetResponse> {
  const guard = _guard;
  if (guard === null) return host.net.http.sendNetRequest(request, options);

  const method = request.method.toUpperCase();
  if ((method === 'GET' || method === 'HEAD') && request.body !== undefined && request.body !== null) {
    guard({ operation: 'sendNetRequest', reason: 'body-on-get-or-head', request });
  }
  if (request.timeoutMs !== undefined && request.timeoutMs < 0) {
    guard({ operation: 'sendNetRequest', reason: 'negative-timeout', request });
  }

  const progress = options?.progress;
  if (progress === undefined) return host.net.http.sendNetRequest(request, options);
  let emitted = false;
  const guardedProgress: Signal<typeof progress.emit> = {
    ...progress,
    emit(value) {
      emitted = true;
      progress.emit(value);
    },
  };
  return host.net.http.sendNetRequest(request, { ...options, progress: guardedProgress }).then((response) => {
    if (!emitted && response.status !== 0) {
      guard({ operation: 'sendNetRequest', reason: 'progress-not-emitted', request });
    }
    return response;
  });
}

// Installs the diagnostics hook used by the separately imported enableNetGuards module. Null is the
// production default and preserves direct request/options delegation without allocating wrappers.
export function setNetGuard(guard: NetGuard | null): void {
  _guard = guard;
}

let _guard: NetGuard | null = null;
