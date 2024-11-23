import { Router } from "express";
import { AppContext } from "../config.ts";

export function createRoundsRouter(ctx: AppContext) {
  const router = Router();
  const logger = ctx.logger.child("api:rounds");

  // GET /api/rounds/current
  router.get("/rounds/current", async (_req, res) => {
    try {
      const currentRound = await ctx.roundService.getCurrentRound();
      res.json(currentRound || null);
    } catch (error) {
      logger.error("Error fetching current round:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/rounds/:roundId/cutoffs
  router.get("/rounds/:roundId/cutoffs", async (req, res) => {
    try {
      const roundId = parseInt(req.params.roundId);
      if (isNaN(roundId)) {
        return res.status(400).json({ error: "Invalid round ID" });
      }
      const cutoffs = await ctx.db
        .selectFrom("elimination")
        .select(["team", (eb) => eb.fn.max("likeCount").as("cutoffLikes")])
        .where("roundId", "=", roundId)
        .groupBy("team")
        .execute();

      res.json(cutoffs);
    } catch (error) {
      logger.error("Error fetching round cutoffs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/rounds/status
  router.get("/rounds/status", async (_req, res) => {
    try {
      const status = await ctx.roundService.getRoundStatus();
      res.json(status);
    } catch (error) {
      logger.error("Error fetching round status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
