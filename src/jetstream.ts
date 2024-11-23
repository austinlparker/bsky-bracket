import { Jetstream } from "@skyware/jetstream";
import { Database } from "./db/index.ts";
import { determineTeamHash } from "./util/teams.ts";
import { createAtUri } from "./util/uri.ts";
import { Logger, logger } from "./util/logger.ts";
import { GameService } from "./services/game.ts";
import { RoundService } from "./services/rounds.ts";
import { AppBskyFeedPost } from "./lexicon/types";

export class JetstreamService {
  private jetstream: Jetstream;
  private logger: Logger;

  constructor(
    private db: Database,
    private gameService: GameService,
    private roundService: RoundService,
  ) {
    this.jetstream = new Jetstream();
    this.logger = logger.child("jetstream");
    this.setupHandlers();
  }

  private setupHandlers() {
    // Only handle posts
    this.jetstream.onCreate<AppBskyFeedPost.Record>(
      "app.bsky.feed.post",
      async (event) => {
        try {
          this.logger.debug("Processing post", { did: event.did });

          // Add user if they don't exist
          const team = determineTeamHash(event.did);
          await this.db
            .insertInto("user")
            .values({
              did: event.did,
              firstSeen: new Date().toISOString(),
              team,
              currentGameId: null,
            })
            .onConflict((oc) => oc.column("did").doNothing())
            .execute();

          // Process the post
          await this.processPost(event);
        } catch (error) {
          this.logger.error("Failed to process post:", {
            did: event.did,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  }

  private async processPost(event: any) {
    try {
      const currentGame = await this.gameService.getCurrentGame();
      if (!currentGame?.currentRoundId) return;

      // Insert post with PostgreSQL boolean
      await this.db
        .insertInto("post")
        .values({
          uri: createAtUri(
            event.did,
            event.commit.collection,
            event.commit.rkey,
          ),
          cid: event.commit.cid,
          indexedAt: new Date().toISOString(),
          team: determineTeamHash(event.did),
          userId: event.did,
          gameId: currentGame.id,
          roundId: currentGame.currentRoundId,
          likeCount: 0,
          active: true, // Changed from 1 to true
        })
        .onConflict((oc) => oc.column("uri").doNothing())
        .execute();
    } catch (error) {
      this.logger.error("Error processing post:", {
        error: error instanceof Error ? error.message : String(error),
        did: event.did,
      });
      throw error;
    }
  }

  async start() {
    try {
      this.jetstream.start();
    } catch (error) {
      this.logger.error("Failed to start:", error);
      throw error;
    }
  }

  async cleanup() {
    this.jetstream.removeAllListeners();
    this.logger.info("Cleaned up");
  }
}
