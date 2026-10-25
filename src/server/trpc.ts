import { initTRPC, TRPCError } from '@trpc/server'
import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db'
import { suggestions } from './schema'

export const STATUSES = [
  'pending',
  'reviewed',
  'implemented',
  'rejected'
] as const

export type Context = {
  // From Clerk's verified server session, never from request input.
  userId: string | null
  isAdmin: (userId: string) => Promise<boolean>
}

const t = initTRPC.context<Context>().create()

const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId)
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Must be signed in' })
  if (!(await ctx.isAdmin(ctx.userId)))
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not an admin' })
  return next()
})

export const appRouter = t.router({
  me: t.procedure.query(async ({ ctx }) => ({
    isAdmin: ctx.userId ? await ctx.isAdmin(ctx.userId) : false
  })),
  suggestions: t.router({
    list: adminProcedure
      .input(z.object({ status: z.enum(STATUSES).optional() }))
      .query(({ input }) =>
        db
          .select({
            id: suggestions.id,
            title: suggestions.title,
            description: suggestions.description,
            status: suggestions.status,
            authorName: suggestions.authorName,
            authorEmail: suggestions.authorEmail,
            createdAt: suggestions.createdAt
          })
          .from(suggestions)
          .where(
            input.status ? eq(suggestions.status, input.status) : undefined
          )
          .orderBy(desc(suggestions.createdAt))
      ),
    stats: adminProcedure.query(async () => {
      const rows = await db
        .select({ status: suggestions.status, count: count() })
        .from(suggestions)
        .groupBy(suggestions.status)
      const stats: Record<'all' | (typeof STATUSES)[number], number> = {
        all: 0,
        pending: 0,
        reviewed: 0,
        implemented: 0,
        rejected: 0
      }
      for (const row of rows) {
        stats[row.status as (typeof STATUSES)[number]] = row.count
        stats.all += row.count
      }
      return stats
    }),
    create: t.procedure
      .input(
        z.object({
          title: z.string().trim().min(1, 'Title is required'),
          description: z.string().trim().min(1, 'Description is required'),
          authorName: z.string().trim().optional(),
          authorEmail: z.string().trim().optional()
        })
      )
      .mutation(async ({ input }) => {
        const [row] = await db
          .insert(suggestions)
          .values({
            title: input.title,
            description: input.description,
            authorName: input.authorName || null,
            authorEmail: input.authorEmail || null
          })
          .returning({ id: suggestions.id })
        return row!
      }),
    updateStatus: adminProcedure
      .input(
        z.object({ id: z.number().int().positive(), status: z.enum(STATUSES) })
      )
      .mutation(async ({ input }) => {
        await db
          .update(suggestions)
          .set({ status: input.status })
          .where(eq(suggestions.id, input.id))
        return { ok: true }
      })
  })
})

export type AppRouter = typeof appRouter
