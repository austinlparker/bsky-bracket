import { Database } from "../db/index.ts";
import { Logger, logger } from "../util/logger.ts";
import { validateTeamReadiness } from "../util/gameUtils.ts";
import type {
  TeamCounts,
  GameParticipant,
  GameCreationResult,
  RoundCreationResult,
} from "../gameTypes.ts";

export class GameService {
  private logger: Logger;
  private monitoringInterval?: NodeJS.Timeout;

  private readonly MIN_USERS_PER_TEAM = 16;
  private readonly TOTAL_TEAMS = 512;

  constructor(
    private db: Database,
    private gameDurationHours: number = 168, // 1 week default
    private roundDurationHours: number = 24, // 1 day default
    private playersPerTeam: number = 64,
  ) {
    this.logger = logger.child("games");
  }

  // Game Lifecycle Methods
  async getCurrentGame() {
    return await this.db
      .selectFrom("game")
      .select([
        "id",
        "startTime",
        "endTime",
        "status",
        "maxPlayersPerTeam",
        "currentRoundId",
        "winner",
      ])
      .where("status", "in", ["registration", "active"])
      .orderBy("startTime", "desc")
      .limit(1)
      .executeTakeFirst();
  }

  async createNewGame(): Promise<GameCreationResult | null> {
    const now = new Date();
    const endTime = new Date(
      now.getTime() + this.gameDurationHours * 60 * 60 * 1000,
    );

    return await this.db.transaction().execute(async (trx) => {
      const { teamCounts, missingTeams } = await validateTeamReadiness(
        trx,
        this.MIN_USERS_PER_TEAM,
        this.TOTAL_TEAMS,
        "game",
      );

      if (missingTeams.length > 0) {
        this.logger.info("Not enough users for all teams", {
          teamsWithMinUsers: teamCounts.length,
          missingTeams,
          minUsersPerTeam: this.MIN_USERS_PER_TEAM,
        });
        return null;
      }

      const game = await trx
        .insertInto("game")
        .values({
          startTime: now.toISOString(),
          endTime: endTime.toISOString(),
          status: "registration",
          maxPlayersPerTeam: this.playersPerTeam,
          currentRoundId: null,
          winner: null,
        })
        .returning([
          "id",
          "startTime",
          "endTime",
          "status",
          "maxPlayersPerTeam",
          "currentRoundId",
          "winner",
        ])
        .executeTakeFirst();

      if (!game) throw new Error("Failed to create game");

      await this.assignUsers(trx, game.id);

      this.logger.info("New game created", {
        gameId: game.id,
        teamCounts: teamCounts.map((t) => ({
          team: t.team,
          count: Number(t.count),
        })),
      });

      return game;
    });
  }

  private async assignUsers(trx: Transaction<Database>, gameId: number) {
    const BATCH_SIZE = 100;

    const unassignedUsers = await trx
      .selectFrom("user")
      .select(["did", "team"])
      .where("currentGameId", "is", null)
      .execute();

    // Process in batches
    for (let i = 0; i < unassignedUsers.length; i += BATCH_SIZE) {
      const batch = unassignedUsers.slice(i, i + BATCH_SIZE);

      await Promise.all([
        // Insert game participants
        trx
          .insertInto("game_participant")
          .values(
            batch.map((user) => ({
              gameId,
              userId: user.did,
              team: user.team,
              joinedAt: new Date().toISOString(),
              status: "active",
            })),
          )
          .execute(),

        // Update user currentGameId using PostgreSQL syntax
        trx
          .updateTable("user")
          .set({ currentGameId: gameId })
          .where(
            "did",
            "in",
            batch.map((u) => u.did),
          )
          .execute(),
      ]);
    }
  }

