import fs from 'fs';
import path from 'path';
import type {
  GameConfig,
  GameState,
  TeamId,
  Player,
  AnswerRuling,
  TossupResponse,
  BonusResponse,
  CycleRecord,
  TossupResponseRecord,
  BonusResponseRecord,
  QuestionResult,
  QuestionOutcome,
  TossupToken,
  AIBuzzMode,
  BonusPartDecision,
  AIPlayerKwargs,
} from '../../shared/types.js';
import { aiTossupPoints, bonusConsultPoints } from '../../shared/scoring.js';
import { bonusModelLabel, tossupModelLabel } from '../../shared/modelLabels.js';
import { createInitialGameState } from '../../shared/types.js';
import { Questions } from '../data/questions.js';
import { Buzzes } from '../data/buzzes.js';

type StateUpdateCallback = (state: GameState) => void;

/**
 * Game Engine - manages the Quiz Bowl game state machine
 */
export class GameEngine {
  private config: GameConfig;
  private state: GameState;
  private questions: Questions;
  private buzzes: Buzzes;
  private onStateUpdate: StateUpdateCallback;

  // Question IDs
  private tossupIds: string[] = [];
  private bonusIds: string[] = [];

  // Player mappings
  private teamAssignment: Map<string, TeamId> = new Map();
  private players: Map<string, Player> = new Map();
  private buzzerKeyToPlayerId: Map<string, string> = new Map();

  // Current tossup state
  private currentTossupTokens: TossupToken[] = [];
  private streamTimer: NodeJS.Timeout | null = null;

  // Cycle records for logging
  private currentRecord: CycleRecord | null = null;
  private outputDir: string = '';

  constructor(config: GameConfig, onStateUpdate: StateUpdateCallback) {
    this.config = config;
    this.state = createInitialGameState();
    this.onStateUpdate = onStateUpdate;
    this.questions = new Questions();
    this.buzzes = new Buzzes(this.questions);

    // Setup player mappings
    this.setupPlayerMappings();
  }

  /**
   * Initialize the game by loading questions and AI responses
   */
  async initialize(): Promise<void> {
    // Load questions
    this.questions.loadTossupQuestions(this.config.tossup_file);
    if (this.config.bonus_file) {
      this.questions.loadBonusQuestions(this.config.bonus_file);
    }

    if (this.config.power_file) {
      this.questions.loadPower(this.config.power_file);
    }

    if (this.config.equiv_file) {
      this.questions.loadEquivalents(this.config.equiv_file);
    }

    // Load AI responses
    await this.loadAIResponses();

    // Get valid question IDs
    // For tossups, we need AI responses; for bonuses, check if any responses exist
    this.tossupIds = this.questions.getTossupIds().filter((id) =>
      this.buzzes.hasTossupQuestion(id)
    );

    // If no tossups have AI responses, use all tossups (allows human-only games)
    if (this.tossupIds.length === 0) {
      this.tossupIds = this.questions.getTossupIds();
      console.warn('No AI tossup responses found, using all questions');
    }

    // For bonuses, use all if no AI responses
    this.bonusIds = this.questions.getBonusIds();
    const bonusesWithResponses = this.bonusIds.filter((id) =>
      this.buzzes.hasBonusQuestion(id)
    );
    if (bonusesWithResponses.length > 0) {
      this.bonusIds = bonusesWithResponses;
    }

    // Update state totals
    this.state.totalTossups = this.tossupIds.length;
    this.state.totalBonuses = this.bonusIds.length;

    // Initialize question results for navigation
    this.initializeQuestionResults();

    // Create output directory for game logs
    // Include seconds to reduce collisions when starting games quickly.
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const runsDir = path.join(process.cwd(), 'runs');
    this.outputDir = path.join(runsDir, timestamp);
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch (error) {
      console.warn('Could not create output directory:', error);
      this.outputDir = '';
    }

    console.log(`Game initialized with ${this.tossupIds.length} tossups and ${this.bonusIds.length} bonuses`);
  }

  /**
   * Setup player mappings from config
   */
  private setupPlayerMappings(): void {
    const setupTeam = (teamId: TeamId, team: typeof this.config.team_a) => {
      for (const player of team.players) {
        this.teamAssignment.set(player.player_id, teamId);
        this.players.set(player.player_id, player);

        if (player.type === 'human') {
          const kwargs = player.extra_kwargs as { buzzer_key: string };
          this.buzzerKeyToPlayerId.set(kwargs.buzzer_key.toUpperCase(), player.player_id);
        }
        // AI players are resolved by their tossup_model / bonus_model at runtime
        // (see checkForAIBuzzes / loadOwningTeamBonusResponses). We intentionally do
        // not build a model -> player map here: multiple AI teammates may share a
        // model (decoupled tossup/bonus selection), which a single-valued map cannot
        // represent.
      }
    };

    setupTeam('team_a', this.config.team_a);
    setupTeam('team_b', this.config.team_b);
  }

  /** Resolve the buzz mode for an AI player (absent => autonomous). */
  private getAiBuzzMode(playerId: string): AIBuzzMode {
    return this.state.aiBuzzModes[playerId] ?? 'autonomous';
  }

  /** Resolve the autonomous-after-k threshold for an AI player (absent => config default). */
  private getAiAutonomousK(playerId: string): number {
    const k = this.state.aiAutonomousK[playerId] ?? this.config.autonomous_default_k ?? 1;
    return Math.max(1, k);
  }

