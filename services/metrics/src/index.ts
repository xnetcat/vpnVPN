import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 4100);

buildServer()
  .then((fastify) =>
    fastify.listen({ port, host: "0.0.0.0" }).then((address) => {
      fastify.log.info(`metrics service listening on ${address}`);
      return undefined;
    }),
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
