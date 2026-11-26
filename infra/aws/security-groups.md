# Acceso y redes de INIT-007

| Fase | Entrada a EC2 | Publicación Docker |
|---|---|---|
| Laboratorio con SSM | Sin ingress al stack ni al puerto 22. El agente debe estar registrado y alcanzar sus endpoints. | Caddy `127.0.0.1:8080` y Grafana `127.0.0.1:3000`, solo por túnel. |
| Laboratorio con SSH | TCP 22 desde el CIDR administrativo aprobado. Validar el fingerprint de host por un canal del equipo. | Los mismos dos bindings en loopback. |
| Producción futura autorizada | TCP 80/443 para Caddy, con CIDR según la decisión pública y familia IP habilitada. SSH solo si corresponde. | Únicamente 80/443 para gateway, con configuración productiva revisada en INIT-008. |

Los puertos 8000, 9090 y 9100 quedan internos. El 8080 de cAdvisor no se publica. Grafana solo se alcanza por el túnel. El 8080 de loopback del laboratorio corresponde a Caddy. Usar los grupos de seguridad como perímetro y comprobar la configuración efectiva de Docker, la red y el firewall del host. Las reglas de Docker y la publicación de puertos requieren verificación incluso si existe un firewall local. [Publicación de puertos Docker](https://docs.docker.com/engine/network/port-publishing/)

Cloud revisa **la unión de todos los SG** asociados a la ENI, route table principal y específica, IGW, NACL, resolución y la familia IP de cada destino. Un IGW y una ruta pública por sí solos no dan salida IPv4 al host sin direccionamiento adecuado. En subred privada, documentar el egress existente hacia GHCR, Docker Hub, Supabase, repositorios de paquetes y SSM si se usa. Los endpoints privados de AWS no resuelven la salida a servicios externos por sí solos. Un NAT Gateway queda fuera del diseño inicial. [Conectividad SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-troubleshooting.html)

Egress previsto TCP 443 para GHCR, GitHub, Docker Hub, API regional de S3 y SSM cuando aplique, y el endpoint PostgreSQL autorizado en TCP 5432. Considerar DNS, NTP y tráfico de retorno de NACL según el diseño real. Un SG se documenta por CIDR, prefix list o SG de destino, no por nombres de dominio. Confirmar cambios de reglas con autorización separada.

IMDS con tokens requeridos. Evaluar hop limit 1 para el flujo de respaldo **desde el host**. El consumo de IAM desde contenedores del backend debe revisarse por separado, en especial si el hop limit impide su alcance. No aumentar el alcance global para saltar el control. Supabase, GHCR y S3 usan identidades separadas y autorizadas. [Opciones IMDS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-options.html)

Comprobaciones a cargo de Cloud, de solo lectura una vez autorizado:

```bash
aws ec2 describe-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[].Instances[].{Type:InstanceType,Arch:Architecture,AMI:ImageId,Subnet:SubnetId,Vpc:VpcId,SGs:SecurityGroups[].GroupId,Volume:BlockDeviceMappings[].Ebs.VolumeId,IMDS:MetadataOptions}'
aws ec2 describe-subnets --region "$AWS_REGION" --subnet-ids "$SUBNET_ID"
aws ec2 describe-route-tables --region "$AWS_REGION" --filters "Name=vpc-id,Values=$VPC_ID"
aws ec2 describe-internet-gateways --region "$AWS_REGION" --filters "Name=attachment.vpc-id,Values=$VPC_ID"
aws ec2 describe-security-group-rules --region "$AWS_REGION" --filters "Name=group-id,Values=$SG_ID"
```

En el host, `ss -lnt` muestra listeners del espacio de red local. Comprobar también `docker compose ps` y los puertos efectivos del Engine. Si una publicación administrativa queda fuera de loopback o se descubre ingress adicional de AWS, detener únicamente el laboratorio autorizado y corregir el alcance con Cloud antes de seguir.
