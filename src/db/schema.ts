export type DatabaseSchema = {
  post: Post;
  user: User;
  sub_state: SubState;
  game: Game;
  game_participant: GameParticipant;
  round: Round;
  round_participant: RoundParticipant;
  elimination: Elimination;
};

export type Elimination = {
  roundId: number;
  userId: string;
  team: number;
  likeCount: number;
  eliminatedAt: string;
};

export type Post = {
  uri: string;
  cid: string;
  indexedAt: Date; // Changed from string to Date
  team: number;
  userId: string;
  gameId: number | null;
  roundId: number | null;
  likeCount: number;
  active: boolean; // Changed from number to boolean
};

export type User = {
  did: string; // Primary key
  displayName?: string;
  handle?: string;
  firstSeen: Date;
  team: number;
  currentGameId: number | null; // Foreign key to game.id if currently in a game
};

export type SubState = {
  service: string; // Primary key
  cursor: number;
};

export type Game = {
  id: number; // Primary key, auto-increment
  startTime: Date;
  endTime: Date;
  status: "registration" | "active" | "completed";
  maxPlayersPerTeam: number;
  currentRoundId: number | null; // Foreign key to round.id
  winner: number | null; // Winning team number
};

export type GameParticipant = {
  gameId: number; // Primary key (composite)
  userId: string; // Primary key (composite)
  team: number;
  joinedAt: string;
  status: "active" | "eliminated";
};

export type Round = {
  id: number; // Primary key, auto-increment
  gameId: number; // Foreign key to game.id
  startTime: Date;
  endTime: Date;
  status: "active" | "completed";
  cutoffLikes: number | null;
};

export type RoundParticipant = {
  roundId: number; // Primary key (composite)
  userId: string; // Primary key (composite)
  team: number;
  totalLikes: number;
  status: "active" | "eliminated";
};
