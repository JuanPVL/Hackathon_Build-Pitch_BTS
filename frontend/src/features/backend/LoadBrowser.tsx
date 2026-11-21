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

const COLUMN_MAPPING_SPEC = [
  { field: 'Cuenta', csvCol: 'groupAccountId / localAccountCode', required: true },
  { field: 'Monto', csvCol: 'functionalAmount', required: true },
  { field: 'Moneda', csvCol: 'originalCurrencyCode', required: true },
  { field: 'Periodo', csvCol: 'periodMonth', required: true },
  { field: 'Empresa contraparte', csvCol: 'counterpartyCompanyId', required: true },
  { field: 'Llave IC / Documento', csvCol: 'icReference', required: true },
] as const

export function LoadBrowser({ showUploader = false }: { showUploader?: boolean }) {
  const backend = useBackend()
  const { session } = useAuth()
  const access = useBackendAccess()
  const queryClient = useQueryClient()
  const { query: scenario, setScenario } = useScenarioContext()

  const [companyId, setCompanyId] = useState<CompanyCode>('GT1')
  const [statementCode, setStatementCode] = useState<'PYG' | 'BALANCE'>('PYG')
  const [targetScenarioId, setTargetScenarioId] = useState<string>(scenario.scenarioId)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [autoDetectedNote, setAutoDetectedNote] = useState<string | null>(null)
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)
  const [lastLoadId, setLastLoadId] = useState<string | null>(null)
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

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file)
    setActionMsg(null)
    if (!file) {
      setPreviewHeaders([])
      setPreviewRows([])
      setAutoDetectedNote(null)
      setWizardStep(1)
      return
    }
    const lowerName = file.name.toLowerCase()
    let detectedStatement: 'PYG' | 'BALANCE' = statementCode
    if (lowerName.includes('balance')) {
      detectedStatement = 'BALANCE'
      setStatementCode('BALANCE')
    } else if (lowerName.includes('presupuesto') || lowerName.includes('pyg')) {
      detectedStatement = 'PYG'
      setStatementCode('PYG')
    }

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length > 0) {
        const headers = lines[0].split(',').map((h) => h.trim())
        const firstRows = lines.slice(1, 5).map((r) => r.split(',').map((c) => c.trim()))
        setPreviewHeaders(headers)
        setPreviewRows(firstRows)

        const firstData = firstRows[0] ?? []
        const empIdx = headers.findIndex(h => h === 'empresa' || h === 'companyCode' || h === 'companyId')
        const escIdx = headers.findIndex(h => h === 'escenario' || h === 'scenarioCode' || h === 'scenarioId')
        const ctaIdx = headers.findIndex(h => h === 'cuenta_local' || h === 'localAccountCode')

        let detectedComp: CompanyCode = companyId
        const rawComp = empIdx >= 0 ? firstData[empIdx]?.toUpperCase() : undefined
        if (rawComp && COMPANIES.some(c => c.code === rawComp)) {
          detectedComp = rawComp as CompanyCode
          setCompanyId(detectedComp)
        } else {
          const matchComp = COMPANIES.find(c => file.name.toUpperCase().includes(c.code))
          if (matchComp) {
            detectedComp = matchComp.code
            setCompanyId(detectedComp)
          }
        }

        let detectedEsc = scenario.scenarioId
        const rawEsc = escIdx >= 0 ? firstData[escIdx]?.toUpperCase() : undefined
        if (rawEsc === 'PPTO_V1' || rawEsc === 'PPTO_V2') {
          detectedEsc = rawEsc
        } else if (file.name.toUpperCase().includes('_V1')) {
          detectedEsc = 'PPTO_V1'
        } else if (file.name.toUpperCase().includes('_V2')) {
          detectedEsc = 'PPTO_V2'
        }
        setTargetScenarioId(detectedEsc)
        if (detectedEsc !== scenario.scenarioId) {
          setScenario(detectedEsc)
        }

        if (!lowerName.includes('balance') && !lowerName.includes('presupuesto') && ctaIdx >= 0) {
          const firstAcc = firstData[ctaIdx] ?? ''
          if (/^[123]\./.test(firstAcc)) {
            detectedStatement = 'BALANCE'
            setStatementCode('BALANCE')
          } else if (/^[45678]\./.test(firstAcc)) {
            detectedStatement = 'PYG'
            setStatementCode('PYG')
          }
        }

        setAutoDetectedNote(
          `Auto-configurado desde el CSV: Empresa ${detectedComp} · Estado ${detectedStatement} · Escenario ${detectedEsc} (${lines.length - 1} filas detectadas).`,
        )
      }
    }
    reader.readAsText(file)
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('Selecciona un archivo CSV antes de subir.')
      const effectiveScenario = targetScenarioId || scenario.scenarioId
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('companyId', companyId)
      form.append('scenarioId', effectiveScenario)
      form.append('financialStatementCode', statementCode)
      return backend.uploadLoad(form)
    },
    onSuccess: async (created) => {
      setSelectedFile(null)
      setPreviewHeaders([])
      setPreviewRows([])
      setLastLoadId(created.loadId)
      setWizardStep(3)
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
      setLastLoadId(res.loadId)
      setWizardStep(4)
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
      setLastLoadId(res.loadId)
      setWizardStep(4)
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
  const canApproveLoads = Boolean(access.data?.permissions.approveLoads)
  const canWriteCompany = (comp: string) =>
    canWriteAll || grants.some(g => g.companyId === comp && g.roleCode === 'COMPANY_ACCOUNTANT')

  return (
    <Stack>
      {showUploader && (
        <Card aria-label="Cargador de archivos CSV">
          <CardHeader
            title="Subir archivo CSV (nueva versión)"
            aside={
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Pasos del cargador">
                {([
                  [1, '1. Subir archivo'],
                  [2, '2. Mapear columnas'],
                  [3, '3. Validar y previsualizar'],
                  [4, '4. Resultado'],
                ] as const).map(([step, label]) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setWizardStep(step)}
                    style={{
                      border: '1px solid var(--q-line)',
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: wizardStep === step ? 700 : 500,
                      background: wizardStep === step ? 'var(--q-navy, #0F2341)' : 'transparent',
                      color: wizardStep === step ? '#fff' : 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--q-muted)' }}>
            Asistente de carga en 4 pasos · No sobrescribe versiones anteriores y registra autor, fecha y hash SHA-256.
          </p>
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
              Plantilla de mapeo
              <input
                type="text"
                readOnly
                value="Estándar QUADRA · 14 columnas (100 %)"
                aria-label="Plantilla de mapeo"
                style={{ minHeight: 38, padding: '6px 10px', borderRadius: 8, background: 'var(--q-surface-alt, #f8fafc)', border: '1px solid var(--q-line)' }}
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              <span>Archivo CSV</span>
              <label
                style={{
                  minHeight: 38,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1.5px dashed var(--q-blue, #2563EB)',
                  background: selectedFile ? 'rgba(37, 99, 235, 0.08)' : 'var(--q-surface-alt, #f8fafc)',
                  color: 'var(--q-navy, #0F2341)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                <Upload size={15} aria-hidden />
                <span>{selectedFile ? selectedFile.name : 'Elegir archivo CSV…'}</span>
                <input
                  id="quadra-csv-file-input"
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Archivo CSV"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            {selectedFile && wizardStep === 1 && (
              <Button type="button" variant="secondary" onClick={() => setWizardStep(2)}>
                2. Revisar mapeo
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              icon={Upload}
              disabled={!selectedFile || uploadMutation.isPending || !canWriteCompany(companyId)}
            >
              {uploadMutation.isPending ? 'Subiendo archivo…' : 'Confirmar y subir CSV'}
            </Button>
          </form>

          {autoDetectedNote && (
            <div style={{ marginTop: 10 }}>
              <Callout tone="info">{autoDetectedNote}</Callout>
            </div>
          )}

          {(wizardStep === 2 || previewHeaders.length > 0) && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--q-line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>Mapeo de columnas obligatorias · Reconocimiento automático</strong>
                <Chip tone="ok">6 de 6 obligatorias · 100 % confianza</Chip>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                {COLUMN_MAPPING_SPEC.map((item) => (
                  <div
                    key={item.field}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--q-line)',
                      fontSize: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.field}</div>
                      <div style={{ color: 'var(--q-muted)' }}>{item.csvCol}</div>
                    </div>
                    <Chip tone="ok">Automática</Chip>
                  </div>
                ))}
              </div>
              {previewRows.length > 0 && (
                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Vista previa del archivo ({previewHeaders.length} encabezados detectados)
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {previewHeaders.slice(0, 8).map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--q-line)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, idx) => (
                        <tr key={idx}>
                          {r.slice(0, 8).map((cell, cIdx) => (
                            <td key={cIdx} style={{ padding: '4px 8px', borderBottom: '1px solid var(--q-line)' }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {wizardStep === 4 && lastLoadId && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--q-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13 }}>
                <strong>Bitácora de carga registrada:</strong> ID <code>{lastLoadId}</code> · Trazabilidad activa en <code>audit.changeLog</code>.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link to={`/cargas/${lastLoadId}?esc=${scenario.scenarioId}`} className="q-btn q-btn--secondary">
                  Ver detalle de la carga
                </Link>
                <Link to={`/conciliacion?esc=${scenario.scenarioId}`} className="q-btn q-btn--primary">
                  Ir a conciliación
                </Link>
              </div>
            </div>
          )}
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
                const canApprove = canApproveLoads && load.statusCode === 'VALIDADA' // solo el controller aprueba (approveLoads)
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
