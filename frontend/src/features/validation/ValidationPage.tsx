import { useMemo, useState } from 'react'
import { ArrowDownWideNarrow, RefreshCw, Upload } from 'lucide-react'
import { Button, Callout, Card, CardHeader, Chip, PageHeader, QueryState, Split, Stack } from '@/shared/ui'
import { useIsMobile, useScenarioContext } from '@/shared/hooks'
import type { ValidationReport } from './domain/types'
import { countBySeverity, severityLabel, sortFindingsByImpact, takeVisible } from './domain/validation'
import { useAcceptCorrection } from './hooks/useAcceptCorrection'
import { useValidationReport } from './hooks/useValidationReport'
import { CorrectionFeedback, FindingDetail } from './ui/FindingDetail'
import { FindingCard, FindingsTable } from './ui/FindingsTable'
import type { RankedFinding } from './ui/FindingsTable'
import { LoadCards } from './ui/LoadCards'
import s from './ValidationPage.module.css'

const PAGE_SIZE = 10

export default function ValidationPage() {
  const { scenario } = useScenarioContext()
  const query = useValidationReport()
  return (
    <Stack>
      <PageHeader
        eyebrow={`PASO 1 · VALIDAR · ${scenario.label.toUpperCase()}`}
        title="Carga y validación"
        subtitle="Nada entra al número del grupo sin pasar el validador. Los hallazgos se ordenan por impacto en USD, no por fila."
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => query.refetch()} disabled={query.isFetching}>Re-validar</Button>
            <Button variant="primary" icon={Upload} disabled title="Próximamente">Subir archivos</Button>
          </>
        }
      />
      <QueryState query={query} emptyTitle="Sin validación disponible" emptyText="El servicio todavía no expone el reporte de validación de este escenario.">
        {report => <ValidationContent report={report} />}
      </QueryState>
    </Stack>
  )
}

function ValidationContent({ report }: { report: ValidationReport }) {
  const mobile = useIsMobile()
  const accept = useAcceptCorrection()
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState(false)

  const ranked = useMemo<RankedFinding[]>(() => sortFindingsByImpact(report.findings).map((f, i) => ({ ...f, rank: i + 1 })), [report.findings])
  const counts = useMemo(() => countBySeverity(report.findings), [report.findings])
  const { visible, hidden } = takeVisible(ranked, PAGE_SIZE, expanded)
  const selected = ranked.find(f => f.id === selectedId) ?? ranked[0]

  const select = (id: string) => { accept.reset(); setSelectedId(id) }
  const acceptSelected = (justification: string) => {
    if (selected) accept.mutate({ findingId: selected.id, justification })
  }

  const feedbackRule = accept.variables ? ranked.find(f => f.id === accept.variables.findingId)?.rule ?? accept.variables.findingId : ''
  const feedback = accept.isSuccess
    ? <CorrectionFeedback status="success" findingRule={feedbackRule} />
    : accept.isError ? <CorrectionFeedback status="error" findingRule={feedbackRule} message={accept.error.message} /> : null

  const detail = (compact: boolean) => selected && (
    <FindingDetail key={selected.id} finding={selected} pending={accept.isPending} onAccept={acceptSelected} compact={compact} />
  )

  const more = hidden > 0 && (
    <Button variant="ghost" className={s.more} onClick={() => setExpanded(true)}>Ver los {hidden} restantes</Button>
  )

  const summary = (
    <div className={s.chips}>
      {counts.blocking > 0 && <Chip tone="err">{counts.blocking} {counts.blocking === 1 ? 'bloqueante' : 'bloqueantes'}</Chip>}
      {counts.warnings > 0 && <Chip tone="warn">{counts.warnings} {counts.warnings === 1 ? 'advertencia' : 'advertencias'}</Chip>}
      {counts.info > 0 && <Chip tone="info">{counts.info} {counts.info === 1 ? 'informativa' : 'informativas'}</Chip>}
    </div>
  )

  return (
    <>
      <LoadCards loads={report.loads} mobile={mobile} />
      {feedback}
      {ranked.length === 0 ? (
        <Callout tone="ok" title="Sin hallazgos.">El validador no encontró diferencias: la carga puede publicarse.</Callout>
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
