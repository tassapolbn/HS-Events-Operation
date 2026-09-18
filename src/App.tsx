import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CampusProvider } from './contexts/CampusContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './i18n';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui/Spinner';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { UsersPage } from './pages/UsersPage';
import { DashboardPage } from './pages/DashboardPage';
import { EventsPage } from './pages/EventsPage';
import { EventFormPage } from './pages/EventFormPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { RequestsPage } from './pages/RequestsPage';
import { RequestFormPage } from './pages/RequestFormPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { CalendarPage } from './pages/CalendarPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { MyDepartmentPage } from './pages/MyDepartmentPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DisplayBoardPage } from './pages/DisplayBoardPage';
import { DisplayPickerPage } from './pages/DisplayPickerPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true
    }
  }
});

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const { isAdmin, loading, profile } = useAuth();
  if (loading || !profile) return <Spinner />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireEventsTeam() {
  const { isEventsTeam, loading, profile } = useAuth();
  if (loading || !profile) return <Spinner />;
  if (!isEventsTeam) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <CampusProvider>
            <ToastProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  {/* Where a password reset link lands. No sign in required: the
                      link itself carries a one-off recovery session. */}
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  {/* Public display board: no sign in required. One board, per-campus links. */}
                  <Route path="/display" element={<DisplayPickerPage />} />
                  <Route path="/display/hsc" element={<DisplayBoardPage campus="HSC" />} />
                  <Route path="/display/hsn" element={<DisplayBoardPage campus="HSN" />} />
                  {/* Legacy links keep working */}
                  <Route path="/display/events" element={<Navigate to="/display" replace />} />
                  <Route path="/display/requests" element={<Navigate to="/display" replace />} />
                  <Route element={<RequireAuth />}>
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<DashboardPage />} />
                      <Route element={<RequireAdmin />}>
                        <Route path="/users" element={<UsersPage />} />
                      </Route>
                      <Route path="/events" element={<EventsPage />} />
                      <Route path="/events/:id" element={<EventDetailPage />} />
                      <Route path="/requests" element={<RequestsPage />} />
                      <Route path="/requests/:id" element={<RequestDetailPage />} />
                      <Route path="/calendar" element={<CalendarPage />} />
                      <Route path="/my-department" element={<MyDepartmentPage />} />
                      <Route element={<RequireEventsTeam />}>
                        <Route path="/events/new" element={<EventFormPage />} />
                        <Route path="/events/:id/edit" element={<EventFormPage />} />
                        <Route path="/requests/new" element={<RequestFormPage />} />
                        <Route path="/requests/:id/edit" element={<RequestFormPage />} />
                        <Route path="/templates" element={<TemplatesPage />} />
                      </Route>
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Route>
                </Routes>
              </BrowserRouter>
            </ToastProvider>
            </CampusProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
