import { Readable } from "node:stream";

class MockResponse {
  constructor() {
    this.body = "";
    this.headers = new Map();
    this.statusCode = 200;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
  }

  end(chunk = "") {
    if (Buffer.isBuffer(chunk)) {
      this.body += chunk.toString("utf8");
      return;
    }

    this.body += String(chunk);
  }
}

export async function invokeHandler(handler, options = {}) {
  const {
    body = null,
    headers = {},
    host = "test.local",
    method = "GET",
    remoteAddress = "127.0.0.1",
    url = "/",
  } = options;

  const requestBody =
    body == null
      ? []
      : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8")];

  const request = Readable.from(requestBody);
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [String(name).toLowerCase(), value])
  );
  request.headers = {
    host,
    ...normalizedHeaders,
  };
  request.method = method;
  request.socket = {
    encrypted: false,
    remoteAddress,
  };
  request.url = url;

  const response = new MockResponse();
  await handler(request, response);

  return {
    body: response.body,
    headers: {
      get(name) {
        const value = response.headers.get(String(name).toLowerCase());
        if (Array.isArray(value)) return value.join(", ");
        return value ?? null;
      },
      getSetCookie() {
        const value = response.headers.get("set-cookie");
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
      },
    },
    json: async () => JSON.parse(response.body || "{}"),
    status: response.statusCode,
    text: async () => response.body,
  };
}
