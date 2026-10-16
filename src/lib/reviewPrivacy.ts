export function isPublicReviewPath(path: string) {
  try { path = decodeURIComponent(path); } catch { return false; }
  return path.toLowerCase().replace(/\/+$/, '') === '/review';
}

export function containsReviewCapability(value: unknown): boolean {
  if (typeof value === 'string') return /#[a-f0-9]{64}(?:$|[\s"&])/i.test(value);
  if (Array.isArray(value)) return value.some(containsReviewCapability);
  if (value && typeof value === 'object') return Object.values(value).some(containsReviewCapability);
  return false;
}
