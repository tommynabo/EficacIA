import { Router, Request, Response } from 'express';
import { AuthService } from '../services/index.js';
import { generateJWT } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, fullName, stripeCustomerId, stripeSubscriptionId, plan } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const userName = fullName || name;
    const result = await AuthService.registerUser(email, password, userName);

    // Si viene con datos de Stripe (flujo trial-first), vincula la suscripción
    if (stripeCustomerId && stripeSubscriptionId) {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      await supabase.from('users').update({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        subscription_plan: plan || 'starter',
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
      }).eq('id', result.user.id);

      // Actualiza el objeto user para la respuesta
      result.user.subscription_plan = plan || 'starter';
      result.user.subscription_status = 'trial';
    }

    res.json({
      user: result.user,
      token: result.token,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({
      error: error.message || 'Registration failed',
    });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const result = await AuthService.loginUser(email, password);

    res.json({
      user: result.user,
      token: result.token,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(401).json({
      error: 'Invalid email or password',
    });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await AuthService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user information',
    });
  }
});

// Update user
router.put('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { name, settings, ai_prompt_sequence, ai_prompt_unibox } = req.body;
    const updates: any = {};

    if (name) updates.name = name;
    if (settings) updates.settings = settings;
    if (ai_prompt_sequence !== undefined) updates.ai_prompt_sequence = ai_prompt_sequence;
    if (ai_prompt_unibox !== undefined) updates.ai_prompt_unibox = ai_prompt_unibox;

    const user = await AuthService.updateUser(userId, updates);

    res.json(user);
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'Failed to update user',
    });
  }
});

export default router;
