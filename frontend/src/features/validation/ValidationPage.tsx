import { LoadBrowser } from '@/features/backend/LoadBrowser'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowDownWideNarrow, Filter, RefreshCw, Upload } from 'lucide-react'
import { Button, Callout, Card, CardHeader, Chip, Grid, PageHeader, QueryState, SegmentedControl, Split, Stack, StatCard } from '@/shared/ui'
import { useIsMobile, useScenarioContext } from '@/shared/hooks'
import type { Severity, ValidationReport } from './domain/types'
import { countBySeverity, severityLabel, sortFindingsByImpact, takeVisible } from './domain/validation'
import { useAcceptCorrection } from './hooks/useAcceptCorrection'
import { useValidationReport } from './hooks/useValidationReport'
import { CorrectionFeedback, FindingDetail } from './ui/FindingDetail'
import { FindingCard, FindingsTable } from './ui/FindingsTable'
import type { RankedFinding } from './ui/FindingsTable'
import { LoadCards } from './ui/LoadCards'
import s from './ValidationPage.module.css'

const PAGE_SIZE = 10
type SeverityFilter = 'TODAS' | Severity

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: 'TODAS', label: 'Todas las severidades' },
  { value: 'B', label: 'Bloqueantes' },
  { value: 'A', label: 'Advertencias' },
  { value: 'I', label: 'Informativas' },
]

export default function ValidationPage() {
  const { scenario, setScenario } = useScenarioContext()
  const location = useLocation()
  const isFindingsRoute = location.pathname.startsWith('/hallazgos')
  const query = useValidationReport()
  return (
    <Stack>
      <PageHeader
        eyebrow={isFindingsRoute ? `PASO 1 · AUDITORÍA DE CALIDAD · ${scenario.label.toUpperCase()}` : `PASO 1 · VALIDAR · ${scenario.label.toUpperCase()}`}
        title={isFindingsRoute ? 'Hallazgos del grupo' : 'Carga y validación'}
        subtitle={
          isFindingsRoute
            ? 'Inspección centralizada de reglas de validación V01–V10 por severidad, empresa e impacto económico en USD.'
            : 'Nada entra al número del grupo sin pasar el validador. Los hallazgos se ordenan por impacto en USD, no por fila.'
        }
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => query.refetch()} disabled={query.isFetching}>Actualizar</Button>
            {!isFindingsRoute && (
              <Button variant="primary" icon={Upload} disabled title="Próximamente">Subir archivos</Button>
            )}
          </>
        }
      />
      <QueryState query={query} emptyTitle="Sin validación disponible" emptyText="El servicio todavía no expone el reporte de validación de este escenario.">
        {report => (
          <>
            {!isFindingsRoute && <LoadBrowser showUploader />}
            <ValidationContent
              report={report}
              isFindingsRoute={isFindingsRoute}
              scenarioId={scenario.id}
              onSwitchToV1={() => setScenario('PPTO_V1')}
            />
          </>
        )}
      </QueryState>
    </Stack>
  )
}

