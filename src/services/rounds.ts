import { Database } from "../db/index.ts";
import { Logger, logger } from "../util/logger.ts";

export class RoundService {
  private monitoringInterval?: NodeJS.Timeout;
  private roundDurationMs: number;
  private logger: Logger;
  private _processingRounds: Set<number>;

  constructor(
    private db: Database,
    private gameService: GameService,
    private roundDurationHours: number,
  ) {
    this.roundDurationMs = roundDurationHours * 60 * 60 * 1000;
    this.logger = logger.child("rounds");
    this._processingRounds = new Set<number>();
  }

  async getCurrentRound() {
    const currentGame = await this.gameService.getCurrentGame();
    if (!currentGame?.currentRoundId) return null;

    return await this.db
      .selectFrom("round")
      .selectAll()
      .where("id", "=", currentGame.currentRoundId)
      .where("status", "=", "active")
      .executeTakeFirst();
  }

  async getRoundStatus() {
    const currentRound = await this.getCurrentRound();
    if (!currentRound) return null;

    const now = new Date();
    const startTime = new Date(currentRound.startTime);
    const endTime = new Date(currentRound.endTime);
    const timeRemaining = endTime.getTime() - now.getTime();
    const progress =
      ((now.getTime() - startTime.getTime()) /
        (endTime.getTime() - startTime.getTime())) *
      100;

    const stats = await this.db.transaction().execute(async (trx) => {
      const [activeTeams, activeUsers, roundPosts, roundLikes] =
        await Promise.all([
          // Count distinct active teams
          trx
            .selectFrom("round_participant")
            .select((eb) => [eb.fn.count("team").as("count")])
            .where("roundId", "=", currentRound.id)
            .where("status", "=", "active")
            .distinct()
            .executeTakeFirst()
            .then((result) => Number(result?.count || 0)),

          // Count active users
          trx
            .selectFrom("round_participant")
            .select((eb) => [eb.fn.count("userId").as("count")])
            .where("roundId", "=", currentRound.id)
            .where("status", "=", "active")
            .executeTakeFirst()
            .then((result) => Number(result?.count || 0)),

          // Count posts
          trx
            .selectFrom("post")
            .select((eb) => [eb.fn.count("uri").as("count")])
            .where("roundId", "=", currentRound.id)
            .where("active", "=", true)
            .executeTakeFirst()
            .then((result) => Number(result?.count || 0)),

          // Sum likes
          trx
            .selectFrom("post")
            .select((eb) => [eb.fn.sum("likeCount").as("total")])
            .where("roundId", "=", currentRound.id)
            .where("active", "=", 1)
            .executeTakeFirst()
            .then((result) => Number(result?.total || 0)),
        ]);

      return {
        totalTeams: activeTeams,
        totalUsers: activeUsers,
        totalPosts: roundPosts,
        totalLikes: roundLikes,
      };
    });
    return {
      roundId: currentRound.id,
      status: currentRound.status,
      startTime: currentRound.startTime,
      endTime: currentRound.endTime,
      timeRemaining,
      progress,
      stats,
    };
  }

  async createNextRound(gameId: number) {
    const now = new Date();
    const endTime = new Date(now.getTime() + this.roundDurationMs);

    return await this.db.transaction().execute(async (trx) => {
      // Get active participants from previous round
      const currentGame = await trx
        .selectFrom("game")
        .select(["id", "currentRoundId"])
        .where("id", "=", gameId)
        .where("status", "=", "active")
        .executeTakeFirst();

      if (!currentGame) {
        this.logger.warn("No active game found when creating next round");
        return null;
      }

      // Create new round
      const round = await trx
        .insertInto("round")
        .values({
          gameId,
          startTime: now.toISOString(),
          endTime: endTime.toISOString(),
          status: "active",
          cutoffLikes: null,
        })
        .returning("*")
        .executeTakeFirst();

      if (!round) {
        throw new Error("Failed to create new round");
      }

      // Get active participants from previous round
      if (currentGame.currentRoundId) {
        const activeParticipants = await trx
          .selectFrom("round_participant")
          .select(["userId", "team"])
          .where("roundId", "=", currentGame.currentRoundId)
          .where("status", "=", "active")
          .execute();

        // Add active participants to new round
        if (activeParticipants.length > 0) {
          await trx
            .insertInto("round_participant")
            .values(
              activeParticipants.map((p) => ({
                roundId: round.id,
                userId: p.userId,
                team: p.team,
                totalLikes: 0,
                status: "active",
              })),
            )
            .execute();
        }
      }

      // Update game's current round
      await trx
        .updateTable("game")
        .set({ currentRoundId: round.id })
        .where("id", "=", gameId)
        .execute();

      this.logger.info("Created new round", {
        roundId: round.id,
        gameId,
      });

      return round;
    });
  }

