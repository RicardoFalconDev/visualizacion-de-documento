# Visualización de documento · lectura requerida antes de firmar

Prototipo del visor de documentos de FID: la persona tiene que recorrer todas las páginas antes de poder firmar.

## Qué incluye

- **Indicador de progreso de lectura:** una barra continua que se llena de forma gradual con el scroll y un contador por página ("1 de 2 páginas").
- **Botón "Firmar documento" bloqueado** hasta completar la lectura. Con hover, foco o click muestra un tooltip que explica qué falta.
- **Chip "Ir al final del documento"** con scroll suave.
- **Zoom** de 50 % a 200 % que no reinicia el progreso.
- **Accesibilidad:** `aria-disabled`, tooltip asociado con `aria-describedby` y anuncio del progreso con `aria-live`.

## Cómo verlo

Abrí `index.html` en el navegador. No necesita instalación ni build.

## Archivos

- `index.html`: estructura.
- `styles.css`: estilos y tokens de diseño.
- `app.js`: interacciones.
- `assets/`: íconos e imagen del documento.
