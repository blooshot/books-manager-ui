import { Link, Route, Routes } from 'react-router'
import { SignInGate } from '@/features/auth/SignInGate'
import { useTokenExpiry } from '@/features/auth/useTokenExpiry'
import { BookDetailPage } from '@/features/books/BookDetailPage'
import { BookListPage } from '@/features/books/BookListPage'
import { CoverProvider } from '@/features/covers/CoverProvider'
import { AppLayout } from '@/features/layout/AppLayout'
import { useAppSelector } from '@/store/hooks'

function NotFoundPage() {
  return (
    <div className="space-y-2">
      <h1 className="font-display text-xl font-bold">Page not found</h1>
      <Link to="/" className="text-primary underline-offset-4 hover:underline">Back to your books</Link>
    </div>
  )
}

/** Routes only; the router itself (hash routing) is provided by main.tsx so tests can use a memory router. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<BookListPage />} />
        <Route path="books/:id" element={<BookDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  useTokenExpiry()
  const status = useAppSelector((s) => s.session.status)
  // 'expired' keeps the app on screen (with the reconnect banner) so nothing in progress is lost.
  if (status !== 'signedIn' && status !== 'expired') return <SignInGate />
  return (
    <CoverProvider>
      <AppRoutes />
    </CoverProvider>
  )
}
