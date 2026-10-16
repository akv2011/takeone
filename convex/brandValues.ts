import { v, ConvexError } from 'convex/values';
import { captionFontValidator, captionStyleValidator } from './captions';
export const brandSettings = v.object({ font: captionFontValidator, captionStyle: captionStyleValidator, textColor: v.string(), outlineColor: v.string(), logo: v.optional(v.bytes()) });
export const brandSelection = v.object({ kitId: v.id('brandKits'), revision: v.number() });
export function validateBrand(settings: any) {
  if (!settings || !['sans', 'serif', 'mono'].includes(settings.font) || !['none', 'clean', 'meme', 'karaoke'].includes(settings.captionStyle) || !/^#[0-9A-Fa-f]{6}$/.test(settings.textColor) || !/^#[0-9A-Fa-f]{6}$/.test(settings.outlineColor)) throw new ConvexError('INVALID_BRAND_KIT');
  if (settings.logo !== undefined) validateLogo(settings.logo);
  return { ...settings, textColor: settings.textColor.toUpperCase(), outlineColor: settings.outlineColor.toUpperCase() };
}
export function validateLogo(value: ArrayBuffer) {
  if (!(value instanceof ArrayBuffer) || value.byteLength < 45 || value.byteLength > 65536) throw new ConvexError('INVALID_BRAND_LOGO');
  const bytes = new Uint8Array(value), view = new DataView(value);
  if (![137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) throw new ConvexError('INVALID_BRAND_LOGO');
  let offset = 8, data = false, ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (offset + length + 12 > bytes.length || !['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'pHYs', 'cHRM'].includes(type)) throw new ConvexError('INVALID_BRAND_LOGO');
    if (offset === 8 && (type !== 'IHDR' || length !== 13 || view.getUint32(16) < 1 || view.getUint32(20) < 1 || view.getUint32(16) > 512 || view.getUint32(20) > 512)) throw new ConvexError('INVALID_BRAND_LOGO');
    if (type === 'IHDR' && offset !== 8) throw new ConvexError('INVALID_BRAND_LOGO');
    if (type === 'IDAT') data = true;
    offset += length + 12;
    if (type === 'IEND') { ended = length === 0 && offset === bytes.length; break; }
  }
  if (!ended || !data) throw new ConvexError('INVALID_BRAND_LOGO');
}

export async function resolveBrand(ctx: any, userId: string, selection: any) {
  if (!selection) return undefined;
  const kit = await ctx.db.get(selection.kitId);
  if (!kit || kit.userId !== userId) throw new ConvexError('BRAND_KIT_NOT_FOUND');
  if (!Number.isSafeInteger(selection.revision) || kit.revision !== selection.revision) throw new ConvexError('BRAND_KIT_CHANGED');
  return validateBrand(kit.settings);
}
