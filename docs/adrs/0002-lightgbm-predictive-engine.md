# ADR 0002: Motor Predictivo de Demanda Basado en Machine Learning con LightGBM

## Estado
Aprobado

## Contexto
El sistema requiere proyectar la demanda de productos para calcular el punto de reorden y los días de cobertura de stock, evitando desabastecimientos en el minimarket «El Buen Vecino».
Inicialmente se consideró el uso exclusivo de promedios móviles simples o la delegación de predicciones numéricas a un modelo LLM (OpenRouter/Bedrock). Sin embargo:
1. Los cálculos de promedio móvil simple no capturan adecuadamente la estacionalidad semanal ni las relaciones no lineales entre categorías y precios.
2. Los modelos LLM son propensos a alucinaciones matemáticas, son costosos por cada inferencia y generan una dependencia crítica de conectividad externa.
3. Las redes neuronales profundas (LSTMs / Transformers) son inviables debido al consumo excesivo de memoria en una instancia de 2 GB de RAM.

## Decisión
Se decide implementar un **modelo de Machine Learning supervisado tabular basado en LightGBM Regressor** que se ejecuta localmente dentro del contenedor de backend en Python:
1. **Eficiencia y Recursos:** LightGBM utiliza algoritmos basados en histogramas (*leaf-wise tree growth*), entrenando sobre 100,000 registros en menos de 2 segundos con un consumo de RAM inferior a 80 MB.
2. **Ingeniería de Características:** Se generan variables de retardo (*lags* $t-1, t-7, t-14$), medias móviles de 7 y 28 días, variables de calendario (`dia_semana`, `dia_mes`, `is_weekend`, `is_payday`) y variables categóricas nativas (`categoria_id`).
3. **Métrica de Calidad:** Se evalúa mediante WAPE (*Weighted Absolute Percentage Error*) con un objetivo $<20\%$ en productos de alta rotación.
4. **Resiliencia Operativa:** La predicción y la emisión de sugerencias de compra operan al 100% de forma autónoma, sin depender de internet ni de llamadas a APIs externas. La integración con LLM queda como un paso opcional exclusivamente para generar síntesis en texto legible para el usuario.

## Consecuencias
- **Positivas:** Cero costo de APIs para inferencia y entrenamiento; predicción del catálogo completo en menos de 50 milisegundos; modelo serializado de menos de 1 MB (`.joblib`); robustez ante desconexiones.
- **Negativas:** Requiere un pipeline de feature engineering en Python y un conjunto de datos histórico inicial (mínimo 90 días) para calibrar los pesos de los árboles.
