import {
  ArrowRight,
  CheckCircle,
  EnvelopeSimple,
  LockKey,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { getSession, signIn } from "../lib/api";

const DEMO_EMAIL = "avery@northstar.example";
const DEMO_PASSWORD = "pricing123";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "We could not sign you in. Please try again.";
}

export function LoginPage() {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const session = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    retry: false,
  });

  const signInMutation = useMutation({
    mutationFn: () => signIn(email.trim(), password),
    onSuccess: (nextSession) => {
      queryClient.setQueryData(["session"], nextSession);
      const requestedPath = (location.state as { from?: unknown } | null)?.from;
      const destination =
        typeof requestedPath === "string" &&
        requestedPath.startsWith("/") &&
        requestedPath !== "/login"
          ? requestedPath
          : "/documents";
      navigate(destination, { replace: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    signInMutation.mutate();
  }

  if (session.data) return <Navigate to="/documents" replace />;

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-story-title">
        <div className="login-brand" aria-label="Pricing Desk">
          <span aria-hidden="true">PD</span>
          <strong>Pricing Desk</strong>
        </div>

        <div className="login-story-copy">
          <p className="login-kicker">Quotes without guesswork</p>
          <h1 id="login-story-title">Pricing decisions, written clearly.</h1>
          <p>
            Build multi-rate pricing documents, inspect every calculation, and finalize
            a client-ready record from one calm workspace.
          </p>
        </div>

        <ul className="login-assurances" aria-label="Workspace benefits">
          <li>
            <CheckCircle size={20} weight="fill" aria-hidden="true" />
            Line-by-line tax and discount clarity
          </li>
          <li>
            <CheckCircle size={20} weight="fill" aria-hidden="true" />
            Immutable finalized documents
          </li>
          <li>
            <CheckCircle size={20} weight="fill" aria-hidden="true" />
            Inclusive date-range reporting
          </li>
        </ul>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <p className="ancillary-eyebrow">Welcome back</p>
          <h2 id="login-title">Sign in to your desk</h2>
          <p className="login-intro">The demo workspace is ready with sample documents.</p>

          <form className="login-form" onSubmit={submit} noValidate>
            <label htmlFor="login-email">Email address</label>
            <div className="login-input-wrap">
              <EnvelopeSimple size={20} aria-hidden="true" />
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                aria-invalid={signInMutation.isError || undefined}
              />
            </div>

            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrap">
              <LockKey size={20} aria-hidden="true" />
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                aria-invalid={signInMutation.isError || undefined}
              />
            </div>

            {signInMutation.isError ? (
              <p className="ancillary-error-inline" role="alert">
                {errorMessage(signInMutation.error)}
              </p>
            ) : null}

            <button
              className="ancillary-button ancillary-button-primary login-submit"
              type="submit"
              disabled={signInMutation.isPending || !email.trim() || !password}
            >
              {signInMutation.isPending ? (
                <>
                  <SpinnerGap className="ancillary-spinner" size={20} aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  Enter workspace
                  <ArrowRight size={20} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="login-demo-note">
            <span>Demo access</span>
            <code>{DEMO_EMAIL}</code>
            <small>Password is prefilled for this take-home experience.</small>
          </div>
        </div>
      </section>
    </main>
  );
}
