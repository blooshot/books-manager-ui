import { Link, Route, Routes } from 'react-router'
import { LoginRoute } from '@/features/auth/LoginRoute'
import { RequireSession } from '@/features/auth/RequireSession'
import { useTokenExpiry } from '@/features/auth/useTokenExpiry'
import { BookDetailPage } from '@/features/books/BookDetailPage'
import { AddBookPage, EditBookPage } from '@/features/books/BookFormPage'
import { BookListPage } from '@/features/books/BookListPage'
import { CoverProvider } from '@/features/covers/CoverProvider'
import { AppLayout } from '@/features/layout/AppLayout'
import { LentOutPage } from '@/features/loans/LentOutPage'
import { PendingChangesPage } from '@/features/sync/PendingChangesPage'

function NotFoundPage() {
  return (
    <div className="space-y-2">
      <h1 className="font-display text-xl font-bold">Page not found</h1>
      <Link to="/" className="text-primary underline-offset-4 hover:underline">Back to your books</Link>
    </div>
  )
}

/**
 * Routes only; the router itself (hash routing) is provided by main.tsx so tests can use a memory router.
 * `/login` is the only public route; everything else needs a session (see RequireSession).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginRoute />} />
      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          <Route index element={<BookListPage />} />
          <Route path="books/new" element={<AddBookPage />} />
          <Route path="books/:id" element={<BookDetailPage />} />
          <Route path="books/:id/edit" element={<EditBookPage />} />
          <Route path="lent-out" element={<LentOutPage />} />
          <Route path="pending" element={<PendingChangesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default function App() {
  useTokenExpiry()
  return (
    <CoverProvider>
      <AppRoutes />
    </CoverProvider>
  )
}
