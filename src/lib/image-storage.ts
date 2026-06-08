export const INLINE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const QUESTION_IMAGES_MAX_COUNT = 6;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function estimateDataUrlBytes(value: string) {
  if (!value.startsWith('data:')) return value.length;
  const base64 = value.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

export function isAllowedInlineImageFile(file: File, maxBytes = INLINE_IMAGE_MAX_BYTES) {
  return file.type.startsWith('image/') && file.size <= maxBytes;
}

export function filterInlineImageUrls(
  images?: string[],
  options: { maxBytes?: number; maxCount?: number } = {}
) {
  const maxBytes = options.maxBytes ?? INLINE_IMAGE_MAX_BYTES;
  const maxCount = options.maxCount ?? QUESTION_IMAGES_MAX_COUNT;
  const kept: string[] = [];
  let dropped = 0;

  for (const image of images || []) {
    if (typeof image !== 'string') {
      dropped += 1;
      continue;
    }

    if (image.startsWith('data:') && estimateDataUrlBytes(image) > maxBytes) {
      dropped += 1;
      continue;
    }

    if (kept.length < maxCount) kept.push(image);
    else dropped += 1;
  }

  return { images: kept, dropped };
}
