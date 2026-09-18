/**
 * Stand-ins for Google, installed at the network layer of a real Chrome page, so the real app can be walked through
 * without a Google account: the sign-in script, the userinfo call, and the Sheets API (read, append, cell update).
 * Drive answers 404. These follow Google's documented behaviour; they are not Google.
 */

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

/** Replaces Google Identity Services: the token client answers after a moment, or as if the popup was closed. */
const GIS_STUB = `
window.google = { accounts: { oauth2: {
  initTokenClient(cfg) {
    return { requestAccessToken() {
      setTimeout(() => (window.__signInFails ? cfg.error_callback({ type: 'popup_closed' }) : cfg.callback({ access_token: 'fake-token', expires_in: 3600 })), 50)
    } }
  },
  revoke(token, done) { window.__revoked = token; done() },
} } };`

export const BOOK_HEADER = ['Book ID', 'Title', 'Author', 'Purchase date', 'Price paid', 'Current market price', 'Photo', 'Added at', 'Categories', 'Language', 'Active']
export const OPTION_HEADER = ['Name', 'Active']
export const LOAN_HEADER = ['Book ID', 'Borrower name', 'Borrowed date', 'Borrowed time', 'Place', 'Returned', 'Returned date', 'Returned time']

/** The pretend Google side of a flow. Change `online` or `sheets` while a flow runs to simulate things going wrong. */
export function newWorld() {
  return {
    online: true,
    token: 'fake-token',
    /** tab name -> rows (row 0 is the header). Delete a key to simulate a missing tab. */
    sheets: {
      Books: [
        BOOK_HEADER,
        ['B-0001', 'Dune', 'Frank Herbert', '2025-12-31', '500', '1200', '', '2026-01-01T00:00:00.000Z', 'Self-help', 'English'],
        ['B-0002', 'Emma', 'Jane Austen', '', '', '', '', ''],
        ['B-0003', 'The Left Hand of Darkness', 'Ursula K. Le Guin', '', '250', '', '', ''],
      ],
      Borrowers: [LOAN_HEADER, ['B-0002', 'Ravi', '2026-09-01', '10:00', 'Office', 'No', '', '']],
      Categories: [OPTION_HEADER, ['Business', 'Yes'], ['Self-help', 'Yes']],
      Languages: [OPTION_HEADER, ['English', 'Yes'], ['Hindi', 'Yes']],
    },
    writes: [],
  }
}

const json = (req, status, body) => req.respond({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
const badRange = (req, range) => json(req, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: `Unable to parse range: ${range}` } })
const trimRow = (row) => {
  const cells = row.map(String)
  while (cells.length && cells[cells.length - 1] === '') cells.pop()
  return cells
}
const stored = (value) => (String(value).startsWith("'") ? String(value).slice(1) : String(value))

export async function installStubs(page, world, log) {
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const url = new URL(req.url())
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (local) return req.continue()
    log.push(`${req.method()} ${url.hostname}${url.pathname}`)

    if (url.hostname === 'accounts.google.com' && url.pathname === '/gsi/client') {
      return req.respond({ status: 200, contentType: 'text/javascript', body: GIS_STUB })
    }
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS })
    if (!world.online) return req.abort('failed') // the network is down

    if (url.pathname === '/oauth2/v3/userinfo') return json(req, 200, { email: 'me@example.com' })
    if (req.headers().authorization !== `Bearer ${world.token}`) return json(req, 401, { error: { message: 'unauthenticated' } })

    if (url.hostname === 'sheets.googleapis.com') {
      const path = decodeURIComponent(url.pathname)
      if (path.endsWith('/values:batchGet')) {
        const ranges = url.searchParams.getAll('ranges')
        const missing = ranges.find((r) => !(r in world.sheets))
        if (missing) return badRange(req, missing)
        return json(req, 200, { valueRanges: ranges.map((range) => ({ range, values: world.sheets[range].map(trimRow) })) })
      }
      const append = /\/values\/([^/:]+):append$/.exec(path)
      if (append && req.method() === 'POST') {
        const tab = append[1]
        if (!(tab in world.sheets)) return badRange(req, tab)
        const row = JSON.parse(req.postData()).values[0].map(stored)
        world.sheets[tab].push(row)
        world.writes.push(`append ${tab}`)
        const n = world.sheets[tab].length
        return json(req, 200, { updates: { updatedRange: `${tab}!A${n}:H${n}` } })
      }
      if (path.endsWith('/values:batchUpdate') && req.method() === 'POST') {
        for (const { range, values } of JSON.parse(req.postData()).data) {
          const [, tab, letters, rowNo] = /^([^!]+)!([A-Z]+)(\d+)$/.exec(range)
          const col = [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
          const row = world.sheets[tab][Number(rowNo) - 1]
          while (row.length <= col) row.push('')
          row[col] = stored(values[0][0])
          world.writes.push(`update ${range}`)
        }
        return json(req, 200, {})
      }
    }
    return json(req, 404, { error: { message: 'not stubbed' } }) // Drive, anything else
  })
}
