export async function validateTeamReadiness(
  trx: Transaction<Database>,
  minUsersPerTeam: number,
  totalTeams: number,
  context: "game" | "round",
  gameId?: number,
) {
  const query =
    context === "game"
      ? trx
          .selectFrom("user")
          .select(["team"])
          .select((eb) => eb.fn.count<number>("did").as("count"))
          .where("currentGameId", "is", null)
      : trx
          .selectFrom("game_participant")
          .select(["team"])
          .select((eb) => eb.fn.count<number>("userId").as("count"))
          .where("gameId", "=", gameId!)
          .where("status", "=", "active");

  const teamCounts = await query
    .groupBy("team")
    .having(
      (eb) => eb.fn.count(context === "game" ? "did" : "userId"),
      ">=",
      minUsersPerTeam,
    )
    .execute();

  const readyTeams = new Set(teamCounts.map((t) => t.team));
  const missingTeams = [];

  for (let team = 0; team < totalTeams; team++) {
    if (!readyTeams.has(team)) {
      missingTeams.push(team);
    }
  }

  return {
    teamCounts,
    readyTeams: readyTeams.size,
    missingTeams,
  };
}
