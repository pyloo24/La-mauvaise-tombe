// Times are relative to the beginning of the voice, independently of its length.
export const maxSoundTime = 3600;
export const isTimedAmbience = cue => Number.isFinite(cue.duration) && cue.duration > 0;
export const effectStart = (cue, voiceDuration) => (cue.position || 0) * voiceDuration + (cue.offset || 0);
export function soundLength(cue, asset, kind) {
  if (kind === 'layers') return isTimedAmbience(cue) ? cue.duration : 0;
  return Math.min(cue.duration ?? asset?.duration ?? 0, asset?.duration ?? 0);
}
export function soundEnd(entry, voiceDuration, assets = {}) {
  const replyEnd = voiceDuration + entry.after;
  if (entry.silenceAfter) return replyEnd;
  return Math.max(replyEnd,
    ...entry.effects.map(cue => effectStart(cue, voiceDuration) + soundLength(cue, assets[cue.assetId], 'effects')),
    ...entry.layers.filter(isTimedAmbience).map(cue => (cue.offset || 0) + cue.duration));
}
