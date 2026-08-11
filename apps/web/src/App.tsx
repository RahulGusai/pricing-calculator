import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { BrandMark } from "./components/BrandMark";
import { getSession, setSessionExpiredHandler } from "./lib/api";

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const SignupPage = lazy(() =>
  import("./pages/SignupPage").then((module) => ({ default: module.SignupPage })),
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
      <BrandMark className="loading-logo" />
      <p>Opening Pricing Desk…</p>
    </div>
  );
}

function ProtectedRoutes() {
  const location = useLocation();
  const session = useQuery({ queryKey: ["session"], queryFn: getSession, retry: false });

  if (session.isLoading) return <LoadingScreen />;
  if (session.isError) {
    return (
      <section className="route-error" role="alert">
        <h1>We couldn’t restore your session</h1>
        <p>{session.error instanceof Error ? session.error.message : "Try again."}</p>
        <button className="button secondary" type="button" onClick={() => void session.refetch()}>
          Try again
        </button>
      </section>
    );
  }
  if (!session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <AppShell user={session.data.user} />;
}

function SessionExpiryBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.clear();
      navigate("/login", { replace: true, state: { from: location.pathname } });
    });
    return () => setSessionExpiredHandler(null);
  }, [location.pathname, navigate, queryClient]);

  return null;
}

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SessionExpiryBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:documentId" element={<DocumentEditorPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
