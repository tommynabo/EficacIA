import { Router, Request, Response } from 'express';
import { AuthService } from '../services/index.js';
import { generateJWT } from '../lib/utils.js';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const result = await AuthService.registerUser(email, password, name);

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

    const { name, settings } = req.body;
    const updates: any = {};

    if (name) updates.name = name;
    if (settings) updates.settings = settings;

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
