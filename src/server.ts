import http from "http";
import events from "events";
import express from "express";
import { DidResolver, MemoryCache } from "@atproto/identity";
import { createServer } from "./lexicon/index.ts";
import feedGeneration from "./methods/feed-generation.ts";
import describeGenerator from "./methods/describe-generator.ts";
import { createDb, Database, migrateToLatest } from "./db/index.ts";
import { AppContext, Config } from "./config.ts";
import wellKnown from "./well-known.ts";
import { JetstreamService } from "./jetstream.ts";
import { createTeamsRouter } from "./methods/teams.ts";
import { createRoundsRouter } from "./methods/rounds.ts";
import path from "path";
import { RoundService } from "./services/rounds.ts";
import { GameService } from "./services/game.ts";
import { Logger, logger } from "./util/logger.ts";

export class FeedGenerator {
  public app: express.Application;
  public server?: http.Server;
  public db: Database;
  public jetstream: JetstreamService;
  public cfg: Config;
  public gameService: GameService;
  public roundService: RoundService;
  private logger: Logger;

  constructor(app: express.Application, db: Database, cfg: Config) {
    this.app = app;
    this.db = db;
    this.cfg = cfg;
    this.logger = logger.child("server");
    this.gameService = new GameService(
      db,
      cfg.gameDurationHours,
      cfg.roundDurationHours,
      cfg.playersPerTeam,
    );
    this.roundService = new RoundService(
      db,
      this.gameService,
      cfg.roundDurationHours,
    );
    this.jetstream = new JetstreamService(
      db,
      this.gameService,
      this.roundService,
    );
  }

  static async create(cfg: Config) {
    const app = express();
    app.use(express.static(path.join(process.cwd(), "public")));

    const db = createDb(cfg);
    await migrateToLatest(db);

    const feedGen = new FeedGenerator(app, db, cfg);

    const didCache = new MemoryCache();
    const didResolver = new DidResolver({
      plcUrl: "https://plc.directory",
      didCache,
    });

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024,
        textLimit: 100 * 1024,
        blobLimit: 5 * 1024 * 1024,
      },
    });

    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
      gameService: feedGen.gameService,
      roundService: feedGen.roundService,
      logger: logger,
    };

    feedGeneration(server, ctx);
    describeGenerator(server, ctx);
    app.use(express.json());
    app.use("/api", createRoundsRouter(ctx));
    app.use("/api", createTeamsRouter(ctx));
    app.use(server.xrpc.router);
    app.use(wellKnown(ctx));

    return feedGen;
  }

  public async start(): Promise<http.Server> {
    this.logger.info("Database initialized");

    // Start game monitoring first
    await this.gameService.ensureActiveGame();
    this.gameService.startGameMonitoring();
    this.logger.info("Game monitoring started");

    // Start round monitoring (rounds are now managed within games)
    this.roundService.startRoundMonitoring();
    this.logger.info("Round monitoring started");

    // Start Jetstream service
    await this.jetstream.start();
    this.logger.info("Jetstream service started");

    // Start HTTP server
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost);
    await events.once(this.server, "listening");

    this.logger.info("Server started", {
      port: this.cfg.port,
      host: this.cfg.listenhost,
    });

    return this.server;
  }

  async stop() {
    this.roundService.stopRoundMonitoring();
    await this.jetstream.cleanup();
    if (this.server) {
      await new Promise((resolve) => this.server?.close(resolve));
    }
  }
}
