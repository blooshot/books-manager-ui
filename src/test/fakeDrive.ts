/**
 * In-memory stand-in for the Google Drive v3 API, used as `fetch` in tests.
 * It is deliberately as strict as the real API about the things that bit us:
 *  - JSON bodies must be sent as application/json (not fetch's default text/plain)
 *  - multipart uploads must be multipart/related with a JSON metadata part first
 *    (a FormData / multipart/form-data body is rejected)
 *  - only files the app created are visible (drive.file scope)
 *  - wrong/missing Bearer token gives 401
 * It records every call, and refuses DELETE outright.
 */
export interface FakeDriveFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  trashed: boolean
  bytes?: Uint8Array
  createdOrder: number
}

export interface FakeDriveCall {
  method: string
  url: string
  /** Parsed JSON body for JSON requests; metadata for uploads. */
  body?: Record<string, unknown>
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

const fakeId = (n: number) => `1FakeDriveFileId${String(n).padStart(12, '0')}`

export class FakeDrive {
  files = new Map<string, FakeDriveFile>()
  calls: FakeDriveCall[] = []
  token = 'test-token'
  /** Set to make the next request fail with this status. */
  failNext?: number
  private counter = 0

  /** Seeds a file as if the app had created it earlier. */
  seed(partial: Partial<FakeDriveFile> & { name: string }): FakeDriveFile {
    this.counter += 1
    const file: FakeDriveFile = {
      id: fakeId(this.counter),
      mimeType: FOLDER_MIME,
      parents: [],
      trashed: false,
      createdOrder: this.counter,
      ...partial,
    }
    this.files.set(file.id, file)
    return file
  }