  private plainTextFromTokens(tokens: TossupToken[]): string {
    return tokens
      .filter((token) => token.kind === 'text')
      .map((token) => token.text)
      .join(' ');
  }

  private isRevealLocked(): boolean {
    return !!this.state.revealLockoutUntilMs && Date.now() < this.state.revealLockoutUntilMs;
  }

  /**
   * Initialize question results for navigation sidebar
   */
  private initializeQuestionResults(): void {
    // Initialize tossup results
    this.state.tossupResults = this.tossupIds.map((id, index) => {
      const tossup = this.questions.getTossup(id);
      const text = tossup ? this.plainTextFromTokens(tossup.tokens) : '';
      const previewText = text.split(/\s+/).slice(0, 10).join(' ') + (text.split(/\s+/).length > 10 ? '...' : '');

      return {
        index,
        questionId: id,
        type: 'tossup' as const,
        outcome: 'pending' as QuestionOutcome,
        previewText,
        answer: tossup?.answer || '',
      };
    });

    // Initialize bonus results
    this.state.bonusResults = this.bonusIds.map((id, index) => {
      const bonus = this.questions.getBonusQuestion(id);
      const leadin = bonus?.leadin || '';
      const previewText = leadin.length > 80 ? leadin.slice(0, 80) + '...' : leadin;

      return {
        index,
        questionId: id,
        type: 'bonus' as const,
        outcome: 'pending' as QuestionOutcome,
        previewText,
        // No answer line for bonuses - they have multiple parts
      };
    });
  }

  /**
   * Update tossup result outcome
   */
  private updateTossupResult(tossupIndex: number, outcome: QuestionOutcome, previousScore?: { team_a: number; team_b: number }): void {
    const result = this.state.tossupResults.find(r => r.index === tossupIndex);
    if (result) {
      result.outcome = outcome;
      if (previousScore !== undefined) {
        result.previousScore = previousScore;
      }
    }
  }

  /**
   * Update bonus result outcome
   */
  private updateBonusResult(bonusIndex: number, outcome: QuestionOutcome, previousScore?: { team_a: number; team_b: number }): void {
    const result = this.state.bonusResults.find(r => r.index === bonusIndex);
    if (result) {
      result.outcome = outcome;
      if (previousScore !== undefined) {
        result.previousScore = previousScore;
      }
    }
  }

  /**
   * Get all AI players across both teams.
   */
  private getAIPlayers(): Player[] {
    return [
      ...this.config.team_a.players.filter((p) => p.type === 'ai'),
      ...this.config.team_b.players.filter((p) => p.type === 'ai'),
    ];
  }

  /** Resolve a bonus response system key to its roster display name. */
  private bonusModelLabelForSystem(systemKey: string): string {
    const owner = this.state.bonusOwner;
    if (!owner) return systemKey;
    for (const player of this.config[owner].players) {
      if (player.type === 'ai') {
        const kwargs = player.extra_kwargs as AIPlayerKwargs;
        if (kwargs.bonus_model === systemKey) {
          return bonusModelLabel(kwargs);
        }
      }
    }
    return systemKey;
  }

  /**
   * Load AI responses from the model directory.
   *
   * Tossup and bonus models are decoupled and may be shared across teammates, so
   * we load each distinct model file exactly once. This matters for bonuses in
   * particular: `Buzzes.addBonusResponse` appends rows, so loading the same bonus
   * model twice would duplicate every bonus response. (Tossup loading is keyed by
   * token position and is naturally idempotent, but we dedupe it too for clarity.)
   */
  private async loadAIResponses(): Promise<void> {
    const modelDir = this.config.model_directory;

    const aiPlayers = this.getAIPlayers();

    // Map each distinct model to a representative player, used only for clearer
    // error messages if a response file is missing.
    const tossupModels = new Map<string, Player>();
    const bonusModels = new Map<string, Player>();
    for (const player of aiPlayers) {
      const kwargs = player.extra_kwargs as { tossup_model: string; bonus_model: string };
      if (kwargs.tossup_model && !tossupModels.has(kwargs.tossup_model)) {
        tossupModels.set(kwargs.tossup_model, player);
      }
      if (kwargs.bonus_model && !bonusModels.has(kwargs.bonus_model)) {
        bonusModels.set(kwargs.bonus_model, player);
      }
    }

    for (const [model, player] of tossupModels) {
      const tossupSuccess = this.buzzes.addTossupSystem(path.join(modelDir, model));
      if (!tossupSuccess) {
        throw new Error(
          `Failed to load tossup responses for ${player.name} (model: ${model})`
        );
      }
    }

    // Load bonus responses if bonus file is specified
    if (this.config.bonus_file) {
      for (const [model, player] of bonusModels) {
        const bonusSuccess = this.buzzes.addBonusSystem(path.join(modelDir, model));
        if (!bonusSuccess) {
          throw new Error(
            `Failed to load bonus responses for ${player.name} (model: ${model})`
          );
        }
      }
    }
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return { ...this.state };
  }

  /**
   * Start the game
   */
  startGame(): void {
    if (this.tossupIds.length === 0) {
      throw new Error('No tossup questions available');
    }

    // Reset all game state
    this.state.currentTossupNum = 0;
    this.state.currentTossupId = null;
    this.state.currentBonusNum = 0;
    this.state.currentBonusId = null;
    this.state.bonusOwner = null;
    this.state.bonusQuestion = null;
    this.state.currentBonusPartAnswer = null;
    this.state.scores = { team_a: 0, team_b: 0 };
    this.initAiBuzzModes();
    this.nextQuestion();
  }

