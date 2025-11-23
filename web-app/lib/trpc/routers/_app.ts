import { router } from "../init";
import { deviceRouter } from "./device";
import { billingRouter } from "./billing";
import { adminRouter } from "./admin";
import { serversRouter } from "./servers";
import { proxiesRouter } from "./proxies";

export const appRouter = router({
  device: deviceRouter,
  billing: billingRouter,
  admin: adminRouter,
  servers: serversRouter,
  proxies: proxiesRouter,
});

export type AppRouter = typeof appRouter;

