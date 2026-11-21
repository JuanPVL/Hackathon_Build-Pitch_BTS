import { pgTable, pgSchema, index, check, bigint, text, jsonb, uuid, timestamp, uniqueIndex, foreignKey, unique, integer, numeric, boolean, smallint, date, primaryKey, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const audit = pgSchema("audit");
export const authz = pgSchema("authz");

export const changeLog_changeLogId_seqInAudit = audit.sequence("changeLog_changeLogId_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const changeLogInAudit = audit.table("changeLog", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	changeLogId: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "audit.\"changeLog_changeLogId_seq\"", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807 }),
	tableName: text().notNull(),
	operation: text().notNull(),
	recordKey: jsonb().notNull(),
	oldData: jsonb(),
	newData: jsonb(),
	changedFields: jsonb(),
	userId: uuid().default(sql`audit."currentUserId"()`),
	dbRole: text().default(sql`current_user`).notNull(),
	reason: text().default(sql`nullif(current_setting('app.change_reason', true), '')`),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint({ mode: "number" }).default(sql`txid_current()`).notNull(),
	changedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("changeLog_recordKey_idx").using("gin", table.recordKey.asc().nullsLast().op("jsonb_ops")),
	index("changeLog_tableName_changedAt_idx").using("btree", table.tableName.asc().nullsLast().op("text_ops"), table.changedAt.desc().nullsFirst().op("text_ops")),
	check("changeLog_operation_check", sql`operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])`),
]);

export const dataLoad = pgTable("dataLoad", {
	loadId: uuid().defaultRandom().primaryKey().notNull(),
	companyId: text().notNull(),
	scenarioId: text().notNull(),
	financialStatementCode: text().notNull(),
	fileName: text().notNull(),
	fileHash: text(),
	version: integer().notNull(),
	statusCode: text().default('RECIBIDA').notNull(),
	statusReason: text(),
	statusDomainCode: text().notNull().generatedAlwaysAs(sql`'LOAD'::text`),
	uploadedBy: uuid().default(sql`audit."currentUserId"()`),
	uploadedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	approvedBy: uuid(),
	approvedAt: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	index("dataLoad_fileHash_idx").using("btree", table.fileHash.asc().nullsLast().op("text_ops")),
	uniqueIndex("uqDataLoadOneApproved").using("btree", table.companyId.asc().nullsLast().op("text_ops"), table.scenarioId.asc().nullsLast().op("text_ops"), table.financialStatementCode.asc().nullsLast().op("text_ops")).where(sql`("statusCode" = 'APROBADA'::text)`),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [company.companyId],
			name: "dataLoad_companyId_fkey"
		}),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenario.scenarioId],
			name: "dataLoad_scenarioId_fkey"
		}),
	foreignKey({
			columns: [table.financialStatementCode],
			foreignColumns: [financialStatement.financialStatementCode],
			name: "dataLoad_financialStatementCode_fkey"
		}),
	foreignKey({
			columns: [table.statusCode, table.statusDomainCode],
			foreignColumns: [status.domainCode, status.statusCode],
			name: "dataLoad_statusDomainCode_statusCode_fkey"
		}),
	unique("dataLoad_companyId_scenarioId_financialStatementCode_versio_key").on(table.companyId, table.scenarioId, table.financialStatementCode, table.version),
	check("dataLoad_version_check", sql`version > 0`),
]);

export const dataLoadLine = pgTable("dataLoadLine", {
	lineId: text().primaryKey().notNull(),
	loadId: uuid().notNull(),
	rowNumber: integer().notNull(),
	companyCode: text(),
	scenarioCode: text(),
	periodCode: text(),
	localAccountCode: text(),
	description: text(),
	currencyCode: text(),
	amount: numeric({ precision: 20, scale:  2 }),
	icPartnerCode: text(),
	icDocumentId: text(),
	transactionCurrencyCode: text(),
	transactionAmount: numeric({ precision: 20, scale:  2 }),
	counterpartyTaxId: text(),
	volume: numeric(),
	price: numeric(),
}, (table) => [
	index("dataLoadLine_icDocumentId_idx").using("btree", table.icDocumentId.asc().nullsLast().op("text_ops")).where(sql`("icDocumentId" IS NOT NULL)`),
	foreignKey({
			columns: [table.loadId],
			foreignColumns: [dataLoad.loadId],
			name: "dataLoadLine_loadId_fkey"
		}).onDelete("cascade"),
	unique("dataLoadLine_loadId_rowNumber_key").on(table.loadId, table.rowNumber),
	check("dataLoadLine_rowNumber_check", sql`"rowNumber" > 0`),
]);

export const validationFinding = pgTable("validationFinding", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	findingId: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "\"validationFinding_findingId_seq\"", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807 }),
	loadId: uuid(),
	scenarioId: text(),
	ruleCode: text().notNull(),
	severityCode: text().notNull(),
	companyCode: text(),
	recordRef: text(),
	message: text().notNull(),
	foundValue: text(),
	expectedValue: text(),
	suggestion: text(),
	impactUsd: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("validationFinding_loadId_idx").using("btree", table.loadId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.loadId],
			foreignColumns: [dataLoad.loadId],
			name: "validationFinding_loadId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenario.scenarioId],
			name: "validationFinding_scenarioId_fkey"
		}),
	foreignKey({
			columns: [table.ruleCode],
			foreignColumns: [validationRule.ruleCode],
			name: "validationFinding_ruleCode_fkey"
		}),
	foreignKey({
			columns: [table.severityCode],
			foreignColumns: [severity.severityCode],
			name: "validationFinding_severityCode_fkey"
		}),
	check("validationFinding_check", sql`("loadId" IS NOT NULL) OR ("scenarioId" IS NOT NULL)`),
]);

export const icReceivable = pgTable("icReceivable", {
	receivableId: uuid().defaultRandom().primaryKey().notNull(),
	icDocumentId: text().notNull(),
	version: integer().notNull(),
	companyId: text().notNull(),
	partnerCompanyId: text().notNull(),
	currencyCode: text().notNull(),
	amount: numeric({ precision: 20, scale:  2 }).notNull(),
	balance: numeric({ precision: 20, scale:  2 }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [company.companyId],
			name: "icReceivable_companyId_fkey"
		}),
	foreignKey({
			columns: [table.partnerCompanyId],
			foreignColumns: [company.companyId],
			name: "icReceivable_partnerCompanyId_fkey"
		}),
	foreignKey({
			columns: [table.currencyCode],
			foreignColumns: [currency.currencyCode],
			name: "icReceivable_currencyCode_fkey"
		}),
	foreignKey({
			columns: [table.icDocumentId, table.version],
			foreignColumns: [icDocument.icDocumentId, icDocument.version],
			name: "icReceivable_icDocumentId_version_fkey"
		}),
	unique("icReceivable_icDocumentId_version_key").on(table.icDocumentId, table.version),
	check("icReceivable_amount_check", sql`amount > (0)::numeric`),
	check("icReceivable_check", sql`(balance >= (0)::numeric) AND (balance <= amount)`),
	check("icReceivable_check1", sql`"companyId" <> "partnerCompanyId"`),
]);

