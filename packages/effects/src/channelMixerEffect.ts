import type { ChannelMixerEffect } from '@flighthq/types';

export function createChannelMixerEffect(options: Readonly<Omit<ChannelMixerEffect, 'kind'>>): ChannelMixerEffect {
  return { kind: 'ChannelMixerEffect', ...options };
}
