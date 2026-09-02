/**
 * Settings.jsx — NexusFlow Settings Page
 *
 * Steps 6–9:
 * Step 6 — Profile section: name, email, role from AuthContext (not hardcoded)
 * Step 7 — Notification toggles: Alert Notifications, High Severity Alerts
 * Step 8 — Monitoring defaults: Default Sensor selector (from TelemetryContext)
 * Step 9 — Save Changes button with success/error feedback
 */

import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTelemetry } from "../context/TelemetryContext";
import api from "../services/api";

// ── Simple toggle component ────────────────────────────────────────────────────

function Toggle({ id, checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "#7c3aed" : "#e2e8f0",
        position: "relative",
        transition: "background 0.2s ease",
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute",
        top: 3, left: checked ? 23 : 3,
        width: 18, height: 18,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        transition: "left 0.2s ease",
        display: "block",
      }} />
    </button>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function SettingsSection({ title, description, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h3 className="settings-section-title">{title}</h3>
        {description && (
          <p className="settings-section-desc">{description}</p>
        )}
      </div>
      <div className="settings-section-body">
        {children}
      </div>
    </div>
  );
}

// ── Row inside a section ───────────────────────────────────────────────────────

function SettingsRow({ label, description, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {description && (
          <span className="settings-row-desc">{description}</span>
        )}
      </div>
      <div className="settings-row-control">
        {children}
      </div>
    </div>
  );
}

// ── Read-only field ────────────────────────────────────────────────────────────

function ReadOnlyField({ value }) {
  return (
    <div className="settings-readonly-field">
      {value || <span style={{ color: "#94a3b8" }}>—</span>}
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const colors = {
    admin:    { bg: "#fef3c7", color: "#b45309", border: "#fde68a" },
    operator: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    viewer:   { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  };
  const c = colors[role?.toLowerCase()] || { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };

  return (
    <span style={{
      fontSize: 11, fontWeight: 800, padding: "3px 10px",
      borderRadius: 20, textTransform: "capitalize",
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {role || "—"}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useAuth();
  const { sensorIds } = useTelemetry();

  // Step 7 — Notification preferences (frontend state; extend to API when ready)
  const [alertNotifications, setAlertNotifications] = useState(true);
  const [highSeverityOnly,   setHighSeverityOnly]   = useState(false);

  // Step 8 & 9 — Monitoring defaults
  const [defaultSensor, setDefaultSensor] = useState(sensorIds[0] || "TURBINE-001");
  const [telemetryInterval, setTelemetryInterval] = useState("5s");

  // Step 10 — Save state
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'success' | 'error'

  // Keep defaultSensor in sync when sensorIds load
  useEffect(() => {
    if (sensorIds.length > 0 && !sensorIds.includes(defaultSensor)) {
      setDefaultSensor(sensorIds[0]);
    }
  }, [sensorIds, defaultSensor]);

  // Step 10 — Save handler
  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      // Prepare settings payload
      const settingsPayload = {
        alertNotifications,
        highSeverityOnly,
        defaultSensor,
        telemetryInterval,
      };

      // Persist to localStorage so the preference survives a refresh
      localStorage.setItem("nx_settings", JSON.stringify(settingsPayload));

      // Try to save to backend (if user preferences endpoint exists)
      try {
        await api.put('/api/users/preferences', settingsPayload);
      } catch (apiError) {
        console.warn('[Settings] Backend preferences API not available, using localStorage only:', apiError.message);
      }

      // Simulate short async operation for UI feedback
      await new Promise((r) => setTimeout(r, 600));
      
      setSaveStatus("success");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('[Settings] Error saving settings:', error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // Load persisted preferences on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nx_settings") || "{}");
      if (typeof saved.alertNotifications === "boolean") setAlertNotifications(saved.alertNotifications);
      if (typeof saved.highSeverityOnly   === "boolean") setHighSeverityOnly(saved.highSeverityOnly);
      if (saved.defaultSensor)                           setDefaultSensor(saved.defaultSensor);
      if (saved.telemetryInterval)                       setTelemetryInterval(saved.telemetryInterval);
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="settings-page">

      {/* ── HEADER ── */}
      <div className="settings-header">
        <div>
          <span className="eyebrow">NexusFlow</span>
          <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(22px, 2.5vw, 30px)", letterSpacing: "-0.03em" }}>
            Settings
          </h1>
          <p style={{ margin: 0, color: "#778296", fontSize: 13 }}>
            Manage your profile, notifications, and monitoring preferences.
          </p>
        </div>
      </div>

      <div className="settings-body">

        {/* ── Step 6: Profile ── */}
        <SettingsSection
          title="Profile"
          description="Your account information from the authentication server."
        >
          <SettingsRow label="Name">
            <ReadOnlyField value={user?.name} />
          </SettingsRow>

          <SettingsRow label="Email">
            <ReadOnlyField value={user?.email} />
          </SettingsRow>

          <SettingsRow label="Role">
            <RoleBadge role={user?.role} />
          </SettingsRow>
        </SettingsSection>

        {/* ── Step 7: Notifications ── */}
        <SettingsSection
          title="Notifications"
          description="Control which alerts trigger real-time notifications."
        >
          <SettingsRow
            label="Alert Notifications"
            description="Show a toast notification whenever a rule is triggered."
          >
            <Toggle
              id="toggle-alert-notif"
              checked={alertNotifications}
              onChange={setAlertNotifications}
            />
          </SettingsRow>

          <SettingsRow
            label="High Severity Alerts Only"
            description="Only show notifications for HIGH and CRITICAL severity alerts."
          >
            <Toggle
              id="toggle-high-only"
              checked={highSeverityOnly}
              onChange={setHighSeverityOnly}
              disabled={!alertNotifications}
            />
          </SettingsRow>
        </SettingsSection>

        {/* ── Step 8: Monitoring ── */}
        <SettingsSection
          title="Monitoring Settings"
          description="Configure default sensor and telemetry refresh rate."
        >
          <SettingsRow
            label="Default Sensor"
            description="This sensor is selected automatically when you open the Dashboard."
          >
            <select
              className="range-select settings-select"
              value={defaultSensor}
              onChange={(e) => setDefaultSensor(e.target.value)}
            >
              {sensorIds.length > 0 ? (
                sensorIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))
              ) : (
                <option value="TURBINE-001">TURBINE-001</option>
              )}
            </select>
          </SettingsRow>

          <SettingsRow
            label="Telemetry Update Interval"
            description="Frequency of simulated or polled sensor data refreshes."
          >
            <select
              className="range-select settings-select"
              value={telemetryInterval}
              onChange={(e) => setTelemetryInterval(e.target.value)}
            >
              <option value="1s">1 second</option>
              <option value="2s">2 seconds</option>
              <option value="5s">5 seconds</option>
              <option value="10s">10 seconds</option>
            </select>
          </SettingsRow>
        </SettingsSection>

        {/* ── Step 10: Save Changes ── */}
        <div className="settings-save-row">
          {saveStatus === "success" && (
            <span className="settings-save-feedback success">
              ✓ Settings saved successfully
            </span>
          )}
          {saveStatus === "error" && (
            <span className="settings-save-feedback error">
              Unable to save settings. Please try again.
            </span>
          )}

          <button
            type="button"
            className="settings-save-btn"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
          >
            {saveStatus === "saving" ? "Saving…" : "Save Changes"}
          </button>
        </div>

      </div>
    </div>
  );
}
