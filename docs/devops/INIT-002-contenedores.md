# INIT-002 — Contenedorización y entorno local

## Alcance y línea base

Implementación sobre `genni@8a049c4`. El árbol ya contenía `docs/devops/arquitectura-to-be-y-plan-devops.md` como documento sin seguimiento. Se consultaron ese diseño, `AGENTS.md`, la guía de la app, el plan original y los ADR. La auditoría Markdown sigue fuera del checkout disponible. El laboratorio usa datos de memoria y no requiere acceso a Supabase ni a S3.

## Archivos de este bloque

```text
.
├── .env.example                         modificado
├── .gitattributes                        nuevo
├── .gitignore                            modificado
├── backend/
│   ├── .dockerignore                     nuevo
│   ├── Dockerfile                        modificado
│   ├── docker-entrypoint.sh              nuevo
│   ├── requirements.txt                  modificado
│   └── requirements-dev.txt              nuevo
├── frontend/
│   ├── .dockerignore                     nuevo
│   └── Dockerfile                        modificado
├── deploy/
│   ├── Caddyfile                         modificado
│   ├── docker-compose.yml                modificado
│   └── docker-compose.dev.yml            nuevo
├── monitoring/prometheus/prometheus.yml modificado
└── docs/devops/INIT-002-contenedores.md   nuevo
```

El backend usa un venv en `/opt/venv` que se copia entre etapas. El compilador y las cabeceras de PostgreSQL quedan en el builder. El runtime conserva `libgomp1` y `libpq5`, usa UID/GID `10001` y ejecuta un worker Uvicorn. El worker único simplifica el uso de RAM y la lectura de métricas del proceso. Las ventas de laboratorio en memoria siguen perdiéndose si se reinicia el backend. El target `test` instala pytest por separado y mantiene la escritura de los fixtures en el contenedor desechable. El Dockerfile del frontend sigue usando `npm ci`, Vite y la configuración Nginx en su etapa final. Ambos contextos excluyen archivos de entorno, material de credenciales, cachés, dumps, uploads y artefactos locales.

## Operación local

Ejecutar desde la raíz con Docker Desktop o Docker Engine y Compose v2. Crear un archivo **exclusivo de laboratorio**, usando claves generadas en la máquina. Si ya existe `.env.lab`, conservarlo y verificar que sea de laboratorio. Evitar los puertos 8080 y 3000 si ya están en uso.

```powershell
if (Test-Path -LiteralPath .env.lab) { throw 'Ya existe .env.lab' }
@(
  'ENVIRONMENT=development'
  ('SECRET_KEY=' + [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
  ('GRAFANA_ADMIN_PASSWORD=lab-' + [guid]::NewGuid().ToString('N'))
  'GRAFANA_ADMIN_USER=admin'
  'DATABASE_URL='
  'SITE_ADDRESS=http://'
) | Set-Content -LiteralPath .env.lab -Encoding ascii

netstat -ano -p TCP | Select-String ':(8080|3000)\s'
$BaseArgs = @('--env-file', '.env.lab', '-p', 'buenvecino-lab', '-f', 'deploy/docker-compose.yml')
$LabArgs = $BaseArgs + @('-f', 'deploy/docker-compose.dev.yml')
docker compose @BaseArgs config --quiet
docker compose @LabArgs config --quiet
docker compose @LabArgs build
docker compose @LabArgs up -d --wait --wait-timeout 120
docker compose @LabArgs ps
docker compose @LabArgs logs --tail 30 caddy frontend backend
curl.exe --fail --silent http://localhost:8080/health
curl.exe --fail --silent http://localhost:3000/api/health
docker compose @LabArgs exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose @LabArgs exec -T prometheus wget -qO- http://127.0.0.1:9090/api/v1/targets
docker compose @LabArgs stop
```

Tests existentes en imagen temporal, con red deshabilitada, sin mounts de la estación de trabajo y con `DATABASE_URL` vacía. La imagen de pruebas es independiente de la imagen que sirve la API. La suite puede escribir archivos y entrenar con datos sintéticos de fixture.

```powershell
docker build --target test -t minimarket-backend:init002-tests ./backend
docker run --rm --network none minimarket-backend:init002-tests
```

Para repetir el E2E del checkout con el stack en ejecución, usar un perfil temporal de Chrome y limitar las solicitudes a Caddy. El test registra una venta y entrena con fixtures sintéticos del laboratorio.

