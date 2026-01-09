/**
 * Main App Component
 * Handles routing and layout
 */

import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "@/store/auth";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { Dashboard } from "@/pages/Dashboard";
import { WorkflowDetail } from "@/pages/WorkflowDetail";
import { WorkflowReview } from "@/pages/WorkflowReview";
import { LibraryView } from "@/pages/LibraryView";
import { TeamView } from "@/pages/TeamView";
import { HealthView } from "@/pages/HealthView";
import { InvitePage } from "@/pages/InvitePage";

// Settings pages with nested routes
import { SettingsLayout } from "@/pages/settings/SettingsLayout";
import { ProfileSettings } from "@/pages/settings/ProfileSettings";
import { CompanySettings } from "@/pages/settings/CompanySettings";
import { IntegrationSettings } from "@/pages/settings/IntegrationSettings";
import { PreferencesSettings } from "@/pages/settings/PreferencesSettings";

function App() {
  const { checkAuth } = useAuthStore();

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 5000,
          style: {
            background: "#363636",
            color: "#fff",
          },
          success: {
            style: {
              background: "#10B981",
            },
            iconTheme: {
              primary: "#fff",
              secondary: "#10B981",
            },
          },
          error: {
            style: {
              background: "#EF4444",
            },
            duration: 6000,
          },
        }}
      />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/invite/:token" element={<InvitePage />} />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <WorkflowDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows/:id/review"
            element={
              <ProtectedRoute>
                <Layout>
                  <WorkflowReview />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <Layout>
                  <LibraryView />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/team"
            element={
              <ProtectedRoute>
                <Layout>
                  <TeamView />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/health"
            element={
              <ProtectedRoute>
                <Layout>
                  <HealthView />
                </Layout>
              </ProtectedRoute>
            }
          />
          {/* Settings routes with nested layout */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <SettingsLayout />
                </Layout>
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={<Navigate to="/settings/profile" replace />}
            />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="company" element={<CompanySettings />} />
            <Route path="integrations" element={<IntegrationSettings />} />
            <Route path="preferences" element={<PreferencesSettings />} />
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* 404 fallback */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-gray-900">404</h1>
                  <p className="mt-2 text-gray-600">Page not found</p>
                </div>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
