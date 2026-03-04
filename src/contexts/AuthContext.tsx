import React, { createContext, useContext, useState, useEffect } from 'react'
import AuthService, { User } from '../services/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Verifica si hay usuario al montar
  useEffect(() => {
    const initAuth = async () => {
      try {
        const currentUser = await AuthService.getCurrentUser()
        if (currentUser) {
          setUser(currentUser)
        } else {
          // Intenta cargar del localStorage si está disponible
          const storedUser = AuthService.getUserFromStorage()
          setUser(storedUser)
        }
      } catch (error) {
        console.error('Auth init error:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const response = await AuthService.login(email, password)
      setUser(response.user)
    } finally {
      setLoading(false)
    }
  }

  const signup = async (email: string, password: string, fullName: string) => {
    setLoading(true)
    try {
      const response = await AuthService.signup(email, password, fullName)
      setUser(response.user)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    AuthService.logout()
    setUser(null)
  }

  const value: AuthContextType = {
    user,
    loading,
    isLoading: loading,
    isAuthenticated: !!user,
    login,
    signup,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
