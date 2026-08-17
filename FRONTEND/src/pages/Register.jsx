import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
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
        form.password
      );

      navigate("/login", {
        replace: true,
        state: { registered: true },
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
              placeholder="Create a password"
              value={form.password}
              onChange={updateField}
              autoComplete="new-password"
            />
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}

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
