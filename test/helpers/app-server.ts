import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { createAppServer } from "../../server.js";
import type { AppServerOptions } from "../../server/types.js";

export async function startTestServer(options: AppServerOptions = {}) {
  const app = createAppServer({
    host: "127.0.0.1",
    port: 0,
    ...options,
  });

  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");

  const address = app.server.address() as AddressInfo;
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

export function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }

  const combined = response.headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=\s*[A-Za-z0-9!#$%&'*+.^_`|~-]+=)/u);
}

export function cookieHeaderFromSetCookies(setCookies) {
  return setCookies
    .map(cookie => cookie.split(";", 1)[0])
    .join("; ");
}

export function pickCookie(setCookies, cookieName) {
  return (
    setCookies.find(cookie => cookie.startsWith(`${cookieName}=`))?.split(";", 1)[0] || ""
  );
}
