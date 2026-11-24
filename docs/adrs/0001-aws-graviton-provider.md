# ADR 0001: Adopción de AWS (EC2 Graviton2 t4g.small) vía GitHub Student Developer Pack

## Estado
Aprobado

## Contexto
El diseño original del proyecto contemplaba el uso de Oracle Cloud Infrastructure (OCI) Always Free (Ampere A1 Flex: 4 OCPU, 24 GB RAM). No obstante, en las regiones de Sudamérica (São Paulo y Santiago) existe escasez recurrente de capacidad disponible (*Out of capacity*), y la opción alternativa de 1 GB de RAM (`E2.1.Micro`) no soporta la carga concurrente de FastAPI, React, Caddy, Prometheus, Grafana y cAdvisor sin provocar caídas por falta de memoria (OOM Killer).
Por otro lado, el equipo cuenta con una cuenta activa de AWS con créditos promocionales provistos por el GitHub Student Developer Pack (~$100 USD).

## Decisión
Se decide migrar la infraestructura de cómputo y red a **Amazon Web Services (AWS)** utilizando una instancia **EC2 `t4g.small` (ARM64 Graviton2, 2 vCPU, 2 GB RAM)** con sistema operativo Ubuntu 24.04 LTS:
1. **Dimensionamiento:** 2 GB de RAM son suficientes para albergar todo el stack de la aplicación, el motor de Machine Learning y la observabilidad con margen de holgura.
2. **Costo y Financiamiento:** El costo estimado de la instancia (`t4g.small`) más el disco EBS gp3 de 30 GB es de ~14.40 USD/mes, cubierto en su totalidad por los créditos de GitHub Student Pack durante el semestre académico.
3. **Arquitectura ARM64:** Mantiene la compatibilidad con los contenedores ligeros multi-arquitectura originalmente proyectados.
4. **Respaldos en S3:** Se utiliza Amazon S3 para respaldos diarios y almacenamiento de artefactos de Machine Learning, autenticados de forma transparente mediante un **IAM Instance Profile** adjunto a la EC2 (cero credenciales en texto plano en la máquina).

## Consecuencias
- **Positivas:** Despliegue inmediato sin riesgo de rechazo por falta de stock; integración nativa de IAM Roles para S3; monitoreo completo local garantizado sin OOM.
- **Negativas:** Se deben configurar alertas en AWS Budgets a los $25 y $50 USD para evitar consumos accidentales más allá del crédito disponible.