  byName(name: string): FakeDriveFile[] {
    return [...this.files.values()].filter((f) => f.name === name)
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const call: FakeDriveCall = { method, url: url.toString() }
    this.calls.push(call)

    if (this.failNext) {
      const status = this.failNext
      this.failNext = undefined
      return json({ error: { message: `fake failure ${status}` } }, status)
    }
    if (headers.get('Authorization') !== `Bearer ${this.token}`) {
      return json({ error: { message: 'unauthenticated' } }, 401)
    }
    if (method === 'DELETE') return json({ error: { message: 'the app must never delete' } }, 405)

    const contentType = headers.get('Content-Type') ?? ''
    const isUpload = url.pathname.startsWith('/upload/drive/v3/files')
    const path = url.pathname.replace(/^\/(upload\/)?drive\/v3/, '')

    // --- multipart upload
    if (isUpload && method === 'POST') {
      if (!/^multipart\/related;\s*boundary=/i.test(contentType)) {
        return json({ error: { message: `Bad Request: uploadType=multipart needs multipart/related, got "${contentType}"` } }, 400)
      }
      const parsed = await parseMultipartRelated(init?.body, contentType)
      if (!parsed) return json({ error: { message: 'Bad Request: malformed multipart body' } }, 400)
      call.body = parsed.metadata
      const parents = (parsed.metadata.parents as string[] | undefined) ?? []
      for (const parent of parents) {
        if (!this.files.has(parent)) return json({ error: { message: `File not found: ${parent}` } }, 404)
      }
      const file = this.seed({
        name: String(parsed.metadata.name ?? 'Untitled'),
        mimeType: parsed.mediaType,
        parents,
        bytes: parsed.media,
      })
      return json({ id: file.id })
    }

    // --- JSON bodies must be declared as JSON
    let body: Record<string, unknown> | undefined
    if (typeof init?.body === 'string') {
      if (!/^application\/json/i.test(contentType)) {
        return json({ error: { message: `Bad Request: expected application/json, got "${contentType || 'text/plain'}"` } }, 400)
      }
      body = JSON.parse(init.body) as Record<string, unknown>
      call.body = body
    } else if (init?.body) {
      return json({ error: { message: 'Bad Request: unsupported body' } }, 400)
    }

    // --- list
    if (path === '/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      const name = /name = '([^']*)'/.exec(q)?.[1]
      const mime = /mimeType = '([^']*)'/.exec(q)?.[1]
      const wantsTrashed = /trashed = true/.test(q)
      const matches = [...this.files.values()]
        .filter((f) => (name === undefined || f.name === name) && (mime === undefined || f.mimeType === mime))
        .filter((f) => (wantsTrashed ? f.trashed : !f.trashed))
        .sort((a, b) => a.createdOrder - b.createdOrder)
      return json({ files: matches.map((f) => ({ id: f.id })) })
    }

    // --- create (folder or empty file)
    if (path === '/files' && method === 'POST') {
      if (!body || typeof body.name !== 'string') return json({ error: { message: 'Bad Request: name required' } }, 400)
      const file = this.seed({ name: body.name, mimeType: String(body.mimeType ?? 'application/octet-stream'), parents: [] })
      return json({ id: file.id })
    }

    const single = /^\/files\/([^/]+)$/.exec(path)
    if (single) {
      const file = this.files.get(decodeURIComponent(single[1]))
      if (!file) return json({ error: { message: 'File not found' } }, 404)

      if (method === 'GET' && url.searchParams.get('alt') === 'media') {
        if (!file.bytes) return json({ error: { message: 'Only files with content can be downloaded' } }, 403)
        return new Response(file.bytes as BodyInit, { status: 200, headers: { 'Content-Type': file.mimeType } })
      }
      if (method === 'GET') return json({ id: file.id, name: file.name, trashed: file.trashed })

      if (method === 'PATCH') {
        if (!body) return json({ error: { message: 'Bad Request: empty update' } }, 400)
        if (typeof body.name === 'string') file.name = body.name
        if (typeof body.trashed === 'boolean') file.trashed = body.trashed
        return json({ id: file.id })
      }
    }

    return json({ error: { message: `unhandled ${method} ${path}` } }, 404)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// --- multipart/related parsing (byte-level, so binary media survives)

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

async function toBytes(body: BodyInit | null | undefined): Promise<Uint8Array | null> {
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
  if (typeof body === 'string') return new TextEncoder().encode(body)
  return null // FormData and anything else is not a valid multipart/related body
}

async function parseMultipartRelated(
  body: BodyInit | null | undefined,
  contentType: string,
): Promise<{ metadata: Record<string, unknown>; media: Uint8Array; mediaType: string } | null> {
  const bytes = await toBytes(body)
  const boundary = /boundary=("?)([^";]+)\1/i.exec(contentType)?.[2]
  if (!bytes || !boundary) return null

  const enc = new TextEncoder()
  const delimiter = enc.encode(`--${boundary}`)
  const parts: Uint8Array[] = []
  let position = indexOfBytes(bytes, delimiter)
  while (position !== -1) {
    const start = position + delimiter.length
    if (bytes[start] === 0x2d && bytes[start + 1] === 0x2d) break // closing delimiter
    const next = indexOfBytes(bytes, delimiter, start)
    if (next === -1) return null
    parts.push(bytes.slice(start + 2, next - 2)) // drop the CRLF after the delimiter and before the next
    position = next
  }
  if (parts.length !== 2) return null

  const split = (part: Uint8Array) => {
    const cut = indexOfBytes(part, enc.encode('\r\n\r\n'))
    if (cut === -1) return null
    return { headers: new TextDecoder().decode(part.slice(0, cut)), content: part.slice(cut + 4) }
  }
  const meta = split(parts[0])
  const media = split(parts[1])
  if (!meta || !media || !/application\/json/i.test(meta.headers)) return null
  return {
    metadata: JSON.parse(new TextDecoder().decode(meta.content)) as Record<string, unknown>,
    media: media.content,
    mediaType: /Content-Type:\s*([^\r\n]+)/i.exec(media.headers)?.[1] ?? 'application/octet-stream',
  }
}
