import { z } from 'zod'

export const profileNamesSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  givenName: z.string().trim().max(100),
  familyName: z.string().trim().max(100)
})

export const profileUpdateSchema = profileNamesSchema
  .partial()
  .extend({
    givenName: profileNamesSchema.shape.givenName
      .nullable()
      .transform((value) => value ?? '')
      .optional(),
    familyName: profileNamesSchema.shape.familyName
      .nullable()
      .transform((value) => value ?? '')
      .optional(),
    image: z.string().max(200).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0)
