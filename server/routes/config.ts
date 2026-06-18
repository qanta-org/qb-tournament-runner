import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import type { GameConfig, AppConfig } from '../../shared/types.js';
import { DEFAULT_GAME_CONFIG, DEFAULT_APP_CONFIG } from '../../shared/types.js';

export const configRouter = Router();

// Directory holding selectable rule presets (resolved relative to project root).
const RULE_PRESETS_DIR = path.join(process.cwd(), 'config', 'rule-presets');

interface RulePresetFile {
  name?: string;
  description?: string;
  config?: Partial<GameConfig>;
}

function readPresetFile(id: string): (RulePresetFile & { id: string }) | null {
  // Guard against path traversal: only allow simple ids.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const filePath = path.join(RULE_PRESETS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RulePresetFile;
    return { id, ...parsed };
  } catch (err) {
    console.error(`Failed to parse rule preset "${id}":`, err);
    return null;
  }
}

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

/**
 * @swagger
 * /api/config/presets:
 *   get:
 *     summary: List available rule presets
 *     description: Returns the id/name/description of each selectable rule preset
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: List of rule presets
 */
configRouter.get('/presets', (_req, res) => {
  if (!fs.existsSync(RULE_PRESETS_DIR)) {
    res.json({ presets: [] });
    return;
  }
  const files = fs
    .readdirSync(RULE_PRESETS_DIR)
    .filter((f) => f.endsWith('.json'));
  const presets = files
    .map((f) => readPresetFile(f.replace(/\.json$/, '')))
    .filter((p): p is RulePresetFile & { id: string } => p !== null)
    .map((p) => ({ id: p.id, name: p.name ?? p.id, description: p.description ?? '' }));
  res.json({ presets });
});

/**
 * @swagger
 * /api/config/presets/{id}:
 *   get:
 *     summary: Get a rule preset's config overrides
 *     description: Returns the partial GameConfig overrides for the given preset
 *     tags: [Config]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The preset overrides
 *       404:
 *         description: Preset not found
 */
configRouter.get('/presets/:id', (req, res) => {
  const preset = readPresetFile(req.params.id);
  if (!preset) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }
  res.json({
    id: preset.id,
    name: preset.name ?? preset.id,
    description: preset.description ?? '',
    config: preset.config ?? {},
  });
});
