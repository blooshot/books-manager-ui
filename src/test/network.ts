import type { FakeDrive } from '@/test/fakeDrive'
import type { FakeSheets } from '@/test/fakeSheets'

/** A `fetch` that can be taken offline mid-test: while `offline`, every request fails like a dropped connection. */
export function switchableNetwork(sheets: FakeSheets, drive: FakeDrive) {
  const network = { offline: false }
  const fetchImpl: typeof fetch = (input, init) => {
    if (network.offline) return Promise.reject(new TypeError('Failed to fetch'))
    return new URL(String(input)).hostname === 'sheets.googleapis.com' ? sheets.fetch(input, init) : drive.fetch(input, init)
  }
  return { network, fetchImpl }
}
