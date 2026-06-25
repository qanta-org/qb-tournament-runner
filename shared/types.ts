// ============================================
// Client Role Types
// ============================================

export type ClientRole = 'moderator' | 'player';

export interface GameRoom {
  code: string;           // 5-letter join code
  moderatorId: string;    // Socket ID of moderator
  playerIds: string[];    // Socket IDs of player clients
  gameConfig: GameConfig | null;
  createdAt: Date;
}

// ============================================
// Player and Team Types
// ============================================

export type PlayerType = 'human' | 'ai';

/** AI model weight class, used to scale tossup scoring. */
export type AIWeightClass = 'lightweight' | 'midweight' | 'heavyweight';

/** How AI-earned points are deflated (applies to both tossup buzzes and bonus consults). */
export type DeflationMode = 'none' | 'static' | 'weighted';

/** Per-AI buzzing behaviour during tossups. */
export type AIBuzzMode = 'autonomous' | 'muted' | 'semi';

export interface AIPlayerKwargs {
  /** Response-file key for tossup buzzes (maps to `{tossup_model}.buzz.csv`). */
  tossup_model: string;
  /** Response-file key for bonus consults (maps to `{bonus_model}.bonus.csv`). */
  bonus_model: string;
  /** Human-readable tossup model name from `ai_tossup_roster.csv` (UI/logging). */
  tossup_model_name?: string;
  /** Human-readable bonus model name from `ai_bonus_roster.csv` (UI/logging). */
  bonus_model_name?: string;
  /**
   * Setup-time UI hint: whether the tossup and bonus models are coupled (one model
   * choice drives both) or decoupled (independently chosen). This is purely a UI
   * convenience; the engine always reads the concrete `tossup_model` / `bonus_model`
   * fields and ignores this flag. When absent, coupling is inferred from whether the
   * two models are equal (backward compatible with existing rosters).
   */
  coupled?: boolean;
  /** Weight class for tossup score scaling (from `ai_tossup_roster.csv`). */
  tossup_weight_class?: AIWeightClass;
  /** Weight class for bonus consult deflation (from `ai_bonus_roster.csv`). */
  bonus_weight_class?: AIWeightClass;
  /**
   * @deprecated Legacy single weight class. Prefer `tossup_weight_class` /
   * `bonus_weight_class`. Still read as fallback by scoring helpers.
   */
  weight_class?: AIWeightClass;
  /** Keyboard key used by a human to buzz on this AI's behalf in semi-autonomous mode. */
  buzzer_key?: string;
}

/**
 * A catalog entry from `ai_tossup_roster.csv` or `ai_bonus_roster.csv`.
 * Separates the display identity (id + name) from the response-file key (`model`).
 */
export interface ModelRosterEntry {
  id: string;
  name: string;
  model: string;
  weight_class?: AIWeightClass;
  description?: string;
}

export interface HumanPlayerKwargs {
  buzzer_key: string;
}

export interface Player {
  name: string;
  player_id: string;
  type: PlayerType;
  extra_kwargs: AIPlayerKwargs | HumanPlayerKwargs;
}

export interface Team {
  name: string;
  players: Player[];
}

export type TeamId = 'team_a' | 'team_b';

/**
 * Metadata about an AI model discovered in a dataset's responses directory.
 * `hasTossupResponses` / `hasBonusResponses` indicate which phases the model can
 * serve (a model may provide tossup responses, bonus responses, or both), which
 * lets the setup UI offer separate tossup and bonus model pools.
 */
export interface ModelInfo {
  name: string;
  hasTossupResponses: boolean;
  hasBonusResponses: boolean;
}

// ============================================
// Game Configuration
// ============================================

export interface GameConfig {
  // Game Simulation
  auto_stream: boolean;
  streaming_speed: number; // words per minute

  // Evaluation
  auto_evaluate: boolean;
  suppress_early_ai_second_buzzes: boolean;

  // Power points configuration (For Tossup)
  enable_power_points: boolean;
  power_points_value: number;

  // Default points value (For Tossup)
  default_points_value: number;
  tossup_penalty_value: number;
  tossup_penalty_value_second_team: number;

  // Bonus part points value
  bonus_part_points: number;
  multimodal_reveal_lockout_seconds: number;