  async startGame(
    gameId: number,
  ): Promise<{ game: GameCreationResult; round: RoundCreationResult } | null> {
    const now = new Date();

    return await this.db.transaction().execute(async (trx) => {
      const game = await trx
        .selectFrom("game")
        .selectAll()
        .where("id", "=", gameId)
        .where("status", "=", "registration")
        .executeTakeFirst();

      if (!game) {
        throw new Error("Game not found or not in registration status");
      }

      const { missingTeams, teamCounts } = await validateTeamReadiness(
        trx,
        this.MIN_USERS_PER_TEAM,
        this.TOTAL_TEAMS,
        "round",
        gameId,
      );

      if (missingTeams.length > 0) {
        this.logger.info("Not enough active users in all teams to start game", {
          gameId,
          missingTeams,
          teamCounts: teamCounts.map((t) => ({
            team: t.team,
            count: Number(t.count),
          })),
        });
        return null;
      }

      const round = await this.createInitialRound(trx, gameId, now);
      const participants = await this.initializeRoundParticipants(
        trx,
        gameId,
        round.id,
      );

      await this.updateGamePosts(
        trx,
        gameId,
        round.id,
        game.startTime,
        round.endTime,
        participants,
      );

      this.logger.info("Game started", {
        gameId,
        roundId: round.id,
        participantCount: participants.length,
        activeTeams: teamCounts.length,
      });

      return { game, round };
    });
  }

  private async createInitialRound(
    trx: Transaction<Database>,
    gameId: number,
    now: Date,
  ): Promise<RoundCreationResult> {
    const round = await trx
      .insertInto("round")
      .values({
        gameId,
        startTime: now.toISOString(),
        endTime: new Date(
          now.getTime() + this.roundDurationHours * 60 * 60 * 1000,
        ).toISOString(),
        status: "active",
        cutoffLikes: null,
      })
      .returning([
        "id",
        "gameId",
        "startTime",
        "endTime",
        "status",
        "cutoffLikes",
      ])
      .executeTakeFirst();

    if (!round) throw new Error("Failed to create initial round");
    return round;
  }

  private async initializeRoundParticipants(
    trx: Transaction<Database>,
    gameId: number,
    roundId: number,
  ): Promise<GameParticipant[]> {
    const BATCH_SIZE = 100;

    const participants = await trx
      .selectFrom("game_participant")
      .select(["userId", "team"])
      .where("gameId", "=", gameId)
      .where("status", "=", "active")
      .execute();

    if (participants.length === 0) {
      throw new Error("No active participants found for game");
    }

    this.logger.info("Initializing round participants", {
      gameId,
      roundId,
      totalParticipants: participants.length,
    });

    // Process in batches
    for (let i = 0; i < participants.length; i += BATCH_SIZE) {
      const batch = participants.slice(i, i + BATCH_SIZE);

      await trx
        .insertInto("round_participant")
        .values(
          batch.map((p) => ({
            roundId,
            userId: p.userId,
            team: p.team,
            totalLikes: 0,
            status: "active",
          })),
        )
        .execute();

      this.logger.debug("Batch processed", {
        gameId,
        roundId,
        batchSize: batch.length,
        progress: `${i + batch.length}/${participants.length}`,
      });
    }

    await trx
      .updateTable("game")
      .set({
        status: "active",
        currentRoundId: roundId,
      })
      .where("id", "=", gameId)
      .execute();

    this.logger.info("Round participants initialized", {
      gameId,
      roundId,
      participantCount: participants.length,
    });

    return participants;
  }

