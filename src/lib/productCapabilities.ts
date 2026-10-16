export type CapabilityState = { available: boolean; reason?: string };
export type ProductCapabilities = {
  rendering: CapabilityState;
  stockVideo: CapabilityState;
  youtubeClips: CapabilityState;
  aiVideo: CapabilityState;
  telegram: CapabilityState & { username?: string };
  payments: CapabilityState;
  music: CapabilityState;
};
