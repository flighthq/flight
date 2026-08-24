import {
  createWebConnectivityBackend,
  installConnectivityHostBackend,
  observeConnectivityHostResult,
} from '@flighthq/connectivity/contract';
import type { ConnectivityBackend } from '@flighthq/types/contract';

export function enableHostWebConnectivity(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebConnectivityBackend();
  const backend: ConnectivityBackend = {
    getStatus(out) {
      try {
        const result = inner.getStatus(out);
        observeConnectivityHostResult('getStatus', true);
        return result;
      } catch {
        observeConnectivityHostResult('getStatus', false);
        out.online = false;
        out.type = 'unknown';
        out.downlink = -1;
        out.downlinkMax = -1;
        out.effectiveType = '';
        out.rtt = -1;
        out.saveData = false;
        out.metered = false;
        return out;
      }
    },
    async detectReachability(options, out) {
      try {
        const result = await inner.detectReachability!(options, out);
        observeConnectivityHostResult('detectReachability', true);
        return result;
      } catch {
        observeConnectivityHostResult('detectReachability', false);
        out.reachable = false;
        out.latency = -1;
        return out;
      }
    },
    subscribe(listener) {
      try {
        const unsub = inner.subscribe(listener);
        observeConnectivityHostResult('subscribe', true);
        return unsub;
      } catch {
        observeConnectivityHostResult('subscribe', false);
        return () => {};
      }
    },
  };
  installConnectivityHostBackend(backend);
}

export function resetHostWebConnectivityForTest(): void {
  _enabled = false;
}

let _enabled = false;
