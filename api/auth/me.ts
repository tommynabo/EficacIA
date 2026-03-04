import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_lib/supabase'
import { verifyJWT, corsHeaders } from '../_lib/utils'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(200).end()
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = verifyJWT(token)

    if (!decoded) {
      return res.status(401).json({ error: 'Token inválido' })
    }

    const supabase = getSupabase()
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single()

    if (error || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    return res.status(200).json(user)
  } catch (error: any) {
    console.error('Get user error:', error)
    return res.status(500).json({ error: 'Error obteniendo usuario' })
  }
}
