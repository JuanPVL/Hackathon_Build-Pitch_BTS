# Diagrama entidad-relación

Generado desde el catálogo de PostgreSQL tras ejecutar `supabase/01_schema.sql` … `05_security_rls.sql` (FKs reales, no dibujadas a mano).
Nombres en inglés, singular y camelCase (en SQL van entre comillas: `"dataLoad"`). Para no saturar, se omiten las columnas de auditoría
`createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `isActive`, presentes en catálogos, maestros e `icDocument`. `changeLog` vive en el esquema `audit`.

Leyenda de columnas: `PK` clave primaria · `FK` clave foránea · `UK` única · `"nullable"` admite nulo.

## 0. Vista general (todas las tablas)

Solo entidades y relaciones. Cada flecha es una FK real; la etiqueta es la columna FK. `}o--||` = muchos a uno obligatorio, `}o--o|` = opcional, `|o--||` = uno a uno.

```mermaid
erDiagram
  accountMapping }o--|| country : "countryCode"
  accountMapping }o--|| groupAccount : "groupAccountId"
  accountType }o--|| financialStatement : "financialStatementCode"
  company }o--|| country : "countryCode"
  company }o--|| currency : "functionalCurrencyCode"
  consolidatedBalance }o--|| consolidationRun : "runId"
  consolidatedBalance }o--|| groupAccount : "groupAccountId"
  consolidationRun }o--|| scenario : "scenarioId"
  consolidationRunLoad }o--|| consolidationRun : "runId"
  consolidationRunLoad }o--|| dataLoad : "loadId"
  counterparty |o--o| company : "taxId,companyId"
  counterparty }o--|| counterpartyType : "counterpartyTypeCode"
  counterparty }o--o| country : "countryCode"
  dataLoad }o--|| company : "companyId"
  dataLoad }o--|| financialStatement : "financialStatementCode"
  dataLoad }o--|| scenario : "scenarioId"
  dataLoad }o--|| status : "statusCode"
  dataLoadLine }o--|| dataLoad : "loadId"
  elimination }o--o| company : "companyId"
  elimination }o--|| consolidationRun : "runId"
  elimination }o--|| eliminationRule : "eliminationRuleCode"
  elimination }o--|| groupAccount : "groupAccountId"
  financialStatement }o--|| rateType : "defaultRateTypeCode"
  groupAccount }o--|| accountCategory : "accountCategoryCode"
  groupAccount }o--|| accountType : "accountTypeCode"
  groupAccount }o--o| groupAccount : "icCounterAccountId"
  groupAccount }o--o| rateType : "rateTypeCode"
  groupExchangeRate }o--|| currency : "currencyCode"
  groupExchangeRate }o--|| period : "periodCode"
  groupExchangeRate }o--|| rateType : "rateTypeCode"
  groupExchangeRate }o--|| scenario : "scenarioId"
  icDocument }o--|| company : "receiverCompanyId"
  icDocument }o--|| company : "issuerCompanyId"
  icDocument }o--|| currency : "transactionCurrencyCode"
  icDocument }o--|| icDocumentType : "icDocumentTypeCode"
  icDocument }o--|| period : "periodCode"
  icDocument }o--|| scenario : "scenarioId"
  icDocument }o--|| status : "statusCode"
  icDocument }o--o| transferPricingPolicy : "icDocumentTypeCode,transferPricingPolicyId"
  icDocumentType }o--o| eliminationRule : "eliminationRuleCode"
  icDocumentType }o--o| groupAccount : "issuerBsAccountId"
  icDocumentType }o--o| groupAccount : "receiverBsAccountId"
  icDocumentType }o--o| groupAccount : "issuerPlAccountId"
  icDocumentType }o--o| groupAccount : "receiverPlAccountId"
  icPayable }o--|| company : "partnerCompanyId"
  icPayable }o--|| company : "companyId"
  icPayable }o--|| currency : "currencyCode"
  icPayable |o--|| icDocument : "icDocumentId,version"
  icReceivable }o--|| company : "partnerCompanyId"
  icReceivable }o--|| company : "companyId"
  icReceivable }o--|| currency : "currencyCode"
  icReceivable |o--|| icDocument : "icDocumentId,version"
  icReconciliation }o--|| consolidationRun : "runId"
  icReconciliation }o--|| financialStatement : "financialStatementCode"
  icReconciliation }o--|| status : "statusCode"
  lineage }o--o| company : "companyId"
  lineage }o--|| consolidationRun : "runId"
  lineage }o--o| currency : "currencyCode"
  lineage }o--|| groupAccount : "groupAccountId"
  lineage }o--|| lineageSourceType : "sourceTypeCode"
  parameter }o--|| parameterDefinition : "parameterCode"
  parameter }o--|| scenario : "scenarioId"
  scenario }o--|| status : "statusCode"
  status }o--|| statusDomain : "domainCode"
  statusTransition }o--|| status : "domainCode,fromStatusCode"
  statusTransition }o--|| status : "domainCode,toStatusCode"
  transferPricingPolicy }o--|| icDocumentType : "icDocumentTypeCode"
  userCompanyAccess }o--|| accessRole : "roleCode"
  userCompanyAccess }o--o| company : "companyId"
  validationFinding }o--o| dataLoad : "loadId"
  validationFinding }o--o| scenario : "scenarioId"
  validationFinding }o--|| severity : "severityCode"
  validationFinding }o--|| validationRule : "ruleCode"
  validationRule }o--|| severity : "severityCode"
