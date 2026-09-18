/**
 * The flows. Each one drives the real app in a real browser and throws on the first thing that is not as expected.
 * They check what unit tests cannot: real navigation, real layout, real focus.
 */
import { BOOK_HEADER } from './stubs.mjs'

const OLD_BOOK_HEADER = BOOK_HEADER.slice(0, 8)
const resourceNames = (page) => page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name))

import { mkdirSync } from 'node:fs'

const SHOTS = new URL('../../node_modules/.cache/ui-check/', import.meta.url).pathname

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

/** Opens a themed dropdown (Radix opens on a real mouse press) and picks the option with exactly this text. */
async function choose(page, comboSelector, optionText, screenshotName) {
  await page.$eval(comboSelector, (e) => e.scrollIntoView({ block: 'center' })) // not under the fixed bottom nav
  await page.click(comboSelector)
  await waitFor(page, (t) => [...document.querySelectorAll('[role=option]')].some((o) => o.textContent.trim() === t), optionText)
  if (screenshotName) {
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: `${SHOTS}${screenshotName}.png` })
  }
  for (const handle of await page.$$('[role=option]')) {
    if ((await handle.evaluate((e) => e.textContent.trim())) === optionText) return handle.click()
  }
  throw new Error(`no option "${optionText}"`)
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
      await waitForText(page, 'Save book') // the form is a separate file, loaded when first opened
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
    name: 'categories and languages: add one, tag a book, filter and group by it, rename it, archive it',
    async run({ page, open, world }) {
      await open('#/categories')
      await signIn(page)
      await waitForText(page, 'Self-help')
      await fill(page, /^New category/, 'Psychology')
      await click(page, /^Add$/)
      await waitFor(page, () => document.querySelector('[aria-label="Active categories"]')?.textContent.includes('Psychology'))
      expectEqual(world.sheets.Categories.at(-1), ['Psychology', 'Yes'], 'row written to the Categories tab')

      await page.evaluate(() => { location.hash = '#/books/B-0001/edit' })
      await waitForText(page, 'Save changes')
      await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'Psychology').click())
      await choose(page, 'button[role=combobox]', 'Hindi', 'dropdown-open')
      await waitFor(page, () => document.querySelector('button[role=combobox]')?.textContent.trim() === 'Hindi')
      await click(page, /^Save changes$/)
      await waitForHash(page, '#/books/B-0001')
      await waitForText(page, 'Self-help, Psychology')
      expectEqual(world.sheets.Books[1].slice(8, 10), ['Self-help, Psychology', 'Hindi'], 'category and language cells')

      await page.evaluate(() => { location.hash = '#/?group=category' })
      await waitFor(page, () => [...document.querySelectorAll('h2')].some((h) => h.textContent.startsWith('Psychology')))
      const headings = await page.evaluate(() => [...document.querySelectorAll('h2')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()))
      expectEqual(headings, ['Psychology 1', 'Self-help 1', 'Uncategorized 2'], 'group headings')

      await page.evaluate(() => { location.hash = '#/categories' })
      await waitFor(page, () => document.querySelector('[aria-label="Rename Psychology"]'))
      await page.evaluate(() => document.querySelector('[aria-label="Rename Psychology"]').click())
      await page.evaluate(() => { const box = document.querySelector('input[id$="-rename"]'); box.focus(); box.select() })
      await page.keyboard.type('Mind')
      await click(page, /^Save$/)
      await waitFor(page, () => document.querySelector('[aria-label="Active categories"]')?.textContent.includes('Mind'))
      expectEqual(world.sheets.Books[1][8], 'Self-help, Mind', 'the book follows the rename')

      await page.evaluate(() => document.querySelector('[aria-label="Archive Mind"]').click())
      await waitFor(page, () => document.querySelector('[aria-label="Restore Mind"]'))
      expectEqual(world.sheets.Categories.find((r) => r[0] === 'Mind'), ['Mind', 'No'], 'archived, not removed')
      expectEqual(world.sheets.Books[1][8], 'Self-help, Mind', 'the book keeps its text')
      expect(world.writes.every((w) => !/delete|clear/i.test(w)), 'no delete or clear call was made')
    },
  },
  {
    name: 'an older Sheet (no Categories/Languages tabs or columns) still loads and says what to add',
    async run({ page, open, world }) {
      delete world.sheets.Categories
      delete world.sheets.Languages
      world.sheets.Books = world.sheets.Books.map((row, i) => (i === 0 ? OLD_BOOK_HEADER : row.slice(0, 8)))
      await open('#/')
      await signIn(page)
      await waitForText(page, 'The Left Hand of Darkness')
      expect(!(await page.evaluate(() => document.body.innerText.includes('Group by category'))), 'no category controls without categories')
      await page.evaluate(() => { location.hash = '#/categories' })
      await waitForText(page, 'Add a tab named "Categories"')
      await waitForText(page, 'Add a tab named "Languages"')
    },
  },
  {
    name: 'delete a book: it only sets Active to No (row kept), leaves the list, shows under Archived, and can be restored',
    async run({ page, open, world }) {
      await open('#/books/B-0001')
      await signIn(page)
      await waitForText(page, 'Borrow history')
      await click(page, /^Delete book$/)
      await waitFor(page, () => document.querySelector('[role=dialog]')?.textContent.includes('not erased from your Sheet'))
      await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Delete book').click())
      await waitForHash(page, '#/')
      await waitFor(page, () => document.body.innerText.includes('Emma') && !document.body.innerText.includes('Dune'))
      expectEqual(world.sheets.Books.length, 4, 'no row removed from the Books tab')
      expectEqual(world.sheets.Books[1].slice(0, 2), ['B-0001', 'Dune'], 'the row is still there')
      expectEqual(world.sheets.Books[1][10], 'No', 'Active cell')
      expect(world.writes.every((w) => !/delete|clear/i.test(w)), 'no delete or clear call was made')

      await click(page, /^Archived$/)
      await waitForHash(page, '#/?status=archived')
      await waitForText(page, 'Dune')
      await click(page, /Dune/)
      await waitForText(page, 'This book is deleted')
      await click(page, /^Restore book$/)
      await waitFor(page, () => !document.body.innerText.includes('This book is deleted'))
      expectEqual(world.sheets.Books[1][10], 'Yes', 'Active cell after restoring')
      expect((await visibleButtons(page)).includes('Delete book'), 'Delete book is offered again after restoring')
    },
  },
  {
    name: 'pages load on demand: the add form is not downloaded until it is opened',
    async run({ page, open }) {
      await open('#/')
      await signIn(page)
      await waitForText(page, 'The Left Hand of Darkness')
      expect(!(await resourceNames(page)).some((name) => name.includes('BookFormPage')), 'the add form was downloaded with the first screen')
      await page.evaluate(() => { location.hash = '#/books/new' })
      await waitForText(page, 'Save book')
      expect((await resourceNames(page)).some((name) => name.includes('BookFormPage')), 'the add form should load when opened')
    },
  },
  {
    name: 'book cards follow the Fusion product card (radius, padding, type sizes, tags) in a real browser, light and dark',
    async run({ page, open }) {
      await open('#/', { width: 1280, height: 800 })
      await signIn(page)
      await waitForText(page, 'The Left Hand of Darkness')
      const measure = () =>
        page.evaluate(() => {
          const card = document.querySelector('ul[aria-label=Books] a.bm-card')
          const px = (el, prop) => getComputedStyle(el)[prop]
          const first = (selector) => card.querySelector(selector)
          return {
            radius: px(card, 'borderRadius'),
            padding: px(card, 'paddingTop'),
            title: [px(first('.bm-card-title'), 'fontSize'), px(first('.bm-card-title'), 'fontWeight')],
            author: px(first('.bm-card-desc'), 'fontSize'),
            tagFont: [px(first('.bm-tag'), 'fontSize'), px(first('.bm-tag'), 'fontFamily').includes('IBM Plex Mono'), px(first('.bm-tag'), 'borderRadius')],
            price: [px(first('.bm-price'), 'fontSize'), px(first('.bm-price'), 'fontWeight'), px(first('.bm-price'), 'fontFamily').includes('Manrope')],
            shadow: px(card, 'boxShadow') !== 'none',
          }
        })
      expectEqual(
        await measure(),
        { radius: '14px', padding: '20px', title: ['16px', '600'], author: '13px', tagFont: ['11px', true, '999px'], price: ['18px', '700', true], shadow: true },
        'Fusion card styles (light)',
      )
      mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({ path: `${SHOTS}cards-light.png` })
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
      await sleep(400) // let the 150ms colour and shadow transitions finish before measuring
      const dark = await measure()
      expectEqual({ ...dark, shadow: undefined }, { radius: '14px', padding: '20px', title: ['16px', '600'], author: '13px', tagFont: ['11px', true, '999px'], price: ['18px', '700', true], shadow: undefined }, 'Fusion card styles (dark)')
      expectEqual(dark.shadow, false, 'no resting shadow in dark mode (dark relies on the hover shadow)')
      await page.screenshot({ path: `${SHOTS}cards-dark.png` })
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
      await page.setViewport({ width: 390, height: 844 })
      await waitFor(page, () => document.querySelector('nav[aria-label=Main].fixed'))
      const phone = await page.evaluate(() => {
        const card = document.querySelector('ul[aria-label=Books] a.bm-card')
        return { radius: getComputedStyle(card).borderRadius, title: getComputedStyle(card.querySelector('.bm-card-title')).fontSize, sideScroll: document.documentElement.scrollWidth > window.innerWidth }
      })
      expectEqual(phone, { radius: '14px', title: '16px', sideScroll: false }, 'phone card')
      await sleep(400)
      await page.screenshot({ path: `${SHOTS}cards-phone.png` })
    },
  },
  {
    name: 'phone width: Sign out and Sync are on screen, bottom nav; desktop width: header menu and a card grid (no sidebar, no bottom nav, no table)',
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
      await waitFor(page, () => document.querySelector('header nav[aria-label=Main]'))
      const desktop = await page.evaluate(() => ({
        sidebar: Boolean(document.querySelector('aside')),
        bottomNav: Boolean(document.querySelector('nav[aria-label=Main].fixed')),
        table: Boolean(document.querySelector('table')),
        headerLinks: [...document.querySelectorAll('header nav[aria-label=Main] a')].map((a) => a.textContent.trim()),
        cards: document.querySelectorAll('ul[aria-label=Books] > li').length,
        sideScroll: document.documentElement.scrollWidth > window.innerWidth,
      }))
      expectEqual(desktop.headerLinks, ['Books', 'Lent out', 'Categories', 'Add book'], 'header menu')
      expectEqual({ ...desktop, headerLinks: undefined, cards: desktop.cards > 0 }, { sidebar: false, bottomNav: false, table: false, headerLinks: undefined, cards: true, sideScroll: false }, 'desktop layout')
      // A very wide monitor: the header and the page stay in one centred column instead of stretching to the edges.
      await page.setViewport({ width: 2560, height: 1200 })
      const wide = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect()
        return { header: Math.round(box('header > div').width), main: Math.round(box('main').width) }
      })
      expect(wide.header <= 1152 && wide.main <= 1152, `content column should stay at most 1152px wide on a 2560px screen, got ${JSON.stringify(wide)}`)
      await page.setViewport({ width: 1280, height: 800 })
      expectEqual(await boxInViewport(page, /^Sign out$/), true, 'Sign out inside the desktop viewport')
    },
  },
]

export { sleep }
