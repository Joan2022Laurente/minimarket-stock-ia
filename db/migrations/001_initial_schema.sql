-- ==============================================================================
-- 001_initial_schema.sql
-- Minimarket «El Buen Vecino» - DDL de Esquema Relacional Principal
-- ==============================================================================

-- 1. Tabla de Perfiles de Usuario (Extensión de Auth)
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('administrador', 'cajero')),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Categorías de Productos
CREATE TABLE IF NOT EXISTS public.categorias (
    id SERIAL PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,
    descripcion TEXT,
    icono TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla de Proveedores
CREATE TABLE IF NOT EXISTS public.proveedores (
    id SERIAL PRIMARY KEY,
    ruc VARCHAR(11) UNIQUE NOT NULL,
    razon_social TEXT NOT NULL,
    telefono VARCHAR(20),
    contacto_nombre TEXT,
    lead_time_dias INT NOT NULL DEFAULT 3 CHECK (lead_time_dias > 0),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabla de Productos del Catálogo
CREATE TABLE IF NOT EXISTS public.productos (
    id SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    categoria_id INT NOT NULL REFERENCES public.categorias(id) ON DELETE RESTRICT,
    proveedor_id INT REFERENCES public.proveedores(id) ON DELETE SET NULL,
    precio_costo NUMERIC(10, 2) NOT NULL CHECK (precio_costo >= 0),
    precio_venta NUMERIC(10, 2) NOT NULL CHECK (precio_venta >= precio_costo),
    stock_actual INT NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INT NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    stock_seguridad INT NOT NULL DEFAULT 10 CHECK (stock_seguridad >= 0),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabla de Cabecera de Ventas (Tickets de Caja)
CREATE TABLE IF NOT EXISTS public.ventas (
    id SERIAL PRIMARY KEY,
    numero_ticket VARCHAR(30) UNIQUE NOT NULL,
    usuario_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    cajero_nombre TEXT NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    igv NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (igv >= 0),
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'yape_plin')),
    monto_pagado NUMERIC(10, 2) CHECK (monto_pagado >= total),
    vuelto NUMERIC(10, 2) DEFAULT 0 CHECK (vuelto >= 0),
    anulada BOOLEAN NOT NULL DEFAULT false,
    motivo_anulacion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabla de Detalle de Venta (Líneas de Ticket)
CREATE TABLE IF NOT EXISTS public.detalle_ventas (
    id SERIAL PRIMARY KEY,
    venta_id INT NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    producto_id INT NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10, 2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
);

-- 7. Tabla de Kardex / Movimientos de Inventario
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
    id SERIAL PRIMARY KEY,
    producto_id INT NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('venta', 'compra', 'ajuste_positivo', 'ajuste_negativo', 'anulacion_venta')),
    cantidad INT NOT NULL,
    stock_previo INT NOT NULL CHECK (stock_previo >= 0),
    stock_posterior INT NOT NULL CHECK (stock_posterior >= 0),
    motivo TEXT,
    referencia_id INT,
    usuario_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Tabla de Predicciones y Alertas de Reorden (Output de Machine Learning)
CREATE TABLE IF NOT EXISTS public.predicciones (
    id SERIAL PRIMARY KEY,
    producto_id INT NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    fecha_prediccion DATE NOT NULL DEFAULT CURRENT_DATE,
    demanda_diaria_estimada NUMERIC(10, 2) NOT NULL CHECK (demanda_diaria_estimada >= 0),
    dias_cobertura NUMERIC(10, 2) NOT NULL CHECK (dias_cobertura >= 0),
    punto_reorden NUMERIC(10, 2) NOT NULL CHECK (punto_reorden >= 0),
    cantidad_sugerida INT NOT NULL DEFAULT 0 CHECK (cantidad_sugerida >= 0),
    nivel_alerta VARCHAR(15) NOT NULL CHECK (nivel_alerta IN ('critico', 'advertencia', 'optimo')),
    resumen_ejecutivo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Índices de Alto Rendimiento para Consultas de Caja y Dashboard
CREATE INDEX IF NOT EXISTS idx_productos_codigo ON public.productos(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON public.productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON public.ventas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_numero ON public.ventas(numero_ticket);
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta ON public.detalle_ventas(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto ON public.detalle_ventas(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON public.movimientos_inventario(producto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predicciones_producto_fecha ON public.predicciones(producto_id, fecha_prediccion DESC);
