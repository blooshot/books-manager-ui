/**
 * Walks the real app in a real Chrome, with Google stubbed. Usage: `npm run ui:check [-- --only <text>] [-- --keep-open]`.
 * Needs Chrome/Chromium (set CHROME_PATH if it is not found). Not part of `npm run verify`.
 */
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { flows } from './flows.mjs'
import { installStubs, newWorld } from './stubs.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shots = path.join(root, 'node_modules', '.cache', 'ui-check')
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate))
}

const chrome = findChrome()
if (!chrome) {
  console.error('Chrome/Chromium not found. Install it or set CHROME_PATH to its executable.')
  process.exit(2)
}

// The app reads its configuration from VITE_* variables; process.env wins over .env files, so this never touches yours.
process.env.VITE_GOOGLE_CLIENT_ID = 'ui-check.apps.googleusercontent.com'
process.env.VITE_SHEET_ID = 'ui-check-sheet'
process.env.VITE_CURRENCY = 'INR'

mkdirSync(shots, { recursive: true })
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } })
await server.listen()
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/'
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] })

const selected = flows.filter((flow) => !only || flow.name.toLowerCase().includes(only.toLowerCase()))
const failures = []
console.log(`Chrome: ${chrome}\nApp:    ${base}\n`)

for (const flow of selected) {
  const world = newWorld()
  const log = []
  const page = await browser.newPage()
  page.setDefaultTimeout(8000)
  const problems = []
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
  await installStubs(page, world, log)
  const open = async (hash, viewport = { width: 390, height: 844 }) => {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 })
    await page.goto(`${base}${hash}`, { waitUntil: 'networkidle0' })
  }
  const started = Date.now()
  try {
    await flow.run({ page, open, world })
    if (problems.length) throw new Error(problems.join('; '))
    console.log(`  ok    ${flow.name}  (${Date.now() - started} ms)`)
  } catch (error) {
    failures.push(flow.name)
    console.log(`  FAIL  ${flow.name}\n        ${error.message.split('\n')[0]}`)
  } finally {
    const file = path.join(shots, `${flow.name.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
    await page.screenshot({ path: file }).catch(() => undefined)
    await page.close()
  }
}

await browser.close()
await server.close()
console.log(`\n${selected.length - failures.length}/${selected.length} flows passed. Screenshots: ${path.relative(root, shots)}`)
process.exit(failures.length ? 1 : 0)