  // QANTA 2026 rules
  // Tossup AI scoring multipliers by model weight class.
  ai_tossup_score_factors: {
    lightweight: number;
    midweight: number;
    heavyweight: number;
  };
  // How a correct AI tossup buzz is deflated by the buzzing AI's weight class.
  // - none: full points; static: subtract `tossup_static_deflation`;
  // - weighted: multiply by `ai_tossup_score_factors[weight_class]`.
  tossup_deflation_mode: DeflationMode;
  // Fixed points subtracted from a correct AI buzz under `static` tossup deflation.
  tossup_static_deflation: number;
  // Global token threshold for "autonomous after k tokens" buzz mode (k=1 means no gate).
  autonomous_default_k: number;
  // Fraction of bonus part points awarded when the team consults AI before answering.
  // Deprecated: retained only as a back-compat fallback when `bonus_deflation_mode` is unset.
  bonus_ai_consult_factor: number;
  // How a correct AI-consult bonus part is deflated.
  // - none: full points; static: subtract `bonus_static_deflation`;
  // - weighted: subtract sum of `bonus_weight_deflation[weight_class]` over the owning team's AI players.
  bonus_deflation_mode: DeflationMode;
  // Fixed points subtracted from a correct consult under `static` bonus deflation.
  bonus_static_deflation: number;
  // Per-weight-class deflation points subtracted under `weighted` bonus deflation.
  bonus_weight_deflation: {
    lightweight: number;
    midweight: number;
    heavyweight: number;
  };
  // Points awarded for a correct abstention (nobody — human or AI — was right).
  bonus_abstain_points: number;

  // Teams
  team_a: Team;
  team_b: Team;

  // Files (paths or IDs)
  tossup_file: string;
  bonus_file: string;
  model_directory: string;
  power_file?: string;
  equiv_file?: string;
}

export interface AppConfig {
  window_title: string;
  color_team_a: string;
  color_team_b: string;
}

// ============================================
// Question Types
// ============================================

export interface TossupQuestion {
  id: string;
  text: string;
  tokens: TossupToken[];
  has_image: boolean;
  has_audio: boolean;
  answer: string;
  answer_refs: string[];
}

export type MultimodalTokenType = 'img' | 'audio' | 'delay';

export interface TossupTextToken {
  kind: 'text';
  text: string;
}

export interface TossupMultimodalToken {
  kind: 'multimodal';
  tokenType: MultimodalTokenType;
  hash?: string;
  displayText?: string;
  assetPath?: string;
  assetUrl?: string;
}

export type TossupToken = TossupTextToken | TossupMultimodalToken;

export interface BonusMedia {
  imageUrl?: string;
  audioUrl?: string;
  audioDisplayText?: string;
}

export interface BonusPart {
  text: string;
  answer: string;
  answer_refs: string[];
  media?: BonusMedia;
  // Image revealed alongside the answer at the end of the part (answer_image column)
  answerMedia?: BonusMedia;
}

export interface BonusQuestion {
  id: string;
  leadin: string;
  leadinMedia?: BonusMedia;
  parts: BonusPart[];
}

// ============================================
// AI Response Types
// ============================================

export interface TossupResponse {
  system: string;
  guess: string;
  confidence: number;
  buzz: number; // 1 if should buzz, 0 otherwise
  token_position?: number; // token at which this guess/buzz was produced
}

export interface BonusResponse {
  question_id: string;
  part_num: number;
  system: string;
  guess: string;
  confidence: number;
  explanation: string;
}

// ============================================
// Game State Types
// ============================================

export type GamePhase =
  | 'setup'
  | 'tossup_ready'
  | 'tossup_streaming'
  | 'buzz_pending'
  | 'answer_review'
  | 'bonus_leadin'
  | 'bonus_part'
  | 'bonus_part_reveal'
  | 'bonus_human_response'
  | 'bonus_final_answer'
  | 'game_over';

export type BonusStage = 'leadin' | 'question' | 'part_reveal' | 'human_response' | 'final_answer';

/** Per-part decision made by the owning team under QANTA 2026 bonus rules. */
export type BonusPartDecision = 'pending' | 'own' | 'consult_ai' | 'abstain';

// Question outcome tracking for navigation
export type QuestionOutcome = 'pending' | 'team_a' | 'team_b' | 'dead' | 'skipped';

export interface QuestionResult {
  index: number;
  questionId: string;
  type: 'tossup' | 'bonus';
  outcome: QuestionOutcome;
  // For preview
  previewText: string;  // First ~50 chars or lead-in
  answer?: string;      // Answer line (tossups only)
  // Score tracking for replay
  previousScore?: { team_a: number; team_b: number };  // Points awarded when question was last played
}

