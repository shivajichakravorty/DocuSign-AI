import React, { useState, useEffect } from "react";
import { apiClient } from "../api/client";
import type { User } from "../types/auth";
import { AuthContext } from "./auth-context-instance";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await apiClient.get("/auth/me");
        const dbUser = response.data.user;
        setUser({
          id: dbUser.id,
          email: dbUser.email,
          fullName: dbUser.full_name || dbUser.fullName,
          role: dbUser.role,
        });
      } catch {
        localStorage.removeItem("token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiClient.post("/auth/login", { email, password });
    const { token, user: loggedInUser } = response.data;
    localStorage.setItem("token", token);
    setUser(loggedInUser);
  };

  const register = async (
    fullName: string,
    email: string,
    password: string,
  ) => {
    await apiClient.post("/auth/register", { fullName, email, password });
    await login(email, password);
  };

  const logout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      localStorage.removeItem("token");
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
