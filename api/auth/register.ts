import type { VercelRequest, VercelResponse } from '@vercel/node'
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin, getSupabase } from '../_lib/supabase'
import { generateJWT, corsHeaders } from '../_lib/utils'

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
    const { email, password, name, fullName, stripeCustomerId, stripeSubscriptionId, plan } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const supabase = getSupabase()
    const userName = fullName || name || email.split('@')[0]

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      throw new Error(`Auth error: ${authError.message}`)
    }

    const userId = authData.user.id

    // Create user profile
    const insertData: any = {
      id: userId,
      email,
      name: userName,
      subscription_status: 'free',
      settings: {},
    }

    // If coming from Stripe checkout, link subscription
    if (stripeCustomerId && stripeSubscriptionId) {
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 7)

      insertData.stripe_customer_id = stripeCustomerId
      insertData.stripe_subscription_id = stripeSubscriptionId
      insertData.subscription_plan = plan || 'starter'
      insertData.subscription_status = 'trial'
      insertData.trial_ends_at = trialEndsAt.toISOString()
    }

    const { data: userData, error: dbError } = await supabase
      .from('users')
      .insert(insertData)
      .select()
      .single()

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`)
    }

    const token = generateJWT(userId, email)

    return res.status(200).json({
      user: userData,
      token,
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    return res.status(400).json({
      error: error.message || 'Error en registro',
    })
  }
}