export interface GameState {
  phase: GamePhase;

  // Room info
  roomCode: string | null;

  // Tossup state
  currentTossupNum: number;
  currentTossupId: string | null;
  tokenIndex: number;
  totalTokens: number;
  wordIndex: number;
  revealedText: string;
  totalWords: number;
  activeMultimodalToken: TossupMultimodalToken | null;
  revealLockoutUntilMs: number | null;
  teamBuzzed: Record<TeamId, boolean>;
  buzzingPlayer: string | null;
  buzzingPlayerGuess: string | null;  // The guess from buzzing player (shown to all)
  tossupPointsValue: number;

  // Current answer (moderator only - filtered out for player clients)
  currentTossupAnswer: string | null;

  // Full tossup text (moderator only - for preview with grayed unrevealed words)
  fullTossupText: string | null;
  fullTossupTokens: TossupToken[] | null;
  revealedTossupTokens: TossupToken[];

  // Current guesses from AI
  currentGuesses: TossupResponse[];

  // Bonus state
  currentBonusNum: number;
  currentBonusId: string | null;
  currentBonusPart: number;
  bonusOwner: TeamId | null;
  bonusStage: BonusStage;
  bonusQuestion: BonusQuestion | null;
  bonusResponses: BonusResponse[];

  // Per-part 3-way decision for the owning team (QANTA 2026 bonus rules)
  bonusPartDecision: BonusPartDecision;
  // Whether AI responses have been revealed for the current bonus part (consult path)
  bonusAiRevealed: boolean;

  // Current bonus part answer (moderator only)
  currentBonusPartAnswer: string | null;

  // Scores
  scores: Record<TeamId, number>;

  // Per-AI buzz mode (player_id -> mode). Absent entries default to 'autonomous'.
  aiBuzzModes: Record<string, AIBuzzMode>;

  // Per-AI "autonomous after k tokens" threshold (player_id -> k). Absent entries
  // default to GameConfig.autonomous_default_k. k=1 means no gate.
  aiAutonomousK: Record<string, number>;

  // Game progress
  totalTossups: number;
  totalBonuses: number;

  // Question results for navigation (moderator only)
  tossupResults: QuestionResult[];
  bonusResults: QuestionResult[];
}

// ============================================
// Tournament Types
// ============================================

/** Prelim phase structure: no prelims, full RR, double RR, or grouped RR */
export type PrelimStructure = 'none' | 'full_rr' | 'double_rr' | 'grouped_rr';

/** Qualifier phase (only when prelims are grouped): direct to playoffs or RR among qualifiers */
export type QualifierPhase = { kind: 'none' } | { kind: 'rr' };

/** Playoff structure: none or single elimination (future: double_elim) */
export type PlayoffStructure = 'none' | 'single_elim';

/** Structured tournament format: prelim → optional qualifiers → playoffs */
export interface TournamentFormat {
  prelim: PrelimStructure;
  qualifiers: QualifierPhase;
  playoffs: PlayoffStructure;
}

export type TournamentGameStatus = 'scheduled' | 'ready' | 'in_progress' | 'completed';

/** Tournament phase: prelims → qualifiers (optional) → playoffs → completed */
export type TournamentPhase = 'prelims' | 'qualifiers' | 'playoffs' | 'completed';

export interface PacketInfo {
  id: string;
  name: string;
  tossupFile: string;
  bonusFile?: string;
  tossupCount?: number;
  bonusCount?: number;
}

export interface TournamentTeam {
  id: string;
  name: string;
  humanPlayers: Player[];
  aiPlayers: Player[];
  group?: string;
}

export interface TournamentGame {
  id: string;
  round: number;
  matchNumber: number;
  phase: TournamentPhase;
  teamAId: string;
  teamBId: string;
  packetId: string;
  packetPath?: string;
  status: TournamentGameStatus;
  roomCode?: string;
  scores?: { team_a: number; team_b: number };
  winnerId?: string;
  dependsOn?: string[];
  tag?: string;
  group?: string;
}

export interface TeamStanding {
  teamId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  negs: number;
  bonusPoints: number;
  bonusAttempts: number;
  group?: string;
}

export interface Tournament {
  code: string;
  name: string;
  format: TournamentFormat;
  status: 'draft' | 'active' | 'completed';
  phase: TournamentPhase;
  datasetId: string;
  packets: PacketInfo[];
  teams: TournamentTeam[];
  games: TournamentGame[];
  standings: TeamStanding[];
  gameSettings: Partial<GameConfig>;
  modelDirectory: string;
  createdBy: string;
  createdAt: Date;
  topNForPlayoffs?: number;
  playoffBracketSize?: 2 | 4 | 8;
  numGroups?: number;
  groupAssignments?: Record<string, string[]>;
  advancePerGroup?: number;
}

