-- ==============================================================================
-- 01_catalog_seed.sql
-- Datos iniciales: Perfiles, Categorías, Proveedores y Catálogo Peruano
-- ==============================================================================

-- 1. Perfiles de Usuario (Admin y 2 Cajeros)
INSERT INTO public.perfiles (id, nombre, email, rol, activo) VALUES
('00000000-0000-0000-0000-000000000001', 'Juan Pérez (Administrador)', 'admin@elbuenvecino.com', 'administrador', true),
('00000000-0000-0000-0000-000000000002', 'Carlos Quispe (Cajero Mañana)', 'cajero1@elbuenvecino.com', 'cajero', true),
('00000000-0000-0000-0000-000000000003', 'María Rodríguez (Cajera Tarde)', 'cajero2@elbuenvecino.com', 'cajero', true)
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    rol = EXCLUDED.rol;

-- 2. Categorías Principales
INSERT INTO public.categorias (id, nombre, descripcion, icono) VALUES
(1, 'Lácteos y Huevos', 'Leches, yogures, quesos y huevos frescos', 'Milk'),
(2, 'Abarrotes y Despensa', 'Arroz, fideos, aceites, azúcar y conservas', 'ShoppingBag'),
(3, 'Bebidas y Licores', 'Gaseosas, aguas, jugos y cervezas', 'Coffee'),
(4, 'Snacks y Golosinas', 'Galletas, chocolates, papas fritas y golosinas', 'Cookie'),
(5, 'Limpieza y Hogar', 'Detergentes, lejías, jabones y papel higiénico', 'Sparkles'),
(6, 'Cuidado Personal', 'Shampoo, dentífricos, jabones de tocador', 'User')
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion;

SELECT setval('public.categorias_id_seq', (SELECT MAX(id) FROM public.categorias));

-- 3. Proveedores Principales
INSERT INTO public.proveedores (id, ruc, razon_social, telefono, contacto_nombre, lead_time_dias) VALUES
(1, '20100190797', 'GLORIA S.A.', '01-4707170', 'Distribuidora Lácteos Lima', 2),
(2, '20100055237', 'ALICORP S.A.A.', '01-3150800', 'Ventas Mayoristas Callao', 3),
(3, '20100107059', 'ARCA CONTINENTAL LINDLEY S.A.', '01-3115000', 'Despacho Bebidas Centro', 2),
(4, '20100122368', 'MONDELEZ PERU S.A.', '01-2114000', 'Canal Tradicional Lima', 4),
(5, '20100152941', 'PROCTER & GAMBLE DEL PERU S.R.L.', '01-6115000', 'Distribución Limpieza', 5)
ON CONFLICT (id) DO UPDATE SET
    razon_social = EXCLUDED.razon_social,
    lead_time_dias = EXCLUDED.lead_time_dias;

SELECT setval('public.proveedores_id_seq', (SELECT MAX(id) FROM public.proveedores));

-- 4. Catálogo de Productos Peruanos de Alta Rotación
INSERT INTO public.productos (id, codigo_barras, nombre, categoria_id, proveedor_id, precio_costo, precio_venta, stock_actual, stock_minimo, stock_seguridad) VALUES
-- Lácteos
(1, '7750106001018', 'Leche Evaporada Gloria Azul 400g', 1, 1, 3.40, 4.20, 48, 12, 24),
(2, '7750106001025', 'Leche Gloria Deslactosada Roja 400g', 1, 1, 3.60, 4.50, 32, 10, 16),
(3, '7750106001032', 'Yogurt Gloria Fresa 1 Litro', 1, 1, 5.20, 6.80, 18, 6, 12),
(4, '7750106001049', 'Queso Bonlé Edam Gloria 250g', 1, 1, 8.50, 11.50, 14, 4, 8),
(5, '7750000000056', 'Huevos Pardos Caleta x 15 unidades', 1, 1, 7.20, 9.50, 20, 5, 10),

