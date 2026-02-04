import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getCandidateRoutes } from "../services/candidateProvider.js";
import { evaluateModes } from "../services/policyEngine.js";

/**
 * FILE: backend/src/routes/routePlan.ts (or wherever this handler lives)
 * FULL DROP-IN (PRESERVED) + NEXT STEP UPDATE:
 * - Adds compileMode() so modes become explicit policy blocks (tow vs human vs objective)
 * - Adds legacy frontend payload compatibility (so your web/index.html can call this endpoint)
 * - Returns debug.compiledPolicies + debug.normalizedRequest (no routing behavior changes required)
 *
 * IMPORTANT: Tow ignores stress (human settings). Low Stress uses stressTolerance.
 */

const TrailerSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(["UTILITY", "CAMPER", "FREEFORM"]).optional(),
    lengthFt: z.number().positive().optional(),
    widthFt: z.number().positive().optional(),
    heightFt: z.number().positive().optional(),
    weightClass: z.enum(["LIGHT", "MEDIUM", "HEAVY"]).default("MEDIUM")
  })
  .superRefine((val, ctx) => {
    if (val.enabled) {
      if (!val.type) ctx.addIssue({ code: "custom", message: "trailer.type required when enabled=true" });
      if (!val.lengthFt) ctx.addIssue({ code: "custom", message: "trailer.lengthFt required when enabled=true" });
    }
  });

/** ---------- Existing v2 request schema (PRESERVED) ---------- */
const PlanRequestSchemaV2 = z.object({
  requestId: z.string().min(6),
  origin: z.object({ lat: z.number(), lng: z.number() }),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  time: z.object({
    departureType: z.enum(["now", "schedule"]),
    departureTimeIso: z.string().optional()
  }),
  mode: z.object({
    primary: z.enum(["LOW_STRESS", "TOW", "FUEL_SAVER", "FASTEST"]),
    alsoReturn: z.array(z.enum(["LOW_STRESS", "TOW", "FUEL_SAVER", "FASTEST"])).optional()
  }),
  userState: z.object({
    stressTolerance: z.number().int().min(1).max(100)
  }),
  vehicleProfile: z.object({
    vehicleType: z.enum(["CAR", "SUV", "TRUCK", "MINIVAN", "PASSENGER_VAN"]),
    trailer: TrailerSchema
  }),
  preferences: z
    .object({
      avoidTolls: z.boolean().optional(),
      avoidHighways: z.boolean().optional(),
      avoidFerries: z.boolean().optional(),
      avoidUnpaved: z.boolean().optional(),
      avoidTightStreets: z.boolean().optional(),
      routingAlternatives: z.number().int().min(1).max(6).optional()
    })
    .optional(),
  constraints: z
    .object({
      largeTrailerThresholdFt: z.number().positive().optional(),
      destinationExceptionRadiusMiles: z.number().positive().optional(),
      maxRouteCountPerMode: z.number().int().min(1).max(2).optional()
    })
    .optional(),
  session: z
    .object({
      navigationSessionId: z.string().optional(),
      currentPosition: z
        .object({
          lat: z.number(),
          lng: z.number(),
          headingDeg: z.number().optional(),
          speedMps: z.number().optional()
        })
        .optional(),
      activeRouteId: z.string().optional()
    })
    .optional()
});

/** ---------- Legacy web/index.html payload schema (COMPAT) ---------- */
const LegacyWebPayloadSchema = z.object({
  // from web/index.html
  mode: z.enum(["LOW_STRESS", "TOW", "FUEL_SAVER", "FASTEST"]),
  stress: z.number().min(1).max(100).optional(),
  trailerLengthFt: z.number().min(0).max(200).optional(),

  origin: z.object({ lat: z.number(), lng: z.number() }).optional(),
  destination: z.object({ lat: z.number(), lng: z.number() }).optional(),

  originText: z.string().optional(),
  destinationText: z.string().optional(),

  options: z
    .object({
      avoidHighways: z.boolean().optional(),
      avoidTolls: z.boolean().optional(),
      avoidFerries: z.boolean().optional(),
      avoidUnpaved: z.boolean().optional()
    })
    .optional(),

  laneStrategy: z.object({ importance: z.number().min(0).max(100).optional() }).optional(),
  tow: z
    .object({
      confidenceTarget: z.number().min(0).max(100).optional(),
      trailerType: z.string().optional(),
      trailerPresetFt: z.number().optional()
    })
    .optional(),

  // optional extra blocks from UI (we won’t validate deeply here)
  lowStress: z.any().optional(),
  notes: z.string().optional(),

  // optional coords in labels
  originLabel: z.string().optional(),
  destinationLabel: z.string().optional()
});

const PlanRequestUnion = z.union([PlanRequestSchemaV2, LegacyWebPayloadSchema]);

type PrimaryMode = "LOW_STRESS" | "TOW" | "FUEL_SAVER" | "FASTEST";

type CompiledPolicies = {
  objective: { time: number; fuel: number; comfort: number; simplicity: number; risk: number };
  tow: { enabled: boolean };
  human: { enabled: boolean; stressTolerance: number };
};