```powershell
$RunnerDir = Join-Path $env:TEMP ('minimarket-e2e-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $RunnerDir | Out-Null
npm.cmd install --prefix $RunnerDir --no-save --no-package-lock --ignore-scripts playwright-core
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el runner E2E' }
$SpecPath = (Resolve-Path 'frontend/tests-e2e/flujos_criticos.spec.mjs').Path
$RunnerPath = Join-Path $RunnerDir 'run.mjs'
@'
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
process.env.E2E_BASE_URL = 'http://localhost:8080';
const { runCriticalFlows } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === process.env.E2E_BASE_URL
    ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  console.log(JSON.stringify(await runCriticalFlows(page)));
} finally {
  await browser.close();
}
'@ | Set-Content -LiteralPath $RunnerPath -Encoding ascii
node $RunnerPath $SpecPath 'C:/Program Files/Google/Chrome/Application/chrome.exe'
```

La base Compose es el modelo de servicios y volúmenes. El override contiene los builds y las publicaciones locales. `--env-file` selecciona el archivo de interpolación y `environment` declara qué variables recibe cada servicio. El override fija `DATABASE_URL` vacía y deshabilita IMDS y archivos AWS compartidos para el backend. Los fixtures de uploads se escriben en la capa efímera del contenedor y `/uploads` queda fuera de la entrada Caddy. `BACKEND_IMAGE` y `FRONTEND_IMAGE` pueden cambiar a otras referencias para pruebas. `ML_MODEL_PATH` y `ML_METADATA_PATH` deben conservar su directorio persistente. `AWS_S3_BACKUP_BUCKET` se conserva por el contrato del módulo S3 actual, con valor ficticio en el override. No hay consumidor aprobado para `AWS_S3_OBJECTS_BUCKET` ni `APP_DB_MODE`. Los parámetros OpenRouter se retiraron del ejemplo tras verificar que solo eran declaraciones de configuración.

## Validaciones y versiones observadas

Proyecto aislado `buenvecino-init002` con archivo temporal y `genni@8a049c4` como base. Ensayo del 25 de noviembre de 2026, hora de Lima. Windows x64, Docker Desktop 4.48.0, Engine 28.5.1 Linux/amd64, Compose 2.40.2 y Buildx 0.29.1.

| Validación | Resultado | Evidencia |
|---|---|---|
| Compose base y override | PASS | `config --quiet` en ambas variantes y resumen filtrado de puertos. La base no tiene publicaciones. El override agrega solo `127.0.0.1:8080 → 80` y `127.0.0.1:3000 → 3000`. |
| Build frontend | PASS | `npm ci`, `npm run build` con Vite 6.4.6, React 18.3.1, TypeScript 5.7.3 y generación de `sw.js`. Nginx 1.31.10 pasó `nginx -t`. |
| Build backend e importaciones | PASS | Python 3.12.16, FastAPI 0.165.0, Uvicorn 0.54.0, LightGBM 4.7.0, psycopg2 2.9.13 y `python-multipart` 0.0.34. Runtime con `libgomp1` 14.2.0-19 y `libpq5` 17.12-0+deb13u1. `pip check` sin requisitos rotos. PID 1 con `--workers 1`, UID/GID 10001. |
| Rutas y salud | PASS | `/`, `/inventario` y `/health` por Caddy dieron 200. `/api/v1/productos` sin token dio 401. `/metrics` y `/uploads/comprobantes/fixture.json` dieron 404. `caddy validate` pasó con Caddy 2.11.9. |
| DNS y red | PASS | Backend resolvió los otros seis servicios. Redes automáticas observadas `red-web` en `172.21.0.0/16` y `red-monitoreo` en `172.20.0.0/16`. Son asignaciones observadas y pueden cambiar. |
| Observabilidad básica | PASS | Grafana `/api/health` dio 200. `promtool` validó el YAML y `up` devolvió 1 para los tres targets. Se observaron 7 series de memoria por contenedor del proyecto, series `node_cpu_seconds_total` y una serie `http_requests_total` de la ruta de productos. |
| Persistencia | PASS | Tras `up --force-recreate`, los siete IDs cambiaron y se recuperaron los cinco marcadores desde los mounts de ML, Prometheus, Grafana y Caddy. El backend escribió su marcador con UID 10001. Se retiraron los marcadores después de verificar. |
| `.dockerignore` | PASS | En contextos de prueba con `FROM scratch` y `COPY . /` se excluyeron los señuelos `.env*`, claves, `.aws/credentials`, `.docker/config.json`, `.git`, dumps, `node_modules`, uploads y `joblib`. Se conservó el archivo de control. |
| Imágenes y preflight | PASS | El historial de capas y `.Config.Env` carecían de las variables sensibles verificadas. La inspección del filesystem de aplicación no encontró archivos `.env*`, llaves, artefactos ni tests en el runtime backend. El arranque con `ENVIRONMENT=production` y DSN ficticia devolvió `78`. Las credenciales demo y la clave JWT predeterminada del código requieren el cierre de INIT-001. |
| Pytest aislado | PASS | `docker run --rm --network none minimarket-backend:init002-tests` obtuvo **19 aprobadas**. Se instalaron pytest 8.4.2, pytest-asyncio 0.26.0 y HTTPX 0.28.1 en el target de test. Starlette emitió una advertencia de deprecación de HTTPX para `TestClient`. |
| E2E existente | PASS | Runner temporal `playwright-core` con Chrome headless, peticiones limitadas a `http://localhost:8080`. `flujos_criticos.spec.mjs` devolvió `ok: true`, `kardexRows: 1`, `predRows: 28`. Predicciones generadas con datos sintéticos de laboratorio. |
| SQL existente | PASS | En PostgreSQL 18.0 desechable con `--network none` y datos en `tmpfs`, se aplicaron las tres migraciones existentes y `psql -X -v ON_ERROR_STOP=1` procesó `db/tests/rls_tests.sql`. Se creó un stub de `auth.uid()` y un rol `authenticated` en el fixture. El test solo comprueba que RLS está activado. |
| Manifiestos OCI | PASS | `docker buildx imagetools inspect --raw` confirmó `linux/amd64` y `linux/arm64` para Python, Node, Nginx, Caddy, Prometheus, Grafana y ambos exporters usados. |
| ARM64 nativo y producción | NOT RUN | Cloud debe decidir la arquitectura y validar las ruedas, OpenMP, consumo, conectividad y recuperación en Linux nativo. |
| Readiness y persistencia PostgreSQL productiva | BLOCKED | Falta autorización de Desarrollo para cambios de configuración, autenticación, persistencia y permisos que los habilitan. |