  /**
   * Move to the next question
   */
  nextQuestion(): void {
    // Save current record if exists
    if (this.currentRecord && this.state.currentTossupNum > 0) {
      this.saveRecord();
    }

    // Check if game is over
    if (this.state.currentTossupNum >= this.tossupIds.length) {
      this.endGame();
      return;
    }

    // Set up next tossup
    const tossupId = this.tossupIds[this.state.currentTossupNum];
    this.state.currentTossupId = tossupId;
    this.state.currentTossupNum++;

    this.startTossupQuestion();
  }

  /**
   * Start a tossup question
   */
  private startTossupQuestion(): void {
    const tossup = this.questions.getTossup(this.state.currentTossupId!);
    if (!tossup) {
      console.error(`Tossup not found: ${this.state.currentTossupId}`);
      return;
    }

    // Reset tossup state
    this.currentTossupTokens = tossup.tokens;
    this.state.phase = 'tossup_streaming';
    this.state.tokenIndex = 0;
    this.state.totalTokens = this.currentTossupTokens.length;
    this.state.wordIndex = 0;
    this.state.revealedText = '';
    this.state.totalWords = this.currentTossupTokens.length;
    this.state.activeMultimodalToken = null;
    this.state.revealLockoutUntilMs = null;
    this.state.revealedTossupTokens = [];
    this.state.teamBuzzed = { team_a: false, team_b: false };
    this.state.buzzingPlayer = null;
    this.state.buzzingPlayerGuess = null;
    this.state.currentGuesses = [];

    // Clear bonus-related state when starting a tossup
    this.state.bonusOwner = null;
    this.state.bonusQuestion = null;
    this.state.bonusResponses = [];
    this.state.currentBonusPartAnswer = null;
    this.state.bonusStage = 'leadin';

    // Set current answer and full text for moderator view
    this.state.currentTossupAnswer = tossup.answer;
    this.state.fullTossupText = this.plainTextFromTokens(tossup.tokens);
    this.state.fullTossupTokens = tossup.tokens;

    // Set initial points value
    this.state.tossupPointsValue = this.config.enable_power_points
      ? this.config.power_points_value
      : this.config.default_points_value;

    // Initialize record
    this.currentRecord = {
      tossupResponses: [],
      bonusResponses: null,
    };

    this.emitState();

    // Start auto-streaming if enabled
    if (this.config.auto_stream) {
      this.startAutoStream();
    } else {
      // In manual mode, reveal first token
      this.revealNextWord();
    }
  }

  /**
   * Start auto-streaming tokens
   */
  private startAutoStream(): void {
    const pauseDuration = Math.floor(60000 / this.config.streaming_speed);

    this.streamTimer = setInterval(() => {
      if (this.state.phase === 'tossup_streaming') {
        this.revealNextWord();
      }
    }, pauseDuration);
  }

  /**
   * Stop auto-streaming
   */
  private stopAutoStream(): void {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
  }

  /**
   * Reveal the next token in the tossup
   */
  revealNextWord(): void {
    if (this.state.phase !== 'tossup_streaming') return;
    if (this.isRevealLocked()) return;

    // Check if we've reached the end
    if (this.state.tokenIndex >= this.currentTossupTokens.length) {
      this.endTossupQuestion();
      return;
    }

    const token = this.currentTossupTokens[this.state.tokenIndex];
    const currentPosition = this.state.tokenIndex;

    if (token.kind === 'text' && this.config.enable_power_points) {
      const powerMark = this.questions.getPowerMark(this.state.currentTossupId!);
      if (powerMark && token.text.toLowerCase().startsWith(powerMark.toLowerCase())) {
        this.state.tossupPointsValue = this.config.default_points_value;
      }
    }

    if (token.kind === 'text') {
      if (this.state.revealedText) {
        this.state.revealedText += ' ' + token.text;
      } else {
        this.state.revealedText = token.text;
      }
    } else if (token.tokenType === 'img' || token.tokenType === 'audio') {
      this.state.activeMultimodalToken = token;
      const lockoutMs = Math.max(0, this.config.multimodal_reveal_lockout_seconds) * 1000;
      this.state.revealLockoutUntilMs = Date.now() + lockoutMs;
    }
    this.state.revealedTossupTokens.push(token);

    // Get current AI guesses
    const guesses = this.buzzes.getTossupGuesses(this.state.currentTossupId!, currentPosition);

    // Check for AI buzzes
    this.checkForAIBuzzes(guesses);

    this.state.tokenIndex++;
    this.state.wordIndex = this.state.tokenIndex;
    this.emitState();
  }

