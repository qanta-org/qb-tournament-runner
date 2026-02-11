import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { socket, connectSocket, disconnectSocket } from '../socket';
import type {
  GameState,
  GameConfig,
  TeamId,
  Player,
  AnswerRuling,
  AppConfig,
  ClientRole,
} from '../../../shared/types';
import { createInitialGameState, DEFAULT_APP_CONFIG } from '../../../shared/types';

interface GameContextValue {
  // Connection & Role
  isConnected: boolean;
  clientRole: ClientRole | null;
  roomCode: string | null;
  playerCount: number;
  error: string | null;

  // State
  gameState: GameState;
  gameConfig: GameConfig | null;
  appConfig: AppConfig;

  // Room Actions
  createRoom: () => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;

  // Game Actions (Moderator only)
  startGame: (config: GameConfig) => void;
  buzz: (playerId: string) => void;
  nextWord: () => void;
  submitAnswerRuling: (ruling: AnswerRuling, answer: string) => void;
  adjustPoints: (adjustments: { team_a: number; team_b: number }) => void;
  toggleMute: (playerId: string) => void;
  advanceBonusStage: () => void;
  submitBonusHumanResponse: (responses: Record<string, string>) => void;
  submitBonusFinalAnswer: (answer: string) => void;
  clearError: () => void;

  // Mid-game player management
  canModifyPlayers: () => boolean;
  addPlayer: (teamId: TeamId, player: Player) => Promise<{ success: boolean; error?: string }>;
  removePlayer: (playerId: string) => Promise<{ success: boolean; error?: string }>;

  // Helpers
  getPlayer: (playerId: string) => Player | undefined;
  getTeamPlayers: (teamId: TeamId) => Player[];
  getTeamColor: (teamId: TeamId) => string;
  isModerator: () => boolean;

