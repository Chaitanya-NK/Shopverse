/**
 * Shrink a photo in the browser before upload (phone photos are often 5–10 MB).
 * Keeps transparency when the browser can encode WebP, otherwise JPEG on white.
 * Any failure returns the original file; the server re-encodes regardless.
 */
export async function shrinkImage(file: File, maxSide = 2048): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1_500_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;

    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await encode("image/webp");
    if (!blob || blob.type !== "image/webp") {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      blob = await encode("image/jpeg");
    }
    bitmap.close();
    if (!blob || blob.size >= file.size) return file;
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, {
      type: blob.type,
    });
  } catch {
    return file;
  }
}
