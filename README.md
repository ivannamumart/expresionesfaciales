# Sin Remedio · Lectura con rostro

Pieza interactiva de investigación en humanidades digitales. La cámara observa microexpresiones del lector frente a cinco fragmentos satírico-menipeos de *Sin Remedio* (Antonio Caballero, 1984). El rostro nunca abandona el navegador; solo mediciones numéricas anónimas viajan al almacenamiento del estudio.

Autoría: **Ivanna Muñoz Martínez**, Universidad de los Andes.

---

## Estructura

```
sin-remedio/
├── index.html           · pieza de participación
├── researcher.html      · panel privado de investigación
├── css/
│   ├── tokens.css       · variables de diseño
│   ├── base.css         · reset y tipografía
│   └── components.css   · componentes compartidos
├── js/
│   ├── config.js        · credenciales (pegar al configurar Supabase)
│   ├── fragments.js     · los cinco fragmentos de Caballero
│   ├── face.js          · cámara, MediaPipe, silueta topográfica
│   ├── store.js         · persistencia Supabase / localStorage
│   ├── app.js           · flujo participante
│   └── researcher.js    · panel y visualizaciones
├── supabase/
│   └── setup.sql        · esquema y Row Level Security
└── README.md
```

---

## Despliegue en GitHub Pages

1. Crear un repositorio público (recomendado: `sin-remedio`).
2. Subir la carpeta completa a la raíz del repositorio.
3. En **Settings → Pages**: Source = `Deploy from a branch`, Branch = `main` / `(root)`.
4. GitHub entrega una URL del tipo `https://<usuario>.github.io/sin-remedio/`.

La cámara exige HTTPS; GitHub Pages ya sirve en HTTPS por defecto.

### Alternativa: Vercel

1. En [vercel.com](https://vercel.com), **Add New → Project** e importar el repositorio.
2. Framework Preset: `Other`. Dejar el resto por defecto.
3. **Deploy**. En un minuto queda publicado.

---

## Activar Supabase

Mientras `js/config.js` tiene credenciales vacías, los datos se guardan en el navegador del participante (localStorage). Para producción:

1. Crear proyecto en [supabase.com](https://supabase.com) (región más cercana).
2. **SQL Editor → New query**: pegar y ejecutar el bloque de `supabase/setup.sql`.
3. **Authentication → Users → Add user**: crear la cuenta de la investigadora (`il.munoz@uniandes.edu.co`), marcar *Auto Confirm User*.
4. **Project Settings → API**: copiar *Project URL* y *anon public key*.
5. Pegar ambos valores en `js/config.js`:

   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGc...';
   ```

6. Hacer commit del cambio. En uno o dos minutos la nueva versión queda en producción.

> La `anon key` es pública por diseño en Supabase. La seguridad depende de las políticas de Row Level Security instaladas por el SQL.

---

## Panel de investigación

Acceso en `/<repo>/researcher.html` (en local: `researcher.html`).

- Modo local (sin Supabase): correo `il.munoz@uniandes.edu.co`, contraseña `sinremedio2026`. Cambiar en `js/config.js`.
- Modo Supabase: la cuenta creada en el paso 3.

El panel muestra el total de sesiones, lecturas y tiempo acumulado; una gráfica del pico medio de risa, asombro e ironía por fragmento; y la tabla de las últimas 50 sesiones. El botón *Exportar CSV* baja todas las reacciones en formato de hoja de cálculo.

---

## Decisiones de diseño

- **Paleta oscura con un único acento coral apagado.** El fondo responde a tres gradientes radiales que respiran lentamente para dar textura líquida sin recurrir a los neones habituales.
- **Dos tipografías contrastantes.** Spline Sans para la interfaz del laboratorio y Instrument Serif italic para los fragmentos literarios: el cambio de voz separa la obra del aparato de observación.
- **El rostro nunca se muestra.** Lo que ve el participante es su silueta como topografía de curvas de nivel, los puntos activos de cada microgesto cambian de color por región facial, y un indicador discreto arriba a la derecha señala la expresión dominante.
- **Chrome en las esquinas, no al centro.** La atención del lector queda disponible para el fragmento.

---

## Métricas registradas por fragmento

- `dwell_ms`: tiempo de lectura
- `peaks` y `means` para: `smile`, `frown`, `browUp`, `browDown`, `squint`, `jawOpen`, `sneer`, `dimple`, `pucker`
- `blink_count`: parpadeos durante la lectura
- `samples_count`: número de muestras numéricas tomadas
- `demo_mode`: true si la sesión usó la silueta sintética en lugar de la cámara real

Ningún frame de video, embedding del rostro ni dato identificatorio se envía o almacena.

---

## Herramientas

Construido con asistencia de un modelo de lenguaje (Claude Opus 4.7 de Anthropic) bajo un esquema *human-in-the-loop*. Cada decisión de diseño, redacción, selección curatorial y configuración técnica pasó por la revisión y aprobación de la investigadora.

Librerías externas, cargadas desde CDN:
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/face_landmarker) · modelo de 468 landmarks + 52 blendshapes
- [supabase-js](https://supabase.com/docs/reference/javascript) · cliente Supabase
- Google Fonts: Instrument Serif, Spline Sans, JetBrains Mono

---

## Licencia

Investigación académica. Los textos de *Sin Remedio* se citan con fines académicos, atribuidos a Antonio Caballero y Alfaguara.