function compileMode(primary: PrimaryMode, stressTolerance: number): CompiledPolicies {
  // Stress is HUMAN. Tow ignores it by disabling human policy.
  const human = { enabled: false, stressTolerance };
  const tow = { enabled: false };

  // baseline weights
  let objective: CompiledPolicies["objective"] = {
    time: 0.4,
    fuel: 0.2,
    comfort: 0.2,
    simplicity: 0.1,
    risk: 0.1
  };

  switch (primary) {
    case "FASTEST":
      objective = { time: 0.8, fuel: 0.05, comfort: 0.05, simplicity: 0.05, risk: 0.05 };
      break;
    case "FUEL_SAVER":
      objective = { time: 0.2, fuel: 0.7, comfort: 0.05, simplicity: 0.03, risk: 0.02 };
      break;
    case "LOW_STRESS":
      human.enabled = true;
      objective = { time: 0.15, fuel: 0.1, comfort: 0.45, simplicity: 0.2, risk: 0.1 };
      break;
    case "TOW":
      tow.enabled = true;
      // Tow: prioritize risk + simplicity; comfort is not the “stress” concept
      objective = { time: 0.35, fuel: 0.1, comfort: 0.05, simplicity: 0.2, risk: 0.3 };
      break;
  }

  return { objective, tow, human };
}

function makeRequestId() {
  // stable-ish, short, URL-safe
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLegacyToV2(body: z.infer<typeof LegacyWebPayloadSchema>) {
  // If coords not locked, we cannot route. Keep behavior explicit.
  if (!body.origin || !body.destination) {
    return { error: "MISSING_COORDS" as const };
  }

  const primary = body.mode;
  const stressTolerance = Math.max(1, Math.min(100, Math.round(Number(body.stress ?? 25))));
  const trailerLen = Number(body.trailerLengthFt ?? 0);

  // Heuristic: if trailerLen > 0, assume towing enabled in profile trailer (even if mode isn't TOW)
  const trailerEnabled = trailerLen > 0;

  const normalized = {
    requestId: makeRequestId(),
    origin: { lat: body.origin.lat, lng: body.origin.lng },
    destination: { lat: body.destination.lat, lng: body.destination.lng },

    time: { departureType: "now" as const },

    mode: { primary, alsoReturn: [] as PrimaryMode[] },

    userState: { stressTolerance },

    vehicleProfile: {
      // We can refine later; default keeps current pipeline working
      vehicleType: "TRUCK" as const,
      trailer: {
        enabled: trailerEnabled,
        type: trailerEnabled ? "FREEFORM" : undefined,
        lengthFt: trailerEnabled ? Math.max(1, trailerLen) : undefined,
        weightClass: "MEDIUM" as const
      }
    },

    preferences: {
      avoidHighways: body.options?.avoidHighways,
      avoidTolls: body.options?.avoidTolls,
      avoidFerries: body.options?.avoidFerries,
      avoidUnpaved: body.options?.avoidUnpaved,
      routingAlternatives: undefined
    },

    constraints: undefined,
    session: undefined
  };

  return { normalized };
}

export default async function routePlan(req: FastifyRequest, reply: FastifyReply) {
  const parsed = PlanRequestUnion.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
  }

  // Determine if this is V2 or legacy and normalize to V2 shape
  let request: z.infer<typeof PlanRequestSchemaV2>;
  let normalizedFrom: "v2" | "legacy" = "v2";

  if ("requestId" in parsed.data && "vehicleProfile" in parsed.data) {
    // V2 already
    request = parsed.data as z.infer<typeof PlanRequestSchemaV2>;
  } else {
    normalizedFrom = "legacy";
    const legacy = parsed.data as z.infer<typeof LegacyWebPayloadSchema>;
    const out = normalizeLegacyToV2(legacy);

    if ("error" in out) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        message: "Origin/Destination coordinates are required. Use address suggestions to lock coordinates.",
        details: { code: out.error }
      });
    }

    // Validate normalized output with your canonical schema
    const again = PlanRequestSchemaV2.safeParse(out.normalized);
    if (!again.success) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        message: "Normalized legacy payload failed canonical validation.",
        details: again.error.flatten()
      });
    }
    request = again.data;
  }

  // Compile policies for the primary mode (NEW)
  const compiledPolicies = compileMode(request.mode.primary, request.userState.stressTolerance);

  // Phase 1: candidates from provider (stubbed for now).
  const candidates = await getCandidateRoutes(request);

  // Phase 2: evaluate with your policy engine (stress/tow/downtown rules etc.)
  const results = evaluateModes({
    request,
    candidates,
    // NEW (safe): policy engine can ignore if it doesn’t accept it yet
    compiledPolicies
  } as any);

  return reply.send({
    requestId: request.requestId,
    generatedAtIso: new Date().toISOString(),
    results,
    errors: [],
    debug: {
      normalizedFrom,
      compiledPolicies,
      normalizedRequest: request
    }
  });
}