  /**
   * Check if any AI players should buzz
   */
  private checkForAIBuzzes(guesses: Map<string, TossupResponse>): void {
    // [playerId, guess] for each AI player that is eligible to buzz this token.
    const validBuzzes: Array<[string, TossupResponse]> = [];

    // 0-indexed position of the token currently being processed.
    const currentPosition = this.state.tokenIndex;

    // Iterate over AI players (not over guess systems) so that multiple teammates
    // sharing a tossup model are each evaluated independently.
    for (const player of this.getAIPlayers()) {
      const playerId = player.player_id;
      const kwargs = player.extra_kwargs as { tossup_model: string };
      const guess = guesses.get(kwargs.tossup_model);
      if (!guess) continue;

      const playerTeam = this.teamAssignment.get(playerId)!;
      const otherTeam = playerTeam === 'team_a' ? 'team_b' : 'team_a';

      // Buzz mode gating (QANTA 2026)
      const mode = this.getAiBuzzMode(playerId);
      // Muted AIs never buzz; semi-autonomous AIs only buzz when a human triggers them.
      if (mode === 'muted' || mode === 'semi') continue;
      // Autonomous AIs cannot buzz before their k-th token is revealed (gate >= k).
      const k = this.getAiAutonomousK(playerId);
      if (currentPosition < k) continue;

      // Skip if team already buzzed
      if (this.state.teamBuzzed[playerTeam]) continue;

      // Suppress early AI second buzzes
      const isLastWord = this.state.wordIndex === this.currentTossupTokens.length - 1;
      if (this.state.teamBuzzed[otherTeam] && !isLastWord) {
        if (this.config.suppress_early_ai_second_buzzes) {
          continue;
        }
      }

      // Discard early buzzes: a buzz decision made before token k does not count
      // (a guess held over from before the gate cannot trigger a buzz). The forced
      // second-team buzz on the last word is exempt and uses the latest guess.
      const buzzedAtOrAfterK =
        !!guess.buzz && guess.token_position !== undefined && guess.token_position >= k;
      if (buzzedAtOrAfterK || (this.state.teamBuzzed[otherTeam] && isLastWord)) {
        validBuzzes.push([playerId, guess]);
      }
    }

    // Handle first valid buzz
    if (validBuzzes.length > 0 && this.tossupInProgress()) {
      const [playerId, guess] = validBuzzes[0];

      this.state.buzzingPlayer = playerId;
      this.state.currentGuesses = Array.from(guesses.values());

      this.handleAIBuzz(guess);
    } else {
      // Update guesses display
      this.state.currentGuesses = Array.from(guesses.values());
    }
  }

  /**
   * Check if tossup is still in progress
   */
  private tossupInProgress(): boolean {
    return (
      this.state.phase === 'tossup_streaming' &&
      !(this.state.teamBuzzed.team_a && this.state.teamBuzzed.team_b)
    );
  }

  /**
   * Handle a player buzz (human or AI)
   */
  handleBuzz(playerId: string): { buzzed: boolean } {
    if (this.state.phase !== 'tossup_streaming') {
      return { buzzed: false };
    }

    const playerTeam = this.teamAssignment.get(playerId);
    if (!playerTeam) {
      console.error(`Unknown player: ${playerId}`);
      return { buzzed: false };
    }

    // Check if team already buzzed
    if (this.state.teamBuzzed[playerTeam]) {
      return { buzzed: false };
    }

    // Set buzzing player and mark team as buzzed
    this.state.buzzingPlayer = playerId;
    this.state.buzzingPlayerGuess = null; // Human player - guess entered later
    this.state.teamBuzzed[playerTeam] = true;
    this.state.phase = 'answer_review';

    // Stop auto-stream
    this.stopAutoStream();

    this.emitState();
    return { buzzed: true };
  }

  /**
   * Handle AI buzz specifically
   */
  private handleAIBuzz(guess: TossupResponse): void {
    const playerId = this.state.buzzingPlayer!;
    const playerTeam = this.teamAssignment.get(playerId)!;

    // Mark team as buzzed and store the guess
    this.state.teamBuzzed[playerTeam] = true;
    this.state.buzzingPlayerGuess = guess.guess; // AI player - guess known immediately
    this.state.phase = 'answer_review';

    // Stop auto-stream
    this.stopAutoStream();

    this.emitState();
  }

  /**
   * After a buzz, reassign who actually answers (QANTA 2026).
   *
   * During answer review the moderator can either keep the human who buzzed, or
   * delegate the answer to a same-team semi-autonomous AI. Delegating to an AI
   * makes it the buzzing player, so the existing ruling logic scores it as an AI
   * buzz (weight-class deflated). The target must be on the same team as the
   * player who originally buzzed (the team that owns the buzz).
   */
  setBuzzSource(playerId: string): { changed: boolean } {
    if (this.state.phase !== 'answer_review' || !this.state.buzzingPlayer) {
      return { changed: false };
    }

    const currentTeam = this.teamAssignment.get(this.state.buzzingPlayer);
    const target = this.players.get(playerId);
    const targetTeam = this.teamAssignment.get(playerId);
    if (!target || !targetTeam || targetTeam !== currentTeam) {
      return { changed: false };
    }

    if (target.type === 'ai') {
      // Only AIs explicitly in semi-autonomous mode may be delegated to.
      if (this.getAiBuzzMode(playerId) !== 'semi') return { changed: false };

      const kwargs = target.extra_kwargs as { tossup_model: string };
      // Latest guess at or before the current revealed position (even if buzz === 0).
      const position = Math.max(0, this.state.tokenIndex - 1);
      const guesses = this.buzzes.getTossupGuesses(this.state.currentTossupId!, position);
      const guess = guesses.get(kwargs.tossup_model);

      this.state.buzzingPlayer = playerId;
      this.state.currentGuesses = Array.from(guesses.values());
      this.state.buzzingPlayerGuess = guess ? guess.guess : '';
    } else {
      // Back to a human answerer; the moderator enters the guess later.
      this.state.buzzingPlayer = playerId;
      this.state.buzzingPlayerGuess = null;
    }

    this.emitState();
    return { changed: true };
  }