export const icPayable = pgTable("icPayable", {
	payableId: uuid().defaultRandom().primaryKey().notNull(),
	icDocumentId: text().notNull(),
	version: integer().notNull(),
	companyId: text().notNull(),
	partnerCompanyId: text().notNull(),
	currencyCode: text().notNull(),
	amount: numeric({ precision: 20, scale:  2 }).notNull(),
	balance: numeric({ precision: 20, scale:  2 }).notNull(),
	acceptedBy: uuid(),
	acceptedAt: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [company.companyId],
			name: "icPayable_companyId_fkey"
		}),
	foreignKey({
			columns: [table.partnerCompanyId],
			foreignColumns: [company.companyId],
			name: "icPayable_partnerCompanyId_fkey"
		}),
	foreignKey({
			columns: [table.currencyCode],
			foreignColumns: [currency.currencyCode],
			name: "icPayable_currencyCode_fkey"
		}),
	foreignKey({
			columns: [table.icDocumentId, table.version],
			foreignColumns: [icDocument.icDocumentId, icDocument.version],
			name: "icPayable_icDocumentId_version_fkey"
		}),
	unique("icPayable_icDocumentId_version_key").on(table.icDocumentId, table.version),
	check("icPayable_amount_check", sql`amount > (0)::numeric`),
	check("icPayable_check", sql`(balance >= (0)::numeric) AND (balance <= amount)`),
	check("icPayable_check1", sql`"companyId" <> "partnerCompanyId"`),
]);

export const consolidationRun = pgTable("consolidationRun", {
	runId: uuid().defaultRandom().primaryKey().notNull(),
	scenarioId: text().notNull(),
	executedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	executedBy: uuid().default(sql`audit."currentUserId"()`),
	parameterSnapshot: jsonb(),
	ratesHash: text(),
	lineageOk: boolean(),
	notes: text(),
}, (table) => [
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenario.scenarioId],
			name: "consolidationRun_scenarioId_fkey"
		}),
]);

export const elimination = pgTable("elimination", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	eliminationLineId: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "\"elimination_eliminationLineId_seq\"", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807 }),
	runId: uuid().notNull(),
	eliminationCode: text().notNull(),
	eliminationRuleCode: text().notNull(),
	icDocumentId: text(),
	companyId: text(),
	groupAccountId: text().notNull(),
	effectUsd: numeric({ precision: 20, scale:  2 }).notNull(),
	sourceRef: text(),
}, (table) => [
	index("elimination_runId_groupAccountId_idx").using("btree", table.runId.asc().nullsLast().op("text_ops"), table.groupAccountId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [consolidationRun.runId],
			name: "elimination_runId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.eliminationRuleCode],
			foreignColumns: [eliminationRule.eliminationRuleCode],
			name: "elimination_eliminationRuleCode_fkey"
		}),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [company.companyId],
			name: "elimination_companyId_fkey"
		}),
	foreignKey({
			columns: [table.groupAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "elimination_groupAccountId_fkey"
		}),
]);

export const lineage = pgTable("lineage", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lineageId: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "\"lineage_lineageId_seq\"", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807 }),
	runId: uuid().notNull(),
	groupAccountId: text().notNull(),
	sourceTypeCode: text().notNull(),
	sourceId: text(),
	companyId: text(),
	localAmount: numeric({ precision: 20, scale:  2 }),
	currencyCode: text(),
	rate: numeric({ precision: 20, scale:  10 }),
	contributionUsd: numeric({ precision: 20, scale:  2 }).notNull(),
}, (table) => [
	index("lineage_runId_groupAccountId_idx").using("btree", table.runId.asc().nullsLast().op("text_ops"), table.groupAccountId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [consolidationRun.runId],
			name: "lineage_runId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.groupAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "lineage_groupAccountId_fkey"
		}),
	foreignKey({
			columns: [table.sourceTypeCode],
			foreignColumns: [lineageSourceType.sourceTypeCode],
			name: "lineage_sourceTypeCode_fkey"
		}),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [company.companyId],
			name: "lineage_companyId_fkey"
		}),
	foreignKey({
			columns: [table.currencyCode],
			foreignColumns: [currency.currencyCode],
			name: "lineage_currencyCode_fkey"
		}),
]);

export const varianceBridge = pgTable("varianceBridge", {
	bridgeId: uuid().defaultRandom().primaryKey().notNull(),
	fromRunId: uuid().notNull(),
	toRunId: uuid().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	notes: text(),
}, (table) => [
	foreignKey({
			columns: [table.fromRunId],
			foreignColumns: [consolidationRun.runId],
			name: "varianceBridge_fromRunId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toRunId],
			foreignColumns: [consolidationRun.runId],
			name: "varianceBridge_toRunId_fkey"
		}).onDelete("cascade"),
	unique("varianceBridge_fromRunId_toRunId_key").on(table.fromRunId, table.toRunId),
	check("varianceBridge_check", sql`"fromRunId" <> "toRunId"`),
]);

export const varianceBridgeLine = pgTable("varianceBridgeLine", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bridgeLineId: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "\"varianceBridgeLine_bridgeLineId_seq\"", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807 }),
	bridgeId: uuid().notNull(),
	effectCode: text().notNull(),
	scopeCode: text().notNull().generatedAlwaysAs(sql`'LINE'::text`),
	companyId: text().notNull(),
	groupAccountId: text().notNull(),
	periodCode: text().notNull(),
	salesDeltaUsd: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
	ebitDeltaUsd: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
	icDetailUsd: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
}, (table) => [
	index("varianceBridgeLine_bridgeId_effectCode_idx").using("btree", table.bridgeId.asc().nullsLast().op("text_ops"), table.effectCode.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.bridgeId],
			foreignColumns: [varianceBridge.bridgeId],
			name: "varianceBridgeLine_bridgeId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [company.companyId],
			name: "varianceBridgeLine_companyId_fkey"
		}),
	foreignKey({
			columns: [table.groupAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "varianceBridgeLine_groupAccountId_fkey"
		}),
	foreignKey({
			columns: [table.periodCode],
			foreignColumns: [period.periodCode],
			name: "varianceBridgeLine_periodCode_fkey"
		}),
	foreignKey({
			columns: [table.effectCode, table.scopeCode],
			foreignColumns: [varianceEffect.effectCode, varianceEffect.scopeCode],
			name: "varianceBridgeLine_effectCode_scopeCode_fkey"
		}),
]);

export const currency = pgTable("currency", {
	currencyCode: text().primaryKey().notNull(),
	name: text().notNull(),
	decimalPlaces: integer().default(2).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	check("currency_currencyCode_check", sql`"currencyCode" ~ '^[A-Z]{3}$'::text`),
	check("currency_decimalPlaces_check", sql`("decimalPlaces" >= 0) AND ("decimalPlaces" <= 6)`),
]);

export const country = pgTable("country", {
	countryCode: text().primaryKey().notNull(),
	name: text().notNull(),
	taxIdLabel: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	check("country_countryCode_check", sql`"countryCode" ~ '^[A-Z]{2}$'::text`),
]);

export const financialStatement = pgTable("financialStatement", {
	financialStatementCode: text().primaryKey().notNull(),
	name: text().notNull(),
	defaultRateTypeCode: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.defaultRateTypeCode],
			foreignColumns: [rateType.rateTypeCode],
			name: "financialStatement_defaultRateTypeCode_fkey"
		}),
]);

export const rateType = pgTable("rateType", {
	rateTypeCode: text().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
]);

export const accountType = pgTable("accountType", {
	accountTypeCode: text().primaryKey().notNull(),
	name: text().notNull(),
	financialStatementCode: text().notNull(),
	normalBalance: text().notNull(),
	kpiSign: smallint().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.financialStatementCode],
			foreignColumns: [financialStatement.financialStatementCode],
			name: "accountType_financialStatementCode_fkey"
		}),
	check("accountType_normalBalance_check", sql`"normalBalance" = ANY (ARRAY['DEBIT'::text, 'CREDIT'::text])`),
	check("accountType_kpiSign_check", sql`"kpiSign" = ANY (ARRAY['-1'::integer, 1])`),
]);

