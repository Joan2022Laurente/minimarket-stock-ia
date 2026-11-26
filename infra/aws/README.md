# Contrato AWS para El Buen Vecino

Cloud debe entregar los datos del laboratorio antes de abrir acceso. [Plantilla JSON](infrastructure-contract.example.json) contiene `null` para los datos pendientes. Guardar la copia aprobada en el canal restringido del equipo. Una copia local del mismo esquema puede llamarse `infrastructure-contract.local.json` y está excluida de Git. Guardar PEM, DSN, tokens, credenciales y archivos libpq por separado.

| Grupo | Fuente que debe contrastar Cloud | Criterio |
|---|---|---|
| AWS | Región, línea presupuestaria y alertas de AWS Budgets | Monto mensual, moneda, umbrales y destinatario autorizado fuera del JSON. |
| EC2 y EBS | DescribeInstances, DescribeInstanceTypes, DescribeImages y DescribeVolumes | ID, AMI, tipo, distribución, plataforma, vCPU, RAM nominal, disco libre mínimo, capacidad, tipo y cifrado de EBS. Contrastar el filesystem que aloja Docker, no solo GB nominales. |
| VPC | DescribeVpcs, DescribeSubnets, DescribeRouteTables y DescribeInternetGateways | Subred dentro del CIDR VPC, tipo de subred, ruta efectiva incluida asociación implícita, IGW cuando corresponde y egress aprobado. La subred privada es opcional. |
| Seguridad | DescribeSecurityGroupRules y DescribeInstances | IDs de todos los SG y unión de reglas, acceso SSH o SSM, IMDSv2 requerido e Instance Profile. `lab_ingress` resume cada regla como `{protocol, port, source}`. `[]` para SSM o TCP 22 desde el CIDR administrativo acordado para SSH. |
| S3 | GetBucketLocation, GetPublicAccessBlock, GetBucketEncryption, GetBucketVersioning y GetBucketLifecycleConfiguration | Bucket de laboratorio, región, Block Public Access, SSE-S3, versionamiento y revisión de Lifecycle. Confirmar alcance efectivo IAM para los prefijos existentes. |
| DNS y Supabase | Inventario DNS aprobado y panel Connect de Supabase | Hostname real, proveedor DNS y endpoint PostgreSQL directo o pooler de sesión con TLS. Registrar hostname y puerto sin incluir DSN. |
| GHCR | GitHub Actions y permisos de los dos paquetes | Repo, visibilidad privada o interna, mecanismo de lectura aprobado y run que emitió `release.json`. |

La plantilla verifica forma y restricciones locales. La presencia de un dato no demuestra por sí sola que el recurso exista. El código 3 indica campos pendientes. El código 1 indica un contrato que contradice el alcance de laboratorio. El IPv4 público, la subred privada complementaria y el IGW de una subred privada son opcionales. Un laboratorio privado requiere una salida autorizada hacia los servicios que realmente consume.

```bash
python3 deploy/scripts/ec2_preflight.py --contract infra/aws/infrastructure-contract.example.json --contract-only
bash deploy/scripts/ec2-preflight.sh --contract /ruta/segura/infrastructure-contract.local.json
```

El preflight por defecto corre diagnóstico local. `--identity` usa solo un token de sesión IMDSv2 y los documentos de identidad y perfil. El token queda en memoria y se usan conexiones sin proxy a la dirección fija de metadata. No consulta credenciales IAM. `--supabase-tls` resuelve el endpoint declarado y negocia TLS con verificación de hostname, sin autenticar contra PostgreSQL. Ejecutar las dos comprobaciones solo desde la EC2 y contra destinos autorizados. Los permisos efectivos de la aplicación y el estado de `/ready` se verifican por separado.

Estados `PASS`, `FAIL`, `BLOCKED` y `NOT RUN`. Salida 0 sin fallos ni bloqueos en los controles solicitados, 1 por fallo, 2 por argumentos incompatibles y 3 por datos, capacidades o acceso pendientes. El código 0 del contrato no acredita preparación productiva.

[Reglas de red](security-groups.md) · [Runbook y handoff de INIT-007](../../docs/devops/INIT-007-integracion-aws.md)
