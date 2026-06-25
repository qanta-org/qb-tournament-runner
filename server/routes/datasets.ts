import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import type { AIWeightClass, ModelRosterEntry } from '../../shared/types';
import {
  normalizeWeightClass,
  readModelRosterFile,
  tossupEntriesFromLegacyAiRoster,
  bonusEntriesFromLegacyAiRoster,
} from '../data/modelRosters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const datasetsRouter = Router();

// Base directories to scan for datasets
const DATA_BASE_DIRS = [
  path.join(__dirname, '../../../data/tourney'), // data/tourney (tournament data)
  path.join(__dirname, '../../../data'),         // Repo data/ (single-game datasets like trails-con)
  path.join(__dirname, '../../data'),             // buzzer-web/data
  path.join(__dirname, '../../uploads'),          // buzzer-web/uploads
];

// ============================================================================
// Types
// ============================================================================

interface PacketInfo {
  id: string;
  name: string;
  tossupFile: string;
  bonusFile?: string;
  tossupCount?: number;
  bonusCount?: number;
}

interface ModelInfo {
  name: string;
  hasTossupResponses: boolean;
  hasBonusResponses: boolean;
  tossupFile?: string;
  bonusFile?: string;
}

interface RosterPlayer {
  player_id: string;
  name: string;
  type: 'ai' | 'human';
  tossup_model?: string;
  bonus_model?: string;
  default_buzzer_key?: string;
  weight_class?: AIWeightClass;
  team?: string;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  details?: string;
}

interface DatasetInfo {
  id: string;
  name: string;
  path: string;
  type: 'simple' | 'tournament';

  // For simple datasets (single tossup/bonus file)
  hasTossups: boolean;
  hasBonuses: boolean;
  tossupFile?: string;
  bonusFile?: string;

  // For tournament datasets (multiple packets)
  packets?: PacketInfo[];

  // Model responses
  responsesDir?: string;
  models: ModelInfo[];

  // Rosters
  hasAiRoster: boolean;
  hasAiTossupRoster: boolean;
  hasAiBonusRoster: boolean;
  hasHumanRoster: boolean;
  aiRosterFile?: string;
  aiTossupRosterFile?: string;
  aiBonusRosterFile?: string;
  humanRosterFile?: string;
  aiPlayers?: RosterPlayer[];
  tossupRoster?: ModelRosterEntry[];
  bonusRoster?: ModelRosterEntry[];
  humanPlayers?: RosterPlayer[];

  // Validation
  validationIssues: ValidationIssue[];
  isValid: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count rows in a CSV file (excluding header)
 */
function countCsvRows(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    return Math.max(0, lines.length - 1); // Subtract header
  } catch {
    return 0;
  }
}

/**
 * Load roster from CSV file
 */
