export const AUDIO_LEVEL_GAIN = 3;
export const AUDIO_LEVEL_CURVE = 0.6;
export const AUDIO_LEVEL_STRETCH = 1.15;

export function mapAudioLevel(rawLevel: number): number {
  const boosted = Math.min(1, Math.max(0, rawLevel) * AUDIO_LEVEL_GAIN);
  return Math.min(1, Math.pow(boosted, AUDIO_LEVEL_CURVE) * AUDIO_LEVEL_STRETCH);
}
