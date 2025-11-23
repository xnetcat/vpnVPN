import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 4000);

buildServer()
  .then((fastify) =>
    fastify.listen({ port, host: "0.0.0.0" }).then((address) => {
      fastify.log.info(`control-plane listening on ${address}`);
      return undefined;
    })
  )
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