El runtime declara versiones exactas en `backend/requirements.txt` para dependencias directas y transitivas. Los Dockerfiles fijan los índices OCI de Python, Node y Nginx por digest. Los paquetes nativos se siguen resolviendo desde Debian al construir y las dependencias de test se resuelven dentro del target temporal.

La versión anterior de cAdvisor (`v0.49.1`) respondía al scrape, pero fallaba al registrar capas `overlayfs` con el snapshotter de containerd. Se actualizó a `gcr.io/cadvisor/cadvisor:v0.54.1` y se comprobó la presencia de series por servicio. No se cambió el motor ni el backend de almacenamiento de Docker Desktop. [Corrección upstream de containerd-snapshotter](https://github.com/google/cadvisor/pull/3709)

Se retiraron los topes de memoria heredados del Compose. El ensayo local tras el E2E observó 152,2 MiB en backend, 91,91 MiB en cAdvisor y 80,61 MiB en Prometheus con `docker stats --no-stream`, sin carga sostenida. El resultado es una muestra de la VM Docker Desktop y no permite fijar límites ni capacidad de EC2. Medir concurrencia, batch, backup y picos en la plataforma candidata antes del dimensionamiento.

Tras la verificación final, `docker compose stop` detuvo los siete servicios de `buenvecino-init002`. `docker volume ls` confirmó los cinco volúmenes del proyecto. El volumen ML del ensayo contiene únicamente artefactos de fixtures sintéticos.

## Handoff a INIT-003 e INIT-004

| Componente | Contrato de laboratorio |
|---|---|
| Proxy y SPA | `http://localhost:8080` por `127.0.0.1:8080 → caddy:80`. `deploy/Caddyfile` enruta `/api/*` sin cambiar el prefijo y `/health` al backend. Deniega `/metrics` y `/uploads` por la entrada. `frontend/Dockerfile` todavía genera `/etc/nginx/conf.d/default.conf` con fallback React y el proxy API heredado. INIT-003 debe extraer la configuración Nginx, revisar OpenAPI, CSP/cache/PWA, y definir rutas separadas de catálogo y comprobantes antes de habilitar HTTPS. |
| `red-web` | `caddy`, `frontend:80`, `backend:8000`. DNS de servicio y CIDR asignado por Docker. |
| `red-monitoreo` | `backend:8000`, `prometheus:9090`, `grafana:3000`, `node-exporter:9100`, `cadvisor:8080`. Grafana es el único publicado, por `127.0.0.1:3000`. |
| Persistencia | Volúmenes por proyecto `ml_artifacts` en `/app/app/ml/artifacts`, `prometheus_data`, `grafana_data`, `caddy_data` y `caddy_config`. Los volúmenes de un proyecto anterior no se adoptan automáticamente. |
| Prometheus y Grafana | `monitoring/prometheus/prometheus.yml` conserva scrape/evaluación a 15 s. Targets `backend:8000/metrics`, `node-exporter:9100` y `cadvisor:8080`. Retención 7 días. Grafana básico con API de salud, sign-up deshabilitado y clave requerida. Provisioning, datasource, dashboards y alertas son tareas de INIT-004. |
| Métricas | El backend expone métricas de proceso y las familias HTTP, ventas y ML existentes a medida que se generan observaciones. El gauge `backup_last_success_timestamp` conserva la semántica incorrecta del código actual y no acredita respaldos. Los exporters de Docker Desktop informan sobre su VM Linux y contenedores; se debe confirmar namespaces, interfaces, cgroups y filesystem real en EC2. |

INIT-003 deberá repetir las pruebas de rutas bloqueadas y probar HTTPS con DNS autorizado. INIT-004 debe validar labels de rutas, datos ausentes, alertas y cobertura cAdvisor. Los mounts de host de cAdvisor requieren una revisión de privilegios en Linux. Un mount del socket Docker en modo solo lectura no limita los métodos de su API. [Publicación de puertos Docker](https://docs.docker.com/engine/network/port-publishing/), [despliegue cAdvisor](https://github.com/google/cadvisor/blob/v0.54.1/docs/running.md)

## Bloqueos productivos y handoff a Desarrollo

El `docker-entrypoint.sh` de la imagen ejecuta únicamente con `ENVIRONMENT=development|test`. En cualquier otro entorno devuelve `78`. La base no publica puertos. La salida `healthy` de Docker corresponde a liveness; el estado `unhealthy` no dispara por sí solo un reinicio.

| Pendiente | Archivos y aceptación futura |
|---|---|
| JWT y contraseñas | `backend/app/core/{config,security}.py`, `backend/app/modules/auth/`, `frontend/src/features/auth/LoginPage.tsx`. Quitar clave JWT predeterminada y cuentas demo de producción; exigir clave aleatoria fuerte, persistir hashes, deshabilitar registro público y verificar credenciales después del reinicio. El código actual de demostración sigue presente en la imagen y en el frontend. |
| Persistencia y readiness | `backend/app/core/database.py`, `backend/app/main.py` y servicios de dominio. Añadir modo memoria explícito; PostgreSQL no disponible implica `503` en venta y readiness, con recuperación sin reiniciar. Probar bajo una DB desechable autorizada. `/ready` queda pendiente. |
| Autorización y base de datos | `backend/app/modules/{ventas,productos,predicciones}/` y `db/migrations/`. Aprobar roles y accesos de cada usuario, políticas RLS y grants del rol PostgreSQL real. Acordar contratos de comprobantes y pruebas de atomicidad. |
| S3 y backups | `backend/app/core/{s3,metrics}.py`, `deploy/scripts/backup.sh`. Separar métrica backup de las subidas y validar éxito con restore aislado antes de habilitarlo. |

Desarrollo debe aprobar los cambios de autenticación, permisos, migraciones y transacción. Cloud debe aprobar arquitectura y capacidad definitivas y validar plataforma nativa, consumo y latencia antes de cualquier candidato productivo.

## Evidencia para el informe universitario

| Capítulo | Evidencia de este bloque |
|---|---|
| 6. Diseño General de la Infraestructura Cloud | Base Compose, separación de producción y laboratorio. |
| 7. Redes Virtuales, §7.3 | Membresía por red, resolución DNS y binds loopback. |
| 8. Procesamiento, §§8.3–8.4 | Builds, venv, UID/GID y arranque de Compose. |
| 9. Almacenamiento | Volúmenes con rutas e identificación por proyecto. |
| 10. Seguridad, §10.2 | Puertos, exclusión de archivos, usuario sin privilegios y bloqueo productivo. |
| 11. Monitoreo, §11.3 | Targets y salud de Prometheus/Grafana en el entorno evaluado. |
| 12. Arquitectura Empresarial y Continuidad, §12.7 | Matriz de resultados, detención conservando volúmenes y handoff. |
| 13. Costo-Beneficio | Capacidad y costos pendientes de medición/confirmación en EC2. |

## Estado Git

`git status --short --branch` muestra `genni` con modificaciones de empaquetado, Compose, monitoreo y documentación. `git diff --stat` cubre los archivos ya seguidos. El árbol de este documento enumera los siete archivos nuevos del bloque. No se cambió de rama ni se prepararon commits.

Propuesta de commits para revisión del equipo.

- `fix: incorporar multipart y fijar dependencias del backend`
- `infra: aislar el laboratorio y validar Docker Compose`
- `docs: registrar pruebas y handoff de INIT-002`
