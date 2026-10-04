/**
 * Client-side image compression.
 *
 * Compression happens here rather than in the Server Action for one reason: a phone
 * photo is 3-6 MB, and the action's upload path would have to move all of it before it
 * could shrink it. Doing it in the browser means a 5 MB pick leaves as roughly 300 KB,
 * so what crosses the network is close to what gets stored.
 *
 * Implemented with `createImageBitmap` plus a canvas rather than a compression library,
 * which keeps the dependency list as it was. The one thing that library would have
 * handled for free is EXIF rotation -- an iPhone photo shot in portrait arrives with its
 * pixels landscape and an orientation tag saying otherwise -- so `imageOrientation:
 * "from-image"` asks the decoder to bake the rotation in, and a plain `<img>` decode is
 * kept as the fallback for engines that ignore the option.
 *
 * Output is WebP where the browser can encode it, because it beats JPEG at the same
 * visual quality for photographs and still carries an alpha channel that JPEG cannot.
 * The bucket accepts JPEG as the fallback, so nothing is ever stored in a format the
 * browser cannot produce.
 */

/** What the composer aims for. The bucket's own ceiling is 1 MiB. */
export const MAX_IMAGE_BYTES = 500 * 1024;

/** Longest edge kept. A phone photo is 4000px wide; a timeline card is not. */
export const MAX_IMAGE_EDGE = 1200;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CompressedImage = {
  file: File;
  width: number;
  height: number;
  /** Size of what the user picked, for reporting the saving. */
  originalBytes: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isAllowedImageType(type: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Attempts, best first. Each is a (scale, quality) pair: the loop stops at the first
 * result under the byte budget, so a small image is only ever encoded once at high
 * quality, and a large one walks down until it fits. The last entry is deliberately
 * aggressive -- if even that misses the budget the smallest candidate is returned rather
 * than failing, because a slightly fat image beats no image, and the bucket still has a
 * 1 MiB ceiling behind this.
 */
const ATTEMPTS: ReadonlyArray<{ scale: number; quality: number }> = [
  { scale: 1, quality: 0.82 },
  { scale: 1, quality: 0.68 },
  { scale: 0.8, quality: 0.75 },
  { scale: 0.65, quality: 0.7 },
  { scale: 0.5, quality: 0.65 },
];

type Decoded = { source: CanvasImageSource; width: number; height: number };

/**
 * Decodes with EXIF orientation applied. `createImageBitmap` rejects some files that an
 * `<img>` will happily display, so the image element is the fallback rather than the
 * other way round.
 */
async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Gambarnya tidak bisa dibaca."));
        image.src = url;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function encode(
  source: CanvasImageSource,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Returns a `File` ready to upload, or throws with a message meant for the person who
 * picked the image. Errors are thrown rather than returned so every caller has to
 * decide what to show.
 */
export async function compressImage(source: File): Promise<CompressedImage> {
  if (!isAllowedImageType(source.type)) {
    throw new Error("Formatnya harus JPEG, PNG, atau WebP.");
  }

  const originalBytes = source.size;
  const decoded = await decode(source);

  try {
    const longest = Math.max(decoded.width, decoded.height);
    const baseScale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;

    let best: { blob: Blob; type: string } | null = null;

    for (const attempt of ATTEMPTS) {
      const scale = baseScale * attempt.scale;
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));

      // WebP first, JPEG second. `toBlob` returns null for a type the encoder lacks, so
      // an unsupported format falls through instead of failing.
      let blob = await encode(decoded.source, width, height, "image/webp", attempt.quality);
      let type = "image/webp";
      if (!blob) {
        blob = await encode(decoded.source, width, height, "image/jpeg", attempt.quality);
        type = "image/jpeg";
      }
      if (!blob) continue;

      if (!best || blob.size < best.blob.size) best = { blob, type };

      if (blob.size <= MAX_IMAGE_BYTES) {
        return {
          file: new File([blob], `image.${extensionFor(type)}`, { type }),
          width,
          height,
          originalBytes,
        };
      }
    }

    if (!best) throw new Error("Gambarnya gagal dikompres. Coba foto lain.");

    return {
      file: new File([best.blob], `image.${extensionFor(best.type)}`, { type: best.type }),
      width: decoded.width,
      height: decoded.height,
      originalBytes,
    };
  } finally {
    // `createImageBitmap` results hold memory until closed; an `<img>` element does not
    // need it, but calling close() on one would throw.
    if ("close" in decoded.source && typeof decoded.source.close === "function") {
      decoded.source.close();
    }
  }
}