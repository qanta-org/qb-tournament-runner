import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type { TossupResponse, BonusResponse } from '../../shared/types.js';
import type { Questions } from './questions.js';

/**
 * Process a raw tossup response dictionary from CSV/JSON
 */
function processTossupResponseDict(item: Record<string, string>): {
  question_id: string;
  token_position: number;
  confidence: number;
  buzz: number;
  guess: string;
} {
  const confidence = parseFloat(item.confidence);
  const buzz = parseInt(item.buzz, 10);
  return {
    question_id: String(item.question_id),
    token_position: parseInt(item.token_position, 10) || 0,
    confidence: isNaN(confidence) ? 0 : confidence,
    buzz: isNaN(buzz) ? 0 : buzz,
    guess: (item.guess || '').replace(/_/g, ' '),
  };
}

/**
 * Process a raw bonus response dictionary from CSV/JSON
 */
function processBonusResponseDict(item: Record<string, string>): {
  question_id: string;
  part_number: number;
  confidence: number;
  guess: string;
  explanation: string;
} {
  const confidence = parseFloat(item.confidence);
  return {
    question_id: String(item.question_id),
    part_number: parseInt(item.part_number, 10) || 1,
    confidence: isNaN(confidence) ? 0 : confidence,
    guess: (item.guess || '').replace(/_/g, ' '),
    explanation: item.explanation || '',
  };
}

/**
 * Load data from a CSV file
 */
function loadCsv<T>(filePath: string, mapper: (item: Record<string, string>) => T): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records.map(mapper);
}

/**
 * Load data from a JSONL file
 */
function loadJsonl<T>(filePath: string, mapper: (item: Record<string, string>) => T): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  return lines.map((line) => mapper(JSON.parse(line)));
}

/**
 * Load data from a JSON file
 */
function loadJson<T>(filePath: string, mapper: (item: Record<string, string>) => T): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    return data.map(mapper);
  }
  return [mapper(data)];
}

/**
 * Load data from file based on extension
 */
function loadFromFile<T>(filePath: string, mapper: (item: Record<string, string>) => T): T[] {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return loadCsv(filePath, mapper);
  } else if (ext === '.jsonl') {
    return loadJsonl(filePath, mapper);
  } else if (ext === '.json') {
    return loadJson(filePath, mapper);
  } else {
    throw new Error(`Unsupported file type: ${filePath}`);
  }
}

/**
 * Buzzes database class - manages AI model responses for tossups and bonuses
 */
export class Buzzes {
  private _questions: Questions;

  // question_id -> system -> token_position -> TossupResponse
  private _buzzes: Map<string, Map<string, Map<number, TossupResponse>>> = new Map();

  // question_id -> part_num -> BonusResponse[]
  private _bpResponses: Map<string, Map<number, BonusResponse[]>> = new Map();

  constructor(questions: Questions) {
    this._questions = questions;
  }

  /**
   * Add a tossup response
   */
  addTossupResponse(
    system: string,
    questionId: string,
    tokenPosition: number,
    guess: string,
    confidence: number,
    buzz: number
  ): void {
    // Suppress very early buzzes (before 10 tokens)
    if (buzz !== 0 && tokenPosition < 10) {
      buzz = 0;
    }

    if (!this._buzzes.has(questionId)) {
      this._buzzes.set(questionId, new Map());
    }

    const questionBuzzes = this._buzzes.get(questionId)!;
    if (!questionBuzzes.has(system)) {
      questionBuzzes.set(system, new Map());
    }

    const systemBuzzes = questionBuzzes.get(system)!;
    systemBuzzes.set(tokenPosition, {
      system,
      guess,
      confidence,
      buzz,
    });
  }

