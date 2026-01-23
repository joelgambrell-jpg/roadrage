import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { monitorDecision } from "../services/policyEngine.js";

const MonitorRequestSchema = z.object({
  navigationSessionId: z.string().min(6),
  activeRouteId: z.string().min(6),
  currentPosition: z.object({ lat: z.number(), lng: z.number(), speedMps: z.number().optional(), headingDeg: z.number().optional() }),
  mode: z.enum(["LOW_STRESS", "TOW", "FUEL_SAVER", "FASTEST"]),
  userState: z.object({ stressTolerance: z.number().int().min(1).max(100) }),
  vehicleProfile: z.object({
    vehicleType: z.enum(["CAR", "SUV", "TRUCK", "MINIVAN", "PASSENGER_VAN"]),
    trailer: z.object({
      enabled: z.boolean(),
      type: z.enum(["UTILITY", "CAMPER", "FREEFORM"]).optional(),
      lengthFt: z.number().positive().optional()
    })
  }),
  lookahead: z.object({ minutes: z.number().int().min(5).max(20).optional(), maxAlternates: z.number().int().min(1).max(3).optional() }).optional(),
  cooldowns: z.object({ minSecondsBetweenReroutes: z.number().int().optional(), minSecondsBetweenPrompts: z.number().int().optional() }).optional()
});

export default async function routeMonitor(req: FastifyRequest, reply: FastifyReply) {
  const parsed = MonitorRequestSchema.safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });

  const decision = monitorDecision(parsed.data);

  return reply.send({
    navigationSessionId: parsed.data.navigationSessionId,
    decision
  });
}
