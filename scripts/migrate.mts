// Applies db/migrations/*.sql in name order, each once, each in its own transaction.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

// vercel-build runs this on every deploy. Only production deploys migrate: previews have no
// DATABASE_URL, and if one were added a branch's migrations would hit the production database.
if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log("skipping migrations outside production");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; cannot run migrations.");
  process.exit(1);
}

const dir = path.join(process.cwd(), "db", "migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    await client.query("begin");
    try {
      await client.query(await readFile(path.join(dir, file), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
