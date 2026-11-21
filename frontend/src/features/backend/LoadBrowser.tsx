import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useBackend } from '@/shared/api/useBackend'
import { useScenarioContext } from '@/shared/hooks'
import { Card, CardHeader, QueryState } from '@/shared/ui'
import { useAuth } from '@/shared/auth'

export function LoadBrowser() {
  const backend = useBackend()
  const { session } = useAuth()
  const { query: scenario } = useScenarioContext()
  const query = useQuery({
    queryKey: ['loads', scenario.scenarioId],
    queryFn: ({ signal }) => backend.loads(scenario.scenarioId, signal),
    enabled: !!session,
  })
  if (!session) return null
  return <Card><CardHeader title="Archivos recibidos" />
    <QueryState query={query} isEmpty={rows => rows.length === 0} emptyTitle="Sin cargas en este escenario">
      {rows => <ul>{rows.map(load => <li key={load.loadId} style={{ padding: '8px 0' }}>
        <Link to={`/cargas/${load.loadId}?esc=${scenario.scenarioId}`}>{load.fileName}</Link>
        {' · '}{load.companyId} · {load.statusCode}
      </li>)}</ul>}
    </QueryState>
  </Card>
}
