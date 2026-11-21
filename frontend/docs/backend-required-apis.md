# APIs pendientes para completar Quadra

Contrato observado: https://quadra-api-348721619034.us-central1.run.app/api/openapi.json.
Base: /api. Este documento propone operaciones ADICIONALES; no afirma que existan.
El cliente ya consume las 19 operaciones publicadas. No sustituirlas ni romper sus respuestas.

## Prioridad de entrega

| Prioridad | Operación faltante propuesta | Qué desbloquea |
| --- | --- | --- |
| P0 | GET /ic-documents/:icDocumentId | Versión/estado vigentes, monto pactado y acciones seguras sin introducir versión manual |
| P0 | GET /scenarios/:scenarioId/rates | Pantalla de tasas y conversión verificable |
| P0 | POST /loads | Subir un presupuesto/balance real desde la aplicación |
| P0 | POST /scenarios/:scenarioId/validate | Ejecutar validación; hoy Actualizar solo consulta hallazgos existentes |
| P0 | POST /loads/:loadId/approve | Aprobar una carga válida o advertencias justificadas antes de consolidar |
| P1 | GET /scenarios | Selector dinámico y capacidades según escenario/usuario |
| P1 | GET /runs/:runId/lineage | Navegar del resultado consolidado a sus filas y asientos de origen |
| P1 | POST /bridges | Generar un bridge para corridas nuevas; hoy solo se consultan bridges ya existentes |
| P1 | POST /validation/findings/:findingId/accept-correction | Aplicar una corrección propuesta de manera controlada |
| P2 | Publicación/versionado de tasas, exports y narrativa | Funciones todavía deshabilitadas o sin contrato |

P0 significa necesario para completar la funcionalidad correspondiente, no que la
demo de lectura actual deba bloquearse: los reportes existentes ya pueden consultarse.
No crear endpoints agregadores de todas las pantallas solo para duplicar lo disponible.

## Reglas comunes de contrato

- Bearer JWT de Supabase en cada endpoint privado, validado en NestJS.
- Identidad y permisos obtenidos del servidor, no de userId/role enviados en el body.
- Drizzle usa transacción con claims verificados y SET LOCAL ROLE authenticated.
- Acceso limitado por empresa y RLS, con pruebas negativas.
- UUID para loadId/runId/bridgeId; icDocumentId es código textual, no UUID.
- Cantidades monetarias y tasas como decimal string (igual que PostgreSQL).
  NULL significa no disponible/no aplicable; nunca reemplazarlo por cero.
- Fechas ISO 8601 UTC; periodos YYYY-MM.
- Los ejemplos siguientes son ilustrativos, no registros ni IDs reales.
- Errores: 400 formato, 401 sesión, 403 permisos, 404 no visible/no existe,
  409 versión/estado/conflicto, 422 validación de negocio.
- Error consistente: {statusCode, code, message, details?, requestId?}.
- Documentar request, response, nullable, enum, security y ejemplos en Swagger
  con DTOs y decoradores. Actualmente OpenAPI no contiene schemas de respuesta.
- Toda mutación debe auditar usuario, fecha y motivo donde aplique.
- No ejecutar seeds, drizzle push ni recrear el esquema existente.
- Las corridas son inmutables. Aprobar/corregir un documento o carga nunca
  reescribe una corrida histórica.

## P0. Documento vigente

GET /ic-documents/:icDocumentId?version=2&scenarioId=PPTO_V2

version opcional: sin ella resolver la versión vigente, sin asumir MAX(version)
si la máquina de estados distingue versión actual. scenarioId desambigua el contexto.
Si la llave no es globalmente única, documentar y exigir el selector necesario.

Respuesta mínima 200:

    {
      "icDocumentId": "IC-F1-2027-12",
      "version": 2,
      "statusCode": "EMITIDA",
      "statusReason": null,
      "icDocumentTypeCode": "VENTA",
      "issuerCompanyId": "GT1",
      "receiverCompanyId": "MX1",
      "transactionCurrencyCode": "USD",
      "transactionAmount": "20000.00",
      "periodCode": "2027-12",
      "receivable": null,
      "payable": null,
      "permissions": {"canAccept": true, "canDispute": true},
      "sourceRefs": []
    }

Los códigos del ejemplo deben sustituirse por los enums reales del catálogo.
receivable/payable son null si faltan; de lo contrario devolver empresa, moneda
funcional, monto funcional, monto USD, tasa, aceptación y referencias de origen
que realmente existen. No inferir estado documental desde icReconciliation.
permissions refleja empresa receptora, rol, estado y versión vigentes.