  /**
   * Handle answer ruling from moderator
   */
  handleAnswerRuling(ruling: AnswerRuling, answer: string): void {
    if (this.state.phase !== 'answer_review' || !this.state.buzzingPlayer) {
      return;
    }

    const playerId = this.state.buzzingPlayer;
    const playerTeam = this.teamAssignment.get(playerId);
    const player = this.players.get(playerId);

    // Safety check: if player was removed during answer review, skip
    if (!playerTeam || !player) {
      console.warn(`Player ${playerId} not found during answer ruling - may have been removed`);
      this.state.buzzingPlayer = null;
      this.state.phase = 'tossup_streaming';
      this.emitState();
      return;
    }

    const otherTeam = playerTeam === 'team_a' ? 'team_b' : 'team_a';

    // Calculate points
    let points = 0;
    const isCorrect = ruling === 'accept';

    if (isCorrect) {
      points = this.state.tossupPointsValue;
      // QANTA 2026: deflate a correct AI buzz by its model weight class.
      if (player.type === 'ai') {
        points = aiTossupPoints(this.config, points, player);
      }
    } else if (ruling === 'reject') {
      // Penalty depends on whether other team already buzzed
      points = this.state.teamBuzzed[otherTeam]
        ? -this.config.tossup_penalty_value_second_team
        : -this.config.tossup_penalty_value;
    }
    // reject_no_penalty = 0 points

    // Update score
    this.state.scores[playerTeam] += points;

    // Record the response
    if (this.currentRecord) {
      const responseRecord: TossupResponseRecord = {
        tossupIndex: this.state.currentTossupNum - 1,
        qid: this.state.currentTossupId!,
        marker: {
          player: {
            id: playerId,
            isStarter: true,
            name: player.name,
            team: playerTeam === 'team_a' ? this.config.team_a.name : this.config.team_b.name,
          },
          tossupModelName:
            player.type === 'ai' ? tossupModelLabel(player.extra_kwargs as AIPlayerKwargs) : undefined,
          position: this.state.wordIndex,
          guess: answer,
          points,
          isCorrect,
        },
      };
      this.currentRecord.tossupResponses.push(responseRecord);
    }

    // Clear buzzing player
    this.state.buzzingPlayer = null;

    if (isCorrect) {
      // Calculate total score changes from all responses (including penalties)
      let teamAScore = 0;
      let teamBScore = 0;
      if (this.currentRecord?.tossupResponses) {
        for (const response of this.currentRecord.tossupResponses) {
          const teamName = response.marker.player.team;
          const responsePoints = response.marker.points;
          if (teamName === this.config.team_a.name) {
            teamAScore += responsePoints;
          } else if (teamName === this.config.team_b.name) {
            teamBScore += responsePoints;
          }
        }
      }
      // Store total score changes for replay tracking
      const previousScore = { team_a: teamAScore, team_b: teamBScore };
      // Update tossup result - the team that got it right
      this.updateTossupResult(this.state.currentTossupNum - 1, playerTeam, previousScore);

      // Check if we have bonus questions
      if (this.bonusIds.length > 0 && this.state.currentBonusNum < this.bonusIds.length) {
        this.startBonusQuestion(playerTeam);
      } else {
        // Move to next tossup
        this.nextQuestion();
      }
    } else {
      // Check if other team can still buzz
      if (!this.state.teamBuzzed[otherTeam]) {
        // Resume streaming
        this.state.phase = 'tossup_streaming';
        if (this.config.auto_stream) {
          this.startAutoStream();
        }
        this.emitState();
      } else {
        // Both teams buzzed wrong - mark as dead and end question
        // Score will be calculated in endTossupQuestion from currentRecord
        this.endTossupQuestion();
      }
    }
  }

  /**
   * End the current tossup question (no one got it)
   */
  private endTossupQuestion(): void {
    this.stopAutoStream();

    this.state.phase = 'tossup_ready';
    this.state.buzzingPlayer = null;
    this.state.revealLockoutUntilMs = null;

    // Show full question text
    this.state.revealedText = this.plainTextFromTokens(this.currentTossupTokens);
    this.state.tokenIndex = this.currentTossupTokens.length;
    this.state.wordIndex = this.currentTossupTokens.length;
    this.state.revealedTossupTokens = [...this.currentTossupTokens];

    // Mark as dead if not already marked (could be marked in handleAnswerRuling)
    const currentResult = this.state.tossupResults.find(r => r.index === this.state.currentTossupNum - 1);
    if (currentResult && currentResult.outcome === 'pending') {
      // Calculate total score changes from all responses (penalties)
      let teamAScore = 0;
      let teamBScore = 0;
      if (this.currentRecord?.tossupResponses) {
        for (const response of this.currentRecord.tossupResponses) {
          const teamName = response.marker.player.team;
          const points = response.marker.points;
          if (teamName === this.config.team_a.name) {
            teamAScore += points;
          } else if (teamName === this.config.team_b.name) {
            teamBScore += points;
          }
        }
      }
      // Store total score changes (usually negative for penalties)
      this.updateTossupResult(this.state.currentTossupNum - 1, 'dead', { team_a: teamAScore, team_b: teamBScore });
    }

    this.emitState();
  }

