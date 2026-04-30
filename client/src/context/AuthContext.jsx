import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/apiClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("idcard_token") || "");
  const [admin, setAdmin] = useState(() => {
    const raw = localStorage.getItem("idcard_admin");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .get("/auth/me")
      .then((res) => setAdmin(res.data.admin))
      .catch(() => {
        localStorage.removeItem("idcard_token");
        localStorage.removeItem("idcard_admin");
        setToken("");
        setAdmin(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (payload) => {
    const res = await api.post("/auth/login", payload);
    localStorage.setItem("idcard_token", res.data.token);
    localStorage.setItem("idcard_admin", JSON.stringify(res.data.admin));
    setToken(res.data.token);
    setAdmin(res.data.admin);
  };

  const logout = () => {
    localStorage.removeItem("idcard_token");
    localStorage.removeItem("idcard_admin");
    setToken("");
    setAdmin(null);
  };

  const value = useMemo(
    () => ({
      token,
      admin,
      loading,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [admin, loading, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
