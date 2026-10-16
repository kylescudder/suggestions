import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

export async function migrate() {
  await sql.file(new URL("./schema.sql", import.meta.url).pathname);
}
