# Protocolo Operativo y Gobernanza para Agentes de IA

Proyecto: **Minimarket «El Buen Vecino»**  
Directiva: **Staff Software Engineer & Principal Systems Architect**  
Versión: **1.0 (Noviembre 2026)**

---

## 1. Principios Fundamentales del Repositorio

1. **Todo es Código y está Versionado:** Infraestructura (Terraform), Base de datos (migraciones SQL), Contenedores (Compose/Caddy), Modelos de ML (pipelines) y Dashboards (Grafana JSON) deben residir en este repositorio.
2. **Aislamiento Estricto de la Ruta Crítica:**
   - La venta en caja (`/api/v1/ventas`) **JAMÁS** debe depender del modelo de ML ni de llamadas a APIs externas. La venta se resuelve en Supabase vía transacción atómica PL/pgSQL ($p95 < 1\text{ s}$).
   - El motor de Machine Learning (LightGBM) corre de forma asíncrona en un job por lotes fuera de los horarios de atención pico.
3. **Mínimo Privilegio y Cero Secretos:**
   - Prohibido commitear llaves, tokens o contraseñas.
   - En la EC2 de AWS se utiliza **IAM Instance Profile** para interactuar con Amazon S3. No se almacenan claves `AWS_ACCESS_KEY_ID` permanentes en el servidor.
   - La clave `SUPABASE_SERVICE_ROLE_KEY` vive exclusivamente en el backend y jamás se expone al cliente frontend.

---

## 2. Puntos de Control Humano Obligatorios (Human-in-the-Loop)

El agente debe detenerse y solicitar confirmación explícita del usuario ante cualquiera de las siguientes acciones:
* Ejecución de `terraform apply` o cualquier comando que altere recursos en AWS.
* Creación, alteración o borrado de políticas IAM o reglas de Security Groups.
* Ejecución de migraciones destructivas (`DROP TABLE`, `ALTER COLUMN` con pérdida de datos) sobre la base de datos de producción.
* Manejo o configuración inicial de secretos en producción.
* Primer despliegue a producción y corte de versión (*go-live*).

---

## 3. Convenciones de Desarrollo y Código

### Backend (Python / FastAPI)
- **Modularidad Feature-First:** Cada funcionalidad reside en su propia carpeta en `app/modules/<nombre_modulo>` conteniendo su `router.py`, `schemas.py` y `service.py`.
- **Tipado Estricto:** Tipos obligatorios en firmas de funciones; validación exhaustiva con Pydantic v2. Cero uso de `Any` injustificado.
- **Manejo de Errores:** Excepciones HTTP estándar (`HTTPException`) con códigos semánticos y mensajes descriptivos estructurados en JSON.

### Machine Learning (LightGBM)
- Toda lógica de preparación de datos debe residir en `app/ml/feature_engineering.py`.
- El modelo serializado se guarda en `app/ml/artifacts/model_latest.joblib`.
- Validación obligatoria mediante métricas de error: **WAPE** y **MAE** contra el baseline antes de promover un nuevo modelo a producción.

### Frontend (React + Vite PWA)
- Componentes organizados por características en `src/features/<modulo>`.
- Estado global exclusivo con **Zustand** (tienda del carrito en `useCartStore.ts`).
- Tipado completo con TypeScript (`noImplicitAny: true`).

---

## 4. Estrategia de Ramas y Commits

- Ramas de trabajo:
  - `feature/<nombre-feature>` para nuevas capacidades.
  - `fix/<nombre-bug>` para correcciones de errores.
  - `infra/<cambio-cloud>` para IaC o Docker.
- Commits semánticos obligatorios:
  - `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `infra:`.
- Ningún cambio se fusiona a `main` si falla la suite de pruebas unitarias o si el escaneo de seguridad reporta vulnerabilidades críticas.
