import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type {
  TossupQuestion,
  BonusQuestion,
  BonusPart,
  TossupToken,
  TossupMultimodalToken,
  BonusMedia,
} from '../../shared/types.js';
import { evaluateAnswer } from './evaluation.js';

/**
 * Parse answer references from string format
 * Handles both string and array representations
 */
function parseAnswerRefs(answer: string): string[] {
  try {
    // Try to parse as JSON array
    const parsed = JSON.parse(answer.replace(/'/g, '"'));
    if (Array.isArray(parsed)) {
      return parsed.map((a: string) => a.replace(/_/g, ' '));
    }
    return [String(parsed).replace(/_/g, ' ')];
  } catch {
    // If not valid JSON, treat as single answer
    return [answer.replace(/_/g, ' ')];
  }
}

/**
 * Process a raw tossup dictionary from CSV/JSON
 */
function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseMultimodalAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrPattern = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null = attrPattern.exec(raw);

  while (match) {
    attributes[match[1]] = match[2];
    match = attrPattern.exec(raw);
  }

  return attributes;
}

function parseTossupTokens(questionText: string): TossupToken[] {
  const tokens: TossupToken[] = [];
  const multimodalPattern = /<multimodal\s+([^>]+)>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null = multimodalPattern.exec(questionText);

  const pushTextTokens = (segment: string) => {
    const words = segment.split(/\s+/).filter(Boolean);
    for (const word of words) {
      tokens.push({ kind: 'text', text: word });
    }
  };

  while (match) {
    const before = questionText.slice(cursor, match.index);
    pushTextTokens(before);

    const attrs = parseMultimodalAttributes(match[1]);
    const tokenType = (attrs.type || '').toLowerCase();
    if (tokenType === 'img' || tokenType === 'audio' || tokenType === 'delay') {
      const multimodalToken: TossupMultimodalToken = {
        kind: 'multimodal',
        tokenType,
        hash: attrs.hash,
        displayText: attrs.displayText,
      };
      tokens.push(multimodalToken);
    }

    cursor = match.index + match[0].length;
    match = multimodalPattern.exec(questionText);
  }

  pushTextTokens(questionText.slice(cursor));
  return tokens;
}

function extractBonusMedia(
  text: string,
  questionFile: string
): { cleanText: string; media?: BonusMedia } {
  const multimodalPattern = /<multimodal\s+([^>]+)>/gi;
  let match: RegExpExecArray | null = multimodalPattern.exec(text);

  const media: BonusMedia = {};

  while (match) {
    const attrs = parseMultimodalAttributes(match[1]);
    const tokenType = (attrs.type || '').toLowerCase();
    const hash = attrs.hash;

    if ((tokenType === 'img' || tokenType === 'audio') && hash) {
      const token: TossupMultimodalToken = {
        kind: 'multimodal',
        tokenType,
        hash,
        displayText: attrs.displayText,
      };

      const assetPath = getPacketAssetPath(questionFile, token);
      const assetUrl = `/api/datasets/asset?file=${encodeURIComponent(assetPath)}`;

      if (tokenType === 'img' && !media.imageUrl) {
        media.imageUrl = assetUrl;
      } else if (tokenType === 'audio' && !media.audioUrl) {
        media.audioUrl = assetUrl;
        media.audioDisplayText = attrs.displayText;
      }
    }

    match = multimodalPattern.exec(text);
  }

  const cleanText = text.replace(multimodalPattern, '').trim();

  if (media.imageUrl || media.audioUrl) {
    return { cleanText, media };
  }

  return { cleanText, media: undefined };
}

/**
 * Resolve a bonus "answer_image" column value (a packet-relative path such as
 * `img/b6_p1_a.png`) into an asset URL. Returns undefined for blank values.
 */
function resolveBonusAnswerImage(
  questionFile: string,
  rawValue: unknown
): BonusMedia | undefined {
  const relPath = String(rawValue ?? '').trim();
  if (!relPath) return undefined;

  const packetDir = path.dirname(questionFile);
  const assetPath = path.isAbsolute(relPath)
    ? relPath
    : path.join(packetDir, relPath);

  if (!fs.existsSync(assetPath)) {
    console.warn(`Bonus answer image not found: ${assetPath}`);
    return undefined;
  }

  return {
    imageUrl: `/api/datasets/asset?file=${encodeURIComponent(assetPath)}`,
  };
}

function getPacketAssetPath(questionFile: string, token: TossupMultimodalToken): string {
  if (token.tokenType === 'delay') {
    return '';
  }

  const hash = token.hash?.trim();
  if (!hash) {
    throw new Error(`Missing hash for ${token.tokenType} multimodal token`);
  }

  const packetDir = path.dirname(questionFile);
  const assetDir = path.join(packetDir, token.tokenType === 'img' ? 'img' : 'audio');
  if (!fs.existsSync(assetDir) || !fs.statSync(assetDir).isDirectory()) {
    throw new Error(`Missing asset directory: ${assetDir}`);
  }

  const matches = fs
    .readdirSync(assetDir)
    .filter((name) => name.startsWith(`${hash}.`))
    .map((name) => path.join(assetDir, name));

  if (matches.length === 0) {
    throw new Error(`No asset found for hash "${hash}" in ${assetDir}`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple assets found for hash "${hash}" in ${assetDir}`);
  }

  return matches[0];
}

function processTossupDict(item: Record<string, unknown>, questionFile: string): TossupQuestion {
  // id must be present as one of the following keys
  const qid = item.question_id || item.qid || item.id;

  // question must be present as one of the following keys
  const questionText = String(item.text || item.question || item.question_text || '');

  // answer references
  const answerRefsStr = String(
    item.answers || item.clean_answers || item.answer_refs || item.answer || ''
  );
  const answerRefs = parseAnswerRefs(answerRefsStr);

  // answer line
  const answerLine = String(
    item.answerline || item.answer_line || item.answer || answerRefs.join(', OR ')
  );

  const parsedTokens = parseTossupTokens(questionText).map((token) => {
    if (token.kind === 'multimodal' && token.tokenType !== 'delay') {
      const assetPath = getPacketAssetPath(questionFile, token);
      return {
        ...token,
        assetUrl: `/api/datasets/asset?file=${encodeURIComponent(assetPath)}`,
      };
    }
    return token;
  });

  const hasImage = parseBoolean(item.has_image) || parsedTokens.some(
    (token) => token.kind === 'multimodal' && token.tokenType === 'img'
  );
  const hasAudio = parseBoolean(item.has_audio) || parsedTokens.some(
    (token) => token.kind === 'multimodal' && token.tokenType === 'audio'
  );

  return {
    id: String(qid),
    text: questionText,
    tokens: parsedTokens,
    has_image: hasImage,
    has_audio: hasAudio,
    answer: answerLine,
    answer_refs: answerRefs,
  };
}

/**
 * Process a raw bonus dictionary from CSV/JSON
 */
function processBonusDict(item: Record<string, unknown>, questionFile: string): BonusQuestion {
  const questionId = String(item.question_id);
  const rawLeadin = String(item.leadin || '');
  const { cleanText: leadin, media: leadinMedia } = extractBonusMedia(rawLeadin, questionFile);

  // Check if we're loading the new format or old format
  if (item.parts && Array.isArray(item.parts)) {
    const rawParts = item.parts as Array<BonusPart & { answer_image?: string }>;
    const parts: BonusPart[] = rawParts.map((part) => {
      const { cleanText, media } = extractBonusMedia(part.text, questionFile);
      return {
        ...part,
        text: cleanText,
        media: media ?? part.media,
        answerMedia:
          part.answerMedia ?? resolveBonusAnswerImage(questionFile, part.answer_image),
      };
    });

    return {
      id: questionId,
      leadin,
      leadinMedia,
      parts,
    };
  } else {
    // Original format - create the 3 parts explicitly
    const parts: BonusPart[] = [];
    for (let i = 0; i < 3; i++) {
      const partKey = `part${i + 1}`;
      const answerKey = `answer${i + 1}`;
      const answerlineKey = `answerline${i + 1}`;
      const answerImageKey = `answer_image${i + 1}`;

      if (item[partKey] && item[answerKey]) {
        const rawPartText = String(item[partKey]);
        const { cleanText, media } = extractBonusMedia(rawPartText, questionFile);

        parts.push({
          text: cleanText,
          answer: String(item[answerlineKey] || item[answerKey]),
          answer_refs: parseAnswerRefs(String(item[answerKey])),
          media,
          answerMedia: resolveBonusAnswerImage(questionFile, item[answerImageKey]),
        });
      }
    }

    return {
      id: questionId,
      leadin,
      leadinMedia,
      parts,
    };
  }
}

/**
 * Load data from a CSV file
 */
function loadCsv<T>(
  filePath: string,
  mapper: (item: Record<string, unknown>, filePath: string) => T
): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];
  return records.map((item) => mapper(item, filePath));
}

/**
 * Load data from a JSONL file
 */
function loadJsonl<T>(
  filePath: string,
  mapper: (item: Record<string, unknown>, filePath: string) => T
): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  return lines.map((line) => mapper(JSON.parse(line), filePath));
}

/**
 * Load data from a JSON file
 */
function loadJson<T>(
  filePath: string,
  mapper: (item: Record<string, unknown>, filePath: string) => T
): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    return data.map((item) => mapper(item, filePath));
  }
  return [mapper(data, filePath)];
}

/**
 * Load data from file based on extension
 */
function loadFromFile<T>(
  filePath: string,
  mapper: (item: Record<string, unknown>, filePath: string) => T
): T[] {
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
 * Questions database class - manages tossup and bonus questions
 */
export class Questions {
  private _tossups: Map<string, TossupQuestion> = new Map();
  private _bonusQuestions: Map<string, BonusQuestion> = new Map();
  private _powerMarks: Map<string, string> = new Map();
  private _equivalents: Record<string, string[]> = {};

  /**
   * Load tossup questions from file
   */
  loadTossupQuestions(questionFile: string): void {
    if (!questionFile) return;

    try {
      const items = loadFromFile(questionFile, processTossupDict);
      for (const item of items) {
        this._tossups.set(item.id, item);
      }
      console.log(`Loaded ${this._tossups.size} tossup questions`);
    } catch (error) {
      console.error(`Error loading questions: ${error}`);
      throw error;
    }
  }

  /**
   * Load bonus questions from file
   */
  loadBonusQuestions(bonusFile: string): void {
    if (!bonusFile) return;

    try {
      const items = loadFromFile(bonusFile, processBonusDict);
      for (const item of items) {
        this._bonusQuestions.set(item.id, item);
      }
      console.log(`Loaded ${this._bonusQuestions.size} bonus questions`);
    } catch (error) {
      console.error(`Error loading bonus questions: ${error}`);
      throw error;
    }
  }

  /**
   * Load power marks from CSV file
   */
  loadPower(powerFile: string): void {
    if (!powerFile) return;

    try {
      const records = loadCsv(powerFile, (item) => item);
      for (const item of records) {
        const question = String(item.question || '');
        const word = String(item.word || '');
        if (question && word) {
          this._powerMarks.set(question, word);
        }
      }
      console.log(`Loaded ${this._powerMarks.size} power marks`);
    } catch (error) {
      console.error(`Error loading power marks: ${error}`);
    }
  }

  /**
   * Load answer equivalents from JSON file
   */
  loadEquivalents(equivalentFile: string): void {
    if (!equivalentFile) return;

    try {
      const content = fs.readFileSync(equivalentFile, 'utf-8');
      this._equivalents = JSON.parse(content);

      // Handle normalization of spaces/underscores
      const normalized: Array<[string, string]> = [];
      for (const [orig, replace] of [
        [' ', '_'],
        ['_', ' '],
      ]) {
        for (const title of Object.keys(this._equivalents)) {
          if (title.includes(orig)) {
            normalized.push([title, title.replace(new RegExp(orig, 'g'), replace)]);
          }
        }
      }

      for (const [orig, replace] of normalized) {
        this._equivalents[replace] = this._equivalents[orig];
      }

      console.log(`Loaded equivalents for ${Object.keys(this._equivalents).length} answers`);
    } catch (error) {
      console.error(`Error loading equivalents: ${error}`);
    }
  }

  /**
   * Get tossup question text by ID
   */
  getTossupText(questionId: string): string | undefined {
    return this._tossups.get(questionId)?.text;
  }

  /**
   * Get tossup question by ID
   */
  getTossup(questionId: string): TossupQuestion | undefined {
    return this._tossups.get(questionId);
  }

  /**
   * Get reference answers for a tossup
   */
  getRefAnswers(questionId: string): string[] {
    return this._tossups.get(questionId)?.answer_refs || [];
  }

  /**
   * Get power mark for a question
   */
  getPowerMark(questionId: string): string | undefined {
    return this._powerMarks.get(questionId);
  }

  /**
   * Get bonus question by ID
   */
  getBonusQuestion(questionId: string): BonusQuestion | undefined {
    return this._bonusQuestions.get(questionId);
  }

  /**
   * Get all tossup IDs
   */
  getTossupIds(): string[] {
    return Array.from(this._tossups.keys());
  }

  /**
   * Get all bonus IDs
   */
  getBonusIds(): string[] {
    return Array.from(this._bonusQuestions.keys());
  }

  /**
   * Get count of tossups
   */
  get tossupCount(): number {
    return this._tossups.size;
  }

  /**
   * Get count of bonuses
   */
  get bonusCount(): number {
    return this._bonusQuestions.size;
  }

  /**
   * Check if a tossup answer is correct
   */
  checkTossupAnswer(questionId: string, guess: string): boolean {
    if (!guess) return false;

    const referenceCorrect = this.getRefAnswers(questionId);
    return evaluateAnswer(guess, referenceCorrect);
  }

  /**
   * Check if a bonus part answer is correct
   */
  checkBonusAnswer(questionId: string, partIndex: number, answer: string): boolean {
    if (!answer) return false;

    const bonus = this._bonusQuestions.get(questionId);
    if (!bonus) return false;

    if (partIndex < 0 || partIndex >= bonus.parts.length) return false;

    const part = bonus.parts[partIndex];
    return evaluateAnswer(answer, part.answer_refs);
  }
}
