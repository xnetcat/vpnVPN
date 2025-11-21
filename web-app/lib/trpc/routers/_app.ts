import { router } from "../init";
import { deviceRouter } from "./device";
import { billingRouter } from "./billing";
import { adminRouter } from "./admin";
import { serversRouter } from "./servers";

export const appRouter = router({
  device: deviceRouter,
  billing: billingRouter,
  admin: adminRouter,
  servers: serversRouter,
});

export type AppRouter = typeof appRouter;

