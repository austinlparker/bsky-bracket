import { Kysely, Migration, MigrationProvider } from "kysely";

const migrations: Record<string, Migration> = {};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

migrations["001"] = {
  async up(db: Kysely<unknown>) {
    // Create user table
    await db.schema
      .createTable("user")
      .addColumn("did", "text", (col) => col.primaryKey())
      .addColumn("displayName", "text")
      .addColumn("handle", "text")
      .addColumn("firstSeen", "timestamptz", (col) => col.notNull())
      .addColumn("team", "integer", (col) => col.notNull())
      .addColumn("currentGameId", "integer")
      .execute();

    // Create post table
    await db.schema
      .createTable("post")
      .addColumn("uri", "text", (col) => col.primaryKey())
      .addColumn("cid", "text", (col) => col.notNull())
      .addColumn("indexedAt", "timestamptz", (col) => col.notNull())
      .addColumn("team", "integer", (col) => col.notNull())
      .addColumn("userId", "text", (col) => col.notNull())
      .addColumn("gameId", "integer")
      .addColumn("roundId", "integer")
      .addColumn("likeCount", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
      .execute();

    // Create sub_state table
    await db.schema
      .createTable("sub_state")
      .addColumn("service", "text", (col) => col.primaryKey())
      .addColumn("cursor", "bigint", (col) => col.notNull())
      .execute();

    // Create game table
    await db.schema
      .createTable("game")
      .addColumn("id", "serial", (col) => col.primaryKey())
      .addColumn("startTime", "timestamptz", (col) => col.notNull())
      .addColumn("endTime", "timestamptz", (col) => col.notNull())
      .addColumn("status", "text", (col) => col.notNull())
      .addColumn("maxPlayersPerTeam", "integer", (col) => col.notNull())
      .addColumn("currentRoundId", "integer")
      .addColumn("winner", "integer")
      .execute();

    // Create game_participant table
    await db.schema
      .createTable("game_participant")
      .addColumn("gameId", "integer", (col) => col.notNull())
      .addColumn("userId", "text", (col) => col.notNull())
      .addColumn("team", "integer", (col) => col.notNull())
      .addColumn("joinedAt", "timestamptz", (col) => col.notNull())
      .addColumn("status", "text", (col) => col.notNull())
      // Composite primary key
      .addPrimaryKeyConstraint("game_participant_pkey", ["gameId", "userId"])
      .execute();

    // Create round table
    await db.schema
      .createTable("round")
      .addColumn("id", "serial", (col) => col.primaryKey())
      .addColumn("gameId", "integer", (col) => col.notNull())
      .addColumn("startTime", "timestamptz", (col) => col.notNull())
      .addColumn("endTime", "timestamptz", (col) => col.notNull())
      .addColumn("status", "text", (col) => col.notNull())
      .addColumn("cutoffLikes", "integer")
      .execute();

    // Create round_participant table
    await db.schema
      .createTable("round_participant")
      .addColumn("roundId", "integer", (col) => col.notNull())
      .addColumn("userId", "text", (col) => col.notNull())
      .addColumn("team", "integer", (col) => col.notNull())
      .addColumn("totalLikes", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("status", "text", (col) => col.notNull())
      // Composite primary key
      .addPrimaryKeyConstraint("round_participant_pkey", ["roundId", "userId"])
      .execute();

    // Create elimination table
    await db.schema
      .createTable("elimination")
      .addColumn("roundId", "integer", (col) => col.notNull())
      .addColumn("userId", "text", (col) => col.notNull())
      .addColumn("team", "integer", (col) => col.notNull())
      .addColumn("likeCount", "integer", (col) => col.notNull())
      .addColumn("eliminatedAt", "timestamptz", (col) => col.notNull())
      // Composite primary key
      .addPrimaryKeyConstraint("elimination_pkey", ["roundId", "userId"])
      .execute();

    // Add indexes
    await db.schema
      .createIndex("post_game_round_idx")
      .on("post")
      .columns(["gameId", "roundId"])
      .execute();

    await db.schema
      .createIndex("round_participant_status_idx")
      .on("round_participant")
      .columns(["roundId", "status"])
      .execute();

    await db.schema
      .createIndex("elimination_round_team_idx")
      .on("elimination")
      .columns(["roundId", "team"])
      .execute();

    // Add foreign key constraints
    await db.schema
      .alterTable("post")
      .addForeignKeyConstraint("fk_post_user", ["userId"], "user", ["did"])
      .execute();

    await db.schema
      .alterTable("game_participant")
      .addForeignKeyConstraint("fk_game_participant_game", ["gameId"], "game", [
        "id",
      ])
      .execute();

    await db.schema
      .alterTable("round")
      .addForeignKeyConstraint("fk_round_game", ["gameId"], "game", ["id"])
      .execute();

    await db.schema
      .alterTable("round_participant")
      .addForeignKeyConstraint(
        "fk_round_participant_round",
        ["roundId"],
        "round",
        ["id"],
      )
      .execute();
  },

  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("elimination").execute();
    await db.schema.dropTable("round_participant").execute();
    await db.schema.dropTable("round").execute();
    await db.schema.dropTable("game_participant").execute();
    await db.schema.dropTable("game").execute();
    await db.schema.dropTable("post").execute();
    await db.schema.dropTable("user").execute();
    await db.schema.dropTable("sub_state").execute();
  },
};
