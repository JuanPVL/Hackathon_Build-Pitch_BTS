import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Play, Upload } from 'lucide-react'
import { COMPANIES, type CompanyCode } from '@/entities'
import { useBackend } from '@/shared/api/useBackend'
import { useScenarioContext } from '@/shared/hooks'
import { Button, Callout, Card, CardHeader, Chip, QueryState, Stack } from '@/shared/ui'
import { useAuth } from '@/shared/auth'
import { useBackendAccess } from '@/shared/auth/useBackendAccess'

export function LoadBrowser({ showUploader = false }: { showUploader?: boolean }) {
  const backend = useBackend()
  const { session } = useAuth()
  const access = useBackendAccess()
  const queryClient = useQueryClient()
  const { query: scenario } = useScenarioContext()

  const [companyId, setCompanyId] = useState<CompanyCode>('GT1')
  const [statementCode, setStatementCode] = useState<'PYG' | 'BALANCE'>('PYG')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [actionMsg, setActionMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const query = useQuery({
    queryKey: ['loads', scenario.scenarioId],
    queryFn: ({ signal }) => backend.loads(scenario.scenarioId, signal),
    enabled: !!session,
  })

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['loads'] })
    await queryClient.invalidateQueries({ queryKey: ['validation'] })
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('Selecciona un archivo CSV antes de subir.')
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('companyId', companyId)
      form.append('scenarioId', scenario.scenarioId)
      form.append('financialStatementCode', statementCode)
      return backend.uploadLoad(form)
    },
    onSuccess: async (created) => {
      setSelectedFile(null)
      setActionMsg({
        tone: 'ok',
        text: `Archivo ${created.fileName} subido (${created.companyId} · v${created.version} · ${created.statusCode} · ${created.rowCount} filas).`,
      })
      await refreshAll()
    },
    onError: (err: Error) => setActionMsg({ tone: 'err', text: err.message }),
  })

  const validateMutation = useMutation({
    mutationFn: (loadId: string) => backend.validateLoad(loadId),
    onSuccess: async (res) => {
      setActionMsg({
        tone: res.statusCode === 'VALIDADA' ? 'ok' : 'err',
        text: `Carga validada → estado ${res.statusCode} (${res.findingsCount} hallazgos).`,
      })
      await refreshAll()
    },
    onError: (err: Error) => setActionMsg({ tone: 'err', text: err.message }),
  })

  const approveMutation = useMutation({
    mutationFn: (loadId: string) => backend.approveLoad(loadId, 'Aprobada desde panel de validación'),
    onSuccess: async (res) => {
      setActionMsg({
        tone: 'ok',
        text: `Carga ${res.fileName} (v${res.version}) aprobada.`,
      })
      await refreshAll()
    },
    onError: (err: Error) => setActionMsg({ tone: 'err', text: err.message }),
  })

  if (!session) return null

  const grants = access.data?.grants ?? []
  const canWriteAll = Boolean(access.data?.permissions.writeAll)
  const canWriteCompany = (comp: string) =>
    canWriteAll || grants.some(g => g.companyId === comp && g.roleCode === 'COMPANY_ACCOUNTANT')

  return (
    <Stack>
      {showUploader && (
        <Card aria-label="Cargador de archivos CSV">
          <CardHeader title="Subir archivo CSV (nueva versión)" />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setActionMsg(null)
              uploadMutation.mutate()
            }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Empresa
              <select
                aria-label="Empresa de la carga"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value as CompanyCode)}
                style={{ minHeight: 38, padding: '6px 10px', borderRadius: 8 }}
              >
                {COMPANIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Estado financiero
              <select
                aria-label="Tipo de estado financiero"
                value={statementCode}
                onChange={(e) => setStatementCode(e.target.value as 'PYG' | 'BALANCE')}
                style={{ minHeight: 38, padding: '6px 10px', borderRadius: 8 }}
              >
                <option value="PYG">PYG · Presupuesto de resultados</option>
                <option value="BALANCE">BALANCE · Balance general</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Archivo CSV
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Archivo CSV"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              icon={Upload}
              disabled={!selectedFile || uploadMutation.isPending || !canWriteCompany(companyId)}
            >
              {uploadMutation.isPending ? 'Subiendo…' : 'Confirmar carga CSV'}
            </Button>
          </form>
        </Card>
      )}

      {actionMsg && <Callout tone={actionMsg.tone}>{actionMsg.text}</Callout>}

      <Card>
        <CardHeader title="Archivos recibidos" />
        <QueryState query={query} isEmpty={(rows) => rows.length === 0} emptyTitle="Sin cargas en este escenario">
          {(rows) => (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((load) => {
                const writable = canWriteCompany(load.companyId)
                const canValidate = writable && load.statusCode !== 'APROBADA' && load.statusCode !== 'REEMPLAZADA'
                const canApprove = writable && load.statusCode === 'VALIDADA'
                return (
                  <li
                    key={load.loadId}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid var(--q-line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <Link to={`/cargas/${load.loadId}?esc=${scenario.scenarioId}`}>
                        <strong>{load.fileName}</strong>
                      </Link>
                      {' · '}
                      <span>{load.companyId}</span>
                      {' · '}
                      <span>{load.financialStatementCode}</span>
                      {' · '}
                      <span>v{load.version}</span>
                      {' · '}
                      <Chip
                        tone={
                          load.statusCode === 'APROBADA'
                            ? 'ok'
                            : load.statusCode === 'CUARENTENA'
                              ? 'err'
                              : load.statusCode === 'VALIDADA'
                                ? 'info'
                                : 'neutral'
                        }
                      >
                        {load.statusCode}
                      </Chip>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {canValidate && (
                        <Button
                          variant="secondary"
                          icon={Play}
                          disabled={validateMutation.isPending}
                          onClick={() => validateMutation.mutate(load.loadId)}
                        >
                          Validar
                        </Button>
                      )}
                      {canApprove && (
                        <Button
                          variant="primary"
                          icon={Check}
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(load.loadId)}
                        >
                          Aprobar
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </QueryState>
      </Card>
    </Stack>
  )
}
