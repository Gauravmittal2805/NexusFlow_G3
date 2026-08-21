import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES = [
  {
    id: "admin",
    label: "Admin",
    badge: "👑 Admin",
    desc: "Full administrative access (Rules, Sensors, Analytics, Settings)",
  },
  {
    id: "operator",
    label: "Operator",
    badge: "⚡ Operator",
    desc: "Build rules, monitor sensors & control actions",
  },
  {
    id: "viewer",
    label: "Viewer",
    badge: "👁️ Viewer",
    desc: "Read-only access to live dashboards & alerts",
  },
];

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "operator",
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setServerError("");
  };

  const setRole = (role) => {
    setForm((current) => ({ ...current, role }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Name is required.";
    }

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!emailPattern.test(form.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!form.password) {
      nextErrors.password = "Password is required.";
    } else if (form.password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }

    if (!form.role) {
      nextErrors.role = "Please select a role.";
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

      await register(
        form.name.trim(),
        form.email.trim(),
        form.password,
        form.role
      );

      navigate("/login", {
        replace: true,
        state: { registered: true, registeredEmail: form.email.trim(), registeredRole: form.role },
      });
    } catch (error) {
      setServerError(
        error.response?.data?.message ||
          error.message ||
          "Unable to register. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

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
            <span className="eyebrow">New workspace</span>
            <h1>Start monitoring your factory.</h1>
            <p>
              Create your NexusFlow account and continue to the live telemetry
              dashboard.
            </p>
          </div>
        </div>
      </div>

      <main className="auth-form-panel">
        <div className="auth-form-card">
          <span className="eyebrow">Create account</span>
          <h2>Register for NexusFlow</h2>
          <p className="auth-subtitle">
            Enter your details to create your account.
          </p>

          {serverError && <div className="auth-error">{serverError}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <label className="form-label" htmlFor="register-name">
              Name
            </label>
            <input
              id="register-name"
              className={`auth-input ${errors.name ? "input-error" : ""}`}
              type="text"
              name="name"
              placeholder="Your name"
              value={form.name}
              onChange={updateField}
              autoComplete="name"
            />
            {errors.name && <span className="field-error">{errors.name}</span>}

            <label className="form-label" htmlFor="register-email">
              Email
            </label>
            <input
              id="register-email"
              className={`auth-input ${errors.email ? "input-error" : ""}`}
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={updateField}
              autoComplete="email"
            />
            {errors.email && <span className="field-error">{errors.email}</span>}

            <label className="form-label" htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              className={`auth-input ${errors.password ? "input-error" : ""}`}
              type="password"
              name="password"
              placeholder="Create a password (min 6 characters)"
              value={form.password}
              onChange={updateField}
              autoComplete="new-password"
            />
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}

            <div className="role-selection-group">
              <label className="form-label">Select Workspace Role</label>
              <div className="role-options-grid">
                {ROLES.map((r) => {
                  const isSelected = form.role === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`role-option-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setRole(r.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setRole(r.id)}
                    >
                      <div className="role-option-header">
                        <span className="role-badge">{r.badge}</span>
                        <span className={`role-radio-dot ${isSelected ? "checked" : ""}`} />
                      </div>
                      <span className="role-option-desc">{r.desc}</span>
                    </div>
                  );
                })}
              </div>
              {errors.role && <span className="field-error">{errors.role}</span>}
            </div>

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