```

## 1. Catálogos y datos maestros

Toda columna de código apunta a un catálogo (no hay listas fijas). `counterparty` separa **INTERCOMPANY** (1:1 con `company`, mismo `taxId`) de **THIRD_PARTY**.

```mermaid
erDiagram
  accountMapping }o--|| country : "countryCode"
  accountMapping }o--|| groupAccount : "groupAccountId"
  accountType }o--|| financialStatement : "financialStatementCode"
  company }o--|| country : "countryCode"
  company }o--|| currency : "functionalCurrencyCode"
  counterparty |o--o| company : "taxId,companyId"
  counterparty }o--|| counterpartyType : "counterpartyTypeCode"
  counterparty }o--o| country : "countryCode"
  financialStatement }o--|| rateType : "defaultRateTypeCode"
  groupAccount }o--|| accountCategory : "accountCategoryCode"
  groupAccount }o--|| accountType : "accountTypeCode"
  groupAccount }o--o| groupAccount : "icCounterAccountId"
  groupAccount }o--o| rateType : "rateTypeCode"
  groupExchangeRate }o--|| currency : "currencyCode"
  groupExchangeRate }o--|| period : "periodCode"
  groupExchangeRate }o--|| rateType : "rateTypeCode"
  groupExchangeRate }o--|| scenario : "scenarioId"
  icDocumentType }o--o| eliminationRule : "eliminationRuleCode"
  icDocumentType }o--o| groupAccount : "issuerBsAccountId"
  icDocumentType }o--o| groupAccount : "receiverBsAccountId"
  icDocumentType }o--o| groupAccount : "issuerPlAccountId"
  icDocumentType }o--o| groupAccount : "receiverPlAccountId"
  parameter }o--|| parameterDefinition : "parameterCode"
  parameter }o--|| scenario : "scenarioId"
  transferPricingPolicy }o--|| icDocumentType : "icDocumentTypeCode"
  validationRule }o--|| severity : "severityCode"
  currency {
    text currencyCode PK
    text name
    int decimalPlaces
  }
  country {
    text countryCode PK
    text name
    text taxIdLabel
  }
  company {
    text companyId PK
    text name
    text countryCode FK
    text functionalCurrencyCode FK
    text taxId UK
    numeric incomeTaxRate
  }
  counterparty {
    text counterpartyId PK
    text counterpartyTypeCode FK
    text name
    text taxId FK,UK
    text countryCode FK "nullable"
    text companyId FK,UK "nullable"
    bool isCustomer
    bool isSupplier
    bool isGeneric
  }
  counterpartyType {
    text counterpartyTypeCode PK
    text name
    bool isGroupMember
  }
  groupAccount {
    text groupAccountId PK
    text name
    text accountTypeCode FK
    text accountCategoryCode FK
    bool isIntercompany
    text icCounterAccountId FK "nullable"
    bool isCurrent "nullable"
    text rateTypeCode FK "nullable"
  }
  accountType {
    text accountTypeCode PK
    text name
    text financialStatementCode FK
    text normalBalance
    smallint kpiSign
  }
  accountCategory {
    text accountCategoryCode PK
    text name
    text kpiGroupCode "nullable"
    text description "nullable"
  }
  financialStatement {
    text financialStatementCode PK
    text name
    text defaultRateTypeCode FK
  }
  rateType {
    text rateTypeCode PK
    text name
    text description "nullable"
  }
  accountMapping {
    text countryCode PK,FK
    text localAccountCode PK
    text groupAccountId FK
  }
  scenario {
    text scenarioId PK
    text description "nullable"
    text statusCode FK
    text statusReason "nullable"
    text statusDomainCode FK
  }
  parameter {
    text scenarioId PK,FK
    text parameterCode PK,FK
    numeric value
    text description "nullable"
  }
  parameterDefinition {
    text parameterCode PK
    text name
    text unit
    numeric minValue "nullable"
    numeric maxValue "nullable"
  }
  groupExchangeRate {
    text scenarioId PK,FK
    text periodCode PK,FK
    text currencyCode PK,FK
    text rateTypeCode PK,FK
    numeric rateToUsd
  }
  period {
    text periodCode PK
    int year
    int month
    date startDate
    date endDate
  }
  transferPricingPolicy {
    text policyId PK
    text icDocumentTypeCode FK
    text description "nullable"
    numeric minPct
    numeric maxPct
  }
  icDocumentType {
    text icDocumentTypeCode PK
    text name
    text issuerPlAccountId FK "nullable"
    text receiverPlAccountId FK "nullable"
    text issuerBsAccountId FK "nullable"
    text receiverBsAccountId FK "nullable"
    text eliminationRuleCode FK "nullable"
  }
  eliminationRule {
    text eliminationRuleCode PK
    text name
    smallint phase
  }
  validationRule {
    text ruleCode PK
    text description
    text severityCode FK
  }
  severity {
    text severityCode PK
    text name
    bool isBlocking
    bool requiresReasonToApprove
  }
