import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { generateJWT } from '../lib/utils.js';
import { User } from '../types/index.js';

export class AuthService {
  static async registerUser(email: string, password: string, name?: string): Promise<{ user: User; token: string }> {
    try {
      // Use Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        throw new Error(`Auth error: ${authError.message}`);
      }

      const userId = authData.user.id;

      // Create user profile in database
      const { data: userData, error: dbError } = await (supabase
        .from('users')
        .insert({
          id: userId,
          email,
          name: name || email.split('@')[0],
          subscription_status: 'free',
          settings: {},
        }) as any)
        .select()
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      const token = generateJWT(userId, email);

      return {
        user: userData as User,
        token,
      };
    } catch (error: any) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  static async loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(`Login failed: ${authError.message}`);
      }

      const { data: userData, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      const token = generateJWT(authData.user.id, email);

      return {
        user: userData as User,
        token,
      };
    } catch (error: any) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  static async getUserById(userId: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        return null;
      }

      return data as User;
    } catch (error) {
      return null;
    }
  }

  static async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    try {
      const { data, error } = await (supabase
        .from('users')
        .update(updates as any)
        .eq('id', userId)
        .select()
        .single() as any);

      if (error) {
        throw new Error(error.message);
      }

      return data as User;
    } catch (error: any) {
      throw new Error(`Update failed: ${error.message}`);
    }
  }
}
