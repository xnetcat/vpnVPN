import { router } from "../init";
import { deviceRouter } from "./device";
import { billingRouter } from "./billing";
import { adminRouter } from "./admin";
import { serversRouter } from "./servers";
import { desktopRouter } from "./desktop";
import { proxiesRouter } from "./proxies";
import { accountRouter } from "./account";
import { analyticsRouter } from "./analytics";

export const appRouter = router({
  device: deviceRouter,
  billing: billingRouter,
  admin: adminRouter,
  servers: serversRouter,
  proxies: proxiesRouter,
  account: accountRouter,
  desktop: desktopRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