export interface CreateTournamentParams {
  name: string;
  format: TournamentFormat;
  datasetId: string;
  /** Teams with human and AI players (wizard builds from roster) */
  teams: TournamentTeam[];
  /** Packets with full paths (from dataset) */
  packets: PacketInfo[];
  /** Path to model responses directory */
  modelDirectory: string;
  gameSettings: Partial<GameConfig>;
  topNForPlayoffs?: number;
  playoffBracketSize?: 2 | 4 | 8;
  numGroups?: number;
  groupAssignments?: Record<string, string[]>;
  advancePerGroup?: number;
}

// ============================================
// WebSocket Event Types
// ============================================

export type AnswerRuling = 'accept' | 'reject' | 'reject_no_penalty';

export interface TossupResponseRecord {
  tossupIndex: number;
  qid: string;
  marker: {
    player: {
      id: string;
      isStarter: boolean;
      name: string;
      team: string;
    };
    /** Display name of the tossup model that buzzed (from roster or fallback to model key). */
    tossupModelName?: string;
    position: number;
    guess: string;
    points: number;
    isCorrect: boolean;
  };
}

export interface BonusPartRecord {
  teamName: string;
  points: number;
  responses: Record<string, string>;
  finalGuess?: string;
  decision?: BonusPartDecision;
  aiRevealed?: boolean;
}

export interface BonusResponseRecord {
  bonusIndex: number;
  correctParts: number[];
  receivingTeamName: string;
  parts: BonusPartRecord[];
}

export interface CycleRecord {
  tossupResponses: TossupResponseRecord[];
  bonusResponses: BonusResponseRecord | null;
}

// Server -> Client events
export interface ServerToClientEvents {
  // Room events
  'room:created': (data: {
    code: string;
    role: ClientRole;
    tournamentCode?: string;
    round?: number;
    matchNumber?: number;
    teamAName?: string;
    teamBName?: string;
  }) => void;
  'room:joined': (data: { code: string; role: ClientRole; config: GameConfig | null }) => void;
  'room:error': (message: string) => void;
  'room:player_count': (count: number) => void;

  // Game events
  'game:state': (state: GameState) => void;
  'game:config': (config: GameConfig) => void;
  'tossup:word': (data: { word: string; index: number; text: string }) => void;
  'tossup:buzz': (data: { player: Player; guess: string }) => void;
  'tossup:guesses': (guesses: TossupResponse[]) => void;
  'tossup:end': (data: { answer: string }) => void;
  'bonus:part': (data: { part: BonusPart; partNum: number; totalParts: number }) => void;
  'bonus:responses': (responses: BonusResponse[]) => void;
  'score:update': (scores: Record<TeamId, number>) => void;
  'sound:buzz': () => void;
  'error': (message: string) => void;
}

// Client -> Server events
export interface ClientToServerEvents {
  // Room events
  'room:create': () => void;  // Moderator creates a room
  'room:join': (code: string) => void;  // Player joins a room
  'room:leave': () => void;

