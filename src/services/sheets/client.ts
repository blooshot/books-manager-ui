import { SessionExpiredError, SheetsError, SheetsPermissionError } from '@/services/sheets/errors'
import type { Cell } from '@/services/sheets/mapping'

/**
 * Thin Sheets v4 client. It exposes exactly three operations — read, append,
 * update cells — and nothing that can clear or delete (ADR-0004). Do not add
 * others; src/test/no-delete.test.ts enforces an allow-list of endpoints.
 */
export interface SheetsClient {
  /** Values for each range, as displayed in the Sheet (FORMATTED_VALUE). */
  batchGet(ranges: string[]): Promise<string[][][]>
  /** Appends one row after the table in `range`; resolves with the range Sheets wrote to. */
  append(range: string, row: Cell[]): Promise<{ updatedRange?: string }>
  /** Sets individual cells. Never used to clear a range. */
  batchUpdate(data: { range: string; value: Cell }[]): Promise<void>
}

export interface SheetsClientOptions {
  sheetId: string
  /** Must throw SessionExpiredError when there is no valid token. */
  getAccessToken: () => string
  fetchImpl?: typeof fetch
}

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

async function toError(response: Response): Promise<SheetsError> {
  if (response.status === 401) return new SessionExpiredError()
  if (response.status === 403) return new SheetsPermissionError()
  let detail = ''
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    detail = body.error?.message ?? ''
  } catch {
    /* no JSON body */
  }
  if (response.status === 404) {
    return new SheetsError('Spreadsheet not found. Check VITE_SHEET_ID.', 404)
  }
  return new SheetsError(detail || `Google Sheets request failed (${response.status}).`, response.status)
}

export function createSheetsClient({ sheetId, getAccessToken, fetchImpl }: SheetsClientOptions): SheetsClient {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const root = `${BASE}/${encodeURIComponent(sheetId)}`

  async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = getAccessToken()
    let response: Response
    try {
      response = await doFetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      })
    } catch {
      throw new SheetsError('Network error: could not reach Google Sheets.')
    }
    if (!response.ok) throw await toError(response)
    return (await response.json()) as T
  }

  return {
    async batchGet(ranges) {
      const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
      const data = await request<{ valueRanges?: { values?: string[][] }[] }>(
        `${root}/values:batchGet?${query}&valueRenderOption=FORMATTED_VALUE`,
      )
      return ranges.map((_, i) => data.valueRanges?.[i]?.values ?? [])
    },

    async append(range, row) {
      const data = await request<{ updates?: { updatedRange?: string } }>(
        `${root}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { method: 'POST', body: JSON.stringify({ values: [row] }) },
      )
      return { updatedRange: data.updates?.updatedRange }
    },

    async batchUpdate(data) {
      await request(`${root}/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: data.map(({ range, value }) => ({ range, values: [[value]] })),
        }),
      })
    },
  }
}
