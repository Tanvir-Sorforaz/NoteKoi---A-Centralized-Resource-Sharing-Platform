import app from "./app.js";
import { config } from "./config/index.js";
import { prisma } from "./lib/prisma.js";
import { closeRedis, connectRedis } from "./lib/redis.js";

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  console.log("[db] PostgreSQL connected");

  try {
    await connectRedis();
    console.log("[redis] connected");
  } catch (error) {
    // Redis is optional at boot: auth fails closed and /health reports it.
    console.warn("[redis] not reachable at startup:", (error as Error).message);
  }

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close();
    await prisma.$disconnect().catch(() => undefined);
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch(async (error: unknown) => {
  console.error("[api] failed to start:", error);
  await prisma.$disconnect().catch(() => undefined);
  await closeRedis();
  process.exit(1);
});

