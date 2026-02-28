import React, { createContext, useEffect, useState } from "react";
import { toast } from "react-toastify";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // NEW: prevents logout on refresh

  // Load user from localStorage on refresh
  useEffect(() => {
    try {
      const savedUser = JSON.parse(localStorage.getItem("currentUser"));
      if (savedUser) {
        setUser(savedUser);
      }
    } catch (err) {
      console.error("Failed to parse saved user", err);
    }
    setAuthLoading(false); // FINISHED LOADING
  }, []);

  // Save user whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem("currentUser", JSON.stringify(user));
    } else {
      localStorage.removeItem("currentUser");
    }
  }, [user]);

  // ---------------- SIGNUP ----------------
  const signup = async (name, email, password) => {
    try {
      const existing = await fetch(
        `http://localhost:3001/users?email=${email}`
      ).then(res => res.json());

      if (existing.length > 0) {
        toast.error("Email already exists!");
        return { success: false };
      }

      const newUser = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        email,
        password,
        role: "user",
        isAdmin: false,
        createdAt: new Date().toISOString(),
      };

      const response = await fetch("http://localhost:3001/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });

      const savedUser = await response.json();
      setUser(savedUser);

      toast.success("Account Created Successfully!");
      return { success: true };
    } catch (err) {
      console.error("Signup error:", err);
      toast.error("Signup failed!");
      return { success: false };
    }
  };

  // ---------------- LOGIN ----------------
  const login = async (email, password) => {
    try {
      // Check Admin Login
      const admin = await fetch(
        `http://localhost:3001/admin?email=${email}&password=${password}`
      ).then(res => res.json());

      if (admin.length > 0) {
        const adminUser = { ...admin[0], role: "admin", isAdmin: true };
        setUser(adminUser);
        toast.success("Admin Logged In!");
        return { success: true, admin: true };
      }

      // Check Normal Users
      const users = await fetch(
        `http://localhost:3001/users?email=${email}&password=${password}`
      ).then(res => res.json());

      if (users.length === 0) {
        toast.error("Invalid Email or Password!");
        return { success: false };
      }

      const loggedUser = { ...users[0], role: "user", isAdmin: false };
      setUser(loggedUser);

      toast.success("User Logged In Successfully!");
      return { success: true, admin: false };
    } catch (err) {
      console.error("Login error:", err);
      toast.error("Login failed!");
      return { success: false };
    }
  };

  // ---------------- LOGOUT ----------------
  const logout = () => {
    setUser(null);
    toast.success("Logged Out Successfully!");
  };

  const isAdmin = user?.role === "admin" || user?.isAdmin === true;

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        signup,
        login,
        logout,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
