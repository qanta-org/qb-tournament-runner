import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type { AIWeightClass, ModelRosterEntry } from '../../shared/types';

type AIWeightClassInput = AIWeightClass | undefined;

/** Normalize a raw weight_class cell to a known value, or undefined if blank/unknown. */
export function normalizeWeightClass(raw: unknown): AIWeightClassInput {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'lightweight' || value === 'midweight' || value === 'heavyweight') {
    return value;
  }
  return undefined;
}

/** Parse rows from a phase-specific model roster CSV (`ai_tossup_roster.csv` / `ai_bonus_roster.csv`). */
export function parseModelRosterCsv(content: string): ModelRosterEntry[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  return records
    .map((record: Record<string, string>) => {
      const id = (record.player_id || record.id || '').trim();
      const name = (record.name || '').trim();
      const model = (record.model || record.tossup_model || record.bonus_model || '').trim();
      if (!id || !name || !model) return null;
      return {
        id,
        name,
        model,
        weight_class: normalizeWeightClass(record.weight_class),
        description: record.description?.trim() || undefined,
      } satisfies ModelRosterEntry;
    })
    .filter((entry: ModelRosterEntry | null): entry is ModelRosterEntry => entry !== null);
}

interface LegacyAiRosterRow {
  player_id: string;
  name: string;
  tossup_model?: string;
  bonus_model?: string;
  weight_class?: AIWeightClass;
  description?: string;
}

/** Derive tossup roster entries from a legacy combined `ai_roster.csv`. */
export function tossupEntriesFromLegacyAiRoster(rows: LegacyAiRosterRow[]): ModelRosterEntry[] {
  const seen = new Set<string>();
  const entries: ModelRosterEntry[] = [];
  for (const row of rows) {
    const model = row.tossup_model?.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    entries.push({
      id: `${row.player_id}_tossup`,
      name: row.name,
      model,
      weight_class: row.weight_class,
      description: row.description,
    });
  }
  return entries;
}

/** Derive bonus roster entries from a legacy combined `ai_roster.csv`. */
export function bonusEntriesFromLegacyAiRoster(rows: LegacyAiRosterRow[]): ModelRosterEntry[] {
  const seen = new Set<string>();
  const entries: ModelRosterEntry[] = [];
  for (const row of rows) {
    const model = (row.bonus_model || row.tossup_model)?.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    entries.push({
      id: `${row.player_id}_bonus`,
      name: row.name,
      model,
      weight_class: row.weight_class,
      description: row.description,
    });
  }
  return entries;
}

/** Load a model roster file if it exists on disk. */
export function readModelRosterFile(filePath: string): ModelRosterEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseModelRosterCsv(content);
  } catch (err) {
    console.error(`Error loading model roster ${filePath}:`, err);
    return [];
  }
}
