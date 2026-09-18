/**
 * The flows. Each one drives the real app in a real browser and throws on the first thing that is not as expected.
 * They check what unit tests cannot: real navigation, real layout, real focus.
 */
import { BOOK_HEADER } from './stubs.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

/** Waits until `check` (run in the page) is truthy. */
const waitFor = (page, check, arg) => page.waitForFunction(check, {}, arg)
const waitForHash = (page, hash) => waitFor(page, (h) => location.hash === h, hash)
const waitForText = (page, text) => waitFor(page, (t) => document.body.innerText.includes(t), text)

/** Clicks the first visible button or link whose text matches. */
async function click(page, pattern) {
  const source = pattern.source
  await waitFor(page, (src) => [...document.querySelectorAll('button, a')].some((e) => e.offsetParent !== null && new RegExp(src).test(e.textContent.trim())), source)
  await page.evaluate((src) => {
    const match = [...document.querySelectorAll('button, a')].find((e) => e.offsetParent !== null && new RegExp(src).test(e.textContent.trim()))
    match.click()
  }, source)
}

/** Types into the input whose label text matches. */
async function fill(page, labelPattern, text) {
  const id = await page.evaluate((src) => {
    const label = [...document.querySelectorAll('label')].find((l) => new RegExp(src).test(l.textContent.trim()))
    return label?.htmlFor ?? null
  }, labelPattern.source)
  expect(id, `no field labelled ${labelPattern}`)
  await page.type(`[id="${id}"]`, text)
}

const visibleButtons = (page) =>
  page.evaluate(() => [...document.querySelectorAll('button, a')].filter((e) => e.offsetParent !== null).map((e) => (e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' ')))

