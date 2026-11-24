# ADR 0003: Arquitectura de Persistencia y Seguridad con Supabase (PostgreSQL, RLS y Transacciones Atómicas)

## Estado
Aprobado

## Contexto
En un entorno de minimarket con 1 administrador y 2 cajeros concurrentes, la meta de negocio principal es registrar la venta en caja en menos de 1 segundo sin riesgo de inconsistencias de stock ni accesos indebidos a datos administrativos.
Un fallo común en arquitecturas web es ejecutar el descuento de stock desde el servidor de aplicaciones en múltiples llamadas HTTP desacopladas, lo que genera condiciones de carrera (*race conditions*) y permite que dos cajeros vendan la última unidad al mismo tiempo. Además, exponer claves con privilegios elevados en clientes frontend vulnera la integridad de los precios y auditorías.

## Decisión
Se decide utilizar **Supabase (PostgreSQL)** adoptando las siguientes garantías de seguridad y transaccionalidad:
1. **Transacción Atómica PL/pgSQL (`registrar_venta`):**
   Toda venta se procesa en una única función almacenada en la base de datos que:
   - Valida el stock actual con bloqueo de fila (`SELECT ... FOR UPDATE`).
   - Inserta la cabecera en `ventas` y las líneas en `detalle_ventas`.
   - Descuenta el inventario y genera el registro de auditoría en `movimientos_inventario`.
   - Ejecuta un `ROLLBACK` total automático si cualquier ítem no cuenta con stock disponible suficiente (`stock < cantidad_solicitada`).
2. **Row Level Security (RLS) Granular:**
   - Rol `cajero`: Solo lectura del catálogo de productos y ejecución de la función `registrar_venta`. Bloqueo absoluto para editar precios, ver márgenes de ganancia o anular ventas pasadas.
   - Rol `administrador`: Acceso completo a inventario, compras, anulación de tickets y visualización de predicciones.
3. **Manejo de Credenciales:**
   - El frontend únicamente utiliza la clave pública `anon` junto con el token JWT de la sesión del usuario.
   - La clave `service_role` permanece aislada en el backend para tareas operativas de sincronización y métricas.

## Consecuencias
- **Positivas:** Consistencia transaccional garantizada por el motor ACID de PostgreSQL; latencia $p95 < 1\text{ s}$ en caja; aislamiento de privilegios a nivel de motor de base de datos.
- **Negativas:** La lógica central de facturación y validación de inventario reside en código SQL/PLpgSQL, lo que requiere versionar las migraciones con disciplina en el repositorio (`db/migrations/`).
