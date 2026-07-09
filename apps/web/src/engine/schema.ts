import { z } from "zod";

export const VerificationStatusSchema = z.enum([
  "verified",
  "ambiguous",
  "not_documented",
  "requires_manual_review"
]);

export const SourceRefSchema = z.object({
  documentId: z.string().min(1),
  page: z.number().int().positive(),
  bates: z.string().optional(),
  exhibitId: z.string().optional(),
  quote: z.string().min(1)
});

const withSourceRequirement = <T extends z.ZodObject<any>>(schema: T) =>
  schema.superRefine((val, ctx) => {
    const finding = val as { status: z.infer<typeof VerificationStatusSchema>; sources: unknown[] };
    if (finding.status !== "not_documented" && finding.sources.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Documented findings must include at least one source.",
        path: ["sources"]
      });
    }

    if (finding.status === "not_documented" && finding.sources.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "not_documented findings should not include sources.",
        path: ["sources"]
      });
    }
  });

export const ActorRoleFindingSchema = withSourceRequirement(
  z.object({
    role: z.string().min(1),
    status: VerificationStatusSchema,
    sources: z.array(SourceRefSchema)
  })
);

export const KeyFindingSchema = withSourceRequirement(
  z.object({
    finding: z.string().min(1),
    status: VerificationStatusSchema,
    sources: z.array(SourceRefSchema)
  })
);

export const RiskFindingSchema = withSourceRequirement(
  z.object({
    type: z.string().min(1),
    description: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]),
    status: VerificationStatusSchema,
    sources: z.array(SourceRefSchema)
  })
);

export const OperativeSummaryResponseSchema = z.object({
  caseMetadata: z.object({
    caseId: z.string().min(1),
    title: z.string().min(1),
    type: z.string().min(1),
    status: z.string().min(1),
    analysisDate: z.string().datetime()
  }),

  coverage: z.object({
    processedPages: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
    coveragePercent: z.number().min(0).max(100),
    missingIntervals: z.array(z.string()),
    overlaps: z.array(z.string()),
    integrityStatus: z.enum(["verified", "unverified"])
  }),

  actorMatrix: z.array(
    z.object({
      name: z.string().min(1),
      roles: z.array(ActorRoleFindingSchema)
    })
  ),

  operativeSummary: z.object({
    keyFindings: z.array(KeyFindingSchema),
    risks: z.array(RiskFindingSchema)
  })
});

export type OperativeSummaryResponse = z.infer<typeof OperativeSummaryResponseSchema>;