  /**
   * Start a bonus question
   */
  startBonusQuestion(owner: TeamId, bonusNum?: number): void {
    if (bonusNum !== undefined) {
      this.state.currentBonusNum = bonusNum;
    }

    const bonusId = this.bonusIds[this.state.currentBonusNum];
    this.state.currentBonusId = bonusId;
    this.state.currentBonusNum++;

    const bonus = this.questions.getBonusQuestion(bonusId);
    if (!bonus) {
      console.error(`Bonus not found: ${bonusId}`);
      this.nextQuestion();
      return;
    }

    // Reset bonus state
    this.state.phase = 'bonus_leadin';
    this.state.bonusOwner = owner;
    this.state.currentBonusPart = 0;
    this.state.bonusStage = 'leadin';
    this.state.bonusQuestion = bonus;
    this.state.bonusResponses = [];
    this.state.bonusPartDecision = 'pending';
    this.state.bonusAiRevealed = false;

    // Clear tossup-related state when starting a bonus
    this.state.buzzingPlayer = null;
    this.state.buzzingPlayerGuess = null;
    this.state.teamBuzzed = { team_a: false, team_b: false };
    this.state.currentGuesses = [];
    this.state.currentTossupAnswer = null;
    this.state.fullTossupText = null;
    this.state.fullTossupTokens = null;
    this.state.revealedTossupTokens = [];
    this.state.activeMultimodalToken = null;
    this.state.revealLockoutUntilMs = null;

    // Set first part's answer for moderator
    if (bonus.parts.length > 0) {
      this.state.currentBonusPartAnswer = bonus.parts[0].answer;
    }

    // Initialize bonus record
    if (this.currentRecord) {
      this.currentRecord.bonusResponses = {
        bonusIndex: this.state.currentBonusNum - 1,
        correctParts: [],
        receivingTeamName:
          owner === 'team_a' ? this.config.team_a.name : this.config.team_b.name,
        parts: [],
      };
    }

    this.emitState();
  }

  /**
   * Advance from the bonus lead-in to the first part.
   * Under QANTA 2026 rules, per-part progression is driven by explicit decisions
   * (see `handleBonusPartResult`), so this only handles leadin -> question.
   */
  advanceBonusStage(): void {
    if (this.state.bonusStage !== 'leadin') {
      return;
    }
    this.state.bonusStage = 'question';
    this.state.phase = 'bonus_part';
    this.state.bonusPartDecision = 'pending';
    this.state.bonusAiRevealed = false;
    this.emitState();
  }

  /** Load the owning team's AI responses for the current bonus part. */
  private loadOwningTeamBonusResponses(): BonusResponse[] {
    if (!this.state.bonusOwner) return [];

    const partNum = this.state.currentBonusPart + 1; // 1-indexed
    const responses = this.buzzes.getBonusGuesses(this.state.currentBonusId!, partNum);

    // Collect the bonus models used by the owning team's AI players. Using a set of
    // models (rather than a model -> player map) supports teammates that share a
    // bonus model under decoupled selection.
    const owningBonusModels = new Set<string>();
    for (const player of this.config[this.state.bonusOwner].players) {
      if (player.type === 'ai') {
        const kwargs = player.extra_kwargs as { bonus_model: string };
        if (kwargs.bonus_model) owningBonusModels.add(kwargs.bonus_model);
      }
    }

    return responses.filter((r) => owningBonusModels.has(r.system));
  }

  /**
   * QANTA 2026: reveal the owning team's AI responses for the current bonus part.
   * The team consults the AI before submitting (consult path -> reduced credit).
   */
  revealBonusAi(): void {
    if (this.state.phase !== 'bonus_part') return;
    this.state.bonusAiRevealed = true;
    this.state.bonusResponses = this.loadOwningTeamBonusResponses();
    this.emitState();
  }

  /**
   * QANTA 2026: resolve a bonus part via one of three decisions.
   * - own: full points if correct, else 0.
   * - consult_ai: `bonus_ai_consult_factor` * full points if correct, else 0.
   * - abstain: `bonus_abstain_points` if the moderator confirms nobody was correct, else 0.
   */
  handleBonusPartResult(data: { decision: BonusPartDecision; correct: boolean; answer: string }): void {
    if (this.state.phase !== 'bonus_part' || !this.state.bonusOwner) return;

    const { decision, correct, answer } = data;
    const partIndex = this.state.currentBonusPart;
    const fullPoints = this.config.bonus_part_points;

    let points = 0;
    if (decision === 'own') {
      points = correct ? fullPoints : 0;
    } else if (decision === 'consult_ai') {
      const owningPlayers = this.config[this.state.bonusOwner].players;
      points = correct ? bonusConsultPoints(this.config, owningPlayers) : 0;
    } else if (decision === 'abstain') {
      points = correct ? (this.config.bonus_abstain_points ?? 1) : 0;
    }

    if (points > 0) {
      this.state.scores[this.state.bonusOwner] += points;
    }

    // Record the part
    if (this.currentRecord?.bonusResponses) {
      const bonusResponsesLog: Record<string, string> = {};
      const shouldLogBonusAi = decision === 'consult_ai' || this.state.bonusAiRevealed;
      if (shouldLogBonusAi) {
        const responses = this.state.bonusAiRevealed
          ? this.state.bonusResponses
          : this.loadOwningTeamBonusResponses();
        for (const response of responses) {
          bonusResponsesLog[this.bonusModelLabelForSystem(response.system)] = response.guess;
        }
      }

      this.currentRecord.bonusResponses.parts.push({
        teamName:
          this.state.bonusOwner === 'team_a'
            ? this.config.team_a.name
            : this.config.team_b.name,
        points,
        responses: bonusResponsesLog,
        finalGuess: answer,
        decision,
        aiRevealed: this.state.bonusAiRevealed,
      });

      if (points > 0) {
        this.currentRecord.bonusResponses.correctParts.push(partIndex);
      }
    }

    // Enter the per-part reveal screen instead of jumping straight ahead.
    // Always reveal the AI responses (and the answer line / answer image) so the
    // room sees the resolution before advancing to the next part or tossup.
    this.state.phase = 'bonus_part_reveal';
    this.state.bonusStage = 'part_reveal';
    this.state.bonusPartDecision = decision;
    this.state.bonusAiRevealed = true;
    this.state.bonusResponses = this.loadOwningTeamBonusResponses();

    this.emitState();
  }

