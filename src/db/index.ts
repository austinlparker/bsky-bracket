import postgres from "pg";
const { Pool } = postgres;
import { Kysely, PostgresDialect, Migrator } from "kysely";
import { DatabaseSchema } from "./schema";
import { migrationProvider } from "./migrations";
import { Config } from "../config";

export const createDb = (config: Config): Database => {
  console.log(config);
  const dialect = new PostgresDialect({
    pool: new Pool({
      host: config.dbHost,
      port: config.dbPort,
      database: config.dbName,
      user: config.dbUser,
      password: config.dbPassword,
      max: config.dbMaxConnections,
    }),
  });

  return new Kysely<DatabaseSchema>({
    dialect,
  });
};

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({
    db,
    provider: migrationProvider,
  });

  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  if (results) {
    for (const it of results) {
      console.log(`Migration "${it.migrationName}" was executed successfully`);
    }
  }
};

export type Database = Kysely<DatabaseSchema>;
