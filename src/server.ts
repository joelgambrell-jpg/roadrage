import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

import routePlan from "./routes/routePlan.js";
import routeMonitor from "./routes/routeMonitor.js";
import tripComplete from "./routes/tripComplete.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await app.register(swagger, {
  openapi: {
    info: { title: "Routing Intelligence Platform API", version: "1.0.0" }
  }
});

await app.register(swaggerUI, { routePrefix: "/docs" });

app.get("/health", async () => ({ ok: true }));

app.post("/v1/route/plan", routePlan);
app.post("/v1/route/monitor", routeMonitor);
app.post("/v1/trip/complete", tripComplete);

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: "0.0.0.0" });