function loadRoster(filePath: string): RosterPlayer[] {
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    return records.map((record: Record<string, string>) => ({
      player_id: record.player_id || '',
      name: record.name || '',
      type: record.type === 'ai' ? 'ai' : 'human',
      tossup_model: record.tossup_model || undefined,
      bonus_model: record.bonus_model || undefined,
      default_buzzer_key: record.default_buzzer_key || undefined,
      weight_class:
        record.type === 'ai' ? normalizeWeightClass(record.weight_class) : undefined,
      team: record.team || undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Scan responses directory for model files
 */
function scanResponsesDir(responsesDir: string): ModelInfo[] {
  if (!fs.existsSync(responsesDir)) return [];

  const files = fs.readdirSync(responsesDir);
  const modelMap = new Map<string, ModelInfo>();

  for (const file of files) {
    // Match patterns like "model-name.buzz.csv" or "model-name.bonus.csv"
    const buzzMatch = file.match(/^(.+)\.buzz\.csv$/);
    const bonusMatch = file.match(/^(.+)\.bonus\.csv$/);

    if (buzzMatch) {
      const modelName = buzzMatch[1];
      const existing = modelMap.get(modelName) || {
        name: modelName,
        hasTossupResponses: false,
        hasBonusResponses: false,
      };
      existing.hasTossupResponses = true;
      existing.tossupFile = path.join(responsesDir, file);
      modelMap.set(modelName, existing);
    }

    if (bonusMatch) {
      const modelName = bonusMatch[1];
      const existing = modelMap.get(modelName) || {
        name: modelName,
        hasTossupResponses: false,
        hasBonusResponses: false,
      };
      existing.hasBonusResponses = true;
      existing.bonusFile = path.join(responsesDir, file);
      modelMap.set(modelName, existing);
    }
  }

  return Array.from(modelMap.values());
}

/**
 * Scan for packets in a directory (packet_1, packet_2, etc.)
 */
function scanPackets(dirPath: string): PacketInfo[] {
  const packets: PacketInfo[] = [];
  const files = fs.readdirSync(dirPath);

  // Sort packet directories numerically
  const packetDirs = files
    .filter(f => f.startsWith('packet_') && fs.statSync(path.join(dirPath, f)).isDirectory())
    .sort((a, b) => {
      const numA = parseInt(a.replace('packet_', ''));
      const numB = parseInt(b.replace('packet_', ''));
      return numA - numB;
    });

  for (const packetDir of packetDirs) {
    const packetPath = path.join(dirPath, packetDir);
    const packetFiles = fs.readdirSync(packetPath);

    const tossupFile = packetFiles.find(f => f === 'tossups.csv');
    const bonusFile = packetFiles.find(f => f === 'bonuses.csv');

    if (tossupFile) {
      const tossupPath = path.join(packetPath, tossupFile);
      const bonusPath = bonusFile ? path.join(packetPath, bonusFile) : undefined;

      packets.push({
        id: packetDir,
        name: `Packet ${packetDir.replace('packet_', '')}`,
        tossupFile: tossupPath,
        bonusFile: bonusPath,
        tossupCount: countCsvRows(tossupPath),
        bonusCount: bonusPath ? countCsvRows(bonusPath) : 0,
      });
    }
  }

  return packets;
}

/**
 * Validate dataset configuration
 */
function validateDataset(info: Partial<DatasetInfo>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for questions
  if (!info.hasTossups && (!info.packets || info.packets.length === 0)) {
    issues.push({
      type: 'error',
      message: 'No tossup questions found',
      details: 'Expected tossups.csv in root directory or packet_*/tossups.csv for tournament format',
    });
  }

  // Check for responses directory
  if (!info.responsesDir) {
    issues.push({
      type: 'warning',
      message: 'No responses directory found',
      details: 'Create a "responses" folder with AI model response files (*.buzz.csv, *.bonus.csv)',
    });
  }

  // Check phase-specific model rosters vs available response files.
  const validateRosterEntries = (
    entries: ModelRosterEntry[] | undefined,
    phase: 'tossup' | 'bonus',
    rosterLabel: string
  ) => {
    if (!entries || entries.length === 0 || !info.models) return;
    const modelByName = new Map(info.models.map((m) => [m.name, m]));
    const datasetHasBonuses = !!info.hasBonuses;

    for (const entry of entries) {
      if (!entry.weight_class) {
        issues.push({
          type: 'warning',
          message: `Missing or invalid weight_class for "${entry.name}"`,
          details: `${rosterLabel} entry "${entry.id}" must specify lightweight, midweight, or heavyweight`,
        });
      }

      const model = modelByName.get(entry.model);
      const hasCapability =
        phase === 'tossup' ? model?.hasTossupResponses : model?.hasBonusResponses;
      if (!model || !hasCapability) {
        const fileSuffix = phase === 'tossup' ? '.buzz.csv' : '.bonus.csv';
        issues.push({
          type: phase === 'bonus' && !datasetHasBonuses ? 'warning' : 'error',
          message: `Missing ${phase} responses for "${entry.name}"`,
          details: `${rosterLabel} entry "${entry.id}" references model "${entry.model}" with no ${phase} responses. Expected file: ${entry.model}${fileSuffix}`,
        });
      }
    }
  };

  validateRosterEntries(info.tossupRoster, 'tossup', 'Tossup roster');
  validateRosterEntries(info.bonusRoster, 'bonus', 'Bonus roster');

  // Validate legacy ai_roster preset teammates against response files.
  if (info.aiPlayers && info.aiPlayers.length > 0 && info.models) {
    const modelByName = new Map(info.models.map((m) => [m.name, m]));
    const datasetHasBonuses = !!info.hasBonuses;

    for (const player of info.aiPlayers) {
      if (player.type !== 'ai') continue;

      if (player.tossup_model) {
        const model = modelByName.get(player.tossup_model);
        if (!model || !model.hasTossupResponses) {
          issues.push({
            type: 'error',
            message: `Missing tossup responses for preset "${player.name}"`,
            details: `ai_roster.csv: model "${player.tossup_model}" has no tossup responses. Expected file: ${player.tossup_model}.buzz.csv`,
          });
        }
      }
      if (player.bonus_model) {
        const model = modelByName.get(player.bonus_model);
        if (!model || !model.hasBonusResponses) {
          issues.push({
            type: datasetHasBonuses ? 'error' : 'warning',
            message: `Missing bonus responses for preset "${player.name}"`,
            details: `ai_roster.csv: model "${player.bonus_model}" has no bonus responses. Expected file: ${player.bonus_model}.bonus.csv`,
          });
        }
      }
    }
  }

  // Check for AI roster if AI models exist but no roster
  if (
    info.models &&
    info.models.length > 0 &&
    !info.hasAiRoster &&
    !info.hasAiTossupRoster &&
    !info.hasAiBonusRoster
  ) {
    issues.push({
      type: 'warning',
      message: 'No AI roster file found',
      details:
        'Create ai_tossup_roster.csv and ai_bonus_roster.csv (or legacy ai_roster.csv) to define AI model catalogs',
    });
  }

  return issues;
}

/**
 * Scan a directory for dataset information
 */
function scanDirectory(dirPath: string, id: string): DatasetInfo | null {
  if (!fs.existsSync(dirPath)) return null;

  const files = fs.readdirSync(dirPath);

  const info: DatasetInfo = {
    id,
    name: id.replace(/[-_]/g, ' '),
    path: dirPath,
    type: 'simple',
    hasTossups: false,
    hasBonuses: false,
    models: [],
    hasAiRoster: false,
    hasAiTossupRoster: false,
    hasAiBonusRoster: false,
    hasHumanRoster: false,
    validationIssues: [],
    isValid: true,
  };

  // Check for packets (tournament format)
  const packets = scanPackets(dirPath);
  if (packets.length > 0) {
    info.type = 'tournament';
    info.packets = packets;
    info.hasTossups = packets.some(p => p.tossupFile);
    info.hasBonuses = packets.some(p => p.bonusFile);
  } else {
    // Simple format - single tossup/bonus file
    const tossupFile = files.find(f =>
      f === 'tossups.csv' || f === 'tossups.json' || f === 'tossups.jsonl'
    );
    if (tossupFile) {
      info.hasTossups = true;
      info.tossupFile = path.join(dirPath, tossupFile);
    }

    const bonusFile = files.find(f =>
      f === 'bonuses.csv' || f === 'bonuses.json' || f === 'bonuses.jsonl'
    );
    if (bonusFile) {
      info.hasBonuses = true;
      info.bonusFile = path.join(dirPath, bonusFile);
    }
  }

  // Look for responses directory
  const responsesDir = files.find(f => {
    const fullPath = path.join(dirPath, f);
    return (f === 'responses' || f === 'models') &&
      fs.existsSync(fullPath) &&
      fs.statSync(fullPath).isDirectory();
  });

  if (responsesDir) {
    info.responsesDir = path.join(dirPath, responsesDir);
    info.models = scanResponsesDir(info.responsesDir);
  }

  // Look for roster files
  if (files.includes('ai_roster.csv')) {
    info.hasAiRoster = true;
    info.aiRosterFile = path.join(dirPath, 'ai_roster.csv');
    info.aiPlayers = loadRoster(info.aiRosterFile);
  }

  if (files.includes('ai_tossup_roster.csv')) {
    info.hasAiTossupRoster = true;
    info.aiTossupRosterFile = path.join(dirPath, 'ai_tossup_roster.csv');
    info.tossupRoster = readModelRosterFile(info.aiTossupRosterFile);
  }

  if (files.includes('ai_bonus_roster.csv')) {
    info.hasAiBonusRoster = true;
    info.aiBonusRosterFile = path.join(dirPath, 'ai_bonus_roster.csv');
    info.bonusRoster = readModelRosterFile(info.aiBonusRosterFile);
  }

  // Derive phase rosters from legacy combined roster when dedicated files are absent.
  if (info.aiPlayers && info.aiPlayers.length > 0) {
    if (!info.tossupRoster?.length) {
      info.tossupRoster = tossupEntriesFromLegacyAiRoster(
        info.aiPlayers.filter((p) => p.type === 'ai') as Array<{
          player_id: string;
          name: string;
          tossup_model?: string;
          bonus_model?: string;
        }>
      );
    }
    if (!info.bonusRoster?.length) {
      info.bonusRoster = bonusEntriesFromLegacyAiRoster(
        info.aiPlayers.filter((p) => p.type === 'ai') as Array<{
          player_id: string;
          name: string;
          tossup_model?: string;
          bonus_model?: string;
        }>
      );
    }
  }

  if (files.includes('human_roster.csv')) {
    info.hasHumanRoster = true;
    info.humanRosterFile = path.join(dirPath, 'human_roster.csv');
    info.humanPlayers = loadRoster(info.humanRosterFile);
  }

  // Validate
  info.validationIssues = validateDataset(info);
  info.isValid = !info.validationIssues.some(i => i.type === 'error');

  return info;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * @swagger
 * /api/datasets/list:
 *   get:
 *     summary: List all available datasets
 *     description: Scans configured directories for datasets and returns them with validation status
 *     tags: [Datasets]
 *     responses:
 *       200:
 *         description: List of datasets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 datasets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "online-0620"
 *                       name:
 *                         type: string
 *                         example: "online 0620"
 *                       type:
 *                         type: string
 *                         enum: [simple, tournament]
 *                       hasTossups:
 *                         type: boolean
 *                       hasBonuses:
 *                         type: boolean
 *                       isValid:
 *                         type: boolean
 *                       validationIssues:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               enum: [error, warning]
 *                             message:
 *                               type: string
 */
datasetsRouter.get('/list', (_req, res) => {
  const datasets: DatasetInfo[] = [];
  const seenPaths = new Set<string>();

  for (const baseDir of DATA_BASE_DIRS) {
    if (!fs.existsSync(baseDir)) continue;

    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip common non-data directories
        const skipDirs = [
          'node_modules', 'dist', '.git', 'buzzer-web', 'scripts',
          'docs', 'slides', 'style', 'templates', 'latex', 'demos',
          'resources', 'buzzer_app', 'configs', '.vscode'
        ];
        if (skipDirs.includes(entry.name)) continue;

        const dirPath = path.join(baseDir, entry.name);

        // Skip if already seen (prevent duplicates from multiple base dirs)
        if (seenPaths.has(dirPath)) continue;
        seenPaths.add(dirPath);

        const info = scanDirectory(dirPath, entry.name);

        if (info && (info.hasTossups || info.hasBonuses)) {
          datasets.push(info);
        }
      }
    } catch (err) {
      console.error(`Error scanning ${baseDir}:`, err);
    }
  }

  res.json({ datasets });
});

datasetsRouter.get('/asset', (req, res) => {
  const file = req.query.file;
  if (typeof file !== 'string' || file.includes('\0')) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  const normalized = path.resolve(file);
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const normalizedForCheck = normalized.replace(/\\/g, '/');
  const isPacketAsset =
    normalizedForCheck.includes('/packet_') &&
    (normalizedForCheck.includes('/img/') || normalizedForCheck.includes('/audio/'));
  if (!isPacketAsset) {
    return res.status(403).json({ error: 'Asset path not allowed' });
  }

  return res.sendFile(normalized);
});

/**
 * @swagger
 * /api/datasets/{id}:
 *   get:
 *     summary: Get dataset details
 *     description: Returns detailed information about a specific dataset including packets, models, and rosters
 *     tags: [Datasets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dataset ID (folder name)
 *         example: "online-0620"
 *     responses:
 *       200:
 *         description: Dataset details
 *       404:
 *         description: Dataset not found
 */
datasetsRouter.get('/:id', (req, res) => {
  const { id } = req.params;

  for (const baseDir of DATA_BASE_DIRS) {
    const dirPath = path.join(baseDir, id);
    if (fs.existsSync(dirPath)) {
      const info = scanDirectory(dirPath, id);
      if (info) {
        return res.json(info);
      }
    }
  }

  res.status(404).json({
    error: 'Dataset not found',
    message: `Could not find dataset "${id}" in any of the data directories.`,
    help: 'Ensure your dataset folder contains tossups.csv and optionally bonuses.csv',
  });
});

/**
 * @swagger
 * /api/datasets/{id}/validate:
 *   get:
 *     summary: Validate a dataset
 *     description: Returns validation results with detailed error/warning messages
 *     tags: [Datasets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dataset ID
 *     responses:
 *       200:
 *         description: Validation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isValid:
 *                   type: boolean
 *                 issues:
 *                   type: array
 *                   items:
 *                     type: object
 *                 summary:
 *                   type: object
 *       404:
 *         description: Dataset not found
 */
datasetsRouter.get('/:id/validate', (req, res) => {
  const { id } = req.params;

  for (const baseDir of DATA_BASE_DIRS) {
    const dirPath = path.join(baseDir, id);
    if (fs.existsSync(dirPath)) {
      const info = scanDirectory(dirPath, id);
      if (info) {
        return res.json({
          isValid: info.isValid,
          issues: info.validationIssues,
          summary: {
            tossups: info.hasTossups,
            bonuses: info.hasBonuses,
            packets: info.packets?.length || 0,
            models: info.models.length,
            aiPlayers: info.aiPlayers?.length || 0,
            humanPlayers: info.humanPlayers?.length || 0,
          },
        });
      }
    }
  }

  res.status(404).json({ error: 'Dataset not found' });
});

/**
 * @swagger
 * /api/datasets/help/structure:
 *   get:
 *     summary: Get dataset structure documentation
 *     description: Returns detailed documentation about expected directory structure and file formats
 *     tags: [Datasets]
 *     responses:
 *       200:
 *         description: Structure documentation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 formats:
 *                   type: object
 *                 fileFormats:
 *                   type: object
 */
datasetsRouter.get('/help/structure', (_req, res) => {
  res.json({
    title: 'Expected Dataset Directory Structure',
    description: 'Datasets can be organized in two formats: Simple (single packet) or Tournament (multiple packets).',
    formats: {
      simple: {
        name: 'Simple Format',
        description: 'For single-packet games or practice sessions',
        structure: `
dataset_name/
├── tossups.csv          # Required: Tossup questions
├── bonuses.csv          # Optional: Bonus questions
├── ai_tossup_roster.csv # Optional: tossup model catalog (id, name, model)
├── ai_bonus_roster.csv  # Optional: bonus model catalog (id, name, model)
├── ai_roster.csv        # Optional: legacy combined AI player definitions
├── human_roster.csv     # Optional: Human player definitions
└── responses/           # Required for AI players
    ├── model-name.buzz.csv    # Tossup responses
    └── model-name.bonus.csv   # Bonus responses
        `.trim(),
        example: 'Q25_week1/',
      },
      tournament: {
        name: 'Tournament Format',
        description: 'For multi-packet tournaments with rosters',
        structure: `
tournament_name/
├── ai_tossup_roster.csv # Tossup model catalog (id, name, model)
├── ai_bonus_roster.csv  # Bonus model catalog (id, name, model)
├── ai_roster.csv        # Legacy: combined AI player definitions with model assignments
├── human_roster.csv     # Human player definitions with team assignments
├── packet_1/
│   ├── tossups.csv
│   └── bonuses.csv
│   ├── img/             # Optional image assets referenced by tossup multimodal tokens
│   └── audio/           # Optional audio assets referenced by tossup multimodal tokens
├── packet_2/
│   ├── tossups.csv
│   └── bonuses.csv
├── ... (more packets)
└── responses/
    ├── Author__model-name.buzz.csv
    └── Author__model-name.bonus.csv
        `.trim(),
        example: 'data/tourney/online-0620/',
      },
    },
    fileFormats: {
      tossups: {
        description: 'Tossup questions CSV',
        requiredColumns: ['qid', 'question', 'clean_answers', 'answerline', 'has_image', 'has_audio'],
        optionalColumns: [
          'question_id (legacy)',
          'text (legacy)',
          'answer/answers (legacy)',
          'category',
          'difficulty',
        ],
        notes: [
          'Backward compatibility: legacy headers are accepted during migration.',
          'Multimodal markers in question are supported: <multimodal type="img|audio|delay" ...>',
          'Image assets must be in packet_X/img and audio assets in packet_X/audio.',
        ],
      },
      bonuses: {
        description: 'Bonus questions CSV',
        requiredColumns: ['question_id', 'leadin', 'part1', 'answer1', 'part2', 'answer2', 'part3', 'answer3'],
        optionalColumns: ['answerline1', 'answerline2', 'answerline3', 'category'],
      },
      ai_roster: {
        description: 'Legacy combined AI player roster (preset teammates with model assignments)',
        requiredColumns: ['player_id', 'name', 'type', 'tossup_model', 'bonus_model'],
        optionalColumns: ['weight_class', 'description'],
        notes: 'Model keys must match response files. Prefer ai_tossup_roster.csv and ai_bonus_roster.csv for model catalogs.',
      },
      ai_tossup_roster: {
        description: 'Tossup model catalog for setup pickers and logging labels',
        requiredColumns: ['id', 'name', 'model', 'weight_class'],
        optionalColumns: ['player_id', 'description'],
        notes: 'model must match a {model}.buzz.csv file in responses/. weight_class: lightweight, midweight, or heavyweight.',
      },
      ai_bonus_roster: {
        description: 'Bonus model catalog for setup pickers and logging labels',
        requiredColumns: ['id', 'name', 'model', 'weight_class'],
        optionalColumns: ['player_id', 'description'],
        notes: 'model must match a {model}.bonus.csv file in responses/. weight_class: lightweight, midweight, or heavyweight.',
      },
      human_roster: {
        description: 'Human player roster',
        requiredColumns: ['player_id', 'name', 'type'],
        optionalColumns: ['default_buzzer_key', 'team', 'description'],
      },
      buzz_responses: {
        description: 'AI tossup responses',
        filename: '{model_name}.buzz.csv',
        requiredColumns: ['question_id', 'token_position', 'guess', 'confidence', 'buzz'],
        optionalColumns: ['correct'],
      },
      bonus_responses: {
        description: 'AI bonus responses',
        filename: '{model_name}.bonus.csv',
        requiredColumns: ['question_id', 'part_number', 'guess', 'confidence'],
        optionalColumns: ['correct'],
      },
    },
  });
});