Ampliación útil: GET /ic-documents/:id/events?version=2 con historial auditable.
No exponer todo audit.changeLog ni datos de otras empresas al pedir eventos.

Mantener POST /ic-documents/:id/accept y /dispute existentes. Validar concurrencia:
si version ya no es vigente o el estado no admite la acción, devolver 409.
No cambiar silenciosamente la versión solicitada por la más reciente.
El frontend podrá reemplazar su campo de versión manual con la recibida aquí,
habilitar botones por permissions y volver a consultar el documento al mutar.

## P0. Tasas reales por periodo

GET /scenarios/:scenarioId/rates?periodCode=2027-12
Opcional runId para consultar una foto SOLO si existen tasas históricas almacenadas
para esa corrida. Si solo hay hash y tasas actuales, declararlo; no fingir snapshot.

    {
      "scenarioId": "PPTO_V2",
      "periodCode": "2027-12",
      "ratesHash": "hash-real-o-null",
      "rows": [
        {
          "currencyCode": "MXN",
          "rateTypeCode": "PRESUPUESTO",
          "periodCode": "2027-12",
          "usdPerUnit": "0.055556"
        }
      ],
      "conversionRules": [],
      "alerts": []
    }

Usar nombres/códigos de groupExchangeRate y catálogos existentes.
Dirección explícita: USD por una unidad funcional. La UI puede invertir para
mostrar unidades por USD, nunca el backend de forma ambigua.
No reducir 12 tasas mensuales a un número anual inventado.
Si no se manda periodo, devolver filas con periodo, sin agregarlas.
alerts debe provenir de hallazgos/reglas ejecutadas; no inventar aprobación.
El frontend actual requiere adaptar RatesTable a periodos con este nuevo contrato;
no activar el adaptador hasta incorporar ese cambio.

## P0. Cargar archivos

POST /loads — multipart/form-data

Campos:
- file: CSV del reto.
- scenarioId: escenario abierto.
- companyId: empresa autorizada.
- financialStatementCode: PYG o BALANCE según catálogo.
- Motivo/metadata solo si el modelo lo exige.

201: {loadId, scenarioId, companyId, financialStatementCode, version,
statusCode, fileName, rowCount, fileHash}.

Leer formatos reales de datos/cargas_* y docs/diccionario-datos.md.
No obligar al usuario a transformar manualmente el CSV a un JSON nuevo.
Validar tamaño máximo documentado, encoding, encabezados, fechas, decimales y
empresa/moneda; indicar número de fila y columna en errores.
No modificar una carga aprobada: crear nueva versión mediante reglas existentes.
Definir detección de reintento por hash/metadata o Idempotency-Key; no duplicar
cargas por doble click/reintentos. Insertar cabecera/líneas atómicamente.
No aprobar una carga por el hecho de recibirla.
Respetar triggers de estado, congelamiento de filas y escenario abierto.
Si guardar el archivo original es necesario, usar almacenamiento privado y
referencia autorizada; no publicar URLs de archivos por defecto.

GET /loads y GET /loads/:id ya existen: reutilizarlos después de subir.
Si se introduce paginación de líneas, hacerlo sin romper la respuesta actual o
publicar GET /loads/:id/lines?page=&pageSize= con total/nextCursor.

## P0. Ejecutar validador

POST /scenarios/:scenarioId/validate
Body mínimo {}. Puede admitir loadIds si hay soporte real para validación parcial.

200: {scenarioId, validationId?, executedAt, totals:{blocking,warnings,info},
loads:[{loadId,statusCode}], findingsCount}.

GET /scenarios/:id/findings sigue siendo consulta y conserva su contrato.
Las reglas deben ejecutarse contra los datos actuales. Los seeds de hallazgos
no equivalen a una ejecución del motor.
Las reglas globales requieren autoridad de grupo; no exponer hallazgos de otras
empresas a un usuario local.
Definir revalidación para no duplicar hallazgos activos; conservar historial
si se utiliza validationId y añadirlo de forma compatible al GET.
No borrar historia ni cambiar automáticamente una carga aprobada.
Si el procesamiento es asíncrono, responder 202 con jobId/statusUrl y publicar
el endpoint de estado, en vez de declarar éxito antes de finalizar.

## P0. Aprobar carga

POST /loads/:loadId/approve
Body: {justification?: string}

200: {loadId, statusCode:"APROBADA", approvedAt, approvedBy, version}.

