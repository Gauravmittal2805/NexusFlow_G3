import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { getProfile, loginUser, registerUser } from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("");

  const clearAuth = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setSessionMessage("");
    navigate("/login", { replace: true });
  }, [clearAuth, navigate]);

  const refreshProfile = useCallback(async () => {
    const response = await getProfile();
    const profileUser = response.data?.user || null;
    setUser(profileUser);
    return profileUser;
  }, []);

  const login = useCallback(
    async (email, password) => {
      const response = await loginUser({ email, password });
      const receivedToken = response.data?.token;

      if (!receivedToken) {
        throw new Error("Login succeeded but no token was returned.");
      }

      localStorage.setItem("token", receivedToken);
      setToken(receivedToken);
      setSessionMessage("");

      // Always fetch the profile so role/user data comes from the backend.
      const loggedInUser = await refreshProfile();

      navigate("/dashboard", { replace: true });
      return loggedInUser;
    },
    [navigate, refreshProfile]
  );

  const register = useCallback(async (name, email, password) => {
    const response = await registerUser({ name, email, password });
    return response.data;
  }, []);

  // Day 2: restore the authenticated session after a browser refresh.
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const storedToken = localStorage.getItem("token");

      if (!storedToken) {
        if (mounted) {
          setToken(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      setToken(storedToken);

      try {
        await refreshProfile();
      } catch (error) {
        if (error.response?.status === 401) {
          clearAuth();
        } else {
          // If the server is unavailable, don't keep a broken session.
          clearAuth();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restoreSession();

    return () => {
      mounted = false;
    };
  }, [clearAuth, refreshProfile]);

  // Day 2: central 401 handling for protected API requests.
  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          clearAuth();
          setSessionMessage("Session expired. Please login again.");

          if (window.location.pathname !== "/login") {
            navigate("/login", {
              replace: true,
              state: { sessionExpired: true },
            });
          }
        }

        return Promise.reject(error);
      }
    );

    return () => api.interceptors.response.eject(interceptorId);
  }, [clearAuth, navigate]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      sessionMessage,
      setSessionMessage,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [
      user,
      token,
      loading,
      sessionMessage,
      login,
      register,
      logout,
      refreshProfile,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
