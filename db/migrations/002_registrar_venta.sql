-- ==============================================================================
-- 002_registrar_venta.sql
-- Función PL/pgSQL atómica para procesar ventas con descuento de inventario
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.registrar_venta(
    p_numero_ticket VARCHAR(30),
    p_usuario_id UUID,
    p_cajero_nombre TEXT,
    p_metodo_pago VARCHAR(20),
    p_monto_pagado NUMERIC(10, 2),
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_producto RECORD;
    v_venta_id INT;
    v_subtotal NUMERIC(10, 2) := 0;
    v_igv NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_vuelto NUMERIC(10, 2) := 0;
    v_linea_subtotal NUMERIC(10, 2);
    v_item_cantidad INT;
    v_item_producto_id INT;
    v_items_procesados INT := 0;
    v_created_at TIMESTAMPTZ := now();
BEGIN
    -- 1. Validaciones básicas de entrada
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'ERR_CARRITO_VACIO: La venta debe contener al menos un producto.'
            USING ERRCODE = '22023';
    END IF;

    IF p_metodo_pago NOT IN ('efectivo', 'tarjeta', 'yape_plin') THEN
        RAISE EXCEPTION 'ERR_METODO_PAGO_INVALIDO: Método de pago "%" no permitido.', p_metodo_pago
            USING ERRCODE = '22023';
    END IF;

    -- 2. Primera pasada: Bloqueo de filas (FOR UPDATE), validación de existencia y stock, cálculo de total
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(producto_id INT, cantidad INT)
    LOOP
        v_item_producto_id := v_item.producto_id;
        v_item_cantidad := v_item.cantidad;

        IF v_item_cantidad <= 0 THEN
            RAISE EXCEPTION 'ERR_CANTIDAD_INVALIDA: La cantidad solicitada para el producto ID % debe ser mayor a cero.', v_item_producto_id
                USING ERRCODE = '22003';
        END IF;

        -- Bloqueo pesimista para evitar carreras entre cajeros
        SELECT id, nombre, precio_venta, stock_actual, activo
        INTO v_producto
        FROM public.productos
        WHERE id = v_item_producto_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ERR_PRODUCTO_NO_ENCONTRADO: El producto con ID % no existe.', v_item_producto_id
                USING ERRCODE = '02000';
        END IF;

        IF NOT v_producto.activo THEN
            RAISE EXCEPTION 'ERR_PRODUCTO_INACTIVO: El producto "%" está inactivo para ventas.', v_producto.nombre
                USING ERRCODE = '22000';
        END IF;

        IF v_producto.stock_actual < v_item_cantidad THEN
            RAISE EXCEPTION 'ERR_STOCK_INSUFICIENTE: Stock insuficiente para "%". Solicitado: %, Disponible: %',
                v_producto.nombre, v_item_cantidad, v_producto.stock_actual
                USING ERRCODE = '55000';
        END IF;

        v_linea_subtotal := ROUND((v_producto.precio_venta * v_item_cantidad), 2);
        v_total := v_total + v_linea_subtotal;
        v_items_procesados := v_items_procesados + 1;
    END LOOP;

    -- Cálculo de desglose tributario (Precios incluyen IGV 18% en Perú)
    v_subtotal := ROUND((v_total / 1.18), 2);
    v_igv := v_total - v_subtotal;

    -- Validación de monto pagado y vuelto
    IF p_metodo_pago = 'efectivo' THEN
        IF p_monto_pagado IS NULL OR p_monto_pagado < v_total THEN
            RAISE EXCEPTION 'ERR_MONTO_INSUFICIENTE: El monto pagado (%) es menor al total (%)', p_monto_pagado, v_total
                USING ERRCODE = '22003';
        END IF;
        v_vuelto := ROUND((p_monto_pagado - v_total), 2);
    ELSE
        p_monto_pagado := v_total;
        v_vuelto := 0;
    END IF;

    -- 3. Inserción de cabecera de venta
    INSERT INTO public.ventas (
        numero_ticket,
        usuario_id,
        cajero_nombre,
        subtotal,
        igv,
        total,
        metodo_pago,
        monto_pagado,
        vuelto,
        created_at
    ) VALUES (
        p_numero_ticket,
        p_usuario_id,
        p_cajero_nombre,
        v_subtotal,
        v_igv,
        v_total,
        p_metodo_pago,
        p_monto_pagado,
        v_vuelto,
        v_created_at
    )
    RETURNING id INTO v_venta_id;

    -- 4. Segunda pasada: Inserción de líneas de detalle, descuento de inventario y registro de kardex
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(producto_id INT, cantidad INT)
    LOOP
        v_item_producto_id := v_item.producto_id;
        v_item_cantidad := v_item.cantidad;

        SELECT id, nombre, precio_venta, stock_actual
        INTO v_producto
        FROM public.productos
        WHERE id = v_item_producto_id;

        v_linea_subtotal := ROUND((v_producto.precio_venta * v_item_cantidad), 2);

        -- Inserción de detalle
        INSERT INTO public.detalle_ventas (
            venta_id,
            producto_id,
            cantidad,
            precio_unitario,
            subtotal
        ) VALUES (
            v_venta_id,
            v_item_producto_id,
            v_item_cantidad,
            v_producto.precio_venta,
            v_linea_subtotal
        );

        -- Descuento atómico de stock
        UPDATE public.productos
        SET stock_actual = stock_actual - v_item_cantidad,
            updated_at = now()
        WHERE id = v_item_producto_id;

        -- Registro de auditoría en Kardex
        INSERT INTO public.movimientos_inventario (
            producto_id,
            tipo,
            cantidad,
            stock_previo,
            stock_posterior,
            motivo,
            referencia_id,
            usuario_id,
            created_at
        ) VALUES (
            v_item_producto_id,
            'venta',
            -v_item_cantidad,
            v_producto.stock_actual,
            v_producto.stock_actual - v_item_cantidad,
            'Venta en caja ticket ' || p_numero_ticket,
            v_venta_id,
            p_usuario_id,
            v_created_at
        );
    END LOOP;

    -- 5. Respuesta estructurada
    RETURN jsonb_build_object(
        'success', true,
        'venta_id', v_venta_id,
        'numero_ticket', p_numero_ticket,
        'subtotal', v_subtotal,
        'igv', v_igv,
        'total', v_total,
        'monto_pagado', p_monto_pagado,
        'vuelto', v_vuelto,
        'items_procesados', v_items_procesados,
        'created_at', v_created_at
    );
END;
$$;
