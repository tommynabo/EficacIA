import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import { config } from './config/index.js';
import { initSupabase, supabase } from './lib/supabase.js';
import { initSupabase } from './lib/supabase.js';
import { initRedis } from './lib/redis.js';
import { authMiddleware, errorHandler, notFoundHandler } from './middleware/index.js';
import { initQueues } from './services/queue.service.js';
import { initWorkers } from './workers/index.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import linkedInRoutes from './routes/linkedin.routes.js';
import leadsRoutes from './routes/leads.routes.js';
import paymentsRoutes from './routes/payments.routes.js';

const app: Express = express();

// CORS must be early
app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
}));

// Stripe webhook needs raw body - must come BEFORE JSON parser
const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
const rawBodyParser = express.raw({ type: 'application/json' });

app.post('/api/payments/stripe-webhook', rawBodyParser, async (req: any, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const body = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);

  try {
    const event = stripe.webhooks.constructEvent(body, sig, config.STRIPE_WEBHOOK_SECRET);
    console.log(`✓ Webhook received: ${event.type}`);

    // Handle different Stripe events
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (userId) {
          let status = 'active';
          if (subscription.status === 'past_due') status = 'past_due';
          if (subscription.cancel_at) status = 'pending_cancellation';

          await supabase.from('users').update({
            subscription_status: status,
            stripe_subscription_id: subscription.id,
          }).eq('id', userId);

          console.log(`✓ Subscription updated for user ${userId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await supabase.from('users').update({
            subscription_status: 'canceled',
            subscription_plan: 'free',
          }).eq('id', userId);

          console.log(`✓ Subscription canceled for user ${userId}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        
        console.log(`✓ Invoice paid:  ${invoice.id}`);
        break;
      }

      case 'charge.failed': {
        const charge = event.data.object as Stripe.Charge;
        console.error(`✗ Charge failed: ${charge.id} - ${charge.failure_message}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// JSON parser for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/linkedin', authMiddleware, linkedInRoutes);
app.use('/api/leads', authMiddleware, leadsRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Initialize services and start server
async function startServer() {
  try {
    console.log('Initializing services...');

    // Initialize Supabase
    initSupabase();
    console.log('✓ Supabase initialized');

    // Initialize Redis
    await initRedis();
    console.log('✓ Redis initialized');

    // Initialize queues
    await initQueues();
    console.log('✓ Queues initialized');

    // Initialize workers
    await initWorkers();
    console.log('✓ Workers initialized');

    // Start server
    const port = config.PORT;
    app.listen(port, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════╗
║  EficacIA Backend Server Running       ║
║  Port: ${port}                             ║
║  Environment: ${config.NODE_ENV}              ║
║  Frontend: ${config.FRONTEND_URL}       ║
╚════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
