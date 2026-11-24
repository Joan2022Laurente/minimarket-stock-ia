-- ==============================================================================
-- 02_synthetic_sales_90d.sql
-- Generador de 90 días de ventas históricas con estacionalidad semanal y quincenal
-- ==============================================================================

DO $$
DECLARE
    v_fecha DATE;
    v_dia_semana INT;
    v_dia_mes INT;
    v_multiplicador NUMERIC;
    v_num_tickets INT;
    v_ticket_idx INT;
    v_ticket_num TEXT;
    v_cajero_id UUID;
    v_cajero_nombre TEXT;
    v_venta_id INT;
    v_hora TIME;
    v_timestamp TIMESTAMPTZ;
    v_num_items INT;
    v_prod RECORD;
    v_cant INT;
    v_subtotal NUMERIC(10, 2);
    v_igv NUMERIC(10, 2);
    v_total NUMERIC(10, 2);
    v_metodo TEXT;
    v_ticket_total NUMERIC(10, 2);
    v_item_subtotal NUMERIC(10, 2);
    v_item_idx INT;
    v_prod_ids INT[] := ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
    v_selected_id INT;
BEGIN
    -- Limpiar ventas sintéticas previas si las hubiera para regeneración idempotente
    -- Solo si se corre en entorno de desarrollo/seed
    TRUNCATE TABLE public.detalle_ventas, public.ventas CASCADE;

    -- Iterar por los últimos 90 días
    FOR i IN 1..90 LOOP
        v_fecha := CURRENT_DATE - (91 - i) * INTERVAL '1 day';
        v_dia_semana := EXTRACT(DOW FROM v_fecha); -- 0=Domingo, 5=Viernes, 6=Sábado
        v_dia_mes := EXTRACT(DAY FROM v_fecha);

        -- Factores de estacionalidad
        v_multiplicador := 1.0;
        IF v_dia_semana IN (5, 6) THEN
            v_multiplicador := v_multiplicador * 1.5; -- Fin de semana vende 50% más
        ELSIF v_dia_semana = 0 THEN
            v_multiplicador := v_multiplicador * 1.2; -- Domingos
        END IF;

        IF v_dia_mes IN (14, 15, 16, 29, 30, 31) THEN
            v_multiplicador := v_multiplicador * 1.3; -- Quincena y fin de mes
        END IF;

        -- Cantidad de tickets por día (entre 12 y 25 base, ajustado por multiplicador)
        v_num_tickets := FLOOR((12 + (RANDOM() * 12)) * v_multiplicador);

        FOR v_ticket_idx IN 1..v_num_tickets LOOP
            -- Generar hora entre 08:00 y 22:00
            v_hora := TIME '08:00:00' + (RANDOM() * INTERVAL '14 hours');
            v_timestamp := (v_fecha + v_hora)::TIMESTAMPTZ;

            -- Alternar cajeros
            IF RANDOM() > 0.5 THEN
                v_cajero_id := '00000000-0000-0000-0000-000000000002';
                v_cajero_nombre := 'Carlos Quispe';
            ELSE
                v_cajero_id := '00000000-0000-0000-0000-000000000003';
                v_cajero_nombre := 'María Rodríguez';
            END IF;

            -- Método de pago
            IF RANDOM() < 0.45 THEN
                v_metodo := 'yape_plin';
            ELSIF RANDOM() < 0.75 THEN
                v_metodo := 'efectivo';
            ELSE
                v_metodo := 'tarjeta';
            END IF;

            v_ticket_num := 'B001-' || LPAD((i * 100 + v_ticket_idx)::TEXT, 8, '0');

            -- Insertar cabecera temporal
            INSERT INTO public.ventas (
                numero_ticket, usuario_id, cajero_nombre, subtotal, igv, total,
                metodo_pago, monto_pagado, vuelto, created_at
            ) VALUES (
                v_ticket_num, v_cajero_id, v_cajero_nombre, 0, 0, 0,
                v_metodo, 0, 0, v_timestamp
            ) RETURNING id INTO v_venta_id;

            -- Generar entre 1 y 4 ítems por ticket
            v_num_items := 1 + FLOOR(RANDOM() * 3);
            v_ticket_total := 0;

            FOR v_item_idx IN 1..v_num_items LOOP
                -- Seleccionar producto aleatorio con mayor probabilidad para alta rotación (IDs 1, 6, 7, 12, 14, 20)
                IF RANDOM() < 0.4 THEN
                    v_selected_id := (ARRAY[1, 6, 7, 12, 14, 20])[1 + FLOOR(RANDOM() * 6)];
                ELSE
                    v_selected_id := v_prod_ids[1 + FLOOR(RANDOM() * array_length(v_prod_ids, 1))];
                END IF;

                SELECT id, precio_venta INTO v_prod FROM public.productos WHERE id = v_selected_id;
                v_cant := 1 + FLOOR(RANDOM() * 2); -- 1 o 2 unidades
                v_item_subtotal := ROUND(v_prod.precio_venta * v_cant, 2);
                v_ticket_total := v_ticket_total + v_item_subtotal;

                INSERT INTO public.detalle_ventas (
                    venta_id, producto_id, cantidad, precio_unitario, subtotal
                ) VALUES (
                    v_venta_id, v_prod.id, v_cant, v_prod.precio_venta, v_item_subtotal
                );
            END LOOP;

            -- Actualizar totales del ticket
            v_subtotal := ROUND(v_ticket_total / 1.18, 2);
            v_igv := v_ticket_total - v_subtotal;

            UPDATE public.ventas
            SET subtotal = v_subtotal,
                igv = v_igv,
                total = v_ticket_total,
                monto_pagado = v_ticket_total,
                vuelto = 0
            WHERE id = v_venta_id;

        END LOOP;
    END LOOP;
END;
$$;
