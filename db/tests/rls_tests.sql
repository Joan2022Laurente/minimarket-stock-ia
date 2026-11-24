-- ==============================================================================
-- db/tests/rls_tests.sql
-- Suite de Verificación de Seguridad RLS en PostgreSQL
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '--- INICIANDO VERIFICACIÓN DE POLÍTICAS RLS ---';

    -- 1. Verificar que RLS está activo en todas las tablas clave
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'productos') = true, 
        'FALLO: RLS no está activo en productos';
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'ventas') = true, 
        'FALLO: RLS no está activo en ventas';
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'detalle_ventas') = true, 
        'FALLO: RLS no está activo en detalle_ventas';
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'movimientos_inventario') = true, 
        'FALLO: RLS no está activo en movimientos_inventario';
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'predicciones') = true, 
        'FALLO: RLS no está activo en predicciones';
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'perfiles') = true, 
        'FALLO: RLS no está activo en perfiles';

    RAISE NOTICE 'ÉXITO: RLS verificado y activo en todas las tablas del minimarket.';
END;
$$;
