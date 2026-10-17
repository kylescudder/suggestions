import { sql } from "../server/db";

const origin = "http://127.0.0.1:3001";
const headers = { "Content-Type": "application/json" };
let createdId: number | undefined;

async function expect(path: string, status: number, init?: RequestInit) {
  const response = await fetch(origin + path, {
    ...init,
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== status) {
    throw new Error(`${path}: expected ${status}, received ${response.status}`);
  }
  return response;
}

try {
  const page = await (await expect("/", 200)).text();
  const asset = page.match(/src="([^\"]+\.js)"/)?.[1];
  if (!asset) throw new Error("Built frontend asset is missing");
  await expect(asset, 200);
  const me = (await (await expect("/api/me", 200)).json()) as {
    isAdmin?: unknown;
  };
  if (me.isAdmin !== false)
    throw new Error("Signed-out user received admin access");
  await expect("/api/suggestions", 401);
  await expect("/api/suggestions/stats", 401);
  await expect("/api/suggestions", 400, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "", description: "" }),
  });
  const created = (await (
    await expect("/api/suggestions", 201, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Herman deployment verification",
        description: "Temporary submission removed by the deployment check.",
      }),
    })
  ).json()) as { id?: unknown };
  if (typeof created.id !== "number" || !Number.isSafeInteger(created.id))
    throw new Error("Submission ID is missing");
  createdId = created.id;
  await expect(`/api/suggestions/${createdId}`, 401, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "implemented" }),
  });
  const [row] =
    await sql`SELECT status FROM suggestions WHERE id = ${createdId!}`;
  if (row?.status !== "pending")
    throw new Error("Submission was not stored correctly");
  console.log(
    "Frontend/assets, public submission, storage and admin boundaries passed",
  );
} finally {
  try {
    if (createdId !== undefined)
      await sql`DELETE FROM suggestions WHERE id = ${createdId}`;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
