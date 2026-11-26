import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const origin = "http://localhost:8080";
process.env.E2E_BASE_URL = origin;
const { runCriticalFlows } = await import("./flujos_criticos.spec.mjs");

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost"],
});

async function isolatedContext(serviceWorkers) {
  const context = await browser.newContext({ serviceWorkers });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  return context;
}

try {
  const context = await isolatedContext("block");
  const page = await context.newPage();
  const result = await runCriticalFlows(page);
  assert.equal(result.ok, true);
  await page.getByTitle("Cerrar sesión").click();
  await page.waitForURL(`${origin}/login`);
  assert.equal(await page.evaluate(() => localStorage.getItem("buenvecino_token")), null);
  console.log(`PASS E2E fixture: venta, Kardex (${result.kardexRows}), ticket, predicción sintética (${result.predRows}) y logout`);
  await context.close();

  const pwa = await isolatedContext("allow");
  const anonymous = await pwa.newPage();
  await anonymous.goto(`${origin}/login`);
  await anonymous.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js"));
  const routeStatus = await anonymous.evaluate(async () => {
    const responses = await Promise.all(["/api/v1/productos", "/metrics", "/uploads/fixture"].map((url) => fetch(url)));
    return responses.map((response) => response.status);
  });
  assert.deepEqual(routeStatus, [401, 404, 404]);
  await pwa.setOffline(true);
  const cachedPrivate = await anonymous.evaluate(async () =>
    fetch("/api/v1/productos").then(() => true, () => false),
  );
  assert.equal(cachedPrivate, false);
  console.log("PASS PWA: service worker activo, endpoints privados protegidos y API ausente offline");
  await pwa.close();
} finally {
  await browser.close();
}
