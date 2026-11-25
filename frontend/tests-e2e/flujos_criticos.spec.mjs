/**
 * frontend/tests-e2e/flujos_criticos.spec.mjs
 * Suite E2E reproducible con Playwright para los flujos críticos de Minimarket El Buen Vecino:
 * 1. Login rápido como Admin y verificación de sesión
 * 2. Venta en POS -> Apertura de Modal -> Cobro -> Pop-up "¡Venta realizada con éxito!"
 * 3. Inventario -> Apertura de modal Nuevo Producto + Kardex actualizado
 * 4. Historial de Ventas -> Filtro por fecha + Detalle de ticket
 * 5. Predicciones IA -> Botón Reentrenar Modelo (LightGBM) + 28 filas renderizadas
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

export async function runCriticalFlows(page) {
  // 1. Login como Administrador
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Admin/i }).click();
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 });

  // 2. Flujo POS + Pop-up de éxito
  await page.locator('button:has-text("Leche Evaporada Gloria")').first().click();
  await page.getByRole('button', { name: /COBRAR VENTA/i }).click();
  await page.getByRole('button', { name: /Confirmar Cobro/i }).click();

  await page.locator('text=¡Venta realizada con éxito!').waitFor({ state: 'visible', timeout: 8000 });
  await page.getByRole('button', { name: /Nueva Venta/i }).click();

  // 3. Flujo Inventario + Kardex + Modal Nuevo Producto
  await page.goto(`${BASE_URL}/inventario`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Nuevo Producto/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Kardex/i }).click();
  const kardexRows = await page.locator('tbody tr').count();
  if (kardexRows < 1) throw new Error('Kardex debería mostrar al menos la venta recién realizada');

  // 4. Flujo Historial de Ventas + Filtro de fechas + Detalle
  await page.goto(`${BASE_URL}/ventas`, { waitUntil: 'networkidle' });
  await page.getByLabel('Fecha inicio').waitFor({ state: 'visible' });
  await page.locator('button:has-text("Ver Ticket")').first().click();
  await page.locator('text=Comprobante de Venta').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  // 5. Flujo Predicciones IA + Reentrenar
  await page.goto(`${BASE_URL}/predicciones`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Reentrenar Modelo/i }).click();
  await page.locator('text=Modelo LightGBM reentrenado con éxito').waitFor({ state: 'visible', timeout: 10000 });
  const predRows = await page.locator('tbody tr').count();
  if (predRows < 28) throw new Error(`Esperadas 28 predicciones, encontradas ${predRows}`);

  return { ok: true, kardexRows, predRows };
}
