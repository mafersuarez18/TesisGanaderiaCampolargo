# Sistema Campolargo — Gestión Veterinaria Bovina

> **Trabajo de Grado · Ingeniería en Informática**  
> María Fernanda Suárez Delfin · Universidad Católica Andrés Bello (UCAB) · 2026

Sistema de gestión veterinaria integral para la empresa ganadera **Sucesión Joao Campolargo** (Ganadería Campolargo), que administra tres fincas ubicadas en el estado Yaracuy, Venezuela. El sistema permite registrar, consultar y analizar toda la información clínica, reproductiva y operacional del hato bovino, también desde el teléfono y sin conexión a internet.

---

## Tabla de contenido

1. [Descripción del proyecto](#descripción-del-proyecto)
2. [Tecnologías utilizadas](#tecnologías-utilizadas)
3. [Arquitectura del sistema](#arquitectura-del-sistema)
4. [Estructura de directorios](#estructura-de-directorios)
5. [Módulos del sistema](#módulos-del-sistema)
6. [Uso sin conexión](#uso-sin-conexión)
7. [Base de datos](#base-de-datos)
8. [Variables de entorno](#variables-de-entorno)
9. [Instalación y puesta en marcha](#instalación-y-puesta-en-marcha)
10. [Datos de prueba](#datos-de-prueba)
11. [Respaldo y restauración de la base de datos](#respaldo-y-restauración-de-la-base-de-datos)
12. [Scripts disponibles](#scripts-disponibles)
13. [Despliegue](#despliegue)
14. [Credenciales de prueba](#credenciales-de-prueba)
15. [API REST](#api-rest)
16. [Roles y permisos](#roles-y-permisos)
17. [Reportes en PDF y Excel](#reportes-en-pdf-y-excel)

---

## Descripción del proyecto

El **Sistema Campolargo** digitaliza y centraliza la gestión operativa de las tres fincas bovinas de la empresa:

- **El Paraíso**
- **Campo Alegre**
- **Las Peñas**

Reemplaza los registros físicos dispersos con un sistema web moderno que permite a administradores, veterinarios y técnicos de campo consultar y actualizar información desde cualquier dispositivo con navegador. Se puede instalar en el teléfono como aplicación (PWA) y seguir usando en el campo sin señal.

### Objetivos del sistema

- Centralizar el historial clínico y sanitario de cada animal
- Automatizar la programación de vacunaciones y desparasitaciones
- Dar trazabilidad reproductiva completa (celos, inseminaciones, gestaciones, partos)
- Emitir alertas automáticas ante eventos críticos (vacunas vencidas, partos próximos, días abiertos excedidos, entre otros)
- Ubicar al hato mediante collares GPS, con el sistema ya preparado para recibir datos de dispositivos reales
- Generar reportes en PDF y Excel para auditoría veterinaria y toma de decisiones
- Llevar un registro de auditoría completo de todas las acciones del sistema
- Permitir el trabajo de campo sin conexión, sincronizando los registros al recuperar la señal

---

## Tecnologías utilizadas

### Backend

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | 24.14+ | Entorno de ejecución |
| TypeScript | 5.x | Tipado estático |
| Express | 5.x | Framework HTTP |
| Prisma ORM | 6.x | Acceso a base de datos y migraciones |
| PostgreSQL | 16+ (desarrollado sobre 18) | Base de datos relacional |
| JWT (jsonwebtoken) | 9.x | Autenticación con tokens |
| Zod | 3.x | Validación de esquemas y de variables de entorno |
| Helmet / express-rate-limit | 8.x / 7.x | Cabeceras de seguridad y límite de peticiones |
| PDFKit | 0.15+ | Generación de reportes en PDF |
| ExcelJS | 4.x | Reportes en Excel e importación de reportes GPS (CSV/XLS) |
| Multer | 2.x | Carga de archivos (importación de reportes de dispositivos GPS) |
| bcryptjs | 2.x | Hash de contraseñas |
| Nodemailer | 6.x | Envío de correos electrónicos |
| node-cron | 3.x | Motor de alertas (evaluación periódica de reglas) |
| Winston | 3.x | Registro de logs |

### Frontend

| Tecnología | Versión | Uso |
|---|---|---|
| React | 19.x | Librería de interfaz |
| TypeScript | 5.x | Tipado estático |
| Vite | 7.x | Bundler y servidor de desarrollo |
| TailwindCSS | 4.x | Estilos utilitarios (plugin `@tailwindcss/vite`) |
| Framer Motion | 12.x | Animaciones |
| TanStack Query | 5.x | Gestión de estado del servidor (caché de consultas) |
| React Router | 7.x | Enrutamiento SPA |
| Zustand | 5.x | Estado de sesión persistido |
| React Hook Form + Zod | 7.x / 3.x | Formularios y validación |
| Recharts | 2.x | Gráficas del dashboard |
| React Leaflet | 5.x | Mapas del módulo de geolocalización |
| Axios | 1.x | Cliente HTTP |
| vite-plugin-pwa | 1.x | Aplicación instalable (PWA) y service worker |
| idb | 8.x | IndexedDB: cola de registros y datos para uso sin conexión |
| react-hot-toast | 2.x | Notificaciones toast |
| Material Symbols | — | Iconografía (Google Icons) |

---

## Arquitectura del sistema

```
┌─────────────────────────────────────────────┐
│               Navegador / PWA               │
│   React + Vite (puerto 5173)                │
│   ┌───────────────────────────────────────┐ │
│   │ Capa offline (IndexedDB)              │ │
│   │  · copia local de las consultas GET   │ │
│   │  · cola de registros sin conexión     │ │
│   └───────────────────────────────────────┘ │
└──────────────────┬──────────────────────────┘
                   │ HTTP/REST (Axios + JWT)
                   ▼
┌─────────────────────────────────────────────┐
│            API REST Express                 │
│   Node.js + TypeScript (puerto 3001)        │
│   Autenticación JWT · Validación Zod        │
│   Motor de alertas (node-cron) · Prisma ORM │
└──────────────────┬──────────────────────────┘
                   │ Prisma Client
                   ▼
┌─────────────────────────────────────────────┐
│            PostgreSQL                       │
│   Base de datos: campolargo                 │
│   Extensiones: unaccent, pg_trgm            │
└─────────────────────────────────────────────┘
```

El backend sigue una arquitectura en capas:

```
Rutas (Router)
  └─► Middleware de autenticación / privilegios / auditoría
       └─► Controlador (validación Zod)
            └─► Servicio (lógica de negocio)
                 └─► Repositorio (consultas Prisma)
                      └─► Base de datos
```

Los módulos más simples (lotes, inseminación) resuelven controlador y servicio directamente en el archivo de rutas, sin separar esas capas; el resto sigue la cadena completa.

---

## Estructura de directorios

```
GanaderiaCampolargo/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma               ← Esquema completo de la base de datos
│   │   ├── seed.ts                     ← Datos iniciales (fincas, razas, usuarios, animales, GPS...)
│   │   ├── datosPruebaIndicadores.ts   ← Datos extra para los indicadores del dashboard
│   │   └── migrations/                 ← Historial de migraciones Prisma
│   ├── src/
│   │   ├── config/entorno.ts           ← Lectura y validación de variables de entorno
│   │   ├── compartido/
│   │   │   ├── middlewares/            ← autenticacion.ts, auditoria.ts, manejarErrores.ts
│   │   │   ├── prisma/                 ← clientePrisma.ts (singleton)
│   │   │   ├── tipos/                  ← respuesta.ts (clases de error)
│   │   │   └── utilidades/             ← paginacion.ts, respuestaHttp.ts
│   │   ├── modulos/                    ← alertas, analytics, animales, auditoria, autenticacion,
│   │   │                                  fincas, geolocalizacion, historialMedico, inseminacion,
│   │   │                                  lotes, notificaciones, planSanitario, reportes,
│   │   │                                  reproduccion, roles, usuarios, vacunacion
│   │   └── app.ts / servidor.ts        ← Punto de entrada Express
│   ├── .env.ejemplo                    ← Plantilla de backend/.env
│   ├── Dockerfile / Dockerfile.dev
│   └── package.json
│
├── frontend/
│   ├── public/                         ← Logos, íconos de la PWA, imágenes
│   ├── src/
│   │   ├── componentes/
│   │   │   ├── layout/                 ← BarraLateral, BarraSuperior, LayoutPrincipal, ModalPerfil, RutaProtegida
│   │   │   └── ui/                     ← Badge, Tabla, Modal, Icono, Paginacion, BuscadorAnimal,
│   │   │                                  SelectorRaza, CampoFecha...
│   │   ├── hooks/                      ← useAutenticacion, useDebounce, useOnline
│   │   ├── stores/                     ← autenticacionStore.ts (sesión persistida)
│   │   ├── paginas/                    ← una carpeta por módulo
│   │   ├── servicios/
│   │   │   ├── clienteAxios.ts         ← Cliente HTTP: JWT, avisos de conexión, modo sin conexión
│   │   │   ├── clienteQuery.ts         ← Cliente de TanStack Query compartido
│   │   │   ├── cacheOffline.ts         ← Copia local de las consultas (IndexedDB)
│   │   │   ├── colaSincronizacion.ts   ← Cola de registros guardados sin conexión
│   │   │   └── precargaOffline.ts      ← Precarga de datos al iniciar sesión
│   │   └── principal.tsx / App.tsx
│   ├── .env.ejemplo                    ← Plantilla de frontend/.env
│   ├── vite.config.ts                  ← Vite, PWA y service worker
│   └── package.json
│
├── docker/postgres/init.sql            ← Extensiones de PostgreSQL para Docker
├── docker-compose.yml                  ← Entorno de desarrollo con Docker
├── docker-compose.prod.yml             ← Entorno de producción con Docker
├── render.yaml                         ← Despliegue del backend en Render
├── .env.ejemplo                        ← Plantilla de variables para Docker Compose
├── COMO_CORRER_EL_SISTEMA.txt          ← Guía paso a paso de instalación y arranque
└── README.md                           ← Este archivo
```

---

## Módulos del sistema

### 1. Dashboard

Pantalla principal con indicadores clave del hato, calculados por el módulo de analítica (`/api/analytics`):

- Total de animales activos, distribuidos por finca y por raza
- Animales en tratamiento / cuarentena, próximos partos (30 días) y alertas activas y críticas
- **Indicadores reproductivos:**
  - Tasa de preñez = gestaciones en curso / hembras activas
  - Tasa de natalidad = nacimientos (desde el 1 de enero del año anterior) / hembras activas
  - Mortalidad de crías = animales muertos nacidos en los últimos 365 días / nacimientos
  - Días abiertos = promedio de días desde el último parto
- **Indicadores clínicos:**
  - Animales tratados este año = animales con algún tratamiento iniciado en el año / animales activos
  - Recurrencia de patologías = animales con la misma enfermedad diagnosticada 2 o más veces / animales con diagnóstico
- Alertas recientes y partos próximos
- Cada indicador tiene un botón de información (ⓘ) que despliega qué mide, la fórmula y el cálculo con los valores actuales (p. ej. "9 ÷ 19 × 100 = 47.4 %")

### 2. Fincas

- Listado de fincas con contadores (animales, lotes, hectáreas)
- Panel de detalle: información general (superficie, dirección, coordenadas GPS), lotes de la finca y lista completa de animales con búsqueda y filtros
- Crear, editar y eliminar fincas (solo administrador). No se puede eliminar una finca con animales asociados

### 3. Lotes

Subdivisión de cada finca en agrupaciones de animales (potreros de manejo):

- CRUD de lotes, con nombre único dentro de cada finca
- Filtro por finca y contador de animales por lote
- No se puede eliminar un lote con animales asignados

### 4. Animales

- Tabla paginada con búsqueda y filtros (finca, lote, raza, sexo, estado)
- Ficha detallada de cada animal: datos básicos, genealogía, peso, estado sanitario
- Identificación generalizada: arete, hierro/número, microchip u otro, con número único
- Selector de raza con patrón "buscar o crear": si la raza no existe en el catálogo, se registra ahí mismo desde el formulario
- **Crías por registrar**: las crías vivas de un parto registrado en Reproducción aparecen arriba del listado hasta darlas de alta; "Registrar" abre el formulario ya rellenado (madre, fecha y peso al nacer, sexo, lote, raza y propósito de la madre) y el animal queda enlazado a su nacimiento
- Exportación del inventario a Excel
- Registro sin conexión: el animal queda en el dispositivo y el listado muestra un aviso con los animales pendientes de subir

### 5. Historial Médico

- Listado de consultas con búsqueda por animal, fecha o diagnóstico
- Registro completo por consulta: anamnesis, examen físico (temperatura, frecuencia cardíaca/respiratoria, tiempo de llenado capilar, movimientos ruminales, condición corporal), estado reproductivo, diagnóstico y plan
- Enfermedades diagnosticadas y sus tratamientos, cada uno con su propio detalle diagnóstico (diagnóstico, pronóstico, síntomas, pruebas)
- Información epidemiológica del entorno (vectores presentes: garrapatas, mosquitos, murciélagos, moscas)
- Desparasitaciones, con auto-sincronización con el calendario de vacunación
- **Vitaminas** aplicadas al animal (producto, fecha, dosis y vía)
- **Pruebas complementarias** (hematología, coprología, bioquímica, uroanálisis, citología, histopatología, otras). El resultado puede dejarse en blanco y registrarse después desde el detalle de la consulta. Las pruebas sin resultado aparecen como "Pendiente". Desde el detalle también se pueden agregar pruebas nuevas a una consulta ya registrada
- Auto-prefill: al seleccionar un animal en una nueva consulta, se pre-cargan los datos de su última desparasitación y sus enfermedades activas
- Generación de PDF por consulta individual o por historial completo de un animal

### 6. Vacunación y desparasitación

- Calendarios de vacunación con intervalo de reaplicación, edad mínima y sexo al que aplican
- Registro de aplicaciones con fecha, dosis, vía y lote de producto; próxima fecha calculada automáticamente
- Selector de medicamento con patrón "buscar o crear"
- Indicador de cumplimiento del calendario por lote

### 7. Reproducción

- Eventos reproductivos: detección de celo, monta natural, inseminación artificial, diagnóstico de gestación, parto, aborto
- **Seguimiento del ciclo completo**:
  1. Una inseminación (desde Inseminación o Reproducción) o una monta queda en la pestaña **Por confirmar**
  2. A los **21 días** llega una alerta "¿Quedó preñada?"; al responder *Sí* se abre la gestación con el parto estimado a 283 días, y al responder *No* la hembra queda libre para otro servicio
  3. Al cumplirse la fecha de parto llega una alerta "¿Cómo salió el parto?" para registrar parto (con los datos de la cría), aborto o pérdida, lo que cierra la gestación y deja el evento en el historial. Si la cría nació viva, queda en Animales → **Crías por registrar** hasta que se le asigne su identificación
  4. Las mismas respuestas se pueden dar desde Reproducción; un diagnóstico de gestación con resultado o un parto/aborto registrados con "Nuevo evento" también actualizan el seguimiento
- Partos próximos clasificados por urgencia (urgente / próximo / futuro); los que ya pasaron su fecha sin registrar aparecen arriba como "Fecha cumplida"
- El historial muestra el resultado de cada parto o pérdida (p. ej. "Parto — cría hembra, muerta al nacer, parto distócico, 28 kg" o "Pérdida de la gestación"), resaltando en rojo las pérdidas
- La mortalidad de crías (dashboard e indicadores) cuenta tanto los animales que murieron como las crías que nacieron muertas o murieron en sus primeras 24 h según el registro del parto
- Indicadores: tasa de preñez, natalidad, aborto, mortalidad de crías, repetición de celo, intervalo entre partos y efectividad de inseminación artificial por semental

### 8. Inseminación

- Catálogo de sementales con datos genéticos y de origen
- Inventario de dosis de semen, con descuento automático al registrar una inseminación
- Registro de inseminaciones con clasificación, técnica de deposición y factores biológicos (patologías, balance energético, temperatura uterina, manejo del hato)
- Alertas de inventario de semen bajo

### 9. Geolocalización

Rastreo GPS de animales, listo para operar con collares satelitales reales (p. ej. Digitanimal SAT) además de datos simulados:

- **Dispositivos GPS**: catálogo de collares, su animal asignado, nivel de batería y estado de conexión
- **Mapa en vivo**: posición actual de todos los animales sobre OpenStreetMap, con el área de cada finca delimitada según sus hectáreas registradas
- **Historial de movilidad**: distancia recorrida, tiempo de actividad y velocidad promedio de un animal
- **Filtros por finca y por lote**
- **Importación de reportes**: los collares reportan a la plataforma del fabricante, desde donde se exporta un archivo (CSV o Excel) que se sube en la ficha del dispositivo; el sistema detecta automáticamente las columnas de fecha, latitud, longitud y velocidad
- Endpoint de ingesta directa (`POST /api/geolocalizacion/dispositivos/:apiKey/ubicacion`) para dispositivos que puedan integrarse en tiempo real

### 10. Alertas

- Tarjetas de resumen por prioridad (crítica, alta, media, baja), usables como filtros
- Tipos de alerta: vacuna vencida/próxima, parto próximo, días abiertos excedidos, enfermedad activa sin resolución, intervalo reproductivo prolongado, ausencia de control veterinario, control de peso pendiente, inventario de semen bajo, además de reglas personalizadas
- Evaluación periódica automática (`node-cron`) y evaluación manual bajo demanda
- Al vencer la duración de un tratamiento, pregunta si el animal mejoró y cierra el tratamiento con la respuesta
- A los 21 días de una inseminación o monta pregunta si la hembra quedó preñada, y al cumplirse la fecha de parto pregunta cómo salió; ambas se responden desde la misma alerta
- Cada regla puede notificar a usuarios específicos o, por defecto, a administradores y veterinarios

### 11. Reportes

- Inventario, estado sanitario, vacunación y reproducción en PDF o Excel, filtrables por año, finca y estado
- Historial médico completo de un animal, o el detalle de una consulta puntual

### 12. Seguridad

- CRUD de usuarios y autoservicio de perfil (cada usuario edita sus propios datos y contraseña)
- Roles con privilegios configurables: el catálogo de privilegios es la fuente de verdad que verifica cada ruta del backend
- Bloqueo temporal de cuenta tras varios intentos fallidos de inicio de sesión
- Tokens JWT de corta duración con renovación automática vía refresh token

### 13. Auditoría

- Registro automático de operaciones críticas (crear, actualizar, eliminar, exportar) y de intentos de inicio de sesión
- Datos almacenados: usuario, acción, módulo, entidad afectada, IP, agente de usuario y resultado
- Consulta filtrada por usuario, tipo de acción, módulo o rango de fechas

### Plan Sanitario (oculto)

El plan sanitario anual por finca está implementado en el backend (`/api/plan-sanitario`) y en la base de datos, pero **no se muestra en la interfaz**: se quitó del menú, de las rutas y del dashboard. Para volver a mostrarlo basta con restaurar su entrada en `BarraLateral.tsx`, su ruta en `App.tsx` y la tarjeta en `PaginaDashboard.tsx`.

---

## Uso sin conexión

El sistema está pensado para el trabajo de campo, donde la señal es intermitente.

- **Precarga al iniciar sesión.** Apenas el usuario entra, se descargan en segundo plano los datos de todas las pantallas (listados, fichas de cada animal y finca, catálogos) y se guardan en el dispositivo (IndexedDB). Aparece el aviso "Listo: la app ya se puede usar sin conexión." La precarga se repite al abrir la app y al volver la señal, como máximo cada 30 minutos.
- **Consultas sin señal.** Si no hay conexión, cada pantalla muestra los últimos datos guardados. Las búsquedas y filtros de animales se resuelven en el propio dispositivo.
- **Registros sin señal.** Crear, editar o eliminar sin conexión guarda la operación en una cola local. El indicador de la barra superior muestra cuántos registros están pendientes. Al volver la señal se suben solos y las pantallas se actualizan.
- **Conexión lenta.** Si un guardado tarda más de 2,5 s aparece un aviso. A los 8 s se considera perdida la conexión y el registro se guarda en el dispositivo.
- **Privacidad.** Al cerrar sesión se borran del dispositivo los datos guardados.
- **Limitaciones.** Los reportes PDF/Excel y el historial de movilidad GPS requieren conexión. Las pantallas con filtros distintos a los iniciales, salvo animales, solo están disponibles sin señal si ya se consultaron con conexión.

---

## Base de datos

| Tabla | Descripción |
|---|---|
| `finca` / `lote` / `potrero` | Propiedades ganaderas y sus subdivisiones |
| `raza` | Catálogo de razas bovinas |
| `medicamento` | Catálogo de fármacos, vacunas y vitaminas |
| `animal` | Hato bovino completo |
| `registro_medico` | Consultas veterinarias |
| `detalle_diagnostico` | Enfermedades diagnosticadas por consulta |
| `tratamiento` | Tratamientos prescritos por consulta |
| `informacion_epidemiologica` | Entorno y vectores relevados en una consulta |
| `prueba_complementaria` | Exámenes de laboratorio de una consulta (resultado opcional) |
| `registro_vitaminas` | Vitaminas aplicadas a cada animal |
| `programa_desparasitacion` | Desparasitaciones registradas |
| `calendario_vacunacion` / `registro_vacunacion` | Programas de vacunación y sus aplicaciones |
| `plan_sanitario` / `actividad_plan_sanitario` | Plan sanitario anual por finca (oculto en la interfaz) |
| `evento_reproductivo` | Celos, montas, inseminaciones, diagnósticos de gestación, partos |
| `inseminacion_artificial` / `diagnostico_gestacion` | Datos específicos de esos eventos |
| `gestacion` / `nacimiento` | Gestaciones y partos con datos de la cría |
| `semental` / `inventario_semen` | Toros y dosis de semen disponibles |
| `dispositivo_gps` / `registro_ubicacion` | Collares GPS y posiciones históricas |
| `rol` / `privilegio` / `rol_privilegio` | Roles del sistema y sus privilegios |
| `usuario` | Cuentas de acceso al sistema |
| `regla_alerta` / `regla_usuario` | Reglas del motor de alertas y sus destinatarios |
| `notificacion` | Alertas generadas por el motor de reglas |
| `registro_auditoria` | Log de operaciones del sistema |

---

## Variables de entorno

Para correr el sistema sin Docker se necesitan dos archivos: `backend/.env` y `frontend/.env`. Cada carpeta tiene su plantilla (`.env.ejemplo`). El `.env.ejemplo` de la raíz es solo para Docker Compose.

### `backend/.env`

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL: `postgresql://usuario:contraseña@host:puerto/base_datos` |
| `DIRECT_URL` | Sí | Conexión directa para `prisma migrate`. En local, igual que `DATABASE_URL`. Solo cambia si `DATABASE_URL` pasa por un pooler (p. ej. Neon) |
| `JWT_SECRETO` | Sí | Clave de los tokens de acceso (mínimo 32 caracteres, aleatoria) |
| `JWT_SECRETO_REFRESH` | Sí | Clave de los refresh tokens (mínimo 32 caracteres, distinta de la anterior) |
| `PUERTO` | No (3001) | Puerto de la API. En Render se usa `PORT`, que tiene prioridad |
| `NODE_ENV` | No (`development`) | `development`, `production` o `test` |
| `URL_FRONTEND` | No (`http://localhost:5173`) | Origen permitido por CORS |
| `JWT_EXPIRACION` / `JWT_EXPIRACION_REFRESH` | No (`15m` / `7d`) | Duración de los tokens |
| `EMAIL_SERVIDOR`, `EMAIL_PUERTO`, `EMAIL_USUARIO`, `EMAIL_CLAVE`, `EMAIL_REMITENTE` | No | Envío de correos. Sin `EMAIL_USUARIO` no se envían |

Ejemplo mínimo:

```env
DATABASE_URL="postgresql://postgres:CONTRASEÑA@localhost:5432/campolargo"
DIRECT_URL="postgresql://postgres:CONTRASEÑA@localhost:5432/campolargo"
PUERTO=3001
JWT_SECRETO=clave_aleatoria_de_minimo_32_caracteres
JWT_SECRETO_REFRESH=otra_clave_aleatoria_distinta_de_32_caracteres
NODE_ENV=development
```

> **Cómo generar claves JWT seguras:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

Si falta una variable obligatoria o un secreto JWT tiene menos de 32 caracteres, el backend no arranca e indica qué variable falta.

### `frontend/.env`

```env
VITE_API_URL=http://localhost:3001/api
```

> Las variables del frontend DEBEN comenzar con `VITE_` para que Vite las exponga al código del navegador.

**Nunca subir los archivos `.env` al repositorio.** Están incluidos en `.gitignore`.

---

## Instalación y puesta en marcha

### Requisitos previos

- Node.js v24.14 o superior (`node --version`)
- PostgreSQL corriendo localmente en el puerto 5432
- Base de datos `campolargo` creada:
  ```sql
  CREATE DATABASE campolargo;
  ```

### Paso 1 — Crear los archivos `.env`

Copiar `backend/.env.ejemplo` como `backend/.env` y `frontend/.env.ejemplo` como `frontend/.env`, y completar los valores (ver [Variables de entorno](#variables-de-entorno)).

### Paso 2 — Instalar dependencias

```powershell
# Desde la raíz del proyecto (instala backend y frontend)
npm install --legacy-peer-deps

# Generar el cliente de Prisma
cd backend
npx prisma generate
```

### Paso 3 — Crear las tablas

```powershell
cd backend
npx prisma migrate deploy
```

Aplica todas las migraciones del repositorio sobre la base de datos vacía.

> No usar `prisma migrate dev --name ...` para instalar: crea una migración nueva en vez de aplicar las existentes.

### Paso 4 — Cargar datos iniciales

```powershell
npm run db:seed
```

Carga las 3 fincas con sus lotes y potreros, razas, usuarios de prueba, medicamentos, calendarios de vacunación, sementales, animales de muestra, historiales médicos, vitaminas, eventos reproductivos, reglas de alerta, notificaciones y dispositivos GPS de prueba. Usa `upsert`, así que no duplica datos si se ejecuta de nuevo.

Opcional: `npm run db:datos-indicadores` agrega datos para ver los indicadores del dashboard con valores realistas (ver [Datos de prueba](#datos-de-prueba)).

### Paso 5 — Iniciar el sistema

```powershell
# Terminal 1 — backend
cd backend
npm run dev
# → Servidor iniciado en el puerto 3001

# Terminal 2 — frontend
cd frontend
npm run dev
# → Local: http://localhost:5173
```

### Paso 6 — Abrir en el navegador

```
http://localhost:5173
```

---

## Datos de prueba

| Comando (en `backend/`) | Qué hace |
|---|---|
| `npm run db:seed` | Datos iniciales del sistema (no borra nada; usa `upsert`) |
| `npm run db:datos-indicadores` | Agrega gestaciones en curso, partos con sus crías (una muerta), y consultas con diagnósticos repetidos y tratamientos de este año, para que los indicadores del dashboard muestren valores realistas. Si se vuelve a ejecutar, reemplaza la tanda anterior sin duplicar |
| `npm run db:datos-indicadores -- --limpiar` | Elimina solo los datos creados por el comando anterior |
| `npm run db:reset` | **Borra toda la base de datos**, vuelve a aplicar las migraciones y ejecuta el seed |

Los datos de `db:datos-indicadores` se calculan respecto a la fecha actual, así que los valores varían con el tiempo. Volver a ejecutarlo los ajusta.

---

## Respaldo y restauración de la base de datos

Las herramientas `pg_dump`, `pg_restore`, `createdb` y `dropdb` vienen con PostgreSQL. En Windows están en `C:\Program Files\PostgreSQL\<versión>\bin`.

### Crear un respaldo

```powershell
pg_dump -U postgres -h localhost -Fc -d campolargo -f respaldo_campolargo_AAAA-MM-DD.dump
```

`-Fc` genera un archivo comprimido que incluye esquema, datos y el historial de migraciones de Prisma.

### Restaurar en una base de datos nueva

```powershell
createdb -U postgres -h localhost campolargo
pg_restore -U postgres -h localhost --no-owner -d campolargo respaldo_campolargo_AAAA-MM-DD.dump
```

### Reemplazar una base de datos existente

```powershell
# ⚠ Borra la base de datos actual: hacer antes un respaldo
dropdb -U postgres -h localhost campolargo
createdb -U postgres -h localhost campolargo
pg_restore -U postgres -h localhost --no-owner -d campolargo respaldo_campolargo_AAAA-MM-DD.dump
```

Después de restaurar, verificar que las migraciones estén al día:

```powershell
cd backend
npx prisma migrate status
```

Si el respaldo es anterior a alguna migración del repositorio, aplicarlas con `npx prisma migrate deploy`.

### Con Docker

```powershell
docker exec campolargo-db pg_dump -U campolargo_admin -Fc -d campolargo > respaldo.dump
docker exec -i campolargo-db pg_restore -U campolargo_admin --no-owner -d campolargo < respaldo.dump
```

---

## Scripts disponibles

| Dónde | Comando | Descripción |
|---|---|---|
| raíz | `npm run dev:backend` / `npm run dev:frontend` | Inicia cada parte en modo desarrollo |
| raíz | `npm run construir` | Compila backend y frontend para producción |
| raíz | `npm run docker:dev` / `npm run docker:prod` | Levanta el sistema completo con Docker |
| raíz | `npm run docker:detener` / `npm run docker:limpiar` | Detiene los contenedores (limpiar también borra los volúmenes) |
| backend | `npm run dev` | API con recarga automática |
| backend | `npm run db:migrar` | Crea y aplica una migración nueva (desarrollo) |
| backend | `npm run db:migrar:prod` | Aplica las migraciones existentes (`prisma migrate deploy`) |
| backend | `npm run db:seed` / `db:datos-indicadores` / `db:reset` | Ver [Datos de prueba](#datos-de-prueba) |
| backend | `npm run db:studio` | Explorador visual de la base de datos (Prisma Studio) |
| frontend | `npm run dev` | Interfaz en modo desarrollo |
| frontend | `npm run construir` / `npm run previsualizar` | Compila la interfaz y la sirve localmente (con service worker, para probar la PWA) |

---

## Despliegue

- **Backend:** `render.yaml` describe el servicio web en Render (imagen Docker de `backend/Dockerfile`). Las variables marcadas `sync: false` (`DATABASE_URL`, `DIRECT_URL`, `URL_FRONTEND`, correo) se completan en el panel de Render. Los secretos JWT se generan solos.
- **Base de datos:** PostgreSQL gestionado (p. ej. Neon). `DATABASE_URL` usa la conexión con pooler y `DIRECT_URL` la conexión directa. Las migraciones se aplican con `npm run db:migrar:prod`.
- **Frontend:** se compila con `npm run construir` (carpeta `frontend/dist`) y se publica en un hosting estático (p. ej. Vercel), con `VITE_API_URL` apuntando a la API desplegada.
- **Docker:** `docker-compose.prod.yml` levanta base de datos, backend y frontend en un mismo servidor, usando el `.env` de la raíz (plantilla: `.env.ejemplo`).

La PWA y el uso sin conexión requieren servir el frontend por HTTPS (o desde `localhost`).

---

## Credenciales de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@campolargo.com | Campolargo2026! |
| Veterinario | veterinario@campolargo.com | Campolargo2026! |
| Técnico | tecnico@campolargo.com | Campolargo2026! |

---

## API REST

La API está disponible en `http://localhost:3001/api`.

### Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/iniciar-sesion` | Iniciar sesión |
| POST | `/auth/renovar-token` | Renovar token JWT |
| POST | `/auth/cerrar-sesion` | Cerrar sesión |
| GET | `/auth/perfil` | Perfil del usuario autenticado |
| GET / PATCH | `/usuarios/mi-perfil` | Ver / editar los datos propios |
| GET | `/fincas` | Listar fincas |
| GET | `/fincas/:id` | Detalle de una finca |
| GET | `/fincas/:id/animales` | Animales de una finca (con filtros) |
| GET | `/lotes?fincaId=` | Listar lotes (opcionalmente por finca) |
| GET | `/animales` | Listar animales (paginado, con filtros) |
| GET | `/animales/:id` | Detalle de un animal |
| GET | `/animales/razas` | Catálogo de razas |
| GET | `/animales/crias-por-registrar` | Crías vivas de partos registrados que aún no son animales (`POST /animales` con `nacimientoId` las enlaza) |
| GET | `/historial-medico` | Listar consultas veterinarias |
| POST | `/historial-medico` | Registrar consulta (con enfermedades, tratamientos, desparasitaciones, vitaminas y pruebas complementarias) |
| GET | `/historial-medico/prefill?animalId=` | Pre-cargar última desparasitación y enfermedades activas |
| POST | `/historial-medico/:id/pruebas-complementarias` | Agregar una prueba complementaria a una consulta ya registrada |
| PATCH | `/historial-medico/pruebas-complementarias/:id` | Registrar o corregir el resultado de una prueba complementaria |
| PATCH | `/historial-medico/tratamientos/:id/finalizar` | Cerrar un tratamiento indicando si el animal mejoró |
| GET | `/vacunacion/calendarios` | Listar calendarios de vacunación |
| GET / POST | `/vacunacion/medicamentos` | Catálogo de medicamentos |
| GET | `/vacunacion` | Listar registros de vacunación |
| PATCH / DELETE | `/vacunacion/:id` | Editar / eliminar un registro de vacunación |
| GET | `/vacunacion/cumplimiento-por-lote` | Cumplimiento del calendario por lote |
| GET | `/reproduccion/partos-proximos` | Gestaciones con parto próximo (`incluirVencidos=true` añade las de fecha cumplida) |
| GET | `/reproduccion/servicios-por-confirmar` | Inseminaciones y montas pendientes de confirmar preñez |
| PATCH | `/reproduccion/servicios/:id/confirmar` | Registrar si la hembra quedó preñada (abre la gestación si es positivo) |
| GET | `/reproduccion/gestaciones` | Gestaciones activas |
| PATCH | `/reproduccion/gestaciones/:id/cerrar` | Cerrar una gestación (parto/aborto/pérdida) |
| GET | `/reproduccion/indicadores` | Indicadores reproductivos del período |
| GET | `/reproduccion/efectividad-inseminacion` | Efectividad de la inseminación por semental |
| GET | `/inseminacion/sementales` | Catálogo de sementales |
| GET | `/inseminacion/inventario` | Inventario de dosis de semen |
| GET | `/geolocalizacion/dispositivos` | Catálogo de dispositivos GPS |
| GET | `/geolocalizacion/animales?fincaId=&loteId=` | Posiciones actuales de los animales |
| GET | `/geolocalizacion/movilidad/:animalId` | Distancia, tiempo de actividad y velocidad promedio |
| POST | `/geolocalizacion/dispositivos/:id/importar` | Importar reporte de posiciones (CSV/XLS) |
| POST | `/geolocalizacion/dispositivos/:apiKey/ubicacion` | Ingesta de posición en tiempo real desde un dispositivo |
| GET | `/alertas` | Reglas de alerta configuradas |
| GET | `/alertas/resumen` | Resumen de alertas por prioridad del usuario autenticado |
| POST | `/alertas/evaluar` | Disparo manual de evaluación de todas las reglas activas |
| GET | `/notificaciones` | Notificaciones del usuario autenticado |
| GET | `/reportes/historial-animal/:animalId` | PDF con el historial médico de un animal |
| GET | `/reportes/consulta/:consultaId` | PDF con el detalle de una consulta |
| GET | `/analytics/dashboard` | Resumen ejecutivo e indicadores reproductivos |
| GET | `/analytics/porcentaje-tratados?desde=&hasta=` | Porcentaje de animales tratados en un período |
| GET | `/analytics/recurrencia-patologias` | Tasa de recurrencia de patologías |
| GET | `/plan-sanitario` | Plan sanitario anual por finca (oculto en la interfaz) |
| GET | `/auditoria` | Registros de auditoría |
| GET | `/usuarios` | Listar usuarios (solo admin) |
| GET | `/roles` | Listar roles y sus privilegios (solo admin) |
| GET | `/health` | Estado del servidor (fuera del prefijo `/api`) |

### Formato de respuesta

```json
{
  "exito": true,
  "datos": { ... },
  "mensaje": "Operación exitosa"
}
```

Los listados paginados agregan `meta: { total, pagina, porPagina, totalPaginas }`. Los errores devuelven:

```json
{
  "exito": false,
  "mensaje": "Descripción del error",
  "errores": [{ "campo": "nombre", "mensaje": "El campo es requerido" }]
}
```

La API limita a 5000 peticiones cada 15 minutos por IP (10 intentos fallidos de inicio de sesión).

---

## Roles y permisos

| Acción | Administrador | Veterinario | Técnico |
|---|---|---|---|
| Ver fincas, animales, historial | ✅ | ✅ | ✅ |
| Crear / editar animales | ✅ | ✅ | ❌ |
| Registrar consultas médicas y resultados de pruebas | ✅ | ✅ | ❌ |
| Editar / eliminar vacunaciones | ✅ | ✅ | ❌ |
| Registrar eventos reproductivos | ✅ | ✅ | ❌ |
| Gestionar dispositivos GPS | ✅ | ✅ | ❌ |
| Crear / eliminar fincas | ✅ | ❌ | ❌ |
| Gestionar usuarios y roles | ✅ | ❌ | ❌ |
| Ver auditoría | ✅ | ❌ | ❌ |
| Descargar reportes | ✅ | ✅ | ✅ |

Cada privilegio individual (p. ej. `animales.crear`, `historial_medico.crear`) se asigna a un rol desde el módulo de Seguridad. La tabla resume cómo están configurados los tres roles por defecto, no una restricción fija del código.

---

## Reportes en PDF y Excel

El módulo de reportes genera documentos con PDFKit (PDF) y ExcelJS (Excel):

- **Historial Médico por Animal** (`GET /api/reportes/historial-animal/:animalId`): datos del animal y todas sus consultas con diagnósticos, tratamientos y desparasitaciones, en orden cronológico.
- **Reporte de Consulta** (`GET /api/reportes/consulta/:consultaId`): detalle completo de una consulta, con examen físico, diagnóstico y plan de tratamiento.
- **Inventario, sanitario, vacunación y reproductivo** (`GET /api/reportes/{inventario|sanitario|vacunacion|reproductivo}`): reportes agregados filtrables por año, finca y estado, en PDF o Excel según el parámetro `formato`.

Los documentos se descargan directamente en el navegador y cada exportación queda registrada en la auditoría.

---

*Desarrollado por María Fernanda Suárez Delfin — UCAB Ingeniería en Informática — 2026*
