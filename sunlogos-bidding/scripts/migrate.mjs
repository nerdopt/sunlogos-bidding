import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const rawUrl = process.env.DATABASE_URL?.trim() ?? "";
const files = (await readdir("migrations").catch(() => []))
  .filter((file) => file.endsWith(".sql"))
  .sort();
if (rawUrl === "" || files.length === 0) {
  console.log("migrate: nothing to do");
  process.exit(0);
}

const client = await connectWithRetry(process.env.DATABASE_URL_UNPOOLED?.trim() || rawUrl);
try {
  await client.query("set lock_timeout = '60s'");
  await client.query("select pg_advisory_lock(7272741)");
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await client.query("select name from schema_migrations")).rows.map((row) => row.name),
  );
  for (const file of files.filter((name) => !done.has(name))) {
    await client.query("begin");
    try {
      await client.query(await readFile(`migrations/${file}`, "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`migrate: applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}

function postgresUrl(connectionString) {
  if (!/[?&]sslmode=(prefer|require|verify-ca)(?:&|$)/.test(connectionString)) return connectionString;
  if (/[?&]uselibpqcompat=/.test(connectionString)) return connectionString;
  const join = connectionString.includes("?") ? "&" : "?";
  return `${connectionString}${join}uselibpqcompat=true`;
}

async function connectWithRetry(connectionString) {
  const safe = postgresUrl(connectionString);
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const client = new pg.Client({ connectionString: safe });
    try {
      await client.connect();
      return client;
    } catch (error) {
      last = error;
      await client.end().catch(() => undefined);
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  const message = last instanceof Error ? last.message : "connect failed";
  console.error(`migrate: database connection failed (${message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://***")})`);
  throw last;
}
