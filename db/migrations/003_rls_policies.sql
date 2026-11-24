-- ==============================================================================
-- 003_rls_policies.sql
-- Políticas de Seguridad a Nivel de Fila (Row Level Security - RLS)
-- ==============================================================================

-- 1. Función auxiliar para obtener el rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT rol FROM public.perfiles WHERE id = auth.uid() AND activo = true;
$$;

-- 2. Habilitar RLS en todas las tablas
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predicciones ENABLE ROW LEVEL SECURITY;

-- 3. Políticas para PERFILES
DROP POLICY IF EXISTS "Lectura de perfiles propios o por admin" ON public.perfiles;
CREATE POLICY "Lectura de perfiles propios o por admin"
    ON public.perfiles FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR public.get_auth_user_role() = 'administrador');

DROP POLICY IF EXISTS "Actualización de perfiles solo por admin" ON public.perfiles;
CREATE POLICY "Actualización de perfiles solo por admin"
    ON public.perfiles FOR UPDATE
    TO authenticated
    USING (public.get_auth_user_role() = 'administrador');

-- 4. Políticas para CATEGORÍAS
DROP POLICY IF EXISTS "Lectura de categorías para todos los autenticados" ON public.categorias;
CREATE POLICY "Lectura de categorías para todos los autenticados"
    ON public.categorias FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Gestión de categorías solo por administrador" ON public.categorias;
CREATE POLICY "Gestión de categorías solo por administrador"
    ON public.categorias FOR ALL
    TO authenticated
    USING (public.get_auth_user_role() = 'administrador');

-- 5. Políticas para PROVEEDORES
DROP POLICY IF EXISTS "Lectura de proveedores para todos los autenticados" ON public.proveedores;
CREATE POLICY "Lectura de proveedores para todos los autenticados"
    ON public.proveedores FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Gestión de proveedores solo por administrador" ON public.proveedores;
CREATE POLICY "Gestión de proveedores solo por administrador"
    ON public.proveedores FOR ALL
    TO authenticated
    USING (public.get_auth_user_role() = 'administrador');

-- 6. Políticas para PRODUCTOS
DROP POLICY IF EXISTS "Lectura de catálogo para cajeros y admin" ON public.productos;
CREATE POLICY "Lectura de catálogo para cajeros y admin"
    ON public.productos FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Gestión de productos solo por administrador" ON public.productos;
CREATE POLICY "Gestión de productos solo por administrador"
    ON public.productos FOR ALL
    TO authenticated
    USING (public.get_auth_user_role() = 'administrador');

-- 7. Políticas para VENTAS
DROP POLICY IF EXISTS "Cajero puede ver sus ventas, Admin puede ver todas" ON public.ventas;
CREATE POLICY "Cajero puede ver sus ventas, Admin puede ver todas"
    ON public.ventas FOR SELECT
    TO authenticated
    USING (usuario_id = auth.uid() OR public.get_auth_user_role() = 'administrador');

DROP POLICY IF EXISTS "Cajeros y admin pueden insertar ventas" ON public.ventas;
CREATE POLICY "Cajeros y admin pueden insertar ventas"
    ON public.ventas FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 8. Políticas para DETALLE DE VENTAS
DROP POLICY IF EXISTS "Lectura de detalles de ventas visibles" ON public.detalle_ventas;
CREATE POLICY "Lectura de detalles de ventas visibles"
    ON public.detalle_ventas FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ventas v
            WHERE v.id = detalle_ventas.venta_id
            AND (v.usuario_id = auth.uid() OR public.get_auth_user_role() = 'administrador')
        )
    );

-- 9. Políticas para MOVIMIENTOS DE INVENTARIO
DROP POLICY IF EXISTS "Lectura de kardex solo por administrador" ON public.movimientos_inventario;
CREATE POLICY "Lectura de kardex solo por administrador"
    ON public.movimientos_inventario FOR SELECT
    TO authenticated
    USING (public.get_auth_user_role() = 'administrador');

-- 10. Políticas para PREDICCIONES Y ALERTAS
DROP POLICY IF EXISTS "Lectura y gestión de predicciones solo por administrador" ON public.predicciones;
CREATE POLICY "Lectura y gestión de predicciones solo por administrador"
    ON public.predicciones FOR ALL
    TO authenticated
    USING (public.get_auth_user_role() = 'administrador');
