import { Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import FlowBuilder from "./pages/FlowBuilder";

const Placeholder = ({ title }) => (
  <div className="placeholder-page">
    <div>
      <span className="eyebrow">NexusFlow</span>
      <h1>{title}</h1>
      <p>This page is scaffolded for the next project phase.</p>
    </div>
  </div>
);

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sensors" element={<Placeholder title="Sensors" />} />
        <Route path="/flow" element={<FlowBuilder />} />
        <Route path="/alerts" element={<Placeholder title="Alerts" />} />
        <Route path="/analytics" element={<Placeholder title="Analytics" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}