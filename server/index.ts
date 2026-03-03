import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { initSupabase } from './lib/supabase.js';
import { initRedis } from './lib/redis.js';
import { authMiddleware, errorHandler, notFoundHandler } from './middleware/index.js';
import { initQueues } from './services/queue.service.js';
import { initWorkers } from './workers/index.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import linkedInRoutes from './routes/linkedin.routes.js';
import leadsRoutes from './routes/leads.routes.js';

const app: Express = express();

// Middleware
app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
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