```

## 2. Cargas y validación (staging)

`dataLoadLine` no tiene FKs a catálogos a propósito: recibe archivos malos para que el validador los reporte.

```mermaid
erDiagram
  dataLoad }o--|| company : "companyId"
  dataLoad }o--|| financialStatement : "financialStatementCode"
  dataLoad }o--|| scenario : "scenarioId"
  dataLoad }o--|| status : "statusCode"
  dataLoadLine }o--|| dataLoad : "loadId"
  scenario }o--|| status : "statusCode"
  validationFinding }o--o| dataLoad : "loadId"
  validationFinding }o--o| scenario : "scenarioId"
  validationFinding }o--|| severity : "severityCode"
  validationFinding }o--|| validationRule : "ruleCode"
  validationRule }o--|| severity : "severityCode"
  company {
    text companyId PK
    text name
    text countryCode FK
    text functionalCurrencyCode FK
    text taxId UK
    numeric incomeTaxRate
  }
  scenario {
    text scenarioId PK
    text description "nullable"
    text statusCode FK
    text statusReason "nullable"
    text statusDomainCode FK
  }
  financialStatement {
    text financialStatementCode PK
    text name
    text defaultRateTypeCode FK
  }
  status {
    text domainCode PK,FK
    text statusCode PK
    text name
    int sortOrder
    bool isInitial
    bool isFinal
    bool isConsolidable
    bool allowsElimination
    bool blocksScenarioClose
  }
  dataLoad {
    uuid loadId PK
    text companyId FK
    text scenarioId FK
    text financialStatementCode FK
    text fileName
    text fileHash "nullable"
    int version
    text statusCode FK
    text statusReason "nullable"
    text statusDomainCode FK
    uuid uploadedBy "nullable"
    timestamptz uploadedAt
    uuid approvedBy "nullable"
    timestamptz approvedAt "nullable"
  }
  dataLoadLine {
    text lineId PK
    uuid loadId FK
    int rowNumber
    text companyCode "nullable"
    text scenarioCode "nullable"
    text periodCode "nullable"
    text localAccountCode "nullable"
    text description "nullable"
    text currencyCode "nullable"
    numeric amount "nullable"
    text icPartnerCode "nullable"
    text icDocumentId "nullable"
    text transactionCurrencyCode "nullable"
    numeric transactionAmount "nullable"
    text counterpartyTaxId "nullable"
    numeric volume "nullable"
    numeric price "nullable"
  }
  validationFinding {
    bigint findingId PK
    uuid loadId FK "nullable"
    text scenarioId FK "nullable"
    text ruleCode FK
    text severityCode FK
    text companyCode "nullable"
    text recordRef "nullable"
    text message
    text foundValue "nullable"
    text expectedValue "nullable"
    text suggestion "nullable"
    numeric impactUsd
  }
  validationRule {
    text ruleCode PK
    text description
    text severityCode FK
  }
  severity {
    text severityCode PK
    text name
    bool isBlocking
    bool requiresReasonToApprove
  }