export const accountCategory = pgTable("accountCategory", {
	accountCategoryCode: text().primaryKey().notNull(),
	name: text().notNull(),
	kpiGroupCode: text(),
	isSales: boolean().default(false).notNull(),
	description: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	check("accountCategory_kpiGroupCode_check", sql`"kpiGroupCode" = ANY (ARRAY['EBIT'::text, 'WORKING_CAPITAL'::text, 'FIXED_ASSET'::text])`),
]);

export const severity = pgTable("severity", {
	severityCode: text().primaryKey().notNull(),
	name: text().notNull(),
	isBlocking: boolean().notNull(),
	requiresReasonToApprove: boolean().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
]);

export const statusDomain = pgTable("statusDomain", {
	domainCode: text().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
]);

export const eliminationRule = pgTable("eliminationRule", {
	eliminationRuleCode: text().primaryKey().notNull(),
	name: text().notNull(),
	phase: smallint().default(1).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
]);

export const lineageSourceType = pgTable("lineageSourceType", {
	sourceTypeCode: text().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
]);

export const parameterDefinition = pgTable("parameterDefinition", {
	parameterCode: text().primaryKey().notNull(),
	name: text().notNull(),
	unit: text().notNull(),
	minValue: numeric(),
	maxValue: numeric(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	check("parameterDefinition_unit_check", sql`unit = ANY (ARRAY['RATIO'::text, 'USD'::text, 'TIMES'::text])`),
	check("parameterDefinition_check", sql`("minValue" IS NULL) OR ("maxValue" IS NULL) OR ("minValue" <= "maxValue")`),
]);

export const counterpartyType = pgTable("counterpartyType", {
	counterpartyTypeCode: text().primaryKey().notNull(),
	name: text().notNull(),
	isGroupMember: boolean().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
]);

export const period = pgTable("period", {
	periodCode: text().primaryKey().notNull(),
	year: integer().notNull(),
	month: integer().notNull(),
	startDate: date().notNull(),
	endDate: date().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	unique("period_year_month_key").on(table.year, table.month),
	check("period_periodCode_check", sql`"periodCode" ~ '^\d{4}-(0[1-9]|1[0-2])$'::text`),
	check("period_month_check", sql`(month >= 1) AND (month <= 12)`),
	check("period_check", sql`"endDate" >= "startDate"`),
]);

export const validationRule = pgTable("validationRule", {
	ruleCode: text().primaryKey().notNull(),
	description: text().notNull(),
	severityCode: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.severityCode],
			foreignColumns: [severity.severityCode],
			name: "validationRule_severityCode_fkey"
		}),
	check("validationRule_ruleCode_check", sql`"ruleCode" ~ '^V\d{2}$'::text`),
]);

export const icDocumentType = pgTable("icDocumentType", {
	icDocumentTypeCode: text().primaryKey().notNull(),
	name: text().notNull(),
	issuerPlAccountId: text(),
	receiverPlAccountId: text(),
	issuerBsAccountId: text(),
	receiverBsAccountId: text(),
	eliminationRuleCode: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.eliminationRuleCode],
			foreignColumns: [eliminationRule.eliminationRuleCode],
			name: "icDocumentType_eliminationRuleCode_fkey"
		}),
	foreignKey({
			columns: [table.issuerPlAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "icDocumentType_issuerPlAccountId_fkey"
		}),
	foreignKey({
			columns: [table.receiverPlAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "icDocumentType_receiverPlAccountId_fkey"
		}),
	foreignKey({
			columns: [table.issuerBsAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "icDocumentType_issuerBsAccountId_fkey"
		}),
	foreignKey({
			columns: [table.receiverBsAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "icDocumentType_receiverBsAccountId_fkey"
		}),
]);

export const company = pgTable("company", {
	companyId: text().primaryKey().notNull(),
	name: text().notNull(),
	countryCode: text().notNull(),
	functionalCurrencyCode: text().notNull(),
	taxId: text().notNull(),
	incomeTaxRate: numeric({ precision: 6, scale:  4 }).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.countryCode],
			foreignColumns: [country.countryCode],
			name: "company_countryCode_fkey"
		}),
	foreignKey({
			columns: [table.functionalCurrencyCode],
			foreignColumns: [currency.currencyCode],
			name: "company_functionalCurrencyCode_fkey"
		}),
	unique("company_companyId_taxId_key").on(table.companyId, table.taxId),
	unique("company_taxId_key").on(table.taxId),
	check("company_incomeTaxRate_check", sql`("incomeTaxRate" >= (0)::numeric) AND ("incomeTaxRate" <= (1)::numeric)`),
]);

export const counterparty = pgTable("counterparty", {
	counterpartyId: text().primaryKey().notNull(),
	counterpartyTypeCode: text().notNull(),
	name: text().notNull(),
	taxId: text().notNull(),
	countryCode: text(),
	companyId: text(),
	isCustomer: boolean().default(true).notNull(),
	isSupplier: boolean().default(true).notNull(),
	isGeneric: boolean().default(false).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.counterpartyTypeCode],
			foreignColumns: [counterpartyType.counterpartyTypeCode],
			name: "counterparty_counterpartyTypeCode_fkey"
		}),
	foreignKey({
			columns: [table.countryCode],
			foreignColumns: [country.countryCode],
			name: "counterparty_countryCode_fkey"
		}),
	foreignKey({
			columns: [table.taxId, table.companyId],
			foreignColumns: [company.companyId, company.taxId],
			name: "counterparty_companyId_taxId_fkey"
		}).onUpdate("cascade"),
	unique("counterparty_taxId_key").on(table.taxId),
	unique("counterparty_companyId_key").on(table.companyId),
	check("counterparty_check", sql`("counterpartyTypeCode" = 'INTERCOMPANY'::text) = ("companyId" IS NOT NULL)`),
	check("counterparty_check1", sql`"isCustomer" OR "isSupplier"`),
]);

export const groupAccount = pgTable("groupAccount", {
	groupAccountId: text().primaryKey().notNull(),
	name: text().notNull(),
	accountTypeCode: text().notNull(),
	accountCategoryCode: text().notNull(),
	isIntercompany: boolean().default(false).notNull(),
	icCounterAccountId: text(),
	isCurrent: boolean(),
	rateTypeCode: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.accountTypeCode],
			foreignColumns: [accountType.accountTypeCode],
			name: "groupAccount_accountTypeCode_fkey"
		}),
	foreignKey({
			columns: [table.accountCategoryCode],
			foreignColumns: [accountCategory.accountCategoryCode],
			name: "groupAccount_accountCategoryCode_fkey"
		}),
	foreignKey({
			columns: [table.icCounterAccountId],
			foreignColumns: [table.groupAccountId],
			name: "groupAccount_icCounterAccountId_fkey"
		}),
	foreignKey({
			columns: [table.rateTypeCode],
			foreignColumns: [rateType.rateTypeCode],
			name: "groupAccount_rateTypeCode_fkey"
		}),
	check("groupAccount_check", sql`"isIntercompany" = ("icCounterAccountId" IS NOT NULL)`),
	check("groupAccount_check1", sql`"icCounterAccountId" <> "groupAccountId"`),
]);

