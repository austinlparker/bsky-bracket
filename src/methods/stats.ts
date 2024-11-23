import { Router } from "express";
import type { AppContext } from "../config";

export function createStatsRouter(ctx: AppContext) {
  const router = Router();
  const logger = ctx.logger.child("api:stats");

  // Get current game overview
  router.get("/stats/current", async (_req, res) => {
    try {
      const currentGame = await ctx.gameService.getCurrentGame();
      if (!currentGame) {
        return res.json({ status: "no-game" });
      }

      const currentRound = await ctx.roundService.getCurrentRound();

      const teamStats = await trx
        .selectFrom("game_participant")
        .select(["team"])
        .select((eb) => [
          eb.fn.count("userId").castTo<string>().as("totalPlayers"),
          eb.fn
            .sum(
              eb
                .case()
                .when("status", "=", "active")
                .then(1)
                .else(0)
                .end(),
            )
            .castTo<string>()
            .as("activePlayers"),
        ])
        .where("gameId", "=", currentGame.id)
        .groupBy("team")
        .execute();

      // Get round statistics with proper casting
      const rounds = await trx
        .selectFrom("round")
        .select([
          "id",
          "startTime",
          "endTime",
          "status",
          "cutoffLikes",
        ])
        .select((eb) => [
          eb.fn.count("elimination.userId").castTo<string>().as("eliminationCount"),
        ])
        .leftJoin("elimination", (join) =>
          join.onRef("elimination.roundId", "=", "round.id"),
        )
        .where("gameId", "=", currentGame.id)
        .groupBy([
          "round.id",
          "round.startTime",
          "round.endTime",
          "round.status",
          "round.cutoffLikes",
        ])
        .orderBy("startTime", "asc")
        .execute();

        // Get current round elimination threshold projection
        let projectedThreshold = null;
        if (currentRound) {
          const lowestActiveLikes = await trx
            .selectFrom("round_participant")
            .select((eb) => eb.fn.min("totalLikes").as("minLikes"))
            .where("roundId", "=", currentRound.id)
            .where("status", "=", "active")
            .executeTakeFirst();

          projectedThreshold = Number(lowestActiveLikes?.minLikes || 0);
        }

        return {
          game: currentGame,
          currentRound,
          projectedThreshold,
          teamStats,
          rounds,
        };
      });

      res.json(stats);
    } catch (error) {
      logger.error("Error fetching current stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get specific round details
  router.get("/stats/round/:roundId", async (req, res) => {
    try {
      const roundId = parseInt(req.params.roundId);
      const roundStats = await ctx.roundService.getRoundStats(roundId);

      // Get elimination details
      const eliminations = await ctx.db
        .selectFrom("round_participant")
        .select(["team", "status", "totalLikes"])
        .select((eb) => [eb.fn.count("userId").as("count")])
        .where("roundId", "=", roundId)
        .groupBy(["team", "status", "totalLikes"])
        .orderBy([
          { ref: "team", direction: "asc" },
          { ref: "totalLikes", direction: "desc" },
        ])
        .execute();

      res.json({
        ...roundStats,
        eliminations,
      });
    } catch (error) {
      logger.error("Error fetching round stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