  // Game events (moderator only, except player:buzz)
  'game:start': (config: GameConfig) => void;
  'game:load_files': (data: { tossupFile: string; bonusFile?: string; modelDir: string }) => void;
  'moderator:next_word': () => void;
  'moderator:adjust_points': (data: { team_a: number; team_b: number }) => void;
  'player:buzz': (playerId: string) => void;
  'moderator:answer_ruling': (data: { ruling: AnswerRuling; answer: string }) => void;
  'bonus:advance': () => void;
  // QANTA 2026: advance from the per-part reveal screen to the next part / tossup
  'bonus:next_part': () => void;
  'bonus:human_response': (responses: Record<string, string>) => void;
  'bonus:final_answer': (answer: string) => void;
  // QANTA 2026: reveal AI responses for the current bonus part (consult path)
  'bonus:reveal_ai': () => void;
  // QANTA 2026: submit a per-part result with the chosen decision
  'bonus:part_result': (data: { decision: BonusPartDecision; correct: boolean; answer: string }) => void;
  // QANTA 2026: set a per-AI buzz mode (mute / autonomous / semi)
  'moderator:set_ai_buzz_mode': (data: { playerId: string; mode: AIBuzzMode }) => void;
  // QANTA 2026: update a single AI's "autonomous after k tokens" threshold live
  'moderator:set_autonomous_k': (data: { playerId: string; k: number }) => void;
  // QANTA 2026: after a buzz, reassign who answers (the human who buzzed, or a
  // same-team semi-autonomous AI delegated to by the moderator)
  'moderator:set_buzz_source': (playerId: string) => void;
  // Mid-game player management
  'moderator:add_player': (
    data: { teamId: TeamId; player: Player },
    callback?: (result: { success: boolean; error?: string }) => void
  ) => void;
  'moderator:remove_player': (
    playerId: string,
    callback?: (result: { success: boolean; error?: string }) => void
  ) => void;
  'moderator:can_modify_players': (
    callback?: (result: { canModify: boolean }) => void
  ) => void;
  // Question navigation
  'moderator:play_tossup': (tossupIndex: number) => void;
  'moderator:play_bonus': (data: { bonusIndex: number; owner: TeamId }) => void;
  // Tournament events
  'tournament:create': (params: CreateTournamentParams, callback?: (res: { code?: string; error?: string }) => void) => void;
  'tournament:get': (code: string, callback?: (res: { tournament?: Tournament; error?: string }) => void) => void;
  'tournament:start_game': (data: { code: string; gameId: string }, callback?: (res: { roomCode?: string; error?: string }) => void) => void;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_GAME_CONFIG: Partial<GameConfig> = {
  auto_stream: false,
  streaming_speed: 200,
  auto_evaluate: false,
  suppress_early_ai_second_buzzes: true,
  enable_power_points: false,
  power_points_value: 15,
  default_points_value: 10,
  tossup_penalty_value: 5,
  tossup_penalty_value_second_team: 0,
  bonus_part_points: 10,
  multimodal_reveal_lockout_seconds: 5,
  ai_tossup_score_factors: {
    lightweight: 1.0,
    midweight: 0.8,
    heavyweight: 0.4,
  },
  tossup_deflation_mode: 'weighted',
  tossup_static_deflation: 5,
  autonomous_default_k: 1,
  bonus_ai_consult_factor: 0.5,
  bonus_deflation_mode: 'static',
  bonus_static_deflation: 5,
  bonus_weight_deflation: {
    lightweight: 1,
    midweight: 2,
    heavyweight: 3,
  },
  bonus_abstain_points: 1,
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  window_title: 'Quiz Bowl Buzzer',
  color_team_a: '#d64960',
  color_team_b: '#2a9cad',
};

export function createInitialGameState(): GameState {
  return {
    phase: 'setup',
    roomCode: null,
    currentTossupNum: 0,
    currentTossupId: null,
    tokenIndex: 0,
    totalTokens: 0,
    wordIndex: 0,
    revealedText: '',
    totalWords: 0,
    activeMultimodalToken: null,
    revealLockoutUntilMs: null,
    teamBuzzed: { team_a: false, team_b: false },
    buzzingPlayer: null,
    buzzingPlayerGuess: null,
    tossupPointsValue: 10,
    currentTossupAnswer: null,
    fullTossupText: null,
    fullTossupTokens: null,
    revealedTossupTokens: [],
    currentGuesses: [],
    currentBonusNum: 0,
    currentBonusId: null,
    currentBonusPart: 0,
    bonusOwner: null,
    bonusStage: 'leadin',
    bonusQuestion: null,
    bonusResponses: [],
    bonusPartDecision: 'pending',
    bonusAiRevealed: false,
    currentBonusPartAnswer: null,
    scores: { team_a: 0, team_b: 0 },
    aiBuzzModes: {},
    aiAutonomousK: {},
    totalTossups: 0,
    totalBonuses: 0,
    tossupResults: [],
    bonusResults: [],
  };
}

/**
 * Filter game state for player clients (remove moderator-only info)
 */
export function filterStateForPlayer(state: GameState): GameState {
  return {
    ...state,
    // Players don't see the correct answer until question ends
    currentTossupAnswer: null,
    // Bonus answer is revealed to players during the per-part reveal screen
    currentBonusPartAnswer:
      state.phase === 'bonus_part_reveal' ? state.currentBonusPartAnswer : null,
    // Players don't see the full tossup text/tokens; they only see revealed stream state
    fullTossupText: null,
    fullTossupTokens: null,
    // Players don't see question results (for navigation)
    tossupResults: [],
    bonusResults: [],
  };
}
