import { useAuth } from "../context/AuthContext";

const ROLE_PERMISSIONS = {
  admin: ["dashboard", "sensors", "flow", "alerts", "analytics", "settings"],
  operator: ["dashboard", "sensors", "flow", "alerts", "analytics", "settings"],
  viewer: ["dashboard", "sensors", "alerts", "analytics", "settings"],
};

export function hasPermission(role, permission) {
  if (!role) return true;
  return (ROLE_PERMISSIONS[role.toLowerCase()] || []).includes(permission);
}

export default function RoleBasedAccess({ permission, children, fallback = null }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.role, permission);

  return allowed ? children : fallback;
}
