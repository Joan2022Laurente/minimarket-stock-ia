# Evidencia local de INIT-008

- Fecha de ejecución 2026-11-26. Rama `genni`, HEAD `6c14322`, comparación con `origin/genni` en el checkout `0 0`. Se usó el working tree con los cambios de INIT-007 e INIT-008. Los digests del laboratorio identifican fixtures construidos en esta ejecución.
- Docker Engine `28.5.1 linux/amd64` y Compose `2.40.2-desktop.1`. El registro se ejecutó en el loopback del Engine. Una prueba inicial mediante el puerto publicado en Windows encontró `connection refused` desde el Engine; se corrigió el acceso en el harness. Un primer arranque del fixture detectó un error de sintaxis en su cadena de métricas. Se corrigió el literal y se reanudó el mismo laboratorio conservando los volúmenes.
- El ciclo usa `buenvecino-init008` y no dispone de DSN. En un candidato fallido, `FAIL` en el log identifica la condición inyectada. El resultado de la prueba es `PASS` cuando la versión anterior recupera sus comprobaciones y el estado permanece coherente.

| Validación | Resultado | Evidencia |
|---|---|---|
| Workflow, Bash y ShellCheck | PASS | Validación estática de Actions y scripts. |
| Contratos del release y preflight | PASS | 31 pruebas `unittest` de INIT-007 e INIT-008, incluidos manifiesto alterado, digest incorrecto, run ajeno, escaneo incongruente, bloqueo por esquema y aprobación JSON falsa. El fallo de recuperación y salida 5 se probaron mediante dobles de prueba. |
| Backend | PASS | Imagen de pruebas construida. `20 passed, 1 warning in 0.78s` sin red. |
| Frontend | PASS | Se repitió el builder sin caché. `npm ci` instaló 427 paquetes e informó tres vulnerabilidades moderadas. TypeScript y Vite compilaron y generaron la PWA. `nginx -t` validó la configuración y se verificaron `index.html`, `sw.js` y el manifest. |
| Caddy y observabilidad estática | PASS | Caddy local y HTTPS estático, preflight inválido exit 78, configuración efectiva Prometheus y pruebas de expresiones `SUCCESS`. Tres dashboards, 54 consultas y siete reglas, ALT-06 pausada. |
| Compose base y override | PASS | `docker compose config --quiet` pasó en ambos casos con el env de fixture. El ciclo verificó que solo Caddy y Grafana publicaban puertos en loopback. |
| PostgreSQL y continuidad | PASS | PostgreSQL desechable y almacenamiento simulado. Dump de 44 580 bytes, conteos iguales en ocho tablas, función de venta, secuencia y controles SQL. `pg_restore` 176 ms en ese fixture. RLS habilitado y políticas presentes. |
| Bloqueos obligatorios | PASS | Backend real exit 78 sin red. Los wrappers rechazaron EC2 y producción con exit 3. |
| GHCR, workflow remoto y sus protecciones | BLOCKED | Requiere que el workflow llegue a `main` por el flujo autorizado, candidato publicado y acceso de lectura a las políticas y a ambos paquetes. |
| EC2, readiness PostgreSQL y escaneo de release | NOT RUN | El laboratorio valida readiness controlada. La promoción requiere un candidato real, la infraestructura autorizada y el escaneo de sus dos digests. |

## Ciclo de release

| Operación | Estado observado | Duración total |
|---|---|---:|
| Activación de A | PASS. A confirmada, sin anterior. | 37,734 s |
| Actualización a B | PASS. B confirmada, A recuperable, marcador visible por Caddy. | 39,841 s |
| B aplicado de nuevo | PASS. Comprobaciones superadas, punteros iguales. | 4,599 s |
| Readiness devuelve 503 | PASS. Candidato rechazado con salida 4; B recuperada y verificada. | 75,637 s |
| Healthcheck fallido | PASS. Compose rechazó el candidato; B recuperada y verificada. | 74,076 s |
| Timeout de readiness | PASS. El sondeo no obtuvo respuesta; B recuperada y verificada. | 80,966 s |
| Interrupción tras ejecutar Compose | PASS. El diario conservó B y bloqueó el rollback ordinario; `--recover` confirmó B. | 38,494 s de recuperación |
| Rollback explícito B → A | PASS. A confirmada, B recuperable. | 43,320 s |

También se verificaron dry-run sin crear estado, exclusión mutua, rechazo de rollback sin versión anterior, imagen ausente, referencia mutable, arquitectura incorrecta, esquema incompatible y modificación del snapshot. Las duraciones de la tabla corresponden a la operación completa. La medición de indisponibilidad desde un cliente quedó **NOT RUN**. Los [eventos originales](eventos-release.jsonl) registran las transiciones.

Prometheus confirmó tres targets en cada validación funcional. Una consulta observó los siete servicios por cAdvisor y la API de Grafana devolvió los tres dashboards y las siete reglas. Se comprobó que el marcador escrito en el volumen ML tenía el mismo contenido después del rollback y que la fecha de creación de los cinco volúmenes no cambió.

El estado final fue `current=release-a`, `previous=release-b` y `pending=null`. Docker conservó los cinco volúmenes, registró los siete contenedores como detenidos y retiró el registro temporal. Los bindings inspeccionados fueron `127.0.0.1:8080 → Caddy:80` y `127.0.0.1:3000 → Grafana:3000`. Los otros cinco servicios carecían de bindings.

| Fixture | Digest backend | Digest frontend |
|---|---|---|
| A | `sha256:cc92fd36a10ac6bb3b57ed11bea92b1005aa90be515f18771afae770b8e9f4cf` | `sha256:ba25b60c5a3a269276e2a6c56e1ad21478555a21f4f8c5d3de9138808b397bbe` |
| B | `sha256:f0e4e50e3c0449bad2afb5d768164a111461c57593413cacb691727b31b149a6` | `sha256:9b4a19af798a70f0e1b90aaf4fa305d6a8f344ae1ce38626148f7a661416ecea` |
