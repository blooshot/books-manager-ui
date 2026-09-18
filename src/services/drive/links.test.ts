import { describe, expect, it } from 'vitest'
import { createDriveFileUrl, getDriveFileIdFromUrl } from '@/services/drive/links'

const ID = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456'

describe('getDriveFileIdFromUrl', () => {
  it.each([
    ['/file/d/ link', `https://drive.google.com/file/d/${ID}/view?usp=sharing`],
    ['link the app writes', `https://drive.google.com/file/d/${ID}/view?usp=drivesdk`],
    ['open?id= link', `https://drive.google.com/open?id=${ID}`],
    ['docs.google.com link', `https://docs.google.com/file/d/${ID}/edit`],
    ['bare ID', ID],
    ['link with surrounding spaces', `  https://drive.google.com/file/d/${ID}/view  `],
  ])('extracts the ID from a %s', (_label, input) => {
    expect(getDriveFileIdFromUrl(input)).toBe(ID)
  })

  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['too-short ID', 'not-a-valid-id'],
    ['non-Drive URL', 'https://example.com/image.jpg'],
    ['non-Drive URL with a long path segment', 'https://example.com/a-very-long-path-segment-that-looks-like-an-id/x'],
    ['Drive-shaped path on another host', `https://evil.example/file/d/${ID}/view`],
    ['Drive link over http', `http://drive.google.com/file/d/${ID}/view`],
    ['Drive URL without an ID', 'https://drive.google.com/drive/my-drive'],
  ])('returns null for %s', (_label, input) => {
    expect(getDriveFileIdFromUrl(input)).toBeNull()
  })
})

describe('createDriveFileUrl', () => {
  it('builds a standard /file/d/ URL that parses back to the same ID', () => {
    const url = createDriveFileUrl(ID)
    expect(url).toBe(`https://drive.google.com/file/d/${ID}/view?usp=drivesdk`)
    expect(getDriveFileIdFromUrl(url)).toBe(ID)
  })

  it('rejects IDs that are empty, too short, or contain URL characters', () => {
    expect(() => createDriveFileUrl('')).toThrow('Invalid file ID')
    expect(() => createDriveFileUrl('too-short')).toThrow('Invalid file ID')
    expect(() => createDriveFileUrl(`${ID}/../x`)).toThrow('Invalid file ID')
  })
})