```

## 3. Intercompany

Un `icDocument` emitido genera en la misma transacción la CxC del emisor (`icReceivable`) y la CxP espejo del receptor (`icPayable`).

```mermaid
erDiagram
  company }o--|| currency : "functionalCurrencyCode"
  counterparty |o--o| company : "taxId,companyId"
  groupAccount }o--o| groupAccount : "icCounterAccountId"
  icDocument }o--|| company : "receiverCompanyId"
  icDocument }o--|| company : "issuerCompanyId"
  icDocument }o--|| currency : "transactionCurrencyCode"
  icDocument }o--|| icDocumentType : "icDocumentTypeCode"
  icDocument }o--|| period : "periodCode"
  icDocument }o--|| status : "statusCode"
  icDocument }o--o| transferPricingPolicy : "icDocumentTypeCode,transferPricingPolicyId"
  icDocumentType }o--o| groupAccount : "issuerBsAccountId"
  icDocumentType }o--o| groupAccount : "receiverBsAccountId"
  icDocumentType }o--o| groupAccount : "issuerPlAccountId"
  icDocumentType }o--o| groupAccount : "receiverPlAccountId"
  icPayable }o--|| company : "partnerCompanyId"
  icPayable }o--|| company : "companyId"
  icPayable }o--|| currency : "currencyCode"
  icPayable |o--|| icDocument : "icDocumentId,version"
  icReceivable }o--|| company : "partnerCompanyId"
  icReceivable }o--|| company : "companyId"
  icReceivable }o--|| currency : "currencyCode"
  icReceivable |o--|| icDocument : "icDocumentId,version"
  transferPricingPolicy }o--|| icDocumentType : "icDocumentTypeCode"
  company {
    text companyId PK
    text name
    text countryCode FK
    text functionalCurrencyCode FK
    text taxId UK
    numeric incomeTaxRate
  }
  counterparty {
    text counterpartyId PK
    text counterpartyTypeCode FK
    text name
    text taxId FK,UK
    text countryCode FK "nullable"
    text companyId FK,UK "nullable"
    bool isCustomer
    bool isSupplier
    bool isGeneric
  }
  currency {
    text currencyCode PK
    text name
    int decimalPlaces
  }
  period {
    text periodCode PK
    int year
    int month
    date startDate
    date endDate
  }
  status {
    text domainCode PK,FK
    text statusCode PK
    text name
    int sortOrder
    bool isInitial
    bool isFinal
    bool isConsolidable
    bool allowsElimination
    bool blocksScenarioClose
  }
  icDocumentType {
    text icDocumentTypeCode PK
    text name
    text issuerPlAccountId FK "nullable"
    text receiverPlAccountId FK "nullable"
    text issuerBsAccountId FK "nullable"
    text receiverBsAccountId FK "nullable"
    text eliminationRuleCode FK "nullable"
  }
  transferPricingPolicy {
    text policyId PK
    text icDocumentTypeCode FK
    text description "nullable"
    numeric minPct
    numeric maxPct
  }
  icDocument {
    text icDocumentId PK
    int version PK
    text scenarioId FK
    text icDocumentTypeCode FK
    text issuerCompanyId FK
    text receiverCompanyId FK
    text transactionCurrencyCode FK
    numeric transactionAmount
    text periodCode FK
    text transferPricingPolicyId FK "nullable"
    text statusCode FK
    text statusReason "nullable"
    text statusDomainCode FK
  }
  icReceivable {
    uuid receivableId PK
    text icDocumentId FK
    int version FK
    text companyId FK
    text partnerCompanyId FK
    text currencyCode FK
    numeric amount
    numeric balance
  }
  icPayable {
    uuid payableId PK
    text icDocumentId FK
    int version FK
    text companyId FK
    text partnerCompanyId FK
    text currencyCode FK
    numeric amount
    numeric balance
    uuid acceptedBy "nullable"
    timestamptz acceptedAt "nullable"
  }
  groupAccount {
    text groupAccountId PK
    text name
    text accountTypeCode FK
    text accountCategoryCode FK
    bool isIntercompany
    text icCounterAccountId FK "nullable"
    bool isCurrent "nullable"
    text rateTypeCode FK "nullable"
  }
