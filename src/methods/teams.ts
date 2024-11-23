import { Router } from "express";
import { AppContext } from "../config";

export function createTeamsRouter(ctx: AppContext) {
  const router = Router();
  const logger = ctx.logger.child("api:teams");

  // GET /api/teams
  router.get("/teams", async (_req, res) => {
    try {
      const teams = await ctx.db
        .selectFrom("user")
        .select("team")
        .select((eb) => [eb.fn.count("did").as("memberCount")])
        .groupBy("team")
        .execute();

      const teamsWithStats = teams.map((team) => ({
        id: team.team,
        memberCount: Number(team.memberCount), // Use Number() instead of parseInt
      }));

      res.json(teamsWithStats);
    } catch (error) {
      logger.error("Error fetching teams:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/teams/:teamId/eliminations
  router.get("/teams/:teamId/eliminations", async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const eliminations = await ctx.db
        .selectFrom("elimination")
        .select(["roundId", "likeCount", "eliminatedAt"])
        .where("team", "=", teamId)
        .orderBy("roundId", "desc")
        .execute();

      res.json(eliminations);
    } catch (error) {
      logger.error("Error fetching team eliminations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
