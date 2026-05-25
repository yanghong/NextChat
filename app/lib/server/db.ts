import mysql, { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getServerSideConfig } from "@/app/config/server";
import { AUTH_SCHEMA_STATEMENTS } from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var nextChatMysqlPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var nextChatSchemaReady: Promise<void> | undefined;
}

export type DbUserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password_hash: string;
};

export function getDbPool() {
  if (!global.nextChatMysqlPool) {
    const config = getServerSideConfig();

    if (
      !config.mysqlHost ||
      !config.mysqlUser ||
      !config.mysqlPassword ||
      !config.mysqlDatabase
    ) {
      throw new Error("MySQL auth database is not configured");
    }

    global.nextChatMysqlPool = mysql.createPool({
      host: config.mysqlHost,
      port: config.mysqlPort,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      database: config.mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      charset: "utf8mb4",
    });
  }

  return global.nextChatMysqlPool;
}

export async function ensureAuthSchema() {
  if (!global.nextChatSchemaReady) {
    global.nextChatSchemaReady = (async () => {
      const pool = getDbPool();
      for (const statement of AUTH_SCHEMA_STATEMENTS) {
        await pool.execute(statement);
      }
    })();
  }

  return global.nextChatSchemaReady;
}

export async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>,
) {
  const connection = await getDbPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
