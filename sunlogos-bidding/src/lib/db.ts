import { mkdir, readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

const g = globalThis as unknown as {
  __sunlogosPool?: pg.Pool;
  __sunlogosPglite?: Promise<PGlite>;
};

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    g.__sunlogosPool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await g.__sunlogosPool.query(text, params)).rows as T[];
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