export const scenario = pgTable("scenario", {
	scenarioId: text().primaryKey().notNull(),
	description: text(),
	statusCode: text().default('ABIERTO').notNull(),
	statusReason: text(),
	statusDomainCode: text().notNull().generatedAlwaysAs(sql`'SCENARIO'::text`),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.statusCode, table.statusDomainCode],
			foreignColumns: [status.domainCode, status.statusCode],
			name: "scenario_statusDomainCode_statusCode_fkey"
		}),
]);

export const transferPricingPolicy = pgTable("transferPricingPolicy", {
	policyId: text().primaryKey().notNull(),
	icDocumentTypeCode: text().notNull(),
	description: text(),
	minPct: numeric({ precision: 6, scale:  4 }).notNull(),
	maxPct: numeric({ precision: 6, scale:  4 }).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.icDocumentTypeCode],
			foreignColumns: [icDocumentType.icDocumentTypeCode],
			name: "transferPricingPolicy_icDocumentTypeCode_fkey"
		}),
	unique("transferPricingPolicy_policyId_icDocumentTypeCode_key").on(table.policyId, table.icDocumentTypeCode),
	check("transferPricingPolicy_minPct_check", sql`"minPct" >= (0)::numeric`),
	check("transferPricingPolicy_check", sql`"maxPct" >= "minPct"`),
]);

export const varianceEffect = pgTable("varianceEffect", {
	effectCode: text().primaryKey().notNull(),
	name: text().notNull(),
	scopeCode: text().notNull(),
	sortOrder: integer().default(0).notNull(),
	description: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	unique("varianceEffect_effectCode_scopeCode_key").on(table.effectCode, table.scopeCode),
	check("varianceEffect_scopeCode_check", sql`"scopeCode" = ANY (ARRAY['LINE'::text, 'EVA'::text])`),
]);

export const userCompanyAccess = pgTable("userCompanyAccess", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	accessId: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "\"userCompanyAccess_accessId_seq\"", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807 }),
	userId: uuid().notNull(),
	companyId: text(),
	roleCode: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	index("userCompanyAccess_userId_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`"isActive"`),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [company.companyId],
			name: "userCompanyAccess_companyId_fkey"
		}),
	foreignKey({
			columns: [table.roleCode],
			foreignColumns: [accessRole.roleCode],
			name: "userCompanyAccess_roleCode_fkey"
		}),
	unique("userCompanyAccess_userId_companyId_roleCode_key").on(table.userId, table.companyId, table.roleCode),
]);

export const accessRole = pgTable("accessRole", {
	roleCode: text().primaryKey().notNull(),
	name: text().notNull(),
	canReadAllCompanies: boolean().default(false).notNull(),
	canWriteAllCompanies: boolean().default(false).notNull(),
	canWriteOwnCompany: boolean().default(false).notNull(),
	canApproveLoads: boolean().default(false).notNull(),
	canManageMasterData: boolean().default(false).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
]);

export const consolidationRunLoad = pgTable("consolidationRunLoad", {
	runId: uuid().notNull(),
	loadId: uuid().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.runId],
			foreignColumns: [consolidationRun.runId],
			name: "consolidationRunLoad_runId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.loadId],
			foreignColumns: [dataLoad.loadId],
			name: "consolidationRunLoad_loadId_fkey"
		}),
	primaryKey({ columns: [table.runId, table.loadId], name: "consolidationRunLoad_pkey"}),
]);

export const varianceBridgeEva = pgTable("varianceBridgeEva", {
	bridgeId: uuid().notNull(),
	effectCode: text().notNull(),
	scopeCode: text().notNull().generatedAlwaysAs(sql`'EVA'::text`),
	evaDeltaUsd: numeric({ precision: 20, scale:  2 }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.bridgeId],
			foreignColumns: [varianceBridge.bridgeId],
			name: "varianceBridgeEva_bridgeId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.effectCode, table.scopeCode],
			foreignColumns: [varianceEffect.effectCode, varianceEffect.scopeCode],
			name: "varianceBridgeEva_effectCode_scopeCode_fkey"
		}),
	primaryKey({ columns: [table.bridgeId, table.effectCode], name: "varianceBridgeEva_pkey"}),
]);

export const consolidatedBalance = pgTable("consolidatedBalance", {
	runId: uuid().notNull(),
	groupAccountId: text().notNull(),
	aggregatedUsd: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
	eliminationsUsd: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
	translationAdjustmentUsd: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
	consolidatedUsd: numeric({ precision: 20, scale:  2 }).generatedAlwaysAs(sql`(("aggregatedUsd" + "eliminationsUsd") + "translationAdjustmentUsd")`),
}, (table) => [
	foreignKey({
			columns: [table.runId],
			foreignColumns: [consolidationRun.runId],
			name: "consolidatedBalance_runId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.groupAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "consolidatedBalance_groupAccountId_fkey"
		}),
	primaryKey({ columns: [table.runId, table.groupAccountId], name: "consolidatedBalance_pkey"}),
]);

export const accountMapping = pgTable("accountMapping", {
	countryCode: text().notNull(),
	localAccountCode: text().notNull(),
	groupAccountId: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.countryCode],
			foreignColumns: [country.countryCode],
			name: "accountMapping_countryCode_fkey"
		}),
	foreignKey({
			columns: [table.groupAccountId],
			foreignColumns: [groupAccount.groupAccountId],
			name: "accountMapping_groupAccountId_fkey"
		}),
	primaryKey({ columns: [table.countryCode, table.localAccountCode], name: "accountMapping_pkey"}),
]);

export const statusTransition = pgTable("statusTransition", {
	domainCode: text().notNull(),
	fromStatusCode: text().notNull(),
	toStatusCode: text().notNull(),
	requiresReason: boolean().default(false).notNull(),
	isActive: boolean().default(true).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
}, (table) => [
	foreignKey({
			columns: [table.domainCode, table.fromStatusCode],
			foreignColumns: [status.domainCode, status.statusCode],
			name: "statusTransition_domainCode_fromStatusCode_fkey"
		}),
	foreignKey({
			columns: [table.domainCode, table.toStatusCode],
			foreignColumns: [status.domainCode, status.statusCode],
			name: "statusTransition_domainCode_toStatusCode_fkey"
		}),
	primaryKey({ columns: [table.domainCode, table.fromStatusCode, table.toStatusCode], name: "statusTransition_pkey"}),
	check("statusTransition_check", sql`"fromStatusCode" <> "toStatusCode"`),
]);

export const parameter = pgTable("parameter", {
	scenarioId: text().notNull(),
	parameterCode: text().notNull(),
	value: numeric().notNull(),
	description: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenario.scenarioId],
			name: "parameter_scenarioId_fkey"
		}),
	foreignKey({
			columns: [table.parameterCode],
			foreignColumns: [parameterDefinition.parameterCode],
			name: "parameter_parameterCode_fkey"
		}),
	primaryKey({ columns: [table.scenarioId, table.parameterCode], name: "parameter_pkey"}),
]);