  /**
   * QANTA 2026: advance from the per-part reveal screen to the next part, or
   * finish the bonus and move on to the next tossup.
   */
  advanceBonusPartReveal(): void {
    if (this.state.phase !== 'bonus_part_reveal') return;

    // Move to next part or end bonus
    this.state.currentBonusPart++;

    if (
      this.state.bonusQuestion &&
      this.state.currentBonusPart < this.state.bonusQuestion.parts.length
    ) {
      // Next part - reset per-part decision state (leadin is only shown once)
      this.state.bonusStage = 'question';
      this.state.phase = 'bonus_part';
      this.state.bonusResponses = [];
      this.state.bonusPartDecision = 'pending';
      this.state.bonusAiRevealed = false;
      this.state.currentBonusPartAnswer = this.state.bonusQuestion.parts[this.state.currentBonusPart].answer;
    } else {
      // End bonus, go to next tossup
      let totalBonusScore = 0;
      if (this.currentRecord?.bonusResponses) {
        totalBonusScore = this.currentRecord.bonusResponses.parts.reduce((sum, part) => sum + part.points, 0);
      }

      const previousScore = {
        team_a: this.state.bonusOwner === 'team_a' ? totalBonusScore : 0,
        team_b: this.state.bonusOwner === 'team_b' ? totalBonusScore : 0,
      };

      if (this.state.bonusOwner) {
        this.updateBonusResult(this.state.currentBonusNum - 1, this.state.bonusOwner, previousScore);
      }
      this.state.currentBonusPartAnswer = null;
      this.state.bonusPartDecision = 'pending';
      this.state.bonusAiRevealed = false;
      this.nextQuestion();
    }

    this.emitState();
  }

  /**
   * Jump to and play a specific tossup question
   * Discards current question in progress
   */
  playTossup(tossupIndex: number): void {
    if (tossupIndex < 0 || tossupIndex >= this.tossupIds.length) {
      console.error(`Invalid tossup index: ${tossupIndex}`);
      return;
    }

    this.stopAutoStream();

    // Mark current tossup as skipped if it was pending
    if (this.state.currentTossupNum > 0) {
      const currentResult = this.state.tossupResults.find(r => r.index === this.state.currentTossupNum - 1);
      if (currentResult && currentResult.outcome === 'pending') {
        this.updateTossupResult(this.state.currentTossupNum - 1, 'skipped');
      }
    }

    // Reverse previous score if question was already played
    const targetResult = this.state.tossupResults.find(r => r.index === tossupIndex);
    if (targetResult && targetResult.previousScore) {
      // Reverse the previous score
      this.state.scores.team_a -= targetResult.previousScore.team_a;
      this.state.scores.team_b -= targetResult.previousScore.team_b;
      // Clear previous score
      targetResult.previousScore = undefined;
    }

    // Reset the target question to pending (allow replay)
    this.updateTossupResult(tossupIndex, 'pending');

    // Jump to the question (nextQuestion will increment, so set to index)
    this.state.currentTossupNum = tossupIndex;
    this.nextQuestion();
  }

  /**
   * Jump to and play a specific bonus question
   * Requires a bonus owner (team that gets the bonus)
   */
  playBonus(bonusIndex: number, owner: TeamId): void {
    if (bonusIndex < 0 || bonusIndex >= this.bonusIds.length) {
      console.error(`Invalid bonus index: ${bonusIndex}`);
      return;
    }

    this.stopAutoStream();

    // Mark current bonus as skipped if it was pending
    if (this.state.currentBonusNum > 0) {
      const currentResult = this.state.bonusResults.find(r => r.index === this.state.currentBonusNum - 1);
      if (currentResult && currentResult.outcome === 'pending') {
        this.updateBonusResult(this.state.currentBonusNum - 1, 'skipped');
      }
    }

    // Reverse previous score if question was already played
    const targetResult = this.state.bonusResults.find(r => r.index === bonusIndex);
    if (targetResult && targetResult.previousScore) {
      // Reverse the previous score
      this.state.scores.team_a -= targetResult.previousScore.team_a;
      this.state.scores.team_b -= targetResult.previousScore.team_b;
      // Clear previous score
      targetResult.previousScore = undefined;
    }

    // Reset the target question to pending (allow replay)
    this.updateBonusResult(bonusIndex, 'pending');

    // Start the bonus question
    this.startBonusQuestion(owner, bonusIndex);
  }

  /**
   * Adjust team points
   */
  adjustPoints(adjustments: { team_a: number; team_b: number }): void {
    this.state.scores.team_a += adjustments.team_a;
    this.state.scores.team_b += adjustments.team_b;
    this.emitState();
  }

  /**
   * Set the buzz mode for an AI player (mute / autonomous / semi).
   */
  setAiBuzzMode(playerId: string, mode: AIBuzzMode): void {
    const player = this.players.get(playerId);
    if (!player || player.type !== 'ai') return;
    this.state.aiBuzzModes[playerId] = mode;
    this.emitState();
  }

  /**
   * QANTA 2026: update a single AI's "autonomous after k tokens" threshold live.
   * Takes effect on the next buzz check.
   */
  setAutonomousK(playerId: string, k: number): void {
    const player = this.players.get(playerId);
    if (!player || player.type !== 'ai') return;
    const next = Math.max(1, Math.floor(Number.isFinite(k) ? k : 1));
    this.state.aiAutonomousK[playerId] = next;
    this.emitState();
  }

