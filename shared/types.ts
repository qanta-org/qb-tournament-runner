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

export interface AIPlayerKwargs {
  tossup_model: string;
  bonus_model: string;
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
  answer: string;
  answer_refs: string[];
}

export interface BonusPart {
  text: string;
  answer: string;
  answer_refs: string[];
}

export interface BonusQuestion {
  id: string;
  leadin: string;
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
  | 'bonus_human_response'
  | 'bonus_final_answer'
  | 'game_over';

export type BonusStage = 'leadin' | 'question' | 'human_response' | 'final_answer';

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
  wordIndex: number;
  revealedText: string;
  totalWords: number;
  teamBuzzed: Record<TeamId, boolean>;
  buzzingPlayer: string | null;
  buzzingPlayerGuess: string | null;  // The guess from buzzing player (shown to all)
  tossupPointsValue: number;

  // Current answer (moderator only - filtered out for player clients)
  currentTossupAnswer: string | null;

  // Full tossup text (moderator only - for preview with grayed unrevealed words)
  fullTossupText: string | null;

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

  // Current bonus part answer (moderator only)
  currentBonusPartAnswer: string | null;

  // Scores
  scores: Record<TeamId, number>;

  // Muted AI players
  mutedPlayers: string[];

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
  'bonus:human_response': (responses: Record<string, string>) => void;
  'bonus:final_answer': (answer: string) => void;
  'player:mute_toggle': (playerId: string) => void;
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
    wordIndex: 0,
    revealedText: '',
    totalWords: 0,
    teamBuzzed: { team_a: false, team_b: false },
    buzzingPlayer: null,
    buzzingPlayerGuess: null,
    tossupPointsValue: 10,
    currentTossupAnswer: null,
    fullTossupText: null,
    currentGuesses: [],
    currentBonusNum: 0,
    currentBonusId: null,
    currentBonusPart: 0,
    bonusOwner: null,
    bonusStage: 'leadin',
    bonusQuestion: null,
    bonusResponses: [],
    currentBonusPartAnswer: null,
    scores: { team_a: 0, team_b: 0 },
    mutedPlayers: [],
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
    currentBonusPartAnswer: null,
    // Players don't see the full tossup text - they only see revealed words
    fullTossupText: null,
    // Players don't see question results (for navigation)
    tossupResults: [],
    bonusResults: [],
  };
}