  /**
   * Add a bonus response
   */
  addBonusResponse(
    system: string,
    questionId: string,
    partNum: number,
    guess: string,
    confidence: number,
    explanation: string
  ): void {
    if (!this._bpResponses.has(questionId)) {
      this._bpResponses.set(questionId, new Map());
    }

    const questionResponses = this._bpResponses.get(questionId)!;
    if (!questionResponses.has(partNum)) {
      questionResponses.set(partNum, []);
    }

    questionResponses.get(partNum)!.push({
      question_id: questionId,
      part_num: partNum,
      system,
      guess,
      confidence,
      explanation,
    });
  }

  /**
   * Check if a bonus question has responses loaded
   */
  hasBonusQuestion(questionId: string): boolean {
    return this._bpResponses.has(questionId);
  }

  /**
   * Check if a tossup question has responses loaded
   */
  hasTossupQuestion(questionId: string): boolean {
    return this._buzzes.has(questionId);
  }

  /**
   * Load buzz responses from file
   */
  loadBuzzFile(system: string, filePath: string): void {
    const buzzes = loadFromFile(filePath, processTossupResponseDict);

    for (const item of buzzes) {
      this.addTossupResponse(
        system,
        item.question_id,
        item.token_position,
        item.guess,
        item.confidence,
        item.buzz
      );
    }
  }

  /**
   * Add tossup system responses from a base path
   * Expects file at {basePath}.buzz.csv
   */
  addTossupSystem(basePath: string): boolean {
    try {
      const buzzFile = `${basePath}.buzz.csv`;
      const system = path.basename(basePath);

      this.loadBuzzFile(system, buzzFile);
      console.log(`Loaded tossup responses for ${system}`);
      return true;
    } catch (error) {
      console.error(`Error loading buzzes from ${basePath}:`, error);
      return false;
    }
  }

  /**
   * Add bonus system responses from a base path
   * Expects file at {basePath}.bonus.csv
   */
  addBonusSystem(basePath: string): boolean {
    try {
      const bonusFile = `${basePath}.bonus.csv`;
      const system = path.basename(basePath);

      const bonusResponses = loadFromFile(bonusFile, processBonusResponseDict);
      console.log(`Found ${bonusResponses.length} bonus responses for ${system}`);

      for (const item of bonusResponses) {
        this.addBonusResponse(
          system,
          item.question_id,
          item.part_number,
          item.guess,
          item.confidence,
          item.explanation
        );
      }

      return true;
    } catch (error) {
      console.error(`Error loading bonus responses from ${basePath}:`, error);
      return false;
    }
  }

  /**
   * Get the latest tossup guesses at a given token position
   */
  getTossupGuesses(questionId: string, tokenPosition: number): Map<string, TossupResponse> {
    const systemGuesses = new Map<string, TossupResponse>();

    const questionBuzzes = this._buzzes.get(questionId);
    if (!questionBuzzes) return systemGuesses;

    for (const [system, guesses] of questionBuzzes) {
      // Find the latest guess at or before the given token position
      let latestPosition = -1;
      for (const pos of guesses.keys()) {
        if (pos <= tokenPosition && pos > latestPosition) {
          latestPosition = pos;
        }
      }

      if (latestPosition >= 0) {
        systemGuesses.set(system, guesses.get(latestPosition)!);
      }
    }

    return systemGuesses;
  }

  /**
   * Get bonus guesses for a question part
   */
  getBonusGuesses(questionId: string, partNum: number): BonusResponse[] {
    return this._bpResponses.get(questionId)?.get(partNum) || [];
  }

  /**
   * Get all loaded system names for tossups
   */
  getTossupSystems(): string[] {
    const systems = new Set<string>();
    for (const questionBuzzes of this._buzzes.values()) {
      for (const system of questionBuzzes.keys()) {
        systems.add(system);
      }
    }
    return Array.from(systems);
  }

  /**
   * Get all loaded system names for bonuses
   */
  getBonusSystems(): string[] {
    const systems = new Set<string>();
    for (const questionResponses of this._bpResponses.values()) {
      for (const responses of questionResponses.values()) {
        for (const response of responses) {
          systems.add(response.system);
        }
      }
    }
    return Array.from(systems);
  }
}
