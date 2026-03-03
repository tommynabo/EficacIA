import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, clearToken, getToken } from '../lib/api';

interface User {
  id: string;
  email: string;
  name?: string;
  subscription_status: 'free' | 'pro' | 'enterprise';
  settings: Record<string, any>;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already logged in
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (token) {
        try {
          const userData = await api.getMe();
          setUser(userData);
        } catch (error) {
          console.error('Failed to get user:', error);
          clearToken();
        }
      }
      setIsLoading(false);
    }

    checkAuth();
  }, []);

  async function login(email: string, password: string) {
    try {
      const { user: userData, token } = await api.login(email, password);
      setToken(token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    }
  }

  async function register(email: string, password: string, name?: string) {
    try {
      const { user: userData, token } = await api.register(email, password, name);
      setToken(token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.message || 'Registration failed');
    }
  }

  function logout() {
    setUser(null);
    clearToken();
  }

  async function updateProfile(updates: Partial<User>) {
    try {
      const updated = await api.updateProfile(updates);
      setUser(updated);
    } catch (error: any) {
      throw new Error(error.message || 'Update failed');
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
