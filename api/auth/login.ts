import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_lib/supabase'
import { corsHeaders } from '../_lib/constants'

const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key'
function generateJWT(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(200).end()
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })
    }

    const supabase = getSupabase()

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' })
    }

    // Get user profile
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (dbError) {
      return res.status(404).json({ error: 'Perfil de usuario no encontrado' })
    }

    const token = generateJWT(authData.user.id, email)

    return res.status(200).json({
      user: userData,
      token,
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return res.status(500).json({ error: 'Error en login' })
  }
}