  async processRoundEliminations(roundId: number) {
    const BATCH_SIZE = 100;
    let processedCount = 0;
    const startTime = Date.now();

    try {
      this.logger.info("Starting round elimination", { roundId });

      return await this.db.transaction().execute(async (trx) => {
        const round = await trx
          .selectFrom("round")
          .selectAll()
          .where("id", "=", roundId)
          .where("status", "=", "active")
          .executeTakeFirst();

        if (!round) {
          this.logger.warn("No active round found for elimination processing", {
            roundId,
          });
          return;
        }

        // Get all active teams in this round
        const teams = await trx
          .selectFrom("round_participant")
          .select("team")
          .where("roundId", "=", roundId)
          .where("status", "=", "active")
          .distinct()
          .execute();

        this.logger.debug("Processing teams", {
          roundId,
          teamCount: teams.length,
        });

        // Process each team separately
        for (const { team } of teams) {
          // Update totalLikes using PostgreSQL aggregation
          await trx
            .updateTable("round_participant")
            .set((eb) => ({
              totalLikes: eb(
                eb
                  .selectFrom("post")
                  .select((eb) =>
                    eb.fn.coalesce(eb.fn.sum("likeCount"), 0).as("total"),
                  )
                  .where("userId", "=", eb.ref("round_participant.userId"))
                  .where("roundId", "=", roundId)
                  .$castTo<number>(),
              ),
            }))
            .where("roundId", "=", roundId)
            .where("team", "=", team)
            .execute();

          // Get team participants ordered by likes
          const participants = await trx
            .selectFrom("round_participant")
            .selectAll()
            .where("roundId", "=", roundId)
            .where("team", "=", team)
            .where("status", "=", "active")
            .orderBy("totalLikes", "asc")
            .execute();

          if (participants.length === 0) continue;

          // Calculate eliminations
          const elimCount = Math.ceil(participants.length / 2);
          const eliminatedUsers = participants.slice(0, elimCount);

          // Process eliminations in batches
          for (let i = 0; i < eliminatedUsers.length; i += BATCH_SIZE) {
            const batch = eliminatedUsers.slice(i, i + BATCH_SIZE);

            await Promise.all([
              // Update round_participant status
              trx
                .updateTable("round_participant")
                .set({ status: "eliminated" })
                .where("roundId", "=", roundId)
                .where(
                  "userId",
                  "in",
                  batch.map((p) => p.userId),
                )
                .execute(),

              // Update game_participant status
              trx
                .updateTable("game_participant")
                .set({ status: "eliminated" })
                .where("gameId", "=", round.gameId)
                .where(
                  "userId",
                  "in",
                  batch.map((p) => p.userId),
                )
                .execute(),
            ]);

            processedCount += batch.length;
          }

          this.logger.debug("Team eliminations processed", {
            roundId,
            team,
            eliminatedCount: eliminatedUsers.length,
            remainingCount: participants.length - eliminatedUsers.length,
          });
        }

        // Get cutoff likes with proper casting
        const cutoffLikes = await trx
          .selectFrom("round_participant")
          .select((eb) => eb.fn.max("totalLikes").as("maxLikes"))
          .where("roundId", "=", roundId)
          .where("status", "=", "eliminated")
          .executeTakeFirst()
          .then((result) => Number(result?.maxLikes || 0));

        // Update round status and cutoff
        await trx
          .updateTable("round")
          .set({
            status: "completed",
            cutoffLikes,
          })
          .where("id", "=", roundId)
          .execute();

        this.logger.info("Round elimination completed", {
          roundId,
          processedCount,
          cutoffLikes,
          processingTimeMs: Date.now() - startTime,
        });

        return cutoffLikes;
      });
    } catch (error) {
      this.logger.error("Error processing eliminations:", {
        roundId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async checkAndProgressRound() {
    const currentRound = await this.getCurrentRound();
    if (!currentRound) {
      this.logger.debug("No active round");
      return;
    }

    if (this._processingRounds.has(currentRound.id)) {
      this.logger.debug("Round already processing", {
        roundId: currentRound.id,
      });
      return;
    }

    const now = new Date();
    const endTime = new Date(currentRound.endTime);

    if (now >= endTime) {
      try {
        this._processingRounds.add(currentRound.id);

        this.logger.info("Round ending", { roundId: currentRound.id });

        await this.processRoundEliminations(currentRound.id);
        const newRound = await this.createNextRound(currentRound.gameId);

        this.logger.info("Round transition completed", {
          previousRoundId: currentRound.id,
          newRoundId: newRound?.id,
        });
      } catch (error) {
        this.logger.error("Round processing error:", {
          roundId: currentRound.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this._processingRounds.delete(currentRound.id);
      }
    }
  }

  async getRoundStats(roundId: number) {
    const [round, participantStats, postStats] = await Promise.all([
      this.db
        .selectFrom("round")
        .selectAll()
        .where("id", "=", roundId)
        .executeTakeFirst(),

      this.db
        .selectFrom("round_participant")
        .select(["team", "status"])
        .select((eb) => [eb.fn.count("userId").as("count")])
        .where("roundId", "=", roundId)
        .groupBy(["team", "status"])
        .execute(),

      this.db
        .selectFrom("post")
        .select((eb) => [
          eb.fn.count("uri").as("postCount"),
          eb.fn.sum("likeCount").as("totalLikes"),
        ])
        .where("roundId", "=", roundId)
        .executeTakeFirst(),
    ]);

    return {
      round,
      participantStats,
      postCount: Number(postStats?.postCount ?? 0),
      totalLikes: Number(postStats?.totalLikes ?? 0),
    };
  }

  startRoundMonitoring() {
    this.logger.info("Round monitoring started", {
      roundDurationHours: this.roundDurationMs / (60 * 60 * 1000),
    });

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkAndProgressRound().catch((err) => {
        this.logger.error("Round monitoring error:", err);
      });
    }, 60 * 1000);
  }

  stopRoundMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.logger.info("Round monitoring stopped");
    }
  }
}
