import {
  ArrowRight,
  CheckCircle,
  EnvelopeSimple,
  LockKey,
  SpinnerGap,
  User,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { BrandMark } from "../components/BrandMark";
import { signUp } from "../lib/api";

const MIN_PASSWORD_LENGTH = 8;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "We could not create your workspace. Please try again.";
}

export function SignupPage() {
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signUpMutation = useMutation({
    mutationFn: () => signUp({
      email: email.trim(),
      password,
      name: name.trim() || undefined,
      workspaceName: workspaceName.trim() || undefined,
    }),
    onSuccess: (session) => {
      queryClient.setQueryData(["session"], session);
      navigate("/documents", { replace: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || password.length < MIN_PASSWORD_LENGTH) return;
    signUpMutation.mutate();
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="signup-story-title">
        <div className="login-brand" aria-label="Pricing Desk">
          <BrandMark className="login-logo" />
          <strong>Pricing Desk</strong>
        </div>

        <div className="login-story-copy">
          <p className="login-kicker">A calmer commercial workflow</p>
          <h1 id="signup-story-title">Start every proposal from a sound number.</h1>
          <p>
            Create a private workspace for precise line pricing, immutable final records,
            and reports that keep currencies separate.
          </p>
        </div>

        <ul className="login-assurances" aria-label="Workspace safeguards">
          <li><CheckCircle size={20} weight="fill" aria-hidden="true" />Server-calculated totals</li>
          <li><CheckCircle size={20} weight="fill" aria-hidden="true" />Private document ownership</li>
          <li><CheckCircle size={20} weight="fill" aria-hidden="true" />Print-ready document previews</li>
        </ul>
      </section>

      <section className="login-panel" aria-labelledby="signup-title">
        <div className="login-form-wrap">
          <p className="ancillary-eyebrow">Create workspace</p>
          <h2 id="signup-title">Set up your desk</h2>
          <p className="login-intro">A name and workspace label are optional; your email and a password are required.</p>

          <form className="login-form" onSubmit={submit} noValidate>
            <label htmlFor="signup-name">Your name <small>Optional</small></label>
            <div className="login-input-wrap">
              <User size={20} aria-hidden="true" />
              <input id="signup-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <label htmlFor="signup-workspace">Workspace name <small>Optional</small></label>
            <div className="login-input-wrap">
              <User size={20} aria-hidden="true" />
              <input id="signup-workspace" name="workspaceName" autoComplete="organization" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
            </div>

            <label htmlFor="signup-email">Email address</label>
            <div className="login-input-wrap">
              <EnvelopeSimple size={20} aria-hidden="true" />
              <input id="signup-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required aria-invalid={signUpMutation.isError || undefined} />
            </div>

            <label htmlFor="signup-password">Password</label>
            <div className="login-input-wrap">
              <LockKey size={20} aria-hidden="true" />
              <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(event) => setPassword(event.target.value)} required aria-describedby="signup-password-hint" aria-invalid={signUpMutation.isError || undefined} />
            </div>
            <p className="login-field-hint" id="signup-password-hint">Use at least 8 characters.</p>

            {signUpMutation.isError ? <p className="ancillary-error-inline" role="alert">{errorMessage(signUpMutation.error)}</p> : null}

            <button className="ancillary-button ancillary-button-primary login-submit" type="submit" disabled={signUpMutation.isPending || !email.trim() || password.length < MIN_PASSWORD_LENGTH}>
              {signUpMutation.isPending ? <><SpinnerGap className="ancillary-spinner" size={20} aria-hidden="true" />Creating workspace…</> : <>
                Create workspace <ArrowRight size={20} aria-hidden="true" />
              </>}
            </button>
          </form>

          <div className="login-demo-note">
            <span>Already have an account?</span>
            <Link to="/login">Sign in instead</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
