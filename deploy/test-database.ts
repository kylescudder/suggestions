// Runs only against an explicitly supplied disposable CI PostgreSQL service.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL must point to disposable PostgreSQL");
const admin = postgres(process.env.TEST_DATABASE_URL, {
  max: 1,
  onnotice: () => {},
});
const name = "suggestions_ci_" + randomUUID().replaceAll("-", "").slice(0, 10);
const ownerName = name + "_owner";
const runtimeName = name + "_runtime";
const otherName = name + "_other";
const clients: ReturnType<typeof postgres>[] = [];
const created: string[] = [];

function client(user: string, database = name) {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.username = user;
  url.password = "";
  url.pathname = "/" + database;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  clients.push(sql);
  return sql;
}

async function denied(operation: PromiseLike<unknown>) {
  await assert.rejects(Promise.resolve(operation), (error: unknown) => {
    return (error as { code?: string }).code === "42501";
  });
}

try {
  for (const role of [ownerName, runtimeName]) {
    await admin.unsafe(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
    );
    created.push(role);
  }
  for (const database of [name, otherName]) {
    await admin.unsafe(`CREATE DATABASE "${database}" OWNER "${ownerName}"`);
    created.push(database);
    await admin.unsafe(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
  }
  await admin.unsafe(`GRANT CONNECT ON DATABASE "${name}" TO "${runtimeName}"`);
  const owner = client(ownerName);
  await owner.unsafe(`
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO "${runtimeName}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${runtimeName}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${runtimeName}";
  `);
  const schema = new URL("../server/schema.sql", import.meta.url).pathname;
  await owner.file(schema);
  await owner.file(schema);
  const runtime = client(runtimeName);
  const [row] = await runtime`
    INSERT INTO suggestions(title, description) VALUES ('CI check', 'Disposable test')
    RETURNING id, status
  `;
  assert.equal(row.status, "pending");
  await runtime`UPDATE suggestions SET status = 'reviewed' WHERE id = ${row.id}`;
  const [updated] =
    await runtime`SELECT status FROM suggestions WHERE id = ${row.id}`;
  assert.equal(updated.status, "reviewed");
  await runtime`DELETE FROM suggestions WHERE id = ${row.id}`;
  assert.equal((await runtime`SELECT id FROM suggestions`).length, 0);
  await denied(runtime.unsafe("CREATE TABLE public.forbidden(id int)"));
  await denied(runtime.unsafe("CREATE SCHEMA forbidden"));
  await denied(runtime.unsafe("CREATE ROLE forbidden"));
  const foreign = client(runtimeName, otherName);
  await denied(foreign`SELECT 1`);
  console.log(
    "Owner migrations/repeat, runtime CRUD/sequences, denied DDL and cross-database isolation passed",
  );
} finally {
  await Promise.all(clients.map((sql) => sql.end({ timeout: 1 })));
  for (const database of [otherName, name]) {
    if (created.includes(database))
      await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
  }
  for (const role of [runtimeName, ownerName]) {
    if (created.includes(role)) await admin.unsafe(`DROP ROLE "${role}"`);
  }
  await admin.end({ timeout: 1 });
}
