import { createWebGeolocationBackend } from '@flighthq/geolocation/contract';
import type { GeolocationBackend } from '@flighthq/types/contract';

export const webGeolocationBackend: GeolocationBackend = createWebGeolocationBackend();
