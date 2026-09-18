import type { Dispatch } from '@reduxjs/toolkit'
import type { CoverVariants } from '@/lib/image'
import { createDriveClient, type DriveClient } from '@/services/drive/client'
import { saveCoverToCache } from '@/services/drive/coverCache'
import { createFolderResolver, type FolderResolver } from '@/services/drive/folder'
import { getDriveFileIdFromUrl } from '@/services/drive/links'
import { markReplaced, uploadCoverInFolder } from '@/services/drive/photos'
import { createSheetsClient } from '@/services/sheets/client'
import { SessionExpiredError } from '@/services/sheets/errors'
import { accessTokenGetter } from '@/store/accessToken'
import { noticeAdded } from '@/store/noticesSlice'
import { tokenExpired } from '@/store/sessionSlice'
import type { RootState } from '@/store'
import type { ThunkExtra } from '@/store/thunkExtra'

/** Shared by the write thunks and the outbox flush: clients, the Drive folder, uploads, and the write queue. */

export function clientFor(getState: () => RootState, extra: ThunkExtra) {
  return createSheetsClient({ sheetId: extra.sheetId, fetchImpl: extra.fetchImpl, getAccessToken: accessTokenGetter(getState, extra.now) })
}

export function driveFor(getState: () => RootState, extra: ThunkExtra): DriveClient {
  return createDriveClient({ fetchImpl: extra.fetchImpl, getAccessToken: accessTokenGetter(getState, extra.now) })
}

/** One folder resolver per Google account for the life of the app (keyed by `extra`, so tests stay isolated). */
const folderResolvers = new WeakMap<ThunkExtra, Map<string, FolderResolver>>()

function folderFor(getState: () => RootState, extra: ThunkExtra, drive: DriveClient): FolderResolver {
  const account = getState().session.email ?? 'default'
  let byAccount = folderResolvers.get(extra)
  if (!byAccount) {
    byAccount = new Map()
    folderResolvers.set(extra, byAccount)
  }
  let resolver = byAccount.get(account)
  if (!resolver) {
    resolver = createFolderResolver(drive, account)
    byAccount.set(account, resolver)
  }
  return resolver
}

/** Uploads a cover for `bookId` and returns the new Drive file ID. */
export async function uploadCoverFile(getState: () => RootState, extra: ThunkExtra, full: Blob, bookId: string): Promise<string> {
  const drive = driveFor(getState, extra)
  return uploadCoverInFolder(drive, folderFor(getState, extra, drive), full, bookId)
}

/** Best-effort: puts a freshly uploaded cover in the local cache so the list never re-downloads it. */
export async function cacheUploadedCover(photoUrl: string, photo: CoverVariants): Promise<void> {
  const fileId = getDriveFileIdFromUrl(photoUrl)
  if (fileId) await saveCoverToCache(fileId, photo.full, photo.thumb)
}

/** Renames the replaced cover so the owner can delete it by hand. Never deletes; never fails the edit. */
export async function retireOldCover(
  dispatch: Dispatch,
  getState: () => RootState,
  extra: ThunkExtra,
  oldUrl: string | undefined,
  newUrl: string,
  bookId: string,
): Promise<void> {
  const oldId = oldUrl ? getDriveFileIdFromUrl(oldUrl) : null
  if (!oldId || oldId === getDriveFileIdFromUrl(newUrl)) return
  try {
    await markReplaced(driveFor(getState, extra), oldId, bookId)
  } catch {
    dispatch(noticeAdded(`The new cover for ${bookId} was saved, but the old cover file could not be renamed in Google Drive.`))
  }
}

/**
 * Sheet writes run strictly one at a time. Each write re-reads the tab and derives
 * something from it (next Book ID, which row to update), so two overlapping writes
 * (e.g. a double-clicked Add) could otherwise both pick the same ID.
 */
let writeTail: Promise<unknown> = Promise.resolve()
export function inWriteQueue<T>(work: () => Promise<T>): Promise<T> {
  const result = writeTail.then(work)
  writeTail = result.catch(() => undefined)
  return result
}

/** Flips the session to 'expired' (shows the reconnect banner) when Google says 401. */
export async function withSessionCheck<T>(dispatch: Dispatch, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof SessionExpiredError) dispatch(tokenExpired())
    throw error
  }
}
