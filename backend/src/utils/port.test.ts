import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { findAvailablePort } from "./port";

test("findAvailablePort skips occupied ports and returns a free one", async () => {
  const occupied = await new Promise<number>((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve(address.port);
      }
    });
  });

  const port = await findAvailablePort(occupied, 5);

  assert.ok(port > occupied);
  assert.ok(port <= occupied + 5);

  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, () => resolve());
  });

  await new Promise<void>((resolve, reject) => {
    probe.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});
