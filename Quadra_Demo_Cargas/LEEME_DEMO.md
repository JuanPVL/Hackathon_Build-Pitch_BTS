# Quadra: archivos para la demo de carga y validación

Son los datos oficiales ficticios del reto del repositorio. No son estados financieros reales de una empresa. Se conservaron sin alterar los importes de las 36 cargas originales; los 3 casos de formato están identificados como alteraciones deliberadas.

## Qué contiene

- 01_V1_con_errores: 12 CSV, presupuesto y balance de GT1, GT2, MX1, MX2, US1 y US2. Escenario PPTO_V1. Los 14 defectos sembrados pueden generar múltiples hallazgos.
- 02_V1_corregida: 12 CSV corregidos para las mismas empresas y escenario PPTO_V1.
- 03_V2_limpia: 12 CSV del escenario PPTO_V2, con cambios de negocio para comparar con V1.
- 04_rechazos_de_formato: 3 CSV alterados para probar rechazo antes de validar: encabezado incorrecto, monto con comas de miles y monto vacío.
- 05_referencia_no_subir: catálogos, tasas y resultados de referencia. Tienen otro esquema: NO se cargan en el cargador de presupuesto/balance.
- Excel: 3 libros con índice y una hoja por empresa/estado financiero. Los datos empiezan en fila 1 con los 14 encabezados originales.
- MANIFIESTO_CARGAS.csv: identifica cada archivo, empresa, escenario, estado financiero, filas, cuentas, periodos y SHA-256 del CSV original.

## Antes de la demo

El backend revisado acepta CSV mediante POST /api/loads/upload. No acepta archivos .xlsx. Usa los CSV de las carpetas 01, 02 o 03. Los libros Excel sirven para revisión/edición; para cargar una hoja editada, exportarla individualmente como CSV UTF-8 delimitado por comas, conservando encabezados y códigos de cuenta como texto.

No cargues el manifiesto, los catálogos, las tasas ni el libro Excel mediante ese endpoint.

En el formulario selecciona empresa y escenario que figuran dentro del archivo. Estado financiero: PYG para presupuesto_*.csv y BALANCE para balance_*.csv. Los CSV usan coma como separador y punto decimal, sin separador de miles. Límite de la API revisada: 5 MB por archivo.

## Recorrido sugerido

1. Inicia sesión con la cuenta de prueba de controller que ya tienes. No se incluyen contraseñas en este paquete.
2. Abre PPTO_V1 y sube presupuesto_US1_V1.csv de 01_V1_con_errores: permite mostrar monto multiplicado por 1,000 y venta duplicada. Para evaluar todas las reglas globales, cargar los 12 archivos del conjunto, no solo una empresa.
3. Ejecuta validación y muestra los hallazgos. Actualizar/consultar hallazgos no equivale a ejecutar el validador.
4. Para casos visuales adicionales: presupuesto_GT1_V1.csv muestra venta negativa; balance_GT1_V1.csv muestra descuadre; presupuesto_MX1_V1.csv muestra monedas erróneas; presupuesto_MX2_V1.csv contiene cuenta sin mapeo; presupuesto_GT2_V1.csv contiene periodo faltante y socio IC ausente.
5. Sube los 12 archivos de 02_V1_corregida al MISMO escenario PPTO_V1 como versiones nuevas, valida y aprueba los que procedan. No mezcles archivos corregidos/incompletos como si ya fueran un conjunto aprobado.
6. Para V2 utiliza los 12 CSV de 03_V2_limpia en PPTO_V2, valida, aprueba y ejecuta consolidación. El origen limpio no implica aprobación automática.
7. Compara corridas concretas V1/V2. Un bridge guardado de corridas anteriores no representa automáticamente las nuevas.
8. Usa los tres archivos de 04 para mostrar errores de formato. Deben rechazarse al importar; no deben confundirse con hallazgos contables.

El sistema puede tener cargas anteriores, escenarios cerrados o tasas ya corregidas. La subida normalmente crea versiones nuevas y la aprobación debe respetar la versión vigente. Un escenario cerrado puede rechazar la carga aunque el CSV sea correcto. El conteo exacto de hallazgos depende del conjunto vigente, tasas y reglas implementadas; la hoja de respuestas describe el conjunto original del reto, no garantiza el estado actual del servidor.

Para reproducir íntegramente el error de tasa V1 se necesita además la tasa original con error; ese archivo está en referencia y NO se sube como carga de presupuesto. El conjunto V1 corregido presupone las tasas corregidas. No cambies tasas de la demo sin el flujo y permisos correspondientes.

## Empresas y monedas

GT1 Alfa Guatemala y GT2 Beta Guatemala: GTQ. MX1 Alfa México y MX2 Gamma México: MXN. US1 Alfa USA y US2 Delta Holding USA: USD. Los archivos incluyen varias cuentas de ingresos, costos, gastos, activos, pasivos, patrimonio y operaciones intercompany, según el plan local de cada país.

## Integridad

Los CSV de 01, 02 y 03 son copias exactas de los archivos fuente. Los Excel convierten únicamente monto, monto_tx, volumen y precio a celdas numéricas; los códigos de cuenta, periodos y documentos permanecen como texto. No se agregaron totales dentro de las hojas de carga, para no introducir registros adicionales.

Crear este paquete no subió archivos ni cambió datos en Supabase.
