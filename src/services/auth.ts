/**
 * Auth Service - Maneja todas las llamadas a auth API
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  subscription_plan: string
  subscription_status: string
}

export interface AuthResponse {
  user: User
  token: string
  supabaseToken?: string
  message: string
}

class AuthService {
  /**
   * Sign Up - Crea una nueva cuenta
   */
  static async signup(email: string, password: string, fullName: string): Promise<AuthResponse> {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Error en registro')
    }

    const data = await res.json()

    // Guarda el token en localStorage
    if (data.token) {
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
    }

    return data
  }

  /**
   * Login - Inicia sesión
   */
  static async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Error en login')
    }

    const data = await res.json()

    // Guarda el token en localStorage
    if (data.token) {
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
    }

    return data
  }

  /**
   * Get Current User
   */
  static async getCurrentUser(): Promise<User | null> {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return null

      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user')
        return null
      }

      const user = await res.json()
      localStorage.setItem('user', JSON.stringify(user))
      return user
    } catch (error) {
      console.error('Error fetching current user:', error)
      return null
    }
  }

  /**
   * Logout - Cierra la sesión
   */
  static logout() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
  }

  /**
   * Get Auth Token
   */
  static getToken(): string | null {
    return localStorage.getItem('auth_token')
  }

  /**
   * Get User from Local Storage
   */
  static getUserFromStorage(): User | null {
    try {
      const user = localStorage.getItem('user')
      return user ? JSON.parse(user) : null
    } catch {
      return null
    }
  }

  /**
   * Create Team
   */
  static async createTeam(name: string, description?: string) {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error('No autenticado')

    const res = await fetch(`${API_URL}/api/auth/create-team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, description }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Error crear equipo')
    }

    return res.json()
  }

  /**
   * Get Teams
   */
  static async getTeams() {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error('No autenticado')

    const res = await fetch(`${API_URL}/api/auth/teams`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      throw new Error('Error obteniendo equipos')
    }

    return res.json()
  }

  /**
   * Is Authenticated
   */
  static isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token')
  }
}

export default AuthService