export const groupExchangeRate = pgTable("groupExchangeRate", {
	scenarioId: text().notNull(),
	periodCode: text().notNull(),
	currencyCode: text().notNull(),
	rateTypeCode: text().notNull(),
	rateToUsd: numeric({ precision: 20, scale:  10 }).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenario.scenarioId],
			name: "groupExchangeRate_scenarioId_fkey"
		}),
	foreignKey({
			columns: [table.periodCode],
			foreignColumns: [period.periodCode],
			name: "groupExchangeRate_periodCode_fkey"
		}),
	foreignKey({
			columns: [table.currencyCode],
			foreignColumns: [currency.currencyCode],
			name: "groupExchangeRate_currencyCode_fkey"
		}),
	foreignKey({
			columns: [table.rateTypeCode],
			foreignColumns: [rateType.rateTypeCode],
			name: "groupExchangeRate_rateTypeCode_fkey"
		}),
	primaryKey({ columns: [table.scenarioId, table.periodCode, table.currencyCode, table.rateTypeCode], name: "groupExchangeRate_pkey"}),
	check("groupExchangeRate_rateToUsd_check", sql`"rateToUsd" > (0)::numeric`),
]);

export const icReconciliation = pgTable("icReconciliation", {
	runId: uuid().notNull(),
	icDocumentId: text().notNull(),
	financialStatementCode: text().notNull(),
	issuerCompanyId: text(),
	receiverCompanyId: text(),
	statusCode: text().notNull(),
	statusDomainCode: text().notNull().generatedAlwaysAs(sql`'RECONCILIATION'::text`),
	issuerUsd: numeric({ precision: 20, scale:  2 }),
	receiverUsd: numeric({ precision: 20, scale:  2 }),
	differenceUsd: numeric({ precision: 20, scale:  2 }),
	lineRefs: text(),
}, (table) => [
	foreignKey({
			columns: [table.runId],
			foreignColumns: [consolidationRun.runId],
			name: "icReconciliation_runId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.financialStatementCode],
			foreignColumns: [financialStatement.financialStatementCode],
			name: "icReconciliation_financialStatementCode_fkey"
		}),
	foreignKey({
			columns: [table.statusCode, table.statusDomainCode],
			foreignColumns: [status.domainCode, status.statusCode],
			name: "icReconciliation_statusDomainCode_statusCode_fkey"
		}),
	primaryKey({ columns: [table.runId, table.icDocumentId, table.financialStatementCode], name: "icReconciliation_pkey"}),
]);

export const status = pgTable("status", {
	domainCode: text().notNull(),
	statusCode: text().notNull(),
	name: text().notNull(),
	sortOrder: integer().default(0).notNull(),
	isInitial: boolean().default(false).notNull(),
	isFinal: boolean().default(false).notNull(),
	isConsolidable: boolean().default(false).notNull(),
	allowsElimination: boolean().default(false).notNull(),
	blocksScenarioClose: boolean().default(false).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
	isActive: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.domainCode],
			foreignColumns: [statusDomain.domainCode],
			name: "status_domainCode_fkey"
		}),
	primaryKey({ columns: [table.domainCode, table.statusCode], name: "status_pkey"}),
]);

export const icDocument = pgTable("icDocument", {
	icDocumentId: text().notNull(),
	version: integer().default(1).notNull(),
	scenarioId: text().notNull(),
	icDocumentTypeCode: text().notNull(),
	issuerCompanyId: text().notNull(),
	receiverCompanyId: text().notNull(),
	transactionCurrencyCode: text().notNull(),
	transactionAmount: numeric({ precision: 20, scale:  2 }).notNull(),
	periodCode: text().notNull(),
	transferPricingPolicyId: text(),
	statusCode: text().default('BORRADOR').notNull(),
	statusReason: text(),
	statusDomainCode: text().notNull().generatedAlwaysAs(sql`'IC_DOCUMENT'::text`),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid().default(sql`audit."currentUserId"()`),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }),
	updatedBy: uuid(),
}, (table) => [
	index("icDocument_issuerCompanyId_idx").using("btree", table.issuerCompanyId.asc().nullsLast().op("text_ops")),
	index("icDocument_receiverCompanyId_idx").using("btree", table.receiverCompanyId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenario.scenarioId],
			name: "icDocument_scenarioId_fkey"
		}),
	foreignKey({
			columns: [table.icDocumentTypeCode],
			foreignColumns: [icDocumentType.icDocumentTypeCode],
			name: "icDocument_icDocumentTypeCode_fkey"
		}),
	foreignKey({
			columns: [table.issuerCompanyId],
			foreignColumns: [company.companyId],
			name: "icDocument_issuerCompanyId_fkey"
		}),
	foreignKey({
			columns: [table.receiverCompanyId],
			foreignColumns: [company.companyId],
			name: "icDocument_receiverCompanyId_fkey"
		}),
	foreignKey({
			columns: [table.transactionCurrencyCode],
			foreignColumns: [currency.currencyCode],
			name: "icDocument_transactionCurrencyCode_fkey"
		}),
	foreignKey({
			columns: [table.periodCode],
			foreignColumns: [period.periodCode],
			name: "icDocument_periodCode_fkey"
		}),
	foreignKey({
			columns: [table.icDocumentTypeCode, table.transferPricingPolicyId],
			foreignColumns: [transferPricingPolicy.policyId, transferPricingPolicy.icDocumentTypeCode],
			name: "icDocument_transferPricingPolicyId_icDocumentTypeCode_fkey"
		}),
	foreignKey({
			columns: [table.statusCode, table.statusDomainCode],
			foreignColumns: [status.domainCode, status.statusCode],
			name: "icDocument_statusDomainCode_statusCode_fkey"
		}),
	primaryKey({ columns: [table.icDocumentId, table.version], name: "icDocument_pkey"}),
	check("icDocument_version_check", sql`version > 0`),
	check("icDocument_transactionAmount_check", sql`"transactionAmount" > (0)::numeric`),
	check("icDocument_check", sql`"issuerCompanyId" <> "receiverCompanyId"`),
]);
export const vMappedLine = pgView("vMappedLine", {	lineId: text(),
	loadId: uuid(),
	rowNumber: integer(),
	companyCode: text(),
	scenarioCode: text(),
	periodCode: text(),
	localAccountCode: text(),
	description: text(),
	currencyCode: text(),
	amount: numeric({ precision: 20, scale:  2 }),
	icPartnerCode: text(),
	icDocumentId: text(),
	transactionCurrencyCode: text(),
	transactionAmount: numeric({ precision: 20, scale:  2 }),
	counterpartyTaxId: text(),
	volume: numeric(),
	price: numeric(),
	loadStatusCode: text(),
	isConsolidable: boolean(),
	financialStatementCode: text(),
	scenarioId: text(),
	companyId: text(),
	countryCode: text(),
	functionalCurrencyCode: text(),
	groupAccountId: text(),
	accountTypeCode: text(),
	accountCategoryCode: text(),
	isIntercompany: boolean(),
	requiredRateTypeCode: text(),
}).with({"securityInvoker":true}).as(sql`SELECT l."lineId", l."loadId", l."rowNumber", l."companyCode", l."scenarioCode", l."periodCode", l."localAccountCode", l.description, l."currencyCode", l.amount, l."icPartnerCode", l."icDocumentId", l."transactionCurrencyCode", l."transactionAmount", l."counterpartyTaxId", l.volume, l.price, d."statusCode" AS "loadStatusCode", ls."isConsolidable", d."financialStatementCode", d."scenarioId", d."companyId", c."countryCode", c."functionalCurrencyCode", m."groupAccountId", g."accountTypeCode", g."accountCategoryCode", COALESCE(g."isIntercompany", false) AS "isIntercompany", COALESCE(g."rateTypeCode", fs."defaultRateTypeCode") AS "requiredRateTypeCode" FROM "dataLoadLine" l JOIN "dataLoad" d ON d."loadId" = l."loadId" JOIN status ls ON ls."domainCode" = 'LOAD'::text AND ls."statusCode" = d."statusCode" JOIN company c ON c."companyId" = d."companyId" JOIN "financialStatement" fs ON fs."financialStatementCode" = d."financialStatementCode" LEFT JOIN "accountMapping" m ON m."countryCode" = c."countryCode" AND m."localAccountCode" = l."localAccountCode" LEFT JOIN "groupAccount" g ON g."groupAccountId" = m."groupAccountId"`);

