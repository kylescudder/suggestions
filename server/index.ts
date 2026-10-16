import { Hono, type Context, type Next } from "hono";
import { serveStatic } from "hono/bun";
import { createClerkClient } from "@clerk/backend";
import { migrate, sql } from "./db";

const STATUSES = ["pending", "reviewed", "implemented", "rejected"];

// Comma-separated list of emails allowed into the admin dashboard.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

// Cache admin lookups so we don't hit the Clerk API on every request.
const adminCache = new Map<string, { isAdmin: boolean; expires: number }>();

async function isAdmin(userId: string) {
  const cached = adminCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.isAdmin;

  const user = await clerk.users.getUser(userId);
  const isAdmin = user.emailAddresses.some(
    (e) =>
      e.verification?.status === "verified" &&
      ADMIN_EMAILS.has(e.emailAddress.toLowerCase()),
  );
  adminCache.set(userId, { isAdmin, expires: Date.now() + 60_000 });
  return isAdmin;
}

type Env = { Variables: { userId: string | null } };

await migrate();

const app = new Hono<Env>();

app.use("/api/*", async (c, next) => {
  const state = await clerk.authenticateRequest(c.req.raw, {
    authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(","),
  });
  c.set("userId", state.toAuth()?.userId ?? null);
  await next();
});

const requireAdmin = async (c: Context<Env>, next: Next) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Must be signed in" }, 401);
  if (!(await isAdmin(userId))) return c.json({ error: "Not an admin" }, 403);
  await next();
};

app.get("/api/me", async (c) => {
  const userId = c.get("userId");
  return c.json({ isAdmin: userId ? await isAdmin(userId) : false });
});

app.get("/api/suggestions", requireAdmin, async (c) => {
  const status = c.req.query("status");
  const rows = await sql`
    SELECT id, title, description, status, author_name AS "authorName",
      author_email AS "authorEmail", created_at AS "createdAt"
    FROM suggestions
    ${status ? sql`WHERE status = ${status}` : sql``}
    ORDER BY created_at DESC
  `;
  return c.json(rows);
});

app.get("/api/suggestions/stats", requireAdmin, async (c) => {
  const rows = await sql<{ status: string; count: number }[]>`
    SELECT status, count(*)::int AS count FROM suggestions GROUP BY status
  `;
  const stats: Record<string, number> = { all: 0 };
  for (const s of STATUSES) stats[s] = 0;
  for (const r of rows) {
    stats[r.status] = r.count;
    stats.all += r.count;
  }
  return c.json(stats);
});

app.post("/api/suggestions", async (c) => {
  const body = await c.req.json<{
    title?: string;
    description?: string;
    authorName?: string;
    authorEmail?: string;
  }>();
  if (!body.title?.trim() || !body.description?.trim()) {
    return c.json({ error: "Title and description are required" }, 400);
  }
  const [row] = await sql`
    INSERT INTO suggestions (title, description, author_name, author_email)
    VALUES (
      ${body.title.trim()},
      ${body.description.trim()},
      ${body.authorName || null},
      ${body.authorEmail || null}
    )
    RETURNING id
  `;
  return c.json(row, 201);
});

app.patch("/api/suggestions/:id", requireAdmin, async (c) => {
  const { status } = await c.req.json<{ status?: string }>();
  if (!status || !STATUSES.includes(status)) {
    return c.json({ error: "Invalid status" }, 400);
  }
  await sql`UPDATE suggestions SET status = ${status} WHERE id = ${Number(c.req.param("id"))}`;
  return c.json({ ok: true });
});

// Serve the built frontend in production.
app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ path: "./dist/index.html" }));

export default { port: Number(process.env.PORT ?? 3001), fetch: app.fetch };
