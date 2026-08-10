import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { getSession } from "./lib/api";

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const DocumentsPage = lazy(() =>
  import("./pages/DocumentsPage").then((module) => ({ default: module.DocumentsPage })),
);
const DocumentEditorPage = lazy(() =>
  import("./pages/DocumentEditorPage").then((module) => ({ default: module.DocumentEditorPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })),
);

function LoadingScreen() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="loading-mark">PD</span>
      <p>Opening Pricing Desk…</p>
    </div>
  );
}

function ProtectedRoutes() {
  const location = useLocation();
  const session = useQuery({ queryKey: ["session"], queryFn: getSession, retry: false });

  if (session.isLoading) return <LoadingScreen />;
  if (!session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <AppShell user={session.data.user} />;
}

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<Navigate to="/documents/sample-draft" replace />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:documentId" element={<DocumentEditorPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
