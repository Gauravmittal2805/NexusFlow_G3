/**
 * AlertFilters.jsx — NexusFlow Alerts Filter & Search Bar
 *
 * Implements:
 * - Step 3: Severity Filter (All, High, Medium, Low)
 * - Step 4: Status Filter (All, Read, Unread)
 * - Step 5: Sensor Filter (All Sensors, TURBINE-001, ...)
 * - Step 6: Search Box (Search alerts...)
 */

import React from "react";

export default function AlertFilters({
  searchTerm,
  onSearchChange,
  severityFilter,
  onSeverityChange,
  statusFilter,
  onStatusChange,
  sensorFilter,
  onSensorChange,
  availableSensors = [],
  onResetFilters,
  hasActiveFilters,
  counts = {},
}) {
  return (
    <div className="alert-filters-card">
      {/* Search Box (Step 6) */}
      <div className="filter-search-row">
        <div className="filter-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="filter-search-input"
            placeholder="Search alerts by rule, sensor, or message..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="btn-clear-input"
              onClick={() => onSearchChange("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className="btn-reset-all-filters"
            onClick={onResetFilters}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Dropdown Filters Grid */}
      <div className="filter-controls-row">
        {/* Severity Filter (Step 3) */}
        <div className="filter-group">
          <label className="filter-label">Severity</label>
          <select
            className="filter-select"
            value={severityFilter}
            onChange={(e) => onSeverityChange(e.target.value)}
          >
            <option value="All">All Severities ({counts.total || 0})</option>
            <option value="HIGH">🔴 High ({counts.high || 0})</option>
            <option value="MEDIUM">🟡 Medium ({counts.medium || 0})</option>
            <option value="LOW">🟢 Low ({counts.low || 0})</option>
          </select>
        </div>

        {/* Status Filter (Step 4) */}
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="All">All Statuses ({counts.total || 0})</option>
            <option value="unread">● Unread ({counts.unread || 0})</option>
            <option value="read">✓ Read ({counts.read || 0})</option>
          </select>
        </div>

        {/* Sensor Filter (Step 5) */}
        <div className="filter-group">
          <label className="filter-label">Sensor</label>
          <select
            className="filter-select"
            value={sensorFilter}
            onChange={(e) => onSensorChange(e.target.value)}
          >
            <option value="All">All Sensors</option>
            {availableSensors.map((sensorId) => (
              <option key={sensorId} value={sensorId}>
                {sensorId}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