function ValidationContent({
  report,
  isFindingsRoute,
  scenarioId,
  onSwitchToV1,
}: {
  report: ValidationReport
  isFindingsRoute?: boolean
  scenarioId?: string
  onSwitchToV1?: () => void
}) {
  const mobile = useIsMobile()
  const accept = useAcceptCorrection()
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState(false)
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('TODAS')

  const allRanked = useMemo<RankedFinding[]>(
    () => sortFindingsByImpact(report.findings).map((f, i) => ({ ...f, rank: i + 1 })),
    [report.findings],
  )
  const ranked = useMemo<RankedFinding[]>(
    () =>
      allRanked.filter(
        f =>
          (!companyFilter || f.scope === companyFilter) &&
          (severityFilter === 'TODAS' || f.severity === severityFilter),
      ),
    [allRanked, companyFilter, severityFilter],
  )
  const counts = useMemo(() => countBySeverity(report.findings), [report.findings])
  const { visible, hidden } = takeVisible(ranked, PAGE_SIZE, expanded)
  const selected = ranked.find(f => f.id === selectedId) ?? ranked[0]

  const select = (id: string) => { accept.reset(); setSelectedId(id) }
  const toggleCompany = (owner: string) => {
    setCompanyFilter(prev => (prev === owner ? null : owner))
    setSelectedId(undefined)
  }
  const acceptSelected = (justification: string) => {
    if (selected) accept.mutate({ findingId: selected.id, justification })
  }

  const feedbackRule = accept.variables ? allRanked.find(f => f.id === accept.variables.findingId)?.rule ?? accept.variables.findingId : ''
  const feedback = accept.isSuccess
    ? <CorrectionFeedback status="success" findingRule={feedbackRule} />
    : accept.isError ? <CorrectionFeedback status="error" findingRule={feedbackRule} message={accept.error.message} /> : null

  const detail = (compact: boolean) => selected && (
    <FindingDetail key={selected.id} finding={selected} pending={accept.isPending} onAccept={acceptSelected} compact={compact} canAccept={report.canAcceptCorrection} />
  )

  const more = hidden > 0 && (
    <Button variant="ghost" className={s.more} onClick={() => setExpanded(true)}>Ver los {hidden} restantes</Button>
  )

  const summary = (
    <div className={s.chips}>
      {counts.blocking > 0 && <Chip tone="err">{counts.blocking} {counts.blocking === 1 ? 'bloqueante' : 'bloqueantes'}</Chip>}
      {counts.warnings > 0 && <Chip tone="warn">{counts.warnings} {counts.warnings === 1 ? 'advertencia' : 'advertencias'}</Chip>}
      {counts.info > 0 && <Chip tone="info">{counts.info} {counts.info === 1 ? 'informativa' : 'informativas'}</Chip>}
      {companyFilter && (
        <Button variant="ghost" onClick={() => setCompanyFilter(null)}>
          Quitar filtro de empresa ({companyFilter})
        </Button>
      )}
    </div>
  )

  return (
    <>
      {isFindingsRoute && (
        <Grid cols={4}>
          <StatCard tone="navy" valueTone="ink" label="Total hallazgos del escenario" value={String(allRanked.length)} caption="Reglas V01 a V10 evaluadas en SQL" />
          <StatCard label="Bloqueantes (Cuarentena)" value={String(counts.blocking)} valueTone={counts.blocking > 0 ? 'red' : 'green'} caption="Impiden aprobar la carga" />
          <StatCard label="Advertencias" value={String(counts.warnings)} valueTone={counts.warnings > 0 ? 'orange' : 'ink'} caption="Requieren justificación al aprobar" />
          <StatCard label="Informativas" value={String(counts.info)} valueTone="blue" caption="Variaciones dentro de umbral" />
        </Grid>
      )}
      <LoadCards loads={report.loads} mobile={mobile} selectedOwner={companyFilter} onSelectOwner={toggleCompany} />
      {(isFindingsRoute || allRanked.length > 0) && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Filter size={15} aria-hidden />
              <strong>Filtrar hallazgos:</strong>
              <span>{companyFilter ? `Empresa ${companyFilter}` : 'Todas las empresas (haz clic en una tarjeta arriba para filtrar)'}</span>
            </div>
            <SegmentedControl<SeverityFilter>
              label="Filtrar por severidad"
              options={SEVERITY_OPTIONS}
              value={severityFilter}
              onChange={v => { setSeverityFilter(v); setSelectedId(undefined) }}
            />
          </div>
        </Card>
      )}
      {feedback}
      {allRanked.length === 0 ? (
        <Callout tone="ok" title="Sin hallazgos.">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span>No hay hallazgos registrados en este escenario. La publicación depende del estado de aprobación de las cargas.</span>
            {scenarioId === 'PPTO_V2' && onSwitchToV1 && (
              <Button variant="secondary" onClick={onSwitchToV1}>
                Ver los 14 hallazgos del escenario V1
              </Button>
            )}
          </div>
        </Callout>
      ) : ranked.length === 0 ? (
        <Callout tone="info" title="Sin hallazgos para este filtro.">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span>No hay hallazgos que coincidan con la empresa o severidad seleccionada.</span>
            <Button variant="secondary" onClick={() => { setCompanyFilter(null); setSeverityFilter('TODAS') }}>
              Mostrar todos los hallazgos ({allRanked.length})
            </Button>
          </div>
        </Callout>
      ) : mobile ? (
        <section className={s.mobileSection} aria-labelledby="hallazgos-titulo">
          <div className={s.mobileHead}>
            <h2 id="hallazgos-titulo" className={s.mobileTitle}>{ranked.length} hallazgos por impacto en USD</h2>
            <span className={s.sort}><ArrowDownWideNarrow size={14} aria-hidden /> Mayor primero</span>
          </div>
          {summary}
          <ul className={s.cards} aria-label="Hallazgos">
            {visible.map(f => (
              <li key={f.id}>
                <FindingCard finding={f} selected={f.id === selected?.id} onSelect={() => select(f.id)}>{detail(true)}</FindingCard>
              </li>
            ))}
          </ul>
          {more}
        </section>
      ) : (
        <Split aside={400}>
          <Card aria-label="Hallazgos">
            <CardHeader
              title={`${ranked.length} ${ranked.length === 1 ? 'hallazgo' : 'hallazgos'}`}
              aside={<span className={s.sort}><ArrowDownWideNarrow size={14} aria-hidden /> Ordenado por impacto en USD</span>}
            />
            <div className={s.summaryRow}>{summary}</div>
            <FindingsTable rows={visible} selectedId={selected?.id} onSelect={f => select(f.id)} />
            {more}
          </Card>
          {selected && (
            <Card tone="navy" aria-label="Detalle del hallazgo">
              <p className={s.detailEyebrow}>{selected.rule} · {severityLabel(selected.severity).toUpperCase()}</p>
              <h2 className={s.detailTitle}>{selected.message}</h2>
              <code className={s.detailRecord}>{selected.record}</code>
              {detail(false)}
            </Card>
          )}
        </Split>
      )}
    </>
  )
}
