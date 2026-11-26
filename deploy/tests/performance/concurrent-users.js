import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const users = Number(__ENV.LAB09_VUS);
if (![1, 3, 5, 10].includes(users)) throw new Error('Use 1, 3, 5 o 10 VU');
const base = 'http://caddy';
const api = '/api/v1';
const stock = 1000;
const requests = new Counter('lab_requests');
const clients = new Counter('lab_4xx');
const servers = new Counter('lab_5xx');
const unexpected = new Rate('lab_unexpected');
const serverRate = new Rate('lab_5xx_rate');
const latencies = new Trend('lab_latency_ms', true);
const sales = new Trend('lab_sales_ms', true);
const salesOk = new Counter('lab_sales_ok');
const id = __ENV.LAB09_CASE;
if (!/^[a-z0-9]{12}$/.test(id || '')) throw new Error('Identificador de fixture inválido');

export const options = {
  scenarios: { cajas: { executor: 'constant-vus', vus: users, duration: '20s', gracefulStop: '5s' } },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'count'],
  thresholds: {
    lab_unexpected: [{ threshold: 'rate<0.02', abortOnFail: true, delayAbortEval: '5s' }],
    lab_5xx_rate: ['rate<0.02'],
    lab_sales_ms: ['p(95)<1000'],
    lab_sales_ok: ['count>0'],
    checks: ['rate==1'],
  },
};

function request(method, route, data, token, expected, timed = false, name = route) {
  const headers = { Host: 'localhost', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = http.request(method, base + route, data === null ? null : JSON.stringify(data),
    { headers, redirects: 0, timeout: '3s', tags: { name } });
  if (timed) {
    const badServer = response.status >= 500 && response.status < 600;
    requests.add(1);
    clients.add(Number(response.status >= 400 && response.status < 500));
    servers.add(Number(badServer));
    unexpected.add(response.status !== expected);
    serverRate.add(badServer);
    latencies.add(response.timings.duration);
    if (route === api + '/ventas' && response.status === 201) sales.add(response.timings.duration);
  }
  if (!check(response, { [method + ' ' + name + ' estado esperado']: (value) => value.status === expected })) {
    if (!timed) fail('Precondición o comprobación del fixture fallida: ' + method + ' ' + name + ' ' + response.status);
    return null;
  }
  return response.json();
}

export function setup() {
  const identity = request('GET', '/health', null, null, 200);
  if (identity.environment !== 'development') fail('Solo se permite el entorno de prueba');
  const admin = request('POST', api + '/auth/login',
    { email: __ENV.LAB09_ADMIN, password: __ENV.LAB09_PASSWORD }, null, 200).access_token;
  const category = request('GET', api + '/productos/categorias', null, admin, 200)[0].id;
  const fixtures = [];
  for (let i = 0; i < users; i++) {
    const login = { email: 'caja-' + id + '-' + i + '@test.invalid', password: 'fixture-' + id + '-' + i };
    request('POST', api + '/auth/register', { ...login, nombre: 'Caja fixture ' + i }, null, 201);
    const user = request('POST', api + '/auth/login', login, null, 200);
    if (user.rol !== 'cajero') fail('Rol de caja inesperado');
    const product = request('POST', api + '/productos', {
      codigo_barras: 'lab09-' + id + '-' + i, nombre: 'Producto fixture ' + i, categoria_id: category,
      precio_costo: 2, precio_venta: 3, stock_actual: stock,
    }, admin, 201);
    fixtures.push({ product: product.id, token: user.access_token });
  }
  return { admin, fixtures };
}

export default function ({ fixtures }) {
  const fixture = fixtures[exec.vu.idInTest - 1];
  request('GET', api + '/inventario', null, fixture.token, 200, true);
  const result = request('POST', api + '/ventas', {
    metodo_pago: 'efectivo', monto_pagado: 5, items: [{ producto_id: fixture.product, cantidad: 1 }],
  }, fixture.token, 201, true);
  if (result && check(result, { 'importe y vuelto correctos': (r) => Number(r.total) === 3 && Number(r.vuelto) === 2 })) {
    salesOk.add(1);
  }
  sleep(1);
}

export function teardown({ admin, fixtures }) {
  let sold = 0;
  for (const { product } of fixtures) {
    const current = request('GET', api + '/productos/' + product, null, admin, 200, false, 'producto por ID');
    const movements = request('GET', api + '/inventario/kardex?producto_id=' + product + '&limit=100',
      null, admin, 200, false, 'kardex por SKU');
    const units = movements.filter((m) => m.tipo === 'venta').reduce((total, m) => total - m.cantidad, 0);
    if (!check(current, { 'stock inicial menos kardex coincide': (value) => value.stock_actual === stock - units })) {
      fail('Descuadre de stock');
    }
    sold += units;
  }
  if (!check(sold, { 'suficientes ventas en el conjunto de SKUs': (n) => n >= users })) fail('Muestra insuficiente');
  console.log('LAB09_KARDEX_UNITS=' + sold);
}

export function handleSummary(data) {
  const recognized = ['lab_requests', 'lab_4xx', 'lab_5xx', 'lab_unexpected', 'lab_5xx_rate', 'lab_latency_ms',
    'lab_sales_ms', 'lab_sales_ok', 'http_reqs', 'checks', 'iterations'];
  const metrics = Object.fromEntries(Object.entries(data.metrics || {}).filter(([key]) => recognized.includes(key)));
  return { stdout: JSON.stringify({ users, metrics, duration_ms: data.state?.testRunDurationMs }) + '\n' };
}