export const vLineUsd = pgView("vLineUsd", {	lineId: text(),
	loadId: uuid(),
	rowNumber: integer(),
	companyCode: text(),
	scenarioCode: text(),
	periodCode: text(),
	localAccountCode: text(),
	description: text(),
	currencyCode: text(),
	amount: numeric({ precision: 20, scale:  2 }),
	icPartnerCode: text(),
	icDocumentId: text(),
	transactionCurrencyCode: text(),
	transactionAmount: numeric({ precision: 20, scale:  2 }),
	counterpartyTaxId: text(),
	volume: numeric(),
	price: numeric(),
	loadStatusCode: text(),
	isConsolidable: boolean(),
	financialStatementCode: text(),
	scenarioId: text(),
	companyId: text(),
	countryCode: text(),
	functionalCurrencyCode: text(),
	groupAccountId: text(),
	accountTypeCode: text(),
	accountCategoryCode: text(),
	isIntercompany: boolean(),
	requiredRateTypeCode: text(),
	rateTypeCode: text(),
	rate: numeric({ precision: 20, scale:  10 }),
	amountUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT v."lineId", v."loadId", v."rowNumber", v."companyCode", v."scenarioCode", v."periodCode", v."localAccountCode", v.description, v."currencyCode", v.amount, v."icPartnerCode", v."icDocumentId", v."transactionCurrencyCode", v."transactionAmount", v."counterpartyTaxId", v.volume, v.price, v."loadStatusCode", v."isConsolidable", v."financialStatementCode", v."scenarioId", v."companyId", v."countryCode", v."functionalCurrencyCode", v."groupAccountId", v."accountTypeCode", v."accountCategoryCode", v."isIntercompany", v."requiredRateTypeCode", r."rateTypeCode", r."rateToUsd" AS rate, round(v.amount * r."rateToUsd", 2) AS "amountUsd" FROM "vMappedLine" v LEFT JOIN "groupExchangeRate" r ON r."scenarioId" = v."scenarioId" AND r."periodCode" = v."periodCode" AND r."currencyCode" = v."functionalCurrencyCode" AND r."rateTypeCode" = v."requiredRateTypeCode"`);

export const vAggregate = pgView("vAggregate", {	scenarioId: text(),
	groupAccountId: text(),
	aggregatedUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT "scenarioId", "groupAccountId", round(sum("amountUsd"), 2) AS "aggregatedUsd" FROM "vLineUsd" WHERE "isConsolidable" AND "groupAccountId" IS NOT NULL GROUP BY "scenarioId", "groupAccountId"`);

export const vIcPair = pgView("vIcPair", {	scenarioId: text(),
	icDocumentId: text(),
	financialStatementCode: text(),
	issuerCompanyId: text(),
	receiverCompanyId: text(),
	issuerLineId: text(),
	receiverLineId: text(),
	issuerTransactionAmount: numeric({ precision: 20, scale:  2 }),
	receiverTransactionAmount: numeric({ precision: 20, scale:  2 }),
	issuerPeriodCode: text(),
	receiverPeriodCode: text(),
	issuerUsd: numeric(),
	receiverUsd: numeric(),
	differenceUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`WITH ic AS ( SELECT v."lineId", v."loadId", v."rowNumber", v."companyCode", v."scenarioCode", v."periodCode", v."localAccountCode", v.description, v."currencyCode", v.amount, v."icPartnerCode", v."icDocumentId", v."transactionCurrencyCode", v."transactionAmount", v."counterpartyTaxId", v.volume, v.price, v."loadStatusCode", v."isConsolidable", v."financialStatementCode", v."scenarioId", v."companyId", v."countryCode", v."functionalCurrencyCode", v."groupAccountId", v."accountTypeCode", v."accountCategoryCode", v."isIntercompany", v."requiredRateTypeCode", v."rateTypeCode", v.rate, v."amountUsd" FROM "vLineUsd" v WHERE v."isIntercompany" AND v."icDocumentId" IS NOT NULL AND v."isConsolidable" ) SELECT COALESCE(a."scenarioId", b."scenarioId") AS "scenarioId", COALESCE(a."icDocumentId", b."icDocumentId") AS "icDocumentId", COALESCE(a."financialStatementCode", b."financialStatementCode") AS "financialStatementCode", COALESCE(a."companyCode", b."icPartnerCode") AS "issuerCompanyId", COALESCE(b."companyCode", a."icPartnerCode") AS "receiverCompanyId", a."lineId" AS "issuerLineId", b."lineId" AS "receiverLineId", a."transactionAmount" AS "issuerTransactionAmount", b."transactionAmount" AS "receiverTransactionAmount", a."periodCode" AS "issuerPeriodCode", b."periodCode" AS "receiverPeriodCode", a."amountUsd" AS "issuerUsd", b."amountUsd" AS "receiverUsd", a."amountUsd" - b."amountUsd" AS "differenceUsd" FROM ( SELECT ic."lineId", ic."loadId", ic."rowNumber", ic."companyCode", ic."scenarioCode", ic."periodCode", ic."localAccountCode", ic.description, ic."currencyCode", ic.amount, ic."icPartnerCode", ic."icDocumentId", ic."transactionCurrencyCode", ic."transactionAmount", ic."counterpartyTaxId", ic.volume, ic.price, ic."loadStatusCode", ic."isConsolidable", ic."financialStatementCode", ic."scenarioId", ic."companyId", ic."countryCode", ic."functionalCurrencyCode", ic."groupAccountId", ic."accountTypeCode", ic."accountCategoryCode", ic."isIntercompany", ic."requiredRateTypeCode", ic."rateTypeCode", ic.rate, ic."amountUsd" FROM ic WHERE ic."accountTypeCode" = ANY (ARRAY['ING'::text, 'ACT'::text])) a FULL JOIN ( SELECT ic."lineId", ic."loadId", ic."rowNumber", ic."companyCode", ic."scenarioCode", ic."periodCode", ic."localAccountCode", ic.description, ic."currencyCode", ic.amount, ic."icPartnerCode", ic."icDocumentId", ic."transactionCurrencyCode", ic."transactionAmount", ic."counterpartyTaxId", ic.volume, ic.price, ic."loadStatusCode", ic."isConsolidable", ic."financialStatementCode", ic."scenarioId", ic."companyId", ic."countryCode", ic."functionalCurrencyCode", ic."groupAccountId", ic."accountTypeCode", ic."accountCategoryCode", ic."isIntercompany", ic."requiredRateTypeCode", ic."rateTypeCode", ic.rate, ic."amountUsd" FROM ic WHERE ic."accountTypeCode" = ANY (ARRAY['GAS'::text, 'PAS'::text])) b ON a."scenarioId" = b."scenarioId" AND a."icDocumentId" = b."icDocumentId" AND a."financialStatementCode" = b."financialStatementCode"`);

export const vIcBilledMatrix = pgView("vIcBilledMatrix", {	scenarioId: text(),
	issuerCompanyId: text(),
	receiverCompanyId: text(),
	billedUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT "scenarioId", "companyCode" AS "issuerCompanyId", "icPartnerCode" AS "receiverCompanyId", round(sum("amountUsd"), 2) AS "billedUsd" FROM "vLineUsd" WHERE "isIntercompany" AND "accountTypeCode" = 'ING'::text AND "financialStatementCode" = 'PYG'::text AND "isConsolidable" GROUP BY "scenarioId", "companyCode", "icPartnerCode"`);

export const vIcBalanceMatrix = pgView("vIcBalanceMatrix", {	scenarioId: text(),
	companyId: text(),
	partnerCompanyId: text(),
	balanceUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT "scenarioId", "companyCode" AS "companyId", "icPartnerCode" AS "partnerCompanyId", round(sum( CASE WHEN "accountTypeCode" = 'ACT'::text THEN "amountUsd" ELSE - "amountUsd" END), 2) AS "balanceUsd" FROM "vLineUsd" WHERE "isIntercompany" AND "financialStatementCode" = 'BALANCE'::text AND "isConsolidable" GROUP BY "scenarioId", "companyCode", "icPartnerCode"`);

export const vLineCounterparty = pgView("vLineCounterparty", {	lineId: text(),
	loadId: uuid(),
	companyCode: text(),
	localAccountCode: text(),
	icPartnerCode: text(),
	counterpartyTaxId: text(),
	icPartnerCounterpartyId: text(),
	taxIdCounterpartyId: text(),
	taxIdCounterpartyTypeCode: text(),
	alertCode: text(),
}).with({"securityInvoker":true}).as(sql`SELECT l."lineId", l."loadId", l."companyCode", l."localAccountCode", l."icPartnerCode", l."counterpartyTaxId", cp."counterpartyId" AS "icPartnerCounterpartyId", tp."counterpartyId" AS "taxIdCounterpartyId", tp."counterpartyTypeCode" AS "taxIdCounterpartyTypeCode", CASE WHEN l."icPartnerCode" IS NOT NULL AND cp."counterpartyId" IS NULL THEN 'UNKNOWN_IC_PARTNER'::text WHEN l."icPartnerCode" = l."companyCode" THEN 'SELF_BILLING'::text WHEN l."icPartnerCode" IS NULL AND tp."counterpartyTypeCode" = 'INTERCOMPANY'::text THEN 'IC_RECORDED_AS_THIRD_PARTY'::text WHEN l."counterpartyTaxId" IS NOT NULL AND tp."counterpartyId" IS NULL THEN 'UNREGISTERED_THIRD_PARTY'::text ELSE NULL::text END AS "alertCode" FROM "dataLoadLine" l LEFT JOIN counterparty cp ON cp."companyId" = l."icPartnerCode" LEFT JOIN counterparty tp ON tp."taxId" = l."counterpartyTaxId"`);

export const vKpiBalance = pgView("vKpiBalance", {	runId: uuid(),
	basisCode: text(),
	companyId: text(),
	groupAccountId: text(),
	amountUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT cb."runId", 'CONSOLIDADO'::text AS "basisCode", NULL::text AS "companyId", cb."groupAccountId", cb."consolidatedUsd" AS "amountUsd" FROM "consolidatedBalance" cb UNION ALL SELECT cb."runId", 'AGREGADO'::text AS "basisCode", NULL::text AS "companyId", cb."groupAccountId", cb."aggregatedUsd" AS "amountUsd" FROM "consolidatedBalance" cb UNION ALL SELECT l."runId", 'EMPRESA'::text AS "basisCode", l."companyId", l."groupAccountId", sum(l."contributionUsd") AS "amountUsd" FROM lineage l WHERE l."sourceTypeCode" = 'LINEA_CARGA'::text AND l."companyId" IS NOT NULL GROUP BY l."runId", l."companyId", l."groupAccountId"`);

export const vKpi = pgView("vKpi", {	runId: uuid(),
	basisCode: text(),
	companyId: text(),
	salesUsd: numeric(),
	ebitUsd: numeric(),
	workingCapitalUsd: numeric(),
	fixedAssetsUsd: numeric(),
	totalAssetsUsd: numeric(),
	currentLiabilitiesUsd: numeric(),
	effectiveTaxRate: numeric(),
	wacc: numeric(),
	investedCapitalUsd: numeric(),
	capitalEmployedUsd: numeric(),
	nopatUsd: numeric(),
	roic: numeric(),
	roce: numeric(),
	evaUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`WITH m AS ( SELECT b."runId", b."basisCode", b."companyId", b."groupAccountId", b."amountUsd", t."kpiSign", t."accountTypeCode", ac."kpiGroupCode", ac."isSales", g."isCurrent" FROM "vKpiBalance" b JOIN "groupAccount" g ON g."groupAccountId" = b."groupAccountId" JOIN "accountType" t ON t."accountTypeCode" = g."accountTypeCode" JOIN "accountCategory" ac ON ac."accountCategoryCode" = g."accountCategoryCode" ), k AS ( SELECT m."runId", m."basisCode", m."companyId", COALESCE(sum(m."amountUsd") FILTER (WHERE m."isSales"), 0::numeric) AS "salesUsd", COALESCE(sum(m."amountUsd" * m."kpiSign"::numeric) FILTER (WHERE m."kpiGroupCode" = 'EBIT'::text), 0::numeric) AS "ebitUsd", COALESCE(sum(m."amountUsd" * m."kpiSign"::numeric) FILTER (WHERE m."kpiGroupCode" = 'WORKING_CAPITAL'::text), 0::numeric) AS "workingCapitalUsd", COALESCE(sum(m."amountUsd" * m."kpiSign"::numeric) FILTER (WHERE m."kpiGroupCode" = 'FIXED_ASSET'::text), 0::numeric) AS "fixedAssetsUsd", COALESCE(sum(m."amountUsd") FILTER (WHERE m."accountTypeCode" = 'ACT'::text), 0::numeric) AS "totalAssetsUsd", COALESCE(sum(m."amountUsd") FILTER (WHERE m."accountTypeCode" = 'PAS'::text AND m."isCurrent"), 0::numeric) AS "currentLiabilitiesUsd" FROM m GROUP BY m."runId", m."basisCode", m."companyId" ), grouptax AS ( SELECT k."runId", sum(k."ebitUsd" * c."incomeTaxRate") / NULLIF(sum(k."ebitUsd"), 0::numeric) AS "taxRate" FROM k JOIN company c ON c."companyId" = k."companyId" WHERE k."basisCode" = 'EMPRESA'::text AND k."ebitUsd" > 0::numeric GROUP BY k."runId" ), r AS ( SELECT k."runId", k."basisCode", k."companyId", k."salesUsd", k."ebitUsd", k."workingCapitalUsd", k."fixedAssetsUsd", k."totalAssetsUsd", k."currentLiabilitiesUsd", COALESCE(c."incomeTaxRate", gt."taxRate") AS "effectiveTaxRate", (run."parameterSnapshot" ->> 'WACC'::text)::numeric AS wacc, k."workingCapitalUsd" + k."fixedAssetsUsd" AS "investedCapitalUsd", k."totalAssetsUsd" - k."currentLiabilitiesUsd" AS "capitalEmployedUsd" FROM k JOIN "consolidationRun" run ON run."runId" = k."runId" LEFT JOIN company c ON c."companyId" = k."companyId" LEFT JOIN grouptax gt ON gt."runId" = k."runId" ) SELECT "runId", "basisCode", "companyId", "salesUsd", "ebitUsd", "workingCapitalUsd", "fixedAssetsUsd", "totalAssetsUsd", "currentLiabilitiesUsd", "effectiveTaxRate", wacc, "investedCapitalUsd", "capitalEmployedUsd", "ebitUsd" * (1::numeric - "effectiveTaxRate") AS "nopatUsd", "ebitUsd" * (1::numeric - "effectiveTaxRate") / NULLIF("investedCapitalUsd", 0::numeric) AS roic, "ebitUsd" / NULLIF("capitalEmployedUsd", 0::numeric) AS roce, "ebitUsd" * (1::numeric - "effectiveTaxRate") - wacc * "investedCapitalUsd" AS "evaUsd" FROM r`);

export const vGroupKpi = pgView("vGroupKpi", {	runId: uuid(),
	basisCode: text(),
	companyId: text(),
	salesUsd: numeric(),
	ebitUsd: numeric(),
	workingCapitalUsd: numeric(),
	fixedAssetsUsd: numeric(),
	totalAssetsUsd: numeric(),
	currentLiabilitiesUsd: numeric(),
	effectiveTaxRate: numeric(),
	wacc: numeric(),
	investedCapitalUsd: numeric(),
	capitalEmployedUsd: numeric(),
	nopatUsd: numeric(),
	roic: numeric(),
	roce: numeric(),
	evaUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT "runId", "basisCode", "companyId", "salesUsd", "ebitUsd", "workingCapitalUsd", "fixedAssetsUsd", "totalAssetsUsd", "currentLiabilitiesUsd", "effectiveTaxRate", wacc, "investedCapitalUsd", "capitalEmployedUsd", "nopatUsd", roic, roce, "evaUsd" FROM "vKpi" WHERE "basisCode" = ANY (ARRAY['CONSOLIDADO'::text, 'AGREGADO'::text])`);

export const vCompanyKpi = pgView("vCompanyKpi", {	runId: uuid(),
	basisCode: text(),
	companyId: text(),
	salesUsd: numeric(),
	ebitUsd: numeric(),
	workingCapitalUsd: numeric(),
	fixedAssetsUsd: numeric(),
	totalAssetsUsd: numeric(),
	currentLiabilitiesUsd: numeric(),
	effectiveTaxRate: numeric(),
	wacc: numeric(),
	investedCapitalUsd: numeric(),
	capitalEmployedUsd: numeric(),
	nopatUsd: numeric(),
	roic: numeric(),
	roce: numeric(),
	evaUsd: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT "runId", "basisCode", "companyId", "salesUsd", "ebitUsd", "workingCapitalUsd", "fixedAssetsUsd", "totalAssetsUsd", "currentLiabilitiesUsd", "effectiveTaxRate", wacc, "investedCapitalUsd", "capitalEmployedUsd", "nopatUsd", roic, roce, "evaUsd" FROM "vKpi" WHERE "basisCode" = 'EMPRESA'::text`);

export const vLineageDetail = pgView("vLineageDetail", {	runId: uuid(),
	scenarioId: text(),
	groupAccountId: text(),
	groupAccountName: text(),
	sourceTypeCode: text(),
	sourceId: text(),
	companyId: text(),
	companyName: text(),
	localAmount: numeric({ precision: 20, scale:  2 }),
	currencyCode: text(),
	rate: numeric({ precision: 20, scale:  10 }),
	contributionUsd: numeric({ precision: 20, scale:  2 }),
	periodCode: text(),
	localAccountCode: text(),
	description: text(),
	icPartnerCode: text(),
	icDocumentId: text(),
	loadId: uuid(),
	fileName: text(),
	loadVersion: integer(),
	loadStatusCode: text(),
	uploadedBy: uuid(),
	uploadedAt: timestamp({ withTimezone: true, mode: 'string' }),
	approvedBy: uuid(),
	approvedAt: timestamp({ withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT l."runId", r."scenarioId", l."groupAccountId", g.name AS "groupAccountName", l."sourceTypeCode", l."sourceId", l."companyId", c.name AS "companyName", l."localAmount", l."currencyCode", l.rate, l."contributionUsd", dl."periodCode", dl."localAccountCode", dl.description, dl."icPartnerCode", dl."icDocumentId", d."loadId", d."fileName", d.version AS "loadVersion", d."statusCode" AS "loadStatusCode", d."uploadedBy", d."uploadedAt", d."approvedBy", d."approvedAt" FROM lineage l JOIN "consolidationRun" r ON r."runId" = l."runId" JOIN "groupAccount" g ON g."groupAccountId" = l."groupAccountId" LEFT JOIN company c ON c."companyId" = l."companyId" LEFT JOIN "dataLoadLine" dl ON l."sourceTypeCode" = 'LINEA_CARGA'::text AND dl."lineId" = l."sourceId" LEFT JOIN "dataLoad" d ON d."loadId" = dl."loadId"`);

export const vVarianceBridgeCheck = pgView("vVarianceBridgeCheck", {	bridgeId: uuid(),
	fromRunId: uuid(),
	toRunId: uuid(),
	bridgeSalesDeltaUsd: numeric(),
	kpiSalesDeltaUsd: numeric(),
	bridgeEbitDeltaUsd: numeric(),
	kpiEbitDeltaUsd: numeric(),
	bridgeEvaDeltaUsd: numeric(),
	kpiEvaDeltaUsd: numeric(),
	isBalanced: boolean(),
}).with({"securityInvoker":true}).as(sql`WITH l AS ( SELECT "varianceBridgeLine"."bridgeId", sum("varianceBridgeLine"."salesDeltaUsd") AS sales, sum("varianceBridgeLine"."ebitDeltaUsd") AS ebit FROM "varianceBridgeLine" GROUP BY "varianceBridgeLine"."bridgeId" ), e AS ( SELECT "varianceBridgeEva"."bridgeId", sum("varianceBridgeEva"."evaDeltaUsd") AS eva FROM "varianceBridgeEva" GROUP BY "varianceBridgeEva"."bridgeId" ) SELECT b."bridgeId", b."fromRunId", b."toRunId", COALESCE(l.sales, 0::numeric) AS "bridgeSalesDeltaUsd", k2."salesUsd" - k1."salesUsd" AS "kpiSalesDeltaUsd", COALESCE(l.ebit, 0::numeric) AS "bridgeEbitDeltaUsd", k2."ebitUsd" - k1."ebitUsd" AS "kpiEbitDeltaUsd", COALESCE(e.eva, 0::numeric) AS "bridgeEvaDeltaUsd", k2."evaUsd" - k1."evaUsd" AS "kpiEvaDeltaUsd", abs(COALESCE(l.sales, 0::numeric) - (k2."salesUsd" - k1."salesUsd")) <= 1::numeric AND abs(COALESCE(l.ebit, 0::numeric) - (k2."ebitUsd" - k1."ebitUsd")) <= 1::numeric AND abs(COALESCE(e.eva, 0::numeric) - (k2."evaUsd" - k1."evaUsd")) <= 1::numeric AS "isBalanced" FROM "varianceBridge" b LEFT JOIN l ON l."bridgeId" = b."bridgeId" LEFT JOIN e ON e."bridgeId" = b."bridgeId" JOIN "vKpi" k1 ON k1."runId" = b."fromRunId" AND k1."basisCode" = 'CONSOLIDADO'::text JOIN "vKpi" k2 ON k2."runId" = b."toRunId" AND k2."basisCode" = 'CONSOLIDADO'::text`);