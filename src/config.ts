import { Database } from "./db/index.ts";
import { DidResolver } from "@atproto/identity";
import { RoundService } from "./services/rounds.ts";
import { GameService } from "./services/game.ts";
import { Logger } from "./util/logger.ts";

export type Config = {
  // Server config
  port: number;
  listenhost: string;
  hostname: string;

  // Database config
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbMaxConnections: number;

  // Subscription config
  subscriptionEndpoint: string;
  subscriptionReconnectDelay: number;

  // DID config
  serviceDid: string;
  publisherDid: string;

  // Game config
  gameDurationHours: number;
  roundDurationHours: number;
  playersPerTeam: number;
};

export type AppContext = {
  db: Database;
  didResolver: DidResolver;
  cfg: Config;
  gameService: GameService;
  roundService: RoundService;
  logger: Logger;
};
