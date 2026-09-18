import { describe, expect, it } from 'vitest'
import { buildMultipartRelated } from '@/services/drive/multipart'

describe('buildMultipartRelated', () => {
  const media = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x0d, 0x0a, 0x80])], { type: 'image/jpeg' })

  it('is multipart/related (not form-data) and names its boundary in the Content-Type', () => {
    const { contentType } = buildMultipartRelated({ name: 'a' }, media, 'image/jpeg', 'B123')
    expect(contentType).toBe('multipart/related; boundary=B123')
  })

  it('puts the JSON metadata first, then the media, and closes the boundary', async () => {
    const { body } = buildMultipartRelated({ name: 'B-0001.jpg', parents: ['folder'] }, media, 'image/jpeg', 'B123')
    const bytes = new Uint8Array(await body.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)

    expect(text.startsWith('--B123\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n')).toBe(true)
    expect(text).toContain('{"name":"B-0001.jpg","parents":["folder"]}')
    expect(text).toContain('--B123\r\nContent-Type: image/jpeg\r\n\r\n')
    expect(text.endsWith('\r\n--B123--')).toBe(true)
    expect(text.indexOf('application/json')).toBeLessThan(text.indexOf('image/jpeg'))
  })

  it('keeps the media bytes intact, including CRLF and high bytes', async () => {
    const { body } = buildMultipartRelated({ name: 'a' }, media, 'image/jpeg', 'B123')
    const bytes = new Uint8Array(await body.arrayBuffer())
    const payload = [0xff, 0xd8, 0xff, 0x00, 0x0d, 0x0a, 0x80]
    const found = bytes.findIndex((_, i) => payload.every((b, j) => bytes[i + j] === b))
    expect(found).toBeGreaterThan(0)
  })

  it('generates a different boundary each time by default', () => {
    const a = buildMultipartRelated({}, media, 'image/jpeg').contentType
    const b = buildMultipartRelated({}, media, 'image/jpeg').contentType
    expect(a).not.toBe(b)
  })
})
