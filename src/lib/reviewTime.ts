export function reviewTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${Math.floor(ms / 60_000).toString().padStart(2, '0')}:${(Math.floor(ms / 1000) % 60).toString().padStart(2, '0')}.${(ms % 1000).toString().padStart(3, '0')}`;
}
