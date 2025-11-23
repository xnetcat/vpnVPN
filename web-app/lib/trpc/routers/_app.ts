import { router } from "../init";
import { deviceRouter } from "./device";
import { billingRouter } from "./billing";
import { adminRouter } from "./admin";
import { serversRouter } from "./servers";
import { proxiesRouter } from "./proxies";
import { accountRouter } from "./account";

export const appRouter = router({
  device: deviceRouter,
  billing: billingRouter,
  admin: adminRouter,
  servers: serversRouter,
  proxies: proxiesRouter,
  account: accountRouter,
});

export type AppRouter = typeof appRouter;