```

## 4. Consolidación

Cada corrida es inmutable: congela parámetros y hash de tasas. `consolidatedUsd` es columna generada (agregado + eliminaciones + CTA).

```mermaid
erDiagram
  company }o--|| currency : "functionalCurrencyCode"
  consolidatedBalance }o--|| consolidationRun : "runId"
  consolidatedBalance }o--|| groupAccount : "groupAccountId"
  consolidationRun }o--|| scenario : "scenarioId"
  consolidationRunLoad }o--|| consolidationRun : "runId"
  consolidationRunLoad }o--|| dataLoad : "loadId"
  dataLoad }o--|| company : "companyId"
  dataLoad }o--|| financialStatement : "financialStatementCode"
  dataLoad }o--|| scenario : "scenarioId"
  dataLoad }o--|| status : "statusCode"
  elimination }o--o| company : "companyId"
  elimination }o--|| consolidationRun : "runId"
  elimination }o--|| eliminationRule : "eliminationRuleCode"
  elimination }o--|| groupAccount : "groupAccountId"
  groupAccount }o--o| groupAccount : "icCounterAccountId"
  icReconciliation }o--|| consolidationRun : "runId"
  icReconciliation }o--|| financialStatement : "financialStatementCode"
  icReconciliation }o--|| status : "statusCode"
  lineage }o--o| company : "companyId"
  lineage }o--|| consolidationRun : "runId"
  lineage }o--o| currency : "currencyCode"
  lineage }o--|| groupAccount : "groupAccountId"
  lineage }o--|| lineageSourceType : "sourceTypeCode"
  scenario }o--|| status : "statusCode"
  scenario {
    text scenarioId PK
    text description "nullable"
    text statusCode FK
    text statusReason "nullable"
    text statusDomainCode FK
  }
  dataLoad {
    uuid loadId PK
    text companyId FK
    text scenarioId FK
    text financialStatementCode FK
    text fileName
    text fileHash "nullable"
    int version
    text statusCode FK
    text statusReason "nullable"
    text statusDomainCode FK
    uuid uploadedBy "nullable"
    timestamptz uploadedAt
    uuid approvedBy "nullable"
    timestamptz approvedAt "nullable"
  }
  consolidationRun {
    uuid runId PK
    text scenarioId FK
    timestamptz executedAt
    uuid executedBy "nullable"
    jsonb parameterSnapshot "nullable"
    text ratesHash "nullable"
    bool lineageOk "nullable"
    text notes "nullable"
  }
  consolidationRunLoad {
    uuid runId PK,FK
    uuid loadId PK,FK
  }
  icReconciliation {
    uuid runId PK,FK
    text icDocumentId PK
    text financialStatementCode PK,FK
    text issuerCompanyId "nullable"
    text receiverCompanyId "nullable"
    text statusCode FK
    text statusDomainCode FK
    numeric issuerUsd "nullable"
    numeric receiverUsd "nullable"
    numeric differenceUsd "nullable"
    text lineRefs "nullable"
  }
  elimination {
    bigint eliminationLineId PK
    uuid runId FK
    text eliminationCode
    text eliminationRuleCode FK
    text icDocumentId "nullable"
    text companyId FK "nullable"
    text groupAccountId FK
    numeric effectUsd
    text sourceRef "nullable"
  }
  consolidatedBalance {
    uuid runId PK,FK
    text groupAccountId PK,FK
    numeric aggregatedUsd
    numeric eliminationsUsd
    numeric translationAdjustmentUsd
    numeric consolidatedUsd "nullable"
  }
  lineage {
    bigint lineageId PK
    uuid runId FK
    text groupAccountId FK
    text sourceTypeCode FK
    text sourceId "nullable"
    text companyId FK "nullable"
    numeric localAmount "nullable"
    text currencyCode FK "nullable"
    numeric rate "nullable"
    numeric contributionUsd
  }
  eliminationRule {
    text eliminationRuleCode PK
    text name
    smallint phase
  }
  lineageSourceType {
    text sourceTypeCode PK
    text name
  }
  groupAccount {
    text groupAccountId PK
    text name
    text accountTypeCode FK
    text accountCategoryCode FK
    bool isIntercompany
    text icCounterAccountId FK "nullable"
    bool isCurrent "nullable"
    text rateTypeCode FK "nullable"
  }
  company {
    text companyId PK
    text name
    text countryCode FK
    text functionalCurrencyCode FK
    text taxId UK
    numeric incomeTaxRate
  }
  currency {
    text currencyCode PK
    text name
    int decimalPlaces
  }
  financialStatement {
    text financialStatementCode PK
    text name
    text defaultRateTypeCode FK
  }
  status {
    text domainCode PK,FK
    text statusCode PK
    text name
    int sortOrder
    bool isInitial
    bool isFinal
    bool isConsolidable
    bool allowsElimination
    bool blocksScenarioClose
  }
