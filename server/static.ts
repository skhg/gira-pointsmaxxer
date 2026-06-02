import path from "node:path";
import { readFile } from "node:fs/promises";

import { contentTypes, securityHeaders } from "./config.js";
import { writeJson } from "./http.js";

function isPathInside(rootDirectory: string, candidatePath: string) {
  return candidatePath === rootDirectory || candidatePath.startsWith(`${rootDirectory}${path.sep}`);
}

export function createStaticAssetServer(options: {
  sourceDirectory: string;
  staticDirectories: string[];
}) {
  const {
    sourceDirectory,
    staticDirectories,
  } = options;

  return async function serveStatic(request, response) {
    const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;

    const readStaticFile = async (relativePath: string) => {
      for (const staticDir of staticDirectories) {
        const safePath =
          relativePath === "/"
            ? path.join(staticDir, "index.html")
            : path.resolve(staticDir, `.${relativePath}`);

        if (!isPathInside(staticDir, safePath)) {
          continue;
        }

        try {
          const file = await readFile(safePath);
          return {
            file,
            safePath,
          };
        } catch {
          // try the next static root
        }
      }

      if (relativePath.startsWith("/src/")) {
        const safePath = path.resolve(sourceDirectory, `.${relativePath.slice("/src".length)}`);

        if (isPathInside(sourceDirectory, safePath)) {
          try {
            const file = await readFile(safePath);
            return {
              file,
              safePath,
            };
          } catch {
            // fall through to the 404 below
          }
        }
      }

      return null;
    };

    const asset = await readStaticFile(requestPath);

    if (asset) {
      const ext = path.extname(asset.safePath);
      const cacheControl =
        ext === ".html" || ext === ".js" || ext === ".css" ? "no-store" : "public, max-age=3600";

      response.writeHead(200, {
        "Cache-Control": cacheControl,
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        ...securityHeaders,
      });
      response.end(asset.file);
      return;
    }

    if (requestPath !== "/" && !path.extname(requestPath)) {
      const spaEntry = await readStaticFile("/");
      if (spaEntry) {
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
          ...securityHeaders,
        });
        response.end(spaEntry.file);
        return;
      }
    }

    writeJson(response, 404, {
      error: "Not found.",
    });
  };
}
