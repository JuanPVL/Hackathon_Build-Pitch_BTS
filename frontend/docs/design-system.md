# QUADRA · Sistema de diseño (MASTER)

Fuente de verdad para construir la interfaz de QUADRA en React. Manda el kit de marca
(`QUADRA_kit_marca/QUADRA_Manual_Identidad_Visual.pdf`); las skills `ui-ux-pro-max`,
`apple-design` y `design-taste-frontend` aportan reglas de UX, accesibilidad y criterio,
pero nunca cambian colores, logos ni tipografías del kit.

Mockup de referencia: `quadra-mockup.pen` (pen.dev) y `mockup-export/*.png`.

## 1. Tesis y elemento distintivo

- **Tesis:** cada cifra del grupo cuadra sola y se explica sola.
- **Elemento distintivo (uno solo):** la ecuación **Agregado − Eliminaciones IC = Consolidado**
  sobre navy, con el resultado en una tarjeta crema. Es el "cuadro que se cierra" del logotipo
  llevado a los números. No se repite en otra forma en la misma pantalla.
- **Apoyo de marca:** el check naranja marca un paso cerrado (barra lateral, cinta "Cierre del
  grupo") y la conciliación (chip "CONCILIADO" junto a la llave del documento).
- **Se evitó:** número gigante + etiqueta + degradado (cliché de plantilla), tarjetas para todo,
  marcadores 01/02/03 sin secuencia real. Los pasos 1–5 sí son una secuencia (validar → explicar).

## 2. Tokens de color (proporción 60 / 30 / 10)

| Token | Hex | Uso | Contraste |
|---|---|---|---|
| `navy` | #13203C | Barra lateral, héroe, botón primario, texto principal | 14.70:1 sobre crema |
| `navy-2` | #1B2B4D | Superficies sobre navy (ítem activo, chips) | — |
| `cream` | #F6F4EF | Fondo de la app, tarjeta del resultado | — |
| `white` | #FFFFFF | Tarjetas y tablas | — |
| `bg-light` | #E8EDF4 | Filas IC, controles segmentados | 13.74:1 con navy |
| `orange` | #F0905A | Check, operadores, acento sobre navy (nunca texto sobre claro) | 6.80:1 sobre navy |
| `orange-text` | #B4511F | Etiquetas en mayúsculas y montos negativos sobre fondo claro | ≈5:1 sobre blanco |
| `blue` | #1F5FBF | Cifras sobre claro | 5.54:1 sobre crema |
| `blue-light` | #7FA6E6 | Cifras sobre navy (el azul no se usa sobre navy) | 6.54:1 sobre navy |
| `gray-blue` | #BECADC | Texto secundario sobre navy | 9.75:1 |
| `gray-text` | #5A6680 | Texto secundario sobre claro | 5.24:1 sobre crema |
| `line` | #DDE3EC | Divisores | — |
| `ok` / `ok-bg` | #1E7A4C / #E3F2EA | Estado "cuadra", aprobado | — |
| `err` / `err-bg` | #B42318 / #FBE6E4 | Bloqueante, cuarentena, EVA negativo | — |
| `warn-bg` | #FCEBDD | Advertencias (con texto `orange-text`) | — |

> `orange-text` (#B4511F) es la versión "naranja oscuro en fondos claros" que pide el manual
> (p. 13), pero no figura en la paleta oficial: validarla con el dueño de la marca.

## 3. Tipografía

| Rol | Fuente | Tamaños |
|---|---|---|
| H1/H2 de pantalla | Space Grotesk Bold | 40 escritorio · 32 tableta · 28 móvil |
| H3 / títulos de tarjeta | Space Grotesk Bold | 20–26 |
| Cifras | Space Grotesk Bold (azul / azul claro) | 15 en tabla · 26–44 destacadas |
| Cuerpo | Inter Regular/Medium | 14 escritorio · 14–15 móvil, interlineado 1.45 |
| Etiqueta | Inter Bold MAYÚSCULAS, tracking +1.8 | 11–12 |
| Llaves y registros | JetBrains Mono | 11.5–12.5 |

Mínimo absoluto 11 px (solo etiquetas en mayúsculas). En la implementación usar
`font-variant-numeric: tabular-nums` en columnas de montos.

## 4. Navegación adaptativa

| Ancho | Navegación | Contexto (Grupo / Periodo / Versión / Moneda) |
|---|---|---|
| ≥ 1024 | Barra lateral de 248 px agrupada por los 5 pasos, con check naranja por paso cerrado | Barra superior con selectores, estado del linaje y usuario |
| 768–1023 | Riel de 80 px con ícono + etiqueta por paso | Un solo selector "Presupuesto 2027 · V2 · USD" |
| < 768 | Barra inferior de 5 pestañas: Inicio, Validar, Conciliar, Explicar, Más | Chip de contexto + estado en la barra superior navy |

Breakpoints: 390 / 768 / 1024 / 1440. La ubicación de la navegación no cambia entre pantallas.

## 5. Patrones responsive por pantalla

- **Consolidado:** la ecuación pasa de 3 bloques horizontales (escritorio y tableta) a 3 filas
  con operador (móvil). KPIs 4 → 2×2. La tabla P&L pierde la columna "Agregado" en tableta y
  se vuelve lista de cuentas en móvil (cuenta IC en gris con "eliminada −X" en naranja oscuro).
- **Cuenta corriente:** la matriz 6×6 solo en ≥ 1024. En móvil: elegir empresa → saldos por
  socio → par expandido con las dos patas espejo y la llave.
- **Validación:** hallazgos ordenados por impacto en USD; el detalle se abre como panel lateral
  (escritorio) u hoja inferior (móvil).
- **Explicador:** la cascada vertical se vuelve lista de efectos con barra, signo e ícono de
  dirección (no depende solo del color). El texto para el director va debajo.

## 6. Inventario de pantallas (`quadra-mockup.pen`)

Todas con cifras de `hackathon-consolidacion/resultados_referencia/` (V2, salvo donde dice V1).

| Pantalla | Paso | Escritorio 1440 | Tableta 768 | Móvil 390 | Responde |
|---|---|---|---|---|---|
| Consolidado | Inicio | 01 | 05 | 06 | ¿Cuánto vende el grupo sin doble conteo y cómo van los KPIs? |
| Carga y validación (V1) | 1 Validar | 02 | 20 | 14 | ¿Qué está mal y cuánto mueve? |
| Conciliación | 2 Conciliar | 09 | 21 | 15 | ¿Cuadran las dos patas de cada documento? |
| Cuenta corriente 6×6 | 2 Conciliar | 03 | — | 07 | ¿Cuánto nos debemos entre empresas? |
| Documento y linaje | 2 Conciliar | 10 | 22 | 16 | ¿De qué factura y fila sale este saldo? |
| Tasas del grupo | 3 Convertir | 11 | 23 | 17 | ¿Con qué tasa se convirtió cada cifra? |
| Eliminaciones | 4 Eliminar | 12 | 24 | 18 | ¿Qué se eliminó, con qué asiento y a dónde fue la diferencia? |
| Rentabilidad | 5 Explicar | 13 | 25 | 19 | ¿ROIC, ROCE y EVA de dónde salen? |
| Desviaciones V1 → V2 | 5 Explicar | 04 | — | 08 | ¿Por qué cambió el EBIT? |

Los números son los prefijos de `mockup-export/NN-*.png` y de los nombres de las pantallas en el `.pen`.

### Cómo se adaptó cada pantalla

- **Tableta:** riel de 80 px + un selector de contexto; los bloques de dos columnas (tabla + panel)
  se apilan; tablas largas ocultan una columna secundaria (Tipo en Conciliación, Empresas en Tasas);
  la cadena de linaje y las patas espejo pasan a vertical; los KPIs de Rentabilidad se apilan.
- **Móvil:** barra inferior (Tasas y Eliminaciones viven en "Más"); toda tabla se vuelve lista de
  tarjetas: hallazgos con regla, severidad, registro e impacto; pares con llave y chip de resultado;
  tasas como tarjeta por moneda con 4 tipos de tasa; asientos con pata emisora y receptora lado a
  lado; KPIs con fórmula y componentes enlazables; el stepper de la vida del documento es vertical.

## 7. Reglas de interacción y accesibilidad

- Objetivos táctiles ≥ 44 × 44 px en móvil (pestañas de 52 px de alto, chips de 44 px).
- Nada se comunica solo con color: montos con signo, íconos de tendencia, etiquetas de estado.
- Toda cifra es clicable hasta su registro origen en ≤ 4 clics (chevron o ícono de linaje).
- Estados obligatorios por superficie: cargando, vacío, error, éxito, sin permiso.
- Movimiento sutil (150–300 ms), respetar `prefers-reduced-motion`.
- Foco visible en teclado; botones de solo ícono con `aria-label`.
- La IA solo redacta: cada texto generado muestra "Redactado por IA · N de N cifras verificadas".
