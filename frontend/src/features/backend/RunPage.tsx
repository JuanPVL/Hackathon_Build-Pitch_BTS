import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useBackend } from '@/shared/api/useBackend'
import { ButtonLink, Card, PageHeader, QueryState, Stack } from '@/shared/ui'

export default function RunPage() {
  const { runId = '' } = useParams()
  const backend = useBackend()
  const query = useQuery({ queryKey: ['run', runId], queryFn: ({ signal }) => backend.run(runId, signal) })
  return <Stack><PageHeader eyebrow="CONSOLIDACIÓN · TRAZABILIDAD" title="Detalle de corrida"
    actions={<ButtonLink to="/">Volver al consolidado</ButtonLink>} />
    <QueryState query={query}>{({ run, loads }) => <>
      <Card><h2>{run.scenarioId}</h2><p>Corrida: {run.runId}</p><p>Generada: {run.executedAt}</p>
        <p>Linaje: {run.lineageOk === null ? 'No informado' : run.lineageOk ? 'Verificado' : 'No cuadra'}</p>
        <p>Hash de tasas: {run.ratesHash ?? 'No informado'}</p>
        {run.notes && <p>{run.notes}</p>}
        <h3>Parámetros congelados</h3>
        <dl>{Object.entries(run.parameterSnapshot ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>
      </Card>
      <Card><h2>Cargas incluidas</h2><ul>{loads.map(load => <li key={load.loadId}><Link to={`/cargas/${load.loadId}?esc=${run.scenarioId}`}>{load.fileName}</Link>{' · '}{load.companyId} · {load.financialStatementCode} · {load.statusCode}</li>)}</ul></Card>
    </>}</QueryState>
  </Stack>
}
