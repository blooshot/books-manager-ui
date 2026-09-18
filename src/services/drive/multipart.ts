/**
 * Body for a Drive `uploadType=multipart` request.
 * Drive requires `multipart/related` (JSON metadata part, then the media part).
 * `FormData` produces `multipart/form-data`, which is not the same thing and must not be used.
 */
export interface MultipartRelated {
  body: Blob
  /** Full Content-Type header value, including the boundary. */
  contentType: string
}

const makeBoundary = () => `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export function buildMultipartRelated(
  metadata: Record<string, unknown>,
  media: Blob,
  mediaType: string,
  boundary: string = makeBoundary(),
): MultipartRelated {
  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mediaType}\r\n\r\n`
  const tail = `\r\n--${boundary}--`
  return {
    body: new Blob([head, media, tail]),
    contentType: `multipart/related; boundary=${boundary}`,
  }
}
