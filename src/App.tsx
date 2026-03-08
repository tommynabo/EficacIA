import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import LandingPage from "./pages/landing"
import AuthPage from "./pages/auth"
import PricingPage from "./pages/pricing"
import { DashboardLayout } from "./components/layout"
import AccountsPage from "./pages/dashboard/accounts"
import CampaignsPage from "./pages/dashboard/campaigns"
import CampaignDetailPage from "./pages/dashboard/campaign-detail"
import LeadsPage from "./pages/dashboard/leads"
import UniboxPage from "./pages/dashboard/unibox"
import AnalyticsPage from "./pages/dashboard/analytics"
import SettingsPage from "./pages/dashboard/settings"
import LinkedInLivePage from "./pages/linkedin-live"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage mode="login" />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage mode="register" />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/linkedin-live" element={<LinkedInLivePage />} />
      
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AccountsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="unibox" element={<UniboxPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
