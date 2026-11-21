import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useBackend } from '@/shared/api/useBackend'
import { PageHeader, Stack, Card, QueryState, ButtonLink } from '@/shared/ui'

export default function LoadPage() {
  const { loadId = '' } = useParams()
  const backend = useBackend()
  const query = useQuery({ queryKey: ['load', loadId], queryFn: ({ signal }) => backend.load(loadId, signal) })
  return <Stack><PageHeader eyebrow="VALIDAR · ORIGEN" title="Detalle de carga"
    actions={<ButtonLink to="/validacion">Volver a validación</ButtonLink>} />
    <QueryState query={query}>{load => <Card>
      <h2>{load.fileName}</h2><p>{load.companyId} · {load.scenarioId} · {load.financialStatementCode} · {load.statusCode} · versión {load.version}</p>
      {load.statusReason && <p>{load.statusReason}</p>}
      <p>{load.lines.length} filas de origen. Se muestran los campos originales de la API.</p>
      <div style={{ overflowX: 'auto', maxHeight: '65vh' }}><table>
        <thead><tr>{Object.keys(load.lines[0] ?? {}).map(key => <th key={key} style={{ padding: 10 }}>{key}</th>)}</tr></thead>
        <tbody>{load.lines.map((line, i) => <tr key={String(line.lineId ?? i)}>{Object.keys(load.lines[0] ?? {}).map(key => <td key={key} style={{ padding: 10, whiteSpace: 'nowrap' }}>{line[key] == null ? '—' : String(line[key])}</td>)}</tr>)}</tbody>
      </table></div>
    </Card>}</QueryState>
  </Stack>
}
