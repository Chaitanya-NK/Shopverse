import "server-only";

import sharp from "sharp";

import { AppError, Errors } from "@/lib/errors";

export type ProcessedImage = { data: Buffer; width: number; height: number };

/**
 * Decode an uploaded photo and re-encode it as WebP no larger than `maxSide`.
 * Re-encoding strips metadata (EXIF location etc.), applies the camera's
 * rotation, and guarantees the stored file really is an image.
 */
export async function toWebp(
  input: Buffer,
  maxSide: number,
  quality = 82,
): Promise<ProcessedImage> {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 60_000_000, failOn: "error" })
      .rotate()
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw Errors.validation(
      { file: ["We couldn't read this image. Try a JPG, PNG or WebP photo."] },
      "We couldn't read this image.",
    );
  }
}
