import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('buenvecino_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('buenvecino_token');
      localStorage.removeItem('buenvecino_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (nombre: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { nombre, email, password, rol: 'cajero' });
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

export const productoService = {
  list: async (categoriaId?: number, search?: string) => {
    const params: Record<string, any> = {};
    if (categoriaId) params.categoria_id = categoriaId;
    if (search) params.search = search;
    const res = await api.get('/productos', { params });
    return res.data;
  },
  getByBarcode: async (barcode: string) => {
    const res = await api.get(`/productos/barcode/${encodeURIComponent(barcode)}`);
    return res.data;
  },
  getCategorias: async () => {
    const res = await api.get('/productos/categorias');
    return res.data;
  },
  create: async (payload: any) => {
    const res = await api.post('/productos', payload);
    return res.data;
  },
  update: async (id: number, payload: any) => {
    const res = await api.put(`/productos/${id}`, payload);
    return res.data;
  },
  remove: async (id: number) => {
    const res = await api.delete(`/productos/${id}`);
    return res.data;
  },
  uploadImage: async (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/productos/${id}/imagen`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

export const ventaService = {
  checkout: async (payload: any) => {
    const res = await api.post('/ventas', payload);
    return res.data;
  },
  list: async (limit: number = 50, offset: number = 0, fechaInicio?: string, fechaFin?: string) => {
    const params: Record<string, any> = { limit, offset };
    if (fechaInicio) params.fecha_inicio = fechaInicio;
    if (fechaFin) params.fecha_fin = fechaFin;
    const res = await api.get('/ventas', { params });
    return res.data;
  },
  getTicket: async (id: number) => {
    const res = await api.get(`/ventas/${id}`);
    return res.data;
  },
  backupReceiptS3: async (id: number) => {
    const res = await api.post(`/ventas/${id}/comprobante-s3`);
    return res.data;
  },
};

export const inventarioService = {
  listStatus: async () => {
    const res = await api.get('/inventario');
    return res.data;
  },
  ajustarStock: async (payload: { producto_id: number; cantidad: number; tipo: string; motivo: string }) => {
    const res = await api.post('/inventario/ajuste', payload);
    return res.data;
  },
  getKardex: async (productoId?: number) => {
    const params = productoId ? { producto_id: productoId } : {};
    const res = await api.get('/inventario/kardex', { params });
    return res.data;
  },
};

export const prediccionService = {
  getSummary: async () => {
    const res = await api.get('/predicciones/summary');
    return res.data;
  },
  listAlertas: async (nivelAlerta?: string) => {
    const params = nivelAlerta ? { nivel_alerta: nivelAlerta } : {};
    const res = await api.get('/predicciones', { params });
    return res.data;
  },
  triggerPipeline: async () => {
    const res = await api.post('/predicciones/run');
    return res.data;
  },
};

export default api;