  // Socket (for direct event emission)
  socket: typeof socket;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

interface GameProviderProps {
  children: ReactNode;
}

export function GameProvider({ children }: GameProviderProps) {
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [appConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Room state
  const [clientRole, setClientRole] = useState<ClientRole | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState(0);

  // Reference to track clientRole for sound handler without causing re-renders
  const clientRoleRef = React.useRef<ClientRole | null>(null);
  clientRoleRef.current = clientRole;

  // Connect to socket on mount - ONLY ONCE
  useEffect(() => {
    connectSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => {
      setIsConnected(false);
      // Don't clear role/room on disconnect - let user retry
    };
    const onError = (msg: string) => setError(msg);
    const onGameState = (state: GameState) => setGameState(state);
    const onGameConfig = (config: GameConfig) => setGameConfig(config);
    const onScoreUpdate = (scores: Record<TeamId, number>) => {
      setGameState((prev) => ({ ...prev, scores }));
    };
    const onSoundBuzz = () => {
      // Only play buzz sound for moderator (use ref to avoid stale closure)
      if (clientRoleRef.current === 'moderator') {
        try {
          const audio = new Audio('/buzzer_sound.wav');
          audio.play().catch(() => { });
        } catch {
          // Ignore audio errors
        }
      }
    };

    // Room events
    const onRoomCreated = (data: { code: string; role: ClientRole }) => {
      setRoomCode(data.code);
      setClientRole(data.role);
      setError(null);
      console.log(`Room created: ${data.code}, role: ${data.role}`);
    };

    const onRoomJoined = (data: { code: string; role: ClientRole; config: GameConfig | null }) => {
      setRoomCode(data.code);
      setClientRole(data.role);
      if (data.config) {
        setGameConfig(data.config);
      }
      setError(null);
      console.log(`Joined room: ${data.code}, role: ${data.role}`);
    };

    const onRoomError = (message: string) => {
      setError(message);
    };

    const onPlayerCount = (count: number) => {
      setPlayerCount(count);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('error', onError);
    socket.on('game:state', onGameState);
    socket.on('game:config', onGameConfig);
    socket.on('score:update', onScoreUpdate);
    socket.on('sound:buzz', onSoundBuzz);
    socket.on('room:created', onRoomCreated);
    socket.on('room:joined', onRoomJoined);
    socket.on('room:error', onRoomError);
    socket.on('room:player_count', onPlayerCount);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('error', onError);
      socket.off('game:state', onGameState);
      socket.off('game:config', onGameConfig);
      socket.off('score:update', onScoreUpdate);
      socket.off('sound:buzz', onSoundBuzz);
      socket.off('room:created', onRoomCreated);
      socket.off('room:joined', onRoomJoined);
      socket.off('room:error', onRoomError);
      socket.off('room:player_count', onPlayerCount);
      disconnectSocket();
    };
  }, []); // Empty dependency array - only run once on mount

  // Room Actions
  const createRoom = useCallback(() => {
    socket.emit('room:create');
  }, []);

  const joinRoom = useCallback((code: string) => {
    socket.emit('room:join', code);
  }, []);

  const leaveRoom = useCallback(() => {
    socket.emit('room:leave');
    setRoomCode(null);
    setClientRole(null);
    setGameConfig(null);
    setGameState(createInitialGameState());
    setPlayerCount(0);
  }, []);

  // Game Actions
  const startGame = useCallback((config: GameConfig) => {
    socket.emit('game:start', config);
  }, []);

  const buzz = useCallback((playerId: string) => {
    socket.emit('player:buzz', playerId);
  }, []);

  const nextWord = useCallback(() => {
    socket.emit('moderator:next_word');
  }, []);

  const submitAnswerRuling = useCallback((ruling: AnswerRuling, answer: string) => {
    socket.emit('moderator:answer_ruling', { ruling, answer });
  }, []);

  const adjustPoints = useCallback((adjustments: { team_a: number; team_b: number }) => {
    socket.emit('moderator:adjust_points', adjustments);
  }, []);

  const toggleMute = useCallback((playerId: string) => {
    socket.emit('player:mute_toggle', playerId);
  }, []);

  const advanceBonusStage = useCallback(() => {
    socket.emit('bonus:advance');
  }, []);

  const submitBonusHumanResponse = useCallback((responses: Record<string, string>) => {
    socket.emit('bonus:human_response', responses);
  }, []);

  const submitBonusFinalAnswer = useCallback((answer: string) => {
    socket.emit('bonus:final_answer', answer);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Mid-game player management
  const canModifyPlayers = useCallback((): boolean => {
    // Allow at tossup_ready phase (between tossups)
    if (gameState.phase === 'tossup_ready') return true;

    // Also allow during tossup_streaming if within first 5 words
    if (gameState.phase === 'tossup_streaming' && gameState.wordIndex <= 5) {
      return true;
    }

    return false;
  }, [gameState.phase, gameState.wordIndex]);

  const addPlayer = useCallback(
    (teamId: TeamId, player: Player): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        socket.emit('moderator:add_player', { teamId, player }, (result) => {
          resolve(result || { success: false, error: 'No response from server' });
        });
      });
    },
    []
  );

  const removePlayer = useCallback(
    (playerId: string): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        socket.emit('moderator:remove_player', playerId, (result) => {
          resolve(result || { success: false, error: 'No response from server' });
        });
      });
    },
    []
  );

  // Helpers
  const getPlayer = useCallback(
    (playerId: string): Player | undefined => {
      if (!gameConfig) return undefined;
      const allPlayers = [...gameConfig.team_a.players, ...gameConfig.team_b.players];
      return allPlayers.find((p) => p.player_id === playerId);
    },
    [gameConfig]
  );

  const getTeamPlayers = useCallback(
    (teamId: TeamId): Player[] => {
      if (!gameConfig) return [];
      return teamId === 'team_a' ? gameConfig.team_a.players : gameConfig.team_b.players;
    },
    [gameConfig]
  );

  const getTeamColor = useCallback(
    (teamId: TeamId): string => {
      return teamId === 'team_a' ? appConfig.color_team_a : appConfig.color_team_b;
    },
    [appConfig]
  );

  const isModerator = useCallback(() => {
    return clientRole === 'moderator';
  }, [clientRole]);

  const value: GameContextValue = {
    // Connection & Role
    isConnected,
    clientRole,
    roomCode,
    playerCount,
    error,

    // State
    gameState,
    gameConfig,
    appConfig,

    // Room Actions
    createRoom,
    joinRoom,
    leaveRoom,

    // Game Actions
    startGame,
    buzz,
    nextWord,
    submitAnswerRuling,
    adjustPoints,
    toggleMute,
    advanceBonusStage,
    submitBonusHumanResponse,
    submitBonusFinalAnswer,
    clearError,

    // Mid-game player management
    canModifyPlayers,
    addPlayer,
    removePlayer,

    // Helpers
    getPlayer,
    getTeamPlayers,
    getTeamColor,
    isModerator,

    // Socket
    socket,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
