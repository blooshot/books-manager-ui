import { columnLetter } from '@/services/sheets/mapping'

/**
 * In-memory stand-in for the Google Sheets v4 values API, used as `fetch` in tests.
 * Mimics the behaviours the app depends on:
 *  - reads return strings (FORMATTED_VALUE) with trailing empty cells trimmed
 *  - USER_ENTERED text with a leading apostrophe is stored without it
 *  - append reports `updatedRange`
 *  - a wrong/missing Bearer token gives 401
 */
export const BOOK_HEADER = [
  'Book ID',
  'Title',
  'Author',
  'Purchase date',
  'Price paid',
  'Current market price',
  'Photo',
  'Added at',
  'Categories',
  'Language',
  'Active',
]
export const OPTION_HEADER = ['Name', 'Active']
export const LOAN_HEADER = [
  'Book ID',
  'Borrower name',
  'Borrowed date',
  'Borrowed time',
  'Place',
  'Returned',
  'Returned date',
  'Returned time',
]

export interface FakeCall {
  method: string
  url: string
  body?: unknown
}

export class FakeSheets {
  tabs: Record<string, string[][]>
  calls: FakeCall[] = []
  token = 'test-token'
  /** Set to make the next request fail with this status. */
  failNext?: number
  /** Simulates an uploaded Excel file opened in Sheets: the API refuses it (Google: "This operation is not supported for this document"). */
  notNativeSheet = false
  /** Set to make the next request with this HTTP method fail (e.g. only the append/upload/rename). */
  failNextMethod?: { method: string; status: number }

  constructor(tabs?: Partial<Record<'Books' | 'Borrowers' | 'Categories' | 'Languages', string[][]>>) {
    this.tabs = {
      Books: tabs?.Books ?? [BOOK_HEADER],
      Borrowers: tabs?.Borrowers ?? [LOAN_HEADER],
      Categories: tabs?.Categories ?? [OPTION_HEADER],
      Languages: tabs?.Languages ?? [OPTION_HEADER],
    }
  }

  fetch: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    this.calls.push({ method, url, body })

    const headers = new Headers(init?.headers)
    if (this.failNextMethod && this.failNextMethod.method === method) {
      const { status } = this.failNextMethod
      this.failNextMethod = undefined
      return json({ error: { message: `fake ${method} failure ${status}` } }, status)
    }
    if (this.failNext) {
      const status = this.failNext
      this.failNext = undefined
      return json({ error: { message: `fake failure ${status}` } }, status)
    }
    if (headers.get('Authorization') !== `Bearer ${this.token}`) {
      return json({ error: { message: 'unauthenticated' } }, 401)
    }

    if (this.notNativeSheet) {
      return json({ error: { code: 400, status: 'FAILED_PRECONDITION', message: 'This operation is not supported for this document.' } }, 400)
    }

    const parsed = new URL(url)
    const path = decodeURIComponent(parsed.pathname)

    if (path.endsWith('/values:batchGet') && method === 'GET') {
      const ranges = parsed.searchParams.getAll('ranges')
      const unknown = ranges.find((r) => !(r in this.tabs))
      if (unknown !== undefined) return unknownRange(unknown)
      return json({ valueRanges: ranges.map((r) => ({ range: r, values: this.read(r) })) })
    }

    const append = /\/values\/([^/:]+):append$/.exec(path)
    if (append && method === 'POST') {
      const tab = append[1]
      if (!(tab in this.tabs)) return unknownRange(tab)
      const rows = this.tabs[tab]
      const row = (body.values[0] as (string | number)[]).map((v) => this.store(v))
      rows.push(row)
      const n = rows.length
      return json({ updates: { updatedRange: `${tab}!A${n}:${columnLetter(row.length - 1)}${n}` } })
    }

    if (path.endsWith('/values:batchUpdate') && method === 'POST') {
      for (const { range, values } of body.data as { range: string; values: (string | number)[][] }[]) {
        const match = /^([^!]+)!([A-Z]+)(\d+)$/.exec(range)
        if (!match) return json({ error: { message: 'bad range' } }, 400)
        const [, tab, letters, rowNo] = match
        if (!(tab in this.tabs)) return unknownRange(tab)
        const col = [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
        const rows = this.tabs[tab]
        const row = rows[Number(rowNo) - 1]
        while (row.length <= col) row.push('')
        row[col] = this.store(values[0][0])
      }
      return json({})
    }

    return json({ error: { message: `unhandled ${method} ${path}` } }, 404)
  }

  /** Values as the API returns them: strings, trailing empties trimmed. */
  private read(range: string): string[][] {
    return this.tabs[range].map((row) => {
      const cells = row.map(String)
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      return cells
    })
  }

  /**
   * What Sheets stores for a USER_ENTERED value. Like typing into the Sheet:
   *  - a leading apostrophe forces plain text (and is not stored);
   *  - an ISO datetime such as 2026-09-18T14:05:00.000Z is parsed into a date-time value, and reads back in the
   *    cell's display format (the default, US-style, here), NOT as the string that was written.
   *    Code that needs a value to round-trip exactly must force it to text.
   */
  private store(value: string | number): string {
    const s = String(value)
    if (s.startsWith("'")) return s.slice(1)
    const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(s)
    if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]} ${Number(iso[4])}:${iso[5]}:${iso[6]}`
    return s
  }
}

/** What the API answers when a range names a tab the spreadsheet doesn't have: 400, not 404. */
function unknownRange(range: string): Response {
  return json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: `Unable to parse range: ${range}` } }, 400)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
