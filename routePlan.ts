import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getCandidateRoutes } from "../services/candidateProvider.js";
import { evaluateModes } from "../services/policyEngine.js";

const TrailerSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["UTILITY", "CAMPER", "FREEFORM"]).optional(),
  lengthFt: z.number().positive().optional(),
  widthFt: z.number().positive().optional(),
  heightFt: z.number().positive().optional(),
  weightClass: z.enum(["LIGHT", "MEDIUM", "HEAVY"]).default("MEDIUM")
}).superRefine((val, ctx) => {
  if (val.enabled) {
    if (!val.type) ctx.addIssue({ code: "custom", message: "trailer.type required when enabled=true" });
    if (!val.lengthFt) ctx.addIssue({ code: "custom", message: "trailer.lengthFt required when enabled=true" });
  }
});

const PlanRequestSchema = z.object({
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
  preferences: z.object({
    avoidTolls: z.boolean().optional(),
    avoidHighways: z.boolean().optional(),
    avoidFerries: z.boolean().optional(),
    avoidUnpaved: z.boolean().optional(),
    avoidTightStreets: z.boolean().optional(),
    routingAlternatives: z.number().int().min(1).max(6).optional()
  }).optional(),
  constraints: z.object({
    largeTrailerThresholdFt: z.number().positive().optional(),
    destinationExceptionRadiusMiles: z.number().positive().optional(),
    maxRouteCountPerMode: z.number().int().min(1).max(2).optional()
  }).optional(),
  session: z.object({
    navigationSessionId: z.string().optional(),
    currentPosition: z.object({
      lat: z.number(),
      lng: z.number(),
      headingDeg: z.number().optional(),
      speedMps: z.number().optional()
    }).optional(),
    activeRouteId: z.string().optional()
  }).optional()
});

export default async function routePlan(req: FastifyRequest, reply: FastifyReply) {
  const parsed = PlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
  }

  const request = parsed.data;

  // Phase 1: candidates from provider (stubbed for now).
  const candidates = await getCandidateRoutes(request);

  // Phase 2: evaluate with your policy engine (stress/tow/downtown rules etc.)
  const results = evaluateModes({
    request,
    candidates
  });

  return reply.send({
    requestId: request.requestId,
    generatedAtIso: new Date().toISOString(),
    results,
    errors: []
  });
}
