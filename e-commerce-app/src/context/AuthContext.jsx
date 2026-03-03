import React, { createContext, useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";

export const AuthContext = createContext();

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// ── helpers ──────────────────────────────────────────────
const getStoredTokens = () => {
  try {
    return {
      access: localStorage.getItem("access_token"),
      refresh: localStorage.getItem("refresh_token"),
    };
  } catch {
    return { access: null, refresh: null };
  }
};

const storeTokens = (access, refresh) => {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
};

const clearTokens = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

// Decode JWT payload (no library needed)
const decodeToken = (token) => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

const isTokenExpired = (token) => {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  return decoded.exp * 1000 < Date.now() - 30000; // 30s buffer
};

// ── provider ─────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ---- refresh access token ----
  const refreshAccessToken = useCallback(async () => {
    const { refresh } = getStoredTokens();
    if (!refresh) return null;

    try {
      const res = await fetch(`${API}/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!res.ok) {
        clearTokens();
        setUser(null);
        return null;
      }

      const data = await res.json();
      storeTokens(data.access, data.refresh || refresh);
      return data.access;
    } catch {
      clearTokens();
      setUser(null);
      return null;
    }
  }, []);

  // ---- get a valid access token (auto-refresh) ----
  const getAccessToken = useCallback(async () => {
    let { access } = getStoredTokens();
    if (access && !isTokenExpired(access)) return access;

    // try refresh
    access = await refreshAccessToken();
    return access;
  }, [refreshAccessToken]);

  // ---- fetch user profile ----
  const fetchProfile = useCallback(
    async (token) => {
      try {
        const res = await fetch(`${API}/auth/profile/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Profile fetch failed");

        const data = await res.json();
        setUser(data);
        return data;
      } catch {
        clearTokens();
        setUser(null);
        return null;
      }
    },
    []
  );

  // ---- initialise on mount ----
  useEffect(() => {
    const init = async () => {
      const token = await getAccessToken();
      if (token) {
        await fetchProfile(token);
      }
      setAuthLoading(false);
    };
    init();
  }, [getAccessToken, fetchProfile]);

  // ---- signup ----
  const signup = async (name, email, password, password2) => {
    try {
      const res = await fetch(`${API}/auth/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, password2 }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data.email?.[0] ||
          data.password?.[0] ||
          data.non_field_errors?.[0] ||
          "Signup failed!";
        toast.error(msg);
        return { success: false };
      }

      storeTokens(data.tokens.access, data.tokens.refresh);
      setUser(data.user);

      toast.success("Account Created Successfully!");
      return { success: true };
    } catch (err) {
      console.error("Signup error:", err);
      toast.error("Signup failed!");
      return { success: false };
    }
  };

  // ---- login ----
  const login = async (email, password) => {
    try {
      const res = await fetch(`${API}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        toast.error("Invalid Email or Password!");
        return { success: false };
      }

      const data = await res.json(); // { access, refresh }
      storeTokens(data.access, data.refresh);

      // Fetch profile to get user details + role
      const profile = await fetchProfile(data.access);

      if (!profile) {
        toast.error("Login failed!");
        return { success: false };
      }

      const isAdminUser = profile.role === "admin";

      toast.success(
        isAdminUser ? "Admin Logged In!" : "User Logged In Successfully!"
      );
      return { success: true, admin: isAdminUser };
    } catch (err) {
      console.error("Login error:", err);
      toast.error("Login failed!");
      return { success: false };
    }
  };

  // ---- logout ----
  const logout = async () => {
    const { refresh } = getStoredTokens();
    const token = await getAccessToken();

    if (token && refresh) {
      try {
        await fetch(`${API}/auth/logout/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refresh }),
        });
      } catch {
        // silent – still clear locally
      }
    }

    clearTokens();
    setUser(null);
    toast.success("Logged Out Successfully!");
  };

  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        signup,
        login,
        logout,
        isAdmin,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
