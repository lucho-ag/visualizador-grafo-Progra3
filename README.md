# Misión UADA · Visualizador de grafos

Visualizador web interactivo de los mapas del TPO **Misión UADA** (Programación III, UADE, 2.º cuatrimestre 2026).
Sitio 100 % estático (HTML + CSS + JS, sin build ni dependencias).

## Funcionalidades

- **Alternar grafos**: mapa no dirigido (`mapa_grande_sin_solucion.txt`) y mapa dirigido oficial (`mapa_grande.txt`). También se puede cargar cualquier `.txt` con el mismo formato.
- **Explorar**: nodos coloreados por tipo (obligatorio, aula que recarga, ventana horaria, prohibido, inicio). Al tocar un nodo se ven sus entradas/salidas, modos, tiempos por modo, recarga y distancia recta al 348. Incluye un diagnóstico automático (inicio sin entradas, obligatorios sin salida o inalcanzables).
- **Filtros**: mostrar/ocultar tiempos y coordenadas, filtrar aristas por modo (C / S / P).
- **Armar ruta a mano**: se elige cada tramo y su modo; se calcula tiempo y batería en vivo y se marca qué regla se rompe (batería, ventana, repetido, zona prohibida, volver sin obligatorios).
- **Branch & Bound**: calcula las 3 mejores secuencias distintas (o la ruta de contingencia), muestra la tabla de pasos, nodos analizados, motivos de poda y un log de exploración. Animación del robot recorriendo la ruta.

## Reglas implementadas

| Modo | Tiempo | Batería |
|---|---|---|
| Caminando (C) | t | t/60 |
| Saltando (S) | t/2 | 2,2·t/60 |
| Patas para arriba (P) | 2t | 0,45·t/60 |

Batería inicial y tope 100; las aulas recargan 1/5 de la suma de sus dígitos (el 348 no recarga); ventanas cerradas en `[desde, hasta]` sin espera; sin repetir lugares; Zona obras prohibida; llegar al 348 con batería exactamente 0 es válido. Contingencia: menor distancia euclídea al 348, desempate por más obligatorios y menor tiempo.

> El solver en JS es una herramienta de verificación visual; el algoritmo a entregar es el del grupo.

## Estructura

```
index.html      página
styles.css      estilos
js/maps.js      los dos mapas embebidos (para que funcione también abriendo el archivo local)
js/model.js     parser, reglas y solver Branch & Bound
js/app.js       interfaz y dibujo SVG
data/*.txt      mapas originales
vercel.json     configuración de Vercel
```

Si cambian los mapas, reemplazá los `.txt` en `data/` y actualizá el texto en `js/maps.js` (o usá "Cargar .txt" en la página).

## Correr local

Abrí `index.html` en el navegador, o `npx serve .`

## Subir a GitHub y desplegar en Vercel

```bash
git init
git add .
git commit -m "Visualizador Mision UADA"
git branch -M main
git remote add origin https://github.com/<usuario>/mision-uada-viz.git
git push -u origin main
```

En [vercel.com/new](https://vercel.com/new): **Import Git Repository** → elegir el repo → Framework Preset **Other**, sin build command ni output directory → **Deploy**. Cada push a `main` redepliega solo.
