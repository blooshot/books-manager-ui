import { lazy, type ComponentType } from 'react'

/**
 * Pages other than the book list and sign-in load when first opened, so the first screen doesn't download the add/edit
 * form, the image code, the accordion, and so on (each becomes its own small file at build time). `React.lazy` wants a
 * default export; these pages use named ones, so this picks the named export out.
 * Tests replace this module with `src/test/eagerPages.ts` (same names, loaded up front), so a page is there on first render.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

export const BookDetailPage = page(() => import('@/features/books/BookDetailPage'), 'BookDetailPage')
export const AddBookPage = page(() => import('@/features/books/BookFormPage'), 'AddBookPage')
export const EditBookPage = page(() => import('@/features/books/BookFormPage'), 'EditBookPage')
export const ManageOptionsPage = page(() => import('@/features/categories/ManageOptionsPage'), 'ManageOptionsPage')
export const LentOutPage = page(() => import('@/features/loans/LentOutPage'), 'LentOutPage')
export const PendingChangesPage = page(() => import('@/features/sync/PendingChangesPage'), 'PendingChangesPage')
