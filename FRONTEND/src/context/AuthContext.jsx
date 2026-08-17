import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import api, {
  loginRequest,
  profileRequest,
  registerRequest,
} from "../services/api";

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
    navigate("/login", { replace: true });
  }, [clearAuth, navigate]);

  const login = useCallback(
    async (email, password) => {
      const response = await loginRequest({ email, password });
      const receivedToken = response.data?.token;

      if (!receivedToken) {
        throw new Error("Login succeeded but no token was returned.");
      }

      localStorage.setItem("token", receivedToken);
      setToken(receivedToken);

      // Use the profile endpoint after login so the frontend is using
      // the same authenticated user information as the backend.
      const profileResponse = await profileRequest();
      const loggedInUser = profileResponse.data?.user;

      setUser(loggedInUser || response.data?.user || null);
      setSessionMessage("");

      navigate("/dashboard", { replace: true });

      return loggedInUser || response.data?.user;
    },
    [navigate]
  );

  const register = useCallback(async (name, email, password) => {
    const response = await registerRequest({ name, email, password });
    return response.data;
  }, []);

  const refreshProfile = useCallback(async () => {
    const response = await profileRequest();
    const profileUser = response.data?.user;
    setUser(profileUser || null);
    return profileUser;
  }, []);

  // Restore the session after a browser refresh.
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const storedToken = localStorage.getItem("token");

      if (!storedToken) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        if (mounted) setToken(storedToken);
        await refreshProfile();
      } catch (error) {
        if (error.response?.status === 401) {
          clearAuth();
        } else {
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

  // Handle any protected API request that becomes unauthorized.
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

    return () => {
      api.interceptors.response.eject(interceptorId);
    };
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
