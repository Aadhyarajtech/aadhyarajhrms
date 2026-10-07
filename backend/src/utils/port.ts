import net from "node:net";

export async function isPortFree(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(
  startPort: number,
  maxAttempts = 20,
): Promise<number> {
  const safeStartPort = Number.isInteger(startPort) ? startPort : 4000;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = safeStartPort + offset;

    if (candidate > 65535) {
      continue;
    }

    if (await isPortFree(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No free port available between ${safeStartPort} and ${safeStartPort + maxAttempts - 1}`,
  );
}
