import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOGIN_ROLES = [
  { id: "any", label: "Auto-detect", icon: "🌐", desc: "Log in with account's assigned role" },
  { id: "admin", label: "Admin", icon: "👑", desc: "Verify Admin permissions" },
  { id: "operator", label: "Operator", icon: "⚡", desc: "Verify Operator permissions" },
  { id: "viewer", label: "Viewer", icon: "👁️", desc: "Verify Viewer permissions" },
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, sessionMessage, setSessionMessage } = useAuth();

  const [form, setForm] = useState({
    email: location.state?.registeredEmail || "",
    password: "",
    role: location.state?.registeredRole || "any",
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setServerError("");
    setSessionMessage("");
  };

  const setRole = (role) => {
    setForm((current) => ({ ...current, role }));
    setServerError("");
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!emailPattern.test(form.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!form.password) {
      nextErrors.password = "Password is required.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");

    if (!validate()) return;

    try {
      setSubmitting(true);
      await login(form.email.trim(), form.password, form.role);
    } catch (error) {
      setServerError(
        error.response?.data?.message ||
          error.message ||
          "Unable to login. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const registeredMessage = location.state?.registered;
  const expiredMessage = location.state?.sessionExpired;

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="brand">
            <div className="brand-mark">N</div>
            <div>
              <strong>NexusFlow</strong>
              <span>IoT Rule Engine</span>
            </div>
          </div>

          <div className="auth-hero-copy">
            <span className="eyebrow">Factory Operations</span>
            <h1>Monitor your machines in real time.</h1>
            <p>
              Connect telemetry, monitor sensor health and manage your
              industrial workspace from one dashboard.
            </p>
          </div>
        </div>
      </div>

      <main className="auth-form-panel">
        <div className="auth-form-card">
          <span className="eyebrow">Welcome back</span>
          <h2>Sign in to NexusFlow</h2>
          <p className="auth-subtitle">
            Enter your credentials to access the dashboard.
          </p>

          {registeredMessage && (
            <div className="auth-success">
              Registration successful. Please login.
            </div>
          )}

          {(sessionMessage || expiredMessage) && (
            <div className="auth-error">
              {sessionMessage || "Session expired. Please login again."}
            </div>
          )}

          {serverError && <div className="auth-error">{serverError}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <label className="form-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className={`auth-input ${errors.email ? "input-error" : ""}`}
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={updateField}
              autoComplete="email"
            />
            {errors.email && <span className="field-error">{errors.email}</span>}

            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className={`auth-input ${errors.password ? "input-error" : ""}`}
              type="password"
              name="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={updateField}
              autoComplete="current-password"
            />
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}

            <div className="role-selection-group">
              <div className="role-label-row">
                <label className="form-label">Role Privilege</label>
                <span className="role-hint-pill">
                  {LOGIN_ROLES.find((r) => r.id === form.role)?.desc || "Role Filter"}
                </span>
              </div>
              <div className="login-role-tabs">
                {LOGIN_ROLES.map((r) => {
                  const isActive = form.role === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`login-role-tab ${isActive ? "active" : ""}`}
                      onClick={() => setRole(r.id)}
                      title={r.desc}
                    >
                      <span className="tab-icon">{r.icon}</span>
                      <span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account? <Link to="/register">Register</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
