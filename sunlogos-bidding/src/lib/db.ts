import { mkdir, readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { GameError } from "./types";

const databaseUrl = postgresUrl(process.env.DATABASE_URL?.trim() ?? "");

function postgresUrl(connectionString: string): string {
  if (!/[?&]sslmode=(prefer|require|verify-ca)(?:&|$)/.test(connectionString)) return connectionString;
  if (/[?&]uselibpqcompat=/.test(connectionString)) return connectionString;
  const join = connectionString.includes("?") ? "&" : "?";
  return `${connectionString}${join}uselibpqcompat=true`;
}

const g = globalThis as unknown as {
  __sunlogosPool?: pg.Pool;
  __sunlogosPglite?: Promise<PGlite>;
};

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    if (!g.__sunlogosPool) {
      const pool = new pg.Pool({
        connectionString: databaseUrl,
        max: 5,
        // Fail the request with JSON instead of waiting until the host replaces it with an HTML page.
        connectionTimeoutMillis: 2000,
        query_timeout: 4000,
        statement_timeout: 4000,
      });
      // An idle client error with no listener crashes the process. The host then
      // sees an HTML error page, and Firefox reports that as a JSON.parse failure.
      pool.on("error", (error: unknown) => {
        console.error("postgres pool error", error);
      });
      g.__sunlogosPool = pool;
    }
    try {
      return (await g.__sunlogosPool.query(text, params)).rows as T[];
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/timeout/i.test(message) || /too many clients/i.test(message) || /connection slots/i.test(message)) {
        throw new GameError("Room is busy — try again", 503);
      }
      throw error;
    }
  }
  g.__sunlogosPglite ??= startLocal().catch((error: unknown) => {
    g.__sunlogosPglite = undefined;
    throw error;
  });
  return (await g.__sunlogosPglite).query<T>(text, params).then((result) => result.rows);
}

async function startLocal(): Promise<PGlite> {
  await mkdir(".data", { recursive: true });
  const db = new PGlite("./.data/sunlogos");
  const files = (await readdir("migrations").catch(() => []))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}