  private async updateGamePosts(
    trx: Transaction<Database>,
    gameId: number,
    roundId: number,
    gameStart: string,
    roundEnd: string,
    participants: GameParticipant[],
  ) {
    const BATCH_SIZE = 100;

    this.logger.info("Updating game posts", {
      gameId,
      roundId,
      participantCount: participants.length,
    });

    // Process participants in batches
    for (let i = 0; i < participants.length; i += BATCH_SIZE) {
      const batch = participants.slice(i, i + BATCH_SIZE);

      await trx
        .updateTable("post")
        .set({
          gameId,
          roundId,
        })
        .where(
          "userId",
          "in",
          batch.map((p) => p.userId),
        )
        .where("active", "=", 1)
        .where((eb) =>
          eb.or([eb("gameId", "is", null), eb("gameId", "=", gameId)]),
        )
        .where("indexedAt", ">=", gameStart)
        .where("indexedAt", "<=", roundEnd)
        .execute();

      this.logger.debug("Post batch processed", {
        gameId,
        roundId,
        batchSize: batch.length,
        progress: `${i + batch.length}/${participants.length}`,
      });
    }

    // Get total updated posts count
    const updatedCount = await trx
      .selectFrom("post")
      .select((eb) => eb.fn.count("uri").as("count"))
      .where("gameId", "=", gameId)
      .where("roundId", "=", roundId)
      .executeTakeFirst();

    this.logger.info("Game posts updated", {
      gameId,
      roundId,
      updatedPosts: Number(updatedCount?.count || 0),
    });
  }

  private async completeGame(gameId: number) {
    this.logger.info("Game ending", { gameId });

    await this.db.transaction().execute(async (trx) => {
      const teamScores = await trx
        .selectFrom("game_participant")
        .select(["team"])
        .select((eb) => [
          eb.fn.count<number>("userId").as("playerCount"),
          eb.fn
            .sum<number>(eb.ref("round_participant.totalLikes"))
            .as("totalLikes"),
        ])
        .innerJoin("round_participant", (join) =>
          join.onRef(
            "game_participant.userId",
            "=",
            "round_participant.userId",
          ),
        )
        .where("game_participant.gameId", "=", gameId)
        .where("game_participant.status", "=", "active")
        .groupBy("team")
        .orderBy("totalLikes", "desc")
        .execute();

      const winningTeam = teamScores[0]?.team;

      await Promise.all([
        trx
          .updateTable("game")
          .set({
            status: "completed",
            winner: winningTeam,
          })
          .where("id", "=", gameId)
          .execute(),

        trx
          .updateTable("user")
          .set({ currentGameId: null })
          .where("currentGameId", "=", gameId)
          .execute(),
      ]);

      this.logger.info("Game completed", {
        gameId,
        winningTeam,
        teamScores: teamScores.map((t) => ({
          team: t.team,
          players: Number(t.playerCount),
          likes: Number(t.totalLikes),
        })),
      });
    });
  }

  // Game Management Methods
  async ensureActiveGame() {
    const currentGame = await this.getCurrentGame();

    if (!currentGame) {
      this.logger.info(
        "No active game found, attempting to create initial game...",
      );
      const game = await this.createNewGame();
      if (!game) {
        this.logger.info("Could not create new game - insufficient users");
        return null;
      }
      const result = await this.startGame(game.id);
      if (!result) {
        this.logger.warn("Could not start newly created game", {
          gameId: game.id,
        });
        return null;
      }
      return game;
    }

    if (currentGame.status === "registration") {
      this.logger.info("Attempting to start registered game...");
      const result = await this.startGame(currentGame.id);
      if (!result) {
        this.logger.warn("Could not start existing game", {
          gameId: currentGame.id,
        });
        return null;
      }
    }

    return currentGame;
  }

  async checkGameStatus() {
    const currentGame = await this.getCurrentGame();
    if (!currentGame) {
      await this.ensureActiveGame();
      return;
    }

    const now = new Date();
    if (new Date(currentGame.endTime) <= now) {
      await this.completeGame(currentGame.id);
      await this.ensureActiveGame();
    }
  }

  // Monitoring Methods
  startGameMonitoring() {
    this.logger.info("Starting game monitoring", {
      gameDurationHours: this.gameDurationHours,
      roundDurationHours: this.roundDurationHours,
      playersPerTeam: this.playersPerTeam,
    });

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkGameStatus().catch((err) => {
        this.logger.error("Error checking game status:", err);
      });
    }, 60 * 1000);
  }

  stopGameMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.logger.info("Game monitoring stopped");
    }
  }
}
