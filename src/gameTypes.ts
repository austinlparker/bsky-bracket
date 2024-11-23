export type TeamCounts = {
  team: number;
  count: string | number;
}[];

export type GameParticipant = {
  userId: string;
  team: number;
};

export interface GameCreationResult {
  id: number;
  startTime: string;
  endTime: string;
  status: string;
  maxPlayersPerTeam: number;
  currentRoundId: number | null;
  winner: number | null;
}

export interface RoundCreationResult {
  id: number;
  gameId: number;
  startTime: string;
  endTime: string;
  status: string;
  cutoffLikes: number | null;
}
