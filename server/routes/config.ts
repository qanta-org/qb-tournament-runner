import { Router } from 'express';
import type { GameConfig, AppConfig } from '../../shared/types.js';
import { DEFAULT_GAME_CONFIG, DEFAULT_APP_CONFIG } from '../../shared/types.js';

export const configRouter = Router();

// Store current game config in memory (for simplicity)
let currentGameConfig: GameConfig | null = null;

/**
 * @swagger
 * /api/config/app:
 *   get:
 *     summary: Get application config
 *     description: Returns default application configuration
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Application configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sound_enabled:
 *                   type: boolean
 *                 auto_stream:
 *                   type: boolean
 *                 word_delay_ms:
 *                   type: number
 */
configRouter.get('/app', (_req, res) => {
  res.json(DEFAULT_APP_CONFIG);
});

/**
 * @swagger
 * /api/config/game:
 *   get:
 *     summary: Get current game config
 *     description: Returns the current game configuration (or defaults if not set)
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Game configuration
 */
configRouter.get('/game', (_req, res) => {
  if (currentGameConfig) {
    res.json(currentGameConfig);
  } else {
    res.json({ ...DEFAULT_GAME_CONFIG });
  }
});

/**
 * @swagger
 * /api/config/game:
 *   post:
 *     summary: Update game config
 *     description: Sets the game configuration for the next game
 *     tags: [Config]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tossup_points_value:
 *                 type: number
 *               tossup_penalty_value:
 *                 type: number
 *               bonus_part_points:
 *                 type: number
 *               enable_power_points:
 *                 type: boolean
 *               power_points_value:
 *                 type: number
 *               auto_stream:
 *                 type: boolean
 *               word_delay_ms:
 *                 type: number
 *     responses:
 *       200:
 *         description: Config updated successfully
 */
configRouter.post('/game', (req, res) => {
  const config = req.body as GameConfig;
  currentGameConfig = { ...DEFAULT_GAME_CONFIG, ...config } as GameConfig;
  res.json({ success: true, config: currentGameConfig });
});

/**
 * @swagger
 * /api/config/defaults:
 *   get:
 *     summary: Get default configurations
 *     description: Returns both default game and app configurations
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Default configurations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gameConfig:
 *                   type: object
 *                 appConfig:
 *                   type: object
 */
configRouter.get('/defaults', (_req, res) => {
  res.json({
    gameConfig: DEFAULT_GAME_CONFIG,
    appConfig: DEFAULT_APP_CONFIG,
  });
});
