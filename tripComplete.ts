import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { newId } from "../services/ids.js";

const TripCompleteSchema = z.object({
  navigationSessionId: z.string().min(6),
  activeRouteId: z.string().min(6),
  outcome: z.object({
    actualDurationSeconds: z.number().int().positive(),
    rerouteCount: z.number().int().optional(),
    userModeSwitches: z.array(z.string()).optional(),
    userFeedback: z.object({
      stressRating1to5: z.number().int().min(1).max(5).optional(),
      towComfort1to10: z.number().int().min(1).max(10).optional()
    }).optional()
  }),
  privacy: z.object({
    allowCommunityLearning: z.boolean().optional(),
    allowSensorSignals: z.boolean().optional()
  }).optional()
});

export default async function tripComplete(req: FastifyRequest, reply: FastifyReply) {
  const parsed = TripCompleteSchema.safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });

  // In v1: accept and queue later (stub)
  return reply.send({ accepted: true, ingestionId: newId("ing_") });
}