async function signIn(page) {
  await click(page, /^(Sign in with Google|Continue as .*)$/)
  await waitFor(page, () => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Sign out'))
}

const boxInViewport = (page, pattern) =>
  page.evaluate((src) => {
    const el = [...document.querySelectorAll('button')].find((b) => new RegExp(src).test(b.textContent.trim()))
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
  }, pattern.source)

export const flows = [
  {
    name: 'a deep link while signed out goes to /login, and signing in returns to it',
    async run({ page, open }) {
      await open('#/books/B-0001')
      await waitForHash(page, '#/login')
      const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name))
      expect(scripts.some((name) => name.includes('accounts.google.com/gsi/client')), 'Google’s script was not loaded before any click')
      await signIn(page)
      await waitForHash(page, '#/books/B-0001')
      await waitForText(page, 'Borrow history')
    },
  },
  {
    name: 'signing out goes to /login; the next sign-in starts at home, not on the page you left',
    async run({ page, open }) {
      await open('#/books/B-0001')
      await signIn(page)
      await waitForHash(page, '#/books/B-0001')
      await click(page, /^Sign out$/)
      await waitForHash(page, '#/login')
      expect((await visibleButtons(page)).includes('Continue as me@example.com'), 'no "Continue as" after signing out')
      expectEqual(await page.evaluate(() => window.__revoked), 'fake-token', 'token revoked at Google')
      await signIn(page)
      await waitForHash(page, '#/')
      await waitForText(page, 'The Left Hand of Darkness')
    },
  },
  {
    name: 'adding a book writes it to the Sheet and opens its page',
    async run({ page, open, world }) {
      await open('#/')
      await signIn(page)
      await click(page, /^Add book$/)
      await waitForHash(page, '#/books/new')
      await fill(page, /^Title/, 'Neuromancer')
      await fill(page, /^Author/, 'William Gibson')
      await fill(page, /^Price paid/, '300')
      await click(page, /^Save book$/)
      await waitForHash(page, '#/books/B-0004')
      await waitForText(page, 'Neuromancer')
      const added = await page.evaluate(() => [...document.querySelectorAll('dt')].find((dt) => dt.textContent === 'Added')?.nextElementSibling?.textContent)
      expect(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(added ?? ''), `Added should read like 2026-09-19 14:05, got ${added}`)
      const row = world.sheets.Books.at(-1)
      expectEqual(row.slice(0, 5), ['B-0004', 'Neuromancer', 'William Gibson', '', '300'], 'row written to the Books tab')
      expect(/^\d{4}-\d{2}-\d{2}T/.test(row[7]), 'Added at should be the ISO timestamp, stored as text')
    },
  },
  {
    name: 'a change made while the Sheet is unreachable is kept, warned about on sign-out, and sent at the next sign-in',
    async run({ page, open, world }) {
      await open('#/books/B-0001')
      await signIn(page)
      await click(page, /^Borrow$/)
      await waitFor(page, () => document.querySelector('[role=dialog]'))
      await page.type('[role=dialog] input[list]', 'Asha')
      world.online = false
      await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Borrow').click())
      await waitFor(page, () => !document.querySelector('[role=dialog]'))
      await waitForText(page, '1 pending')
      await waitForText(page, 'with Asha since')

      await click(page, /^Sign out$/)
      await waitFor(page, () => document.querySelector('[role=dialog]')?.textContent.includes('Sign out with unsent changes?'))
      await click(page, /^Sign out anyway$/)
      await waitForHash(page, '#/login')

      world.online = true
      await signIn(page)
      await waitFor(page, () => !document.body.innerText.includes('pending'))
      const loans = world.sheets.Borrowers.slice(1)
      expectEqual(loans.map((r) => [r[0], r[1], r[5]]), [['B-0002', 'Ravi', 'No'], ['B-0001', 'Asha', 'No']], 'loans in the Sheet')
      await click(page, /^Books$/)
      await waitForText(page, 'Asha · since')
    },
  },
  {
    name: 'a Sheet without the Books and Borrowers tabs shows what to do, not Google’s bare 400',
    async run({ page, open, world }) {
      delete world.sheets.Books
      delete world.sheets.Borrowers
      await open('#/')
      await signIn(page)
      await waitForText(page, 'The Sheet has no tab named "Books"')
      const text = await page.evaluate(() => document.body.innerText)
      expect(text.includes('README > Sheet setup'), 'the message should point at the README')
      expect(!text.includes('Unable to parse range'), 'Google’s raw message should not be shown')
    },
  },
  {
    name: 'a Sheet whose header row is wrong names the missing columns',
    async run({ page, open, world }) {
      world.sheets.Books[0] = BOOK_HEADER.filter((h) => h !== 'Author')
      await open('#/')
      await signIn(page)
      await waitForText(page, 'missing column(s): Author')
    },
  },
  {
    name: 'phone width: Sign out and Sync are on screen, bottom nav (no sidebar); desktop width: sidebar (no bottom nav)',
    async run({ page, open }) {
      await open('#/', { width: 390, height: 844 })
      await signIn(page)
      await waitForText(page, 'Dune')
      expectEqual(await boxInViewport(page, /^Sign out$/), true, 'Sign out inside the phone viewport')
      const phone = await page.evaluate(() => ({
        sidebar: Boolean(document.querySelector('aside')),
        bottomNav: Boolean(document.querySelector('nav[aria-label=Main].fixed')),
        sideScroll: document.documentElement.scrollWidth > window.innerWidth,
      }))
      expectEqual(phone, { sidebar: false, bottomNav: true, sideScroll: false }, 'phone layout')
      const controls = await visibleButtons(page)
      expectEqual(controls.filter((label) => label === 'Sync').length, 1, 'exactly one Sync control')
      expect(!controls.includes('Refresh'), 'the list should not have a second, look-alike Refresh button')

      await page.setViewport({ width: 1280, height: 800 })
      await waitFor(page, () => document.querySelector('aside'))
      const desktop = await page.evaluate(() => ({ sidebar: Boolean(document.querySelector('aside')), bottomNav: Boolean(document.querySelector('nav[aria-label=Main].fixed')), table: Boolean(document.querySelector('table')) }))
      expectEqual(desktop, { sidebar: true, bottomNav: false, table: true }, 'desktop layout')
      expectEqual(await boxInViewport(page, /^Sign out$/), true, 'Sign out inside the desktop viewport')
    },
  },
]

export { sleep }