  /**
   * Initialize default buzz modes (autonomous) for every AI player.
   */
  private initAiBuzzModes(): void {
    const modes: Record<string, AIBuzzMode> = {};
    const ks: Record<string, number> = {};
    const defaultK = Math.max(1, this.config.autonomous_default_k ?? 1);
    for (const player of [...this.config.team_a.players, ...this.config.team_b.players]) {
      if (player.type === 'ai') {
        modes[player.player_id] = 'autonomous';
        ks[player.player_id] = defaultK;
      }
    }
    this.state.aiBuzzModes = modes;
    this.state.aiAutonomousK = ks;
  }

  /**
   * Check if players can be modified in the current phase
   * Allowed at the start of a tossup (within first 5 reveal tokens)
   */
  canModifyPlayers(): boolean {
    // Allow at tossup_ready phase (between tossups)
    if (this.state.phase === 'tossup_ready') return true;

    // Also allow during tossup_streaming if within first 5 reveal tokens
    if (this.state.phase === 'tossup_streaming' && this.state.tokenIndex <= 5) {
      return true;
    }

    return false;
  }

  /**
   * Add a human player to a team mid-game
   */
  addPlayer(teamId: TeamId, player: Player): { success: boolean; error?: string } {
    // Validate phase
    if (!this.canModifyPlayers()) {
      return {
        success: false,
        error: 'Players can only be added at the start of a tossup (within the first 5 reveal tokens)'
      };
    }

    // Validate player type (only human players for now)
    if (player.type !== 'human') {
      return { success: false, error: 'Only human players can be added mid-game' };
    }

    // Check if player ID already exists
    if (this.players.has(player.player_id)) {
      return { success: false, error: 'Player ID already exists' };
    }

    // Check buzzer key uniqueness
    const kwargs = player.extra_kwargs as { buzzer_key: string };
    const buzzerKey = kwargs.buzzer_key?.toUpperCase();
    if (buzzerKey && this.buzzerKeyToPlayerId.has(buzzerKey)) {
      return { success: false, error: `Buzzer key "${buzzerKey}" is already in use` };
    }

    // Add to config
    const team = teamId === 'team_a' ? this.config.team_a : this.config.team_b;
    team.players.push(player);

    // Update mappings
    this.teamAssignment.set(player.player_id, teamId);
    this.players.set(player.player_id, player);
    if (buzzerKey) {
      this.buzzerKeyToPlayerId.set(buzzerKey, player.player_id);
    }

    console.log(`Player added mid-game: ${player.name} to ${team.name}`);
    this.emitState();

    return { success: true };
  }

  /**
   * Remove a human player from the game mid-game
   */
  removePlayer(playerId: string): { success: boolean; error?: string } {
    // Validate phase
    if (!this.canModifyPlayers()) {
      return {
        success: false,
        error: 'Players can only be removed at the start of a tossup (within the first 5 reveal tokens)'
      };
    }

    // Check if player exists
    const player = this.players.get(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Only allow removing human players
    if (player.type !== 'human') {
      return { success: false, error: 'Only human players can be removed mid-game' };
    }

    // Check if player is currently buzzing (shouldn't happen in tossup_ready phase, but safety check)
    if (this.state.buzzingPlayer === playerId) {
      return { success: false, error: 'Cannot remove a player who is currently buzzing' };
    }

    // Get team
    const teamId = this.teamAssignment.get(playerId);
    if (!teamId) {
      return { success: false, error: 'Player team not found' };
    }

    // Remove from config
    const team = teamId === 'team_a' ? this.config.team_a : this.config.team_b;
    team.players = team.players.filter(p => p.player_id !== playerId);

    // Remove from mappings
    this.teamAssignment.delete(playerId);
    this.players.delete(playerId);

    // Remove buzzer key mapping
    const kwargs = player.extra_kwargs as { buzzer_key?: string };
    if (kwargs.buzzer_key) {
      this.buzzerKeyToPlayerId.delete(kwargs.buzzer_key.toUpperCase());
    }

    // Remove from AI buzz modes if present
    if (this.state.aiBuzzModes[playerId]) {
      delete this.state.aiBuzzModes[playerId];
    }
    if (this.state.aiAutonomousK[playerId] !== undefined) {
      delete this.state.aiAutonomousK[playerId];
    }

    console.log(`Player removed mid-game: ${player.name} from ${team.name}`);
    this.emitState();

    return { success: true };
  }

  /**
   * Get current config (for syncing with clients after player changes)
   */
  getConfig(): GameConfig {
    return this.config;
  }

  /**
   * End the game
   */
  private endGame(): void {
    this.stopAutoStream();
    this.state.phase = 'game_over';

    // Save final record
    if (this.currentRecord) {
      this.saveRecord();
    }

    console.log(
      `Game over! Final scores: ${this.config.team_a.name}: ${this.state.scores.team_a}, ${this.config.team_b.name}: ${this.state.scores.team_b}`
    );

    this.emitState();
  }

  /**
   * Save the current cycle record
   */
  private saveRecord(): void {
    if (!this.currentRecord || !this.outputDir) return;

    const filePath = path.join(this.outputDir, 'cycles.jsonl');
    fs.appendFileSync(filePath, JSON.stringify(this.currentRecord) + '\n');
  }

  /**
   * Emit current state to clients
   */
  private emitState(): void {
    this.onStateUpdate(this.getState());
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopAutoStream();
  }
}
