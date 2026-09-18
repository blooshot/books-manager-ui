/**
 * jsdom has no canvas or createImageBitmap, so image resizing can't run for real in tests.
 * This stands in for those browser APIs *underneath* the real `createCoverVariants` /
 * `resizeToJpeg` code, so everything above them (sizing, JPEG output, variants) still runs.
 * The encoded "JPEG" is 2 bytes holding the canvas width, so full and thumbnail differ.
 */
export function stubBrowserImaging(options: { decodeFails?: boolean; width?: number; height?: number } = {}): () => void {
  const originalBitmap = window.createImageBitmap
  const proto = HTMLCanvasElement.prototype
  const originalGetContext = proto.getContext
  const originalToBlob = proto.toBlob

  window.createImageBitmap = async () => {
    if (options.decodeFails) throw new Error('cannot decode')
    return { width: options.width ?? 2000, height: options.height ?? 1500, close: () => undefined } as ImageBitmap
  }
  proto.getContext = function () {
    return { drawImage: () => undefined }
  } as unknown as typeof proto.getContext
  proto.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback, type?: string) {
    callback(new Blob([new Uint8Array([this.width & 255, (this.width >> 8) & 255])], { type: type ?? 'image/png' }))
  }

  return () => {
    window.createImageBitmap = originalBitmap
    proto.getContext = originalGetContext
    proto.toBlob = originalToBlob
  }
}

/** Widths the stub encodes for a 2000x1500 photo: 1000px full image, 240px thumbnail. */
export const STUB_FULL_BYTES = [1000 & 255, (1000 >> 8) & 255]
export const STUB_THUMB_BYTES = [240 & 255, (240 >> 8) & 255]
