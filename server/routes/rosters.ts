import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import type { ModelRosterEntry } from '../../shared/types';
import {
  normalizeWeightClass,
  readModelRosterFile,
  tossupEntriesFromLegacyAiRoster,
  bonusEntriesFromLegacyAiRoster,
} from '../data/modelRosters.js';

interface AIRosterEntry {
  player_id: string;
  name: string;
  type: 'ai';
  tossup_model: string;
  tossup_model_cost?: number;
  bonus_model: string;
  description?: string;
  default_buzzer_key?: string;
  weight_class?: ReturnType<typeof normalizeWeightClass>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const rostersRouter = Router();

// Base directories for roster files
const ROSTER_BASE_DIRS = [
  path.join(__dirname, '../../../data/tourney'), // Tournament data
  path.join(__dirname, '../../data'),            // Repo data directory
  path.join(__dirname, '../../../'),              // Parent of buzzer-web
];

interface HumanRosterEntry {
  player_id: string;
  name: string;
  type: 'human';
  description?: string;
  default_buzzer_key?: string;
}

type RosterEntry = AIRosterEntry | HumanRosterEntry;

/**
 * Find a roster file in any of the base directories
 */
function findRosterFile(filename: string): string | null {
  // First check if it's an absolute path
  if (path.isAbsolute(filename) && fs.existsSync(filename)) {
    return filename;
  }
  
  // Search in base directories
  for (const baseDir of ROSTER_BASE_DIRS) {
    const filePath = path.join(baseDir, filename);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    
    // Also search in subdirectories (for tournament-specific rosters)
    try {
      const subdirs = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      for (const subdir of subdirs) {
        const subPath = path.join(baseDir, subdir, filename);
        if (fs.existsSync(subPath)) {
          return subPath;
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  return null;
}

/**
 * Find a dataset-specific roster file.
 * Supports datasets directly under a base dir and under a base dir's data/ folder.
 */
function findDatasetRosterFile(dataset: string, filename: string): string | null {
  const candidates = new Set<string>();

  for (const baseDir of ROSTER_BASE_DIRS) {
    candidates.add(path.join(baseDir, dataset, filename));
    candidates.add(path.join(baseDir, 'data', dataset, filename));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function loadLegacyAiRosterRows(dataset?: string): AIRosterEntry[] {
  let filePath: string | null = null;
  if (dataset) {
    filePath = findDatasetRosterFile(dataset, 'ai_roster.csv');
  }
  if (!filePath) {
    for (const baseDir of ROSTER_BASE_DIRS) {
      const candidate = path.join(baseDir, 'ai_roster.csv');
      if (fs.existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }
  }
  if (!filePath) return [];
  return loadRosterFile(filePath).filter((e): e is AIRosterEntry => e.type === 'ai');
}

/**
 * Load tossup model catalog for a dataset. Prefers `ai_tossup_roster.csv`, falling
 * back to entries derived from legacy `ai_roster.csv`.
 */
function loadTossupModelRoster(dataset?: string): { entries: ModelRosterEntry[]; source: string } {
  if (dataset) {
    const dedicated = findDatasetRosterFile(dataset, 'ai_tossup_roster.csv');
    if (dedicated) {
      const entries = readModelRosterFile(dedicated);
      if (entries.length > 0) return { entries, source: dataset };
    }
  }

  for (const baseDir of ROSTER_BASE_DIRS) {
    const globalPath = path.join(baseDir, 'ai_tossup_roster.csv');
    if (fs.existsSync(globalPath)) {
      const entries = readModelRosterFile(globalPath);
      if (entries.length > 0) return { entries, source: 'global' };
    }
  }

  const legacyRows = loadLegacyAiRosterRows(dataset);
  if (legacyRows.length > 0) {
    return {
      entries: tossupEntriesFromLegacyAiRoster(legacyRows),
      source: dataset ? `${dataset} (legacy ai_roster.csv)` : 'legacy ai_roster.csv',
    };
  }

  return { entries: [], source: 'none' };
}

/**
 * Load bonus model catalog for a dataset. Prefers `ai_bonus_roster.csv`, falling
 * back to entries derived from legacy `ai_roster.csv`.
 */
function loadBonusModelRoster(dataset?: string): { entries: ModelRosterEntry[]; source: string } {
  if (dataset) {
    const dedicated = findDatasetRosterFile(dataset, 'ai_bonus_roster.csv');
    if (dedicated) {
      const entries = readModelRosterFile(dedicated);
      if (entries.length > 0) return { entries, source: dataset };
    }
  }

  for (const baseDir of ROSTER_BASE_DIRS) {
    const globalPath = path.join(baseDir, 'ai_bonus_roster.csv');
    if (fs.existsSync(globalPath)) {
      const entries = readModelRosterFile(globalPath);
      if (entries.length > 0) return { entries, source: 'global' };
    }
  }

  const legacyRows = loadLegacyAiRosterRows(dataset);
  if (legacyRows.length > 0) {
    return {
      entries: bonusEntriesFromLegacyAiRoster(legacyRows),
      source: dataset ? `${dataset} (legacy ai_roster.csv)` : 'legacy ai_roster.csv',
    };
  }

  return { entries: [], source: 'none' };
}

/**
 * Load a global roster file from base dirs only (no subdirectory scan).
 */
function loadGlobalRosterFile(filename: string): RosterEntry[] {
  for (const baseDir of ROSTER_BASE_DIRS) {
    const directPath = path.join(baseDir, filename);
    if (fs.existsSync(directPath)) {
      return loadRosterFile(directPath);
    }
  }
  return [];
}

/**
 * Load a roster CSV file
 */
function loadRosterFile(filename: string): RosterEntry[] {
  const filePath = findRosterFile(filename);
  
  if (!filePath) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Handle rows with inconsistent column counts
    });
    
    return records.map((record: any) => {
      if (record.type === 'ai') {
        return {
          player_id: record.player_id,
          name: record.name,
          type: 'ai' as const,
          tossup_model: record.tossup_model || '',
          tossup_model_cost: record.tossup_model_cost ? parseFloat(record.tossup_model_cost) : undefined,
          bonus_model: record.bonus_model || '',
          description: record.description || '',
          default_buzzer_key: record.default_buzzer_key || '',
          weight_class: normalizeWeightClass(record.weight_class),
        };
      } else {
        return {
          player_id: record.player_id,
          name: record.name,
          type: 'human' as const,
          description: record.description || '',
          default_buzzer_key: record.default_buzzer_key || '',
        };
      }
    });
  } catch (err) {
    console.error(`Error loading roster file ${filename}:`, err);
    return [];
  }
}

/**
 * @swagger
 * /api/rosters/list:
 *   get:
 *     summary: List all roster files
 *     description: Scans directories for roster CSV files
 *     tags: [Rosters]
 *     responses:
 *       200:
 *         description: List of roster files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rosters:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       path:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [ai, human, mixed]
 *                       count:
 *                         type: number
 */
rostersRouter.get('/list', (_req, res) => {
  const rosterFiles: { filename: string; path: string; type: 'ai' | 'human' | 'mixed'; count: number; location: string }[] = [];
  const seenPaths = new Set<string>();
  
  // Look for roster files in all base directories and their subdirectories
  for (const baseDir of ROSTER_BASE_DIRS) {
    if (!fs.existsSync(baseDir)) continue;
    
    const scanDir = (dir: string, location: string) => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('_roster.csv') || file === 'roster.csv') {
            const fullPath = path.join(dir, file);
            if (seenPaths.has(fullPath)) continue;
            seenPaths.add(fullPath);
            
            const entries = loadRosterFile(fullPath);
            if (entries.length > 0) {
              const hasAI = entries.some(e => e.type === 'ai');
              const hasHuman = entries.some(e => e.type === 'human');
              
              rosterFiles.push({
                filename: file,
                path: fullPath,
                type: hasAI && hasHuman ? 'mixed' : hasAI ? 'ai' : 'human',
                count: entries.length,
                location,
              });
            }
          }
        }
      } catch {
        // Ignore errors
      }
    };
    
    // Scan base directory
    scanDir(baseDir, path.basename(baseDir));
    
    // Scan subdirectories
    try {
      const subdirs = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      for (const subdir of subdirs) {
        scanDir(path.join(baseDir, subdir), subdir);
      }
    } catch {
      // Ignore errors
    }
  }
  
  res.json({ rosters: rosterFiles });
});

/**
 * @swagger
 * /api/rosters/ai:
 *   get:
 *     summary: Get AI players from roster
 *     description: Returns AI player definitions from roster file
 *     tags: [Rosters]
 *     parameters:
 *       - in: query
 *         name: dataset
 *         schema:
 *           type: string
 *         description: Dataset ID to load roster from
 *     responses:
 *       200:
 *         description: AI players
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 players:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       player_id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [ai]
 *                       tossup_model:
 *                         type: string
 *                       bonus_model:
 *                         type: string
 *                 source:
 *                   type: string
 */
rostersRouter.get('/ai', (req, res) => {
  const dataset = req.query.dataset as string | undefined;
  
  let entries: RosterEntry[] = [];
  let source = 'global';
  
  if (dataset) {
    const datasetPath = findDatasetRosterFile(dataset, 'ai_roster.csv');
    if (datasetPath) {
      entries = loadRosterFile(datasetPath);
      source = dataset;
    }
  }
  
  // Fall back to global roster
  if (entries.length === 0) {
    entries = loadGlobalRosterFile('ai_roster.csv');
  }
  
  res.json({ 
    players: entries.filter(e => e.type === 'ai'),
    source,
  });
});

rostersRouter.get('/ai/tossup', (req, res) => {
  const dataset = req.query.dataset as string | undefined;
  const { entries, source } = loadTossupModelRoster(dataset);
  res.json({ entries, source });
});

rostersRouter.get('/ai/bonus', (req, res) => {
  const dataset = req.query.dataset as string | undefined;
  const { entries, source } = loadBonusModelRoster(dataset);
  res.json({ entries, source });
});

/**
 * @swagger
 * /api/rosters/human:
 *   get:
 *     summary: Get human players from roster
 *     description: Returns human player definitions from roster file
 *     tags: [Rosters]
 *     parameters:
 *       - in: query
 *         name: dataset
 *         schema:
 *           type: string
 *         description: Dataset ID to load roster from
 *     responses:
 *       200:
 *         description: Human players
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 players:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       player_id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [human]
 *                       default_buzzer_key:
 *                         type: string
 *                 source:
 *                   type: string
 */
rostersRouter.get('/human', (req, res) => {
  const dataset = req.query.dataset as string | undefined;
  
  let entries: RosterEntry[] = [];
  let source = 'global';
  
  if (dataset) {
    const datasetPath = findDatasetRosterFile(dataset, 'human_roster.csv');
    if (datasetPath) {
      entries = loadRosterFile(datasetPath);
      source = dataset;
    }
  }
  
  // Fall back to global roster
  if (entries.length === 0) {
    entries = loadGlobalRosterFile('human_roster.csv');
  }
  
  res.json({ 
    players: entries.filter(e => e.type === 'human'),
    source,
  });
});

/**
 * @swagger
 * /api/rosters/file/{filename}:
 *   get:
 *     summary: Get roster from specific file
 *     description: Load players from a specific roster CSV file
 *     tags: [Rosters]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Roster filename (must be .csv)
 *     responses:
 *       200:
 *         description: Players from file
 *       400:
 *         description: Invalid filename
 */
rostersRouter.get('/file/:filename', (req, res) => {
  const { filename } = req.params;
  
  // Security: only allow .csv files in the base directory
  if (!filename.endsWith('.csv') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  const entries = loadRosterFile(filename);
  res.json({ players: entries });
});