-- Abarrotes
(6, '7750243000010', 'Arroz Extra Costeño Bolsa 1kg', 2, 2, 3.80, 4.90, 60, 20, 30),
(7, '7750243000027', 'Aceite Vegetal Primor Clásico 900ml', 2, 2, 7.50, 9.80, 35, 10, 20),
(8, '7750243000034', 'Fideos Spaghetti Don Vittorio 450g', 2, 2, 2.30, 3.20, 50, 15, 25),
(9, '7750243000041', 'Atún Trozos Primor en Aceite 170g', 2, 2, 4.60, 6.20, 40, 12, 20),
(10, '7750243000058', 'Azúcar Rubia Cartavio Bolsa 1kg', 2, 2, 3.20, 4.20, 45, 15, 25),
(11, '7750243000065', 'Sal de Mesa Marina Emsal 1kg', 2, 2, 1.20, 1.80, 30, 8, 15),

-- Bebidas
(12, '7750104000101', 'Inca Kola Botella 1.5 Litros PET', 3, 3, 5.00, 6.80, 42, 12, 24),
(13, '7750104000118', 'Coca Cola Botella 1.5 Litros PET', 3, 3, 5.00, 6.80, 38, 12, 24),
(14, '7750104000125', 'Inca Kola Personal 500ml', 3, 3, 2.20, 3.00, 65, 20, 35),
(15, '7750104000132', 'Agua Mineral San Mateo sin Gas 600ml', 3, 3, 1.40, 2.20, 55, 15, 30),
(16, '7750104000149', 'Cerveza Cusqueña Dorada Lata 355ml', 3, 3, 4.50, 6.50, 48, 12, 24),

-- Snacks y Golosinas
(17, '7622210000102', 'Galletas Casino Chocolate Pack x 6', 4, 4, 3.80, 5.20, 30, 10, 18),
(18, '7622210000119', 'Galletas Soda Field Pack x 6', 4, 4, 3.20, 4.50, 40, 12, 20),
(19, '7622210000126', 'Galletas Oreo Clásica Tubo 118g', 4, 4, 2.40, 3.50, 35, 10, 18),
(20, '7622210000133', 'Papas Lays Clásicas Bolsa 45g', 4, 4, 1.80, 2.80, 45, 15, 25),
(21, '7622210000140', 'Chocolate Sublime Clásico Barra 30g', 4, 4, 1.60, 2.50, 60, 20, 30),

-- Limpieza
(22, '7750153000105', 'Detergente Opal Ultra Lavado 800g', 5, 2, 7.80, 10.50, 25, 8, 15),
(23, '7750153000112', 'Lejía Clorox Tradicional 1 Litro', 5, 5, 3.00, 4.50, 28, 8, 14),
(24, '7750153000129', 'Papel Higiénico Suave Rinde Más x 4', 5, 5, 4.50, 6.50, 36, 10, 20),
(25, '7750153000136', 'Lavavajillas Sapolio Pasta Limón 350g', 5, 2, 2.80, 4.00, 22, 6, 12),

-- Cuidado Personal
(26, '7500435100012', 'Shampoo Head & Shoulders Limpieza 375ml', 6, 5, 14.50, 19.90, 15, 5, 8),
(27, '7500435100029', 'Crema Dental Colgate Total 12 75ml', 6, 5, 4.20, 6.00, 30, 10, 15),
(28, '7500435100036', 'Jabón de Tocador Camay Clásico 125g', 6, 5, 2.10, 3.20, 40, 12, 20)
ON CONFLICT (id) DO UPDATE SET
    codigo_barras = EXCLUDED.codigo_barras,
    nombre = EXCLUDED.nombre,
    precio_costo = EXCLUDED.precio_costo,
    precio_venta = EXCLUDED.precio_venta,
    stock_actual = EXCLUDED.stock_actual,
    stock_minimo = EXCLUDED.stock_minimo,
    stock_seguridad = EXCLUDED.stock_seguridad;

SELECT setval('public.productos_id_seq', (SELECT MAX(id) FROM public.productos));