Exigir approveLoads, respetar escenario abierto y transición válida.
Bloqueantes pendientes: 422, sin aprobar.
Advertencias: justificación obligatoria si las reglas permiten aprobación.
No marcar hallazgos como corregidos solo por justificar una advertencia.
Verificar versión vigente y conflictos de aprobación con otra carga del mismo
escenario/empresa/estado financiero. Conservar triggers y auditoría existentes.
La prueba debe cubrir las advertencias y bloqueantes reales de V1.

POST /scenarios/:id/consolidate ya existe. No crear otro motor ni cambiar su ruta.
Después de aprobar, el usuario puede ejecutar esa acción y consultar la nueva
corrida mediante GET /runs/:id y reportes existentes.

## P1. Escenarios y capacidades

GET /scenarios
200: [{scenarioId,name,year,statusCode,permissions:{canUpload,canValidate,
canApprove,canConsolidate}}].

Usar el catálogo real; permisos derivados de grants y estado, no del body.
Necesario para dejar de fijar PPTO_V1/PPTO_V2 y 2027 en el frontend.
Documentar capabilities también para funciones disponibles/no implementadas;
no marcar canUpload=true hasta que POST /loads sea operativo.

## P1. Linaje

GET /runs/:runId/lineage?groupAccountId=4200&pageSize=50&cursor=...
200: {runId,groupAccountId,items:[...],nextCursor,totals:{...}}.

Cada item identifica monto/aporte, tipo de fuente y referencias reales:
loadId/lineId/rowNumber/fileName o eliminationLineId, según corresponda.
Campos no aplicables null. Respetar identidad y visibilidad de la fuente.
Los totales deben cuadrar con el consolidated de la MISMA corrida.
No sustituir esta prueba por run.lineageOk ni mostrar solo la fila de mayor impacto.
Agregar resumen de cuentas verificadas solo si se calcula realmente.

## P1. Generar bridge nuevo

POST /bridges
Body: {fromRunId,toRunId}
201: {bridgeId,fromRunId,toRunId,createdAt}.

Exigir permisos adecuados de grupo; ambas corridas visibles y compatibles.
Usar corridas inmutables y motor existente o implementar cálculo verificado.
Definir idempotencia por el par de corridas: devolver existente o 409 documentado.
Conservar GET /bridges, GET /bridges/:id y GET /bridges/:id/check.
Una corrida nueva no debe quedar comparándose con líneas de un bridge antiguo.
El frontend ya selecciona bridges por las corridas que realmente referencian.

## P1. Correcciones

POST /validation/findings/:findingId/accept-correction
Body: {justification, expectedLoadVersion, correctionId?}
200: {findingId, applied, affectedLoadId, newLoadId?, validationId?, auditRef?}.

No ejecutar suggestion ni SQL enviado por el navegador.
Solo permitir correcciones deterministas implementadas y autorizadas.
Si cambia datos de una carga aprobada, generar una versión nueva con trazabilidad.
Revalidar la carga y devolver su resultado real.
409 si el hallazgo o la versión ya no coincide.
Si no se implementa esta operación, mantenerla deshabilitada; el MVP puede
resolver errores subiendo un CSV corregido como nueva versión.

## P2. Mejoras posteriores

- Publicar nueva versión de tasas con motivo y control de escenario; sin
  alterar las usadas por corridas ya cerradas.
- Exportaciones respaldadas por la corrida/bridge seleccionado.
- Narrativa de desviaciones basada en cifras verificadas; no necesaria para
  validar el cálculo ni requisito para el primer despliegue.
- Endpoint de conciliación independiente solo si el producto lo requiere;
  hoy la conciliación corre dentro de consolidate. No hace falta duplicarlo.

## Pruebas y nuevo despliegue

1. Documentar schemas de todas las respuestas nuevas y existentes en OpenAPI.
2. Agregar pruebas de contrato, permisos por empresa, concurrencia y estados.
3. Probar flujo: subir CSV → validar → revisar → aprobar → consolidar → comparar.
4. Para V1, demostrar hallazgos reales; para V2, comparar números con el oráculo.
5. No relajar RLS ni usar postgres sin contexto de usuario para ocultar fallos.
6. Publicar una revisión nueva del MISMO servicio quadra-api en quadra-66e75,
   región us-central1. Mantener CORS_ORIGIN con el dominio exacto de Vercel.
7. Verificar health, 401 sin JWT y una operación autenticada después del deploy.
8. Entregar OpenAPI actualizado, ejemplos y lista de contratos que requieren
   cambios en el frontend. No es necesario redeploy si solo se escribe este documento;
   sí lo es cuando las nuevas operaciones estén implementadas y probadas.