```

## 5. Estados, seguridad y auditoría

`status`/`statusTransition` son la máquina de estados genérica (dominios LOAD, IC_DOCUMENT, SCENARIO, RECONCILIATION). `audit.changeLog` es append-only; `userCompanyAccess.userId` apunta a `auth.users` en Supabase.

```mermaid
erDiagram
  status }o--|| statusDomain : "domainCode"
  statusTransition }o--|| status : "domainCode,fromStatusCode"
  statusTransition }o--|| status : "domainCode,toStatusCode"
  userCompanyAccess }o--|| accessRole : "roleCode"
  userCompanyAccess }o--o| company : "companyId"
  statusDomain {
    text domainCode PK
    text name
  }
  status {
    text domainCode PK,FK
    text statusCode PK
    text name
    int sortOrder
    bool isInitial
    bool isFinal
    bool isConsolidable
    bool allowsElimination
    bool blocksScenarioClose
  }
  statusTransition {
    text domainCode PK,FK
    text fromStatusCode PK,FK
    text toStatusCode PK,FK
    bool requiresReason
  }
  accessRole {
    text roleCode PK
    text name
    bool canReadAllCompanies
    bool canWriteAllCompanies
    bool canWriteOwnCompany
    bool canApproveLoads
    bool canManageMasterData
  }
  userCompanyAccess {
    bigint accessId PK
    uuid userId
    text companyId FK "nullable"
    text roleCode FK
  }
  company {
    text companyId PK
    text name
    text countryCode FK
    text functionalCurrencyCode FK
    text taxId UK
    numeric incomeTaxRate
  }
  changeLog {
    bigint changeLogId PK
    text tableName
    text operation
    jsonb recordKey
    jsonb oldData "nullable"
    jsonb newData "nullable"
    jsonb changedFields "nullable"
    uuid userId "nullable"
    text dbRole
    text reason "nullable"
    bigint transactionId
    timestamptz changedAt
  }
```
