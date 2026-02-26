import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from '../shared/types.js';
import { setupGameHandlers } from './game/handlers.js';
import { configRouter } from './routes/config.js';
import { filesRouter } from './routes/files.js';
import { datasetsRouter } from './routes/datasets.js';
import { rostersRouter } from './routes/rosters.js';
import { tournamentsRouter } from './routes/tournaments.js';
import { setupTournamentHandlers } from './game/tournament-handlers.js';
import { swaggerSpec } from './swagger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);

// Socket.io setup with CORS
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Quiz Bowl Buzzer API Docs',
}));

// Serve raw OpenAPI spec
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API Routes
app.use('/api/config', configRouter);
app.use('/api/files', filesRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/rosters', rostersRouter);
app.use('/api/tournaments', tournamentsRouter);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Server health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Setup game event handlers for this socket
  setupGameHandlers(io, socket);
  setupTournamentHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Quiz Bowl Buzzer Server Started                  ║
╠════════════════════════════════════════════════════════════╣
║  Server:    http://localhost:${PORT}                          ║
║  API Docs:  http://localhost:${PORT}/api/docs                 ║
║  Client:    ${CLIENT_URL}                    ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown so tsx watch can kill cleanly
function shutdown() {
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { io };
