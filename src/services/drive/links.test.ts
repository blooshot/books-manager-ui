import { describe, it, expect } from 'vitest'
import { getDriveFileIdFromUrl, createDriveFileUrl } from './links'

const VALID_ID = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456'

describe('Drive Links', () => {
  describe('getDriveFileIdFromUrl', () => {
    it('extracts ID from /file/d/ URL', () => {
      expect(getDriveFileIdFromUrl(`https://drive.google.com/file/d/${VALID_ID}/view?usp=sharing`)).toBe(VALID_ID)
    })

    it('extracts ID from open?id= URL', () => {
      expect(getDriveFileIdFromUrl(`https://drive.google.com/open?id=${VALID_ID}`)).toBe(VALID_ID)
    })

    it('extracts ID if given just the ID', () => {
      expect(getDriveFileIdFromUrl(VALID_ID)).toBe(VALID_ID)
    })

    it('returns null for empty or invalid strings', () => {
      expect(getDriveFileIdFromUrl('')).toBeNull()
      expect(getDriveFileIdFromUrl('not-a-valid-id')).toBeNull() // Too short
      expect(getDriveFileIdFromUrl('https://example.com/image.jpg')).toBeNull()
    })
  })

  describe('createDriveFileUrl', () => {
    it('creates a standard /file/d/ URL', () => {
      expect(createDriveFileUrl(VALID_ID)).toBe(`https://drive.google.com/file/d/${VALID_ID}/view?usp=drivesdk`)
    })

    it('throws if fileId is invalid', () => {
      expect(() => createDriveFileUrl('')).toThrow('Invalid file ID')
      expect(() => createDriveFileUrl('too-short')).toThrow('Invalid file ID')
    })
  })
})
