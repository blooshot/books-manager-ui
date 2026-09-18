import { SessionExpiredError, DriveError, DrivePermissionError } from './errors'

export interface DriveClientOptions {
  /** Must throw SessionExpiredError when there is no valid token. */
  getAccessToken: () => string
  fetchImpl?: typeof fetch
}

export type DriveClient = {
  request<T>(path: string, init?: RequestInit): Promise<T>
  requestBlob(path: string, init?: RequestInit): Promise<Blob>
}

const BASE = 'https://www.googleapis.com/drive/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

async function toError(response: Response): Promise<DriveError> {
  if (response.status === 401) return new SessionExpiredError()
  if (response.status === 403) return new DrivePermissionError()
  let detail = ''
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    detail = body.error?.message ?? ''
  } catch {
    /* no JSON body */
  }
  return new DriveError(detail || `Google Drive request failed (${response.status}).`, response.status)
}

export function createDriveClient({ getAccessToken, fetchImpl }: DriveClientOptions): DriveClient {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  async function execute(path: string, init: RequestInit = {}): Promise<Response> {
    const token = getAccessToken()
    let response: Response
    const isUpload = path.startsWith('/upload/')
    const base = isUpload ? UPLOAD_BASE : BASE
    const url = path.startsWith('http') ? path : `${base}${path.replace(/^\/upload/, '')}`

    try {
      response = await doFetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      })
    } catch {
      throw new DriveError('Network error: could not reach Google Drive.')
    }
    if (!response.ok) throw await toError(response)
    return response
  }

  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await execute(path, init)
      return (await response.json()) as T
    },
    async requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
      const response = await execute(path, init)
      return await response.blob()
    },
  }
}
