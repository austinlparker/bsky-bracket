import dotenv from "dotenv";
import { FeedGenerator } from "./server.ts";

const maybeStr = (val?: string) => {
  if (!val) return undefined;
  return val;
};

const maybeInt = (val?: string) => {
  if (!val) return undefined;
  const int = parseInt(val, 10);
  if (isNaN(int)) return undefined;
  return int;
};

const run = async () => {
  dotenv.config();
  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? "example.com";
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`;
  console.log(process.env.DATABASE_URL);
  const server = await FeedGenerator.create({
    // Server config
    port: maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? "localhost",
    hostname,

    // Database config
    dbHost: maybeStr(process.env.DB_HOST) ?? "localhost",
    dbPort: maybeInt(process.env.DB_PORT) ?? 5432,
    dbName: maybeStr(process.env.DB_NAME) ?? "postgres",
    dbUser: maybeStr(process.env.DB_USER) ?? "postgres",
    dbPassword: maybeStr(process.env.DB_PASSWORD) ?? "mypassword",
    dbMaxConnections: maybeInt(process.env.DB_MAX_CONNECTIONS) ?? 10,

    // Subscription config
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      "wss://bsky.network",
    subscriptionReconnectDelay:
      maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,

    // DID config
    serviceDid,
    publisherDid:
      maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ?? "did:example:alice",

    // Game config
    gameDurationHours: maybeInt(process.env.FEEDGEN_GAME_DURATION_HOURS) ?? 168, // 1 week default
    roundDurationHours:
      maybeInt(process.env.FEEDGEN_ROUND_DURATION_HOURS) ?? 24, // 1 day default
    playersPerTeam: maybeInt(process.env.FEEDGEN_PLAYERS_PER_TEAM) ?? 64, // 64 players per team default
  });

  await server.start();
  console.log(
    `🤖 running feed generator at http://${server.cfg.listenhost}:${server.cfg.port}`,
  );
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
