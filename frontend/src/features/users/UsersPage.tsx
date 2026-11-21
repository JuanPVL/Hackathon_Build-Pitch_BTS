import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserPlus, Users } from 'lucide-react'
import { COMPANIES, type CompanyCode } from '@/entities'
import type { AccessRoleCode, AdminUserDto } from '@/shared/api/backend'
import { useBackend } from '@/shared/api/useBackend'
import { useBackendAccess } from '@/shared/auth/useBackendAccess'
import { Button, ButtonLink, Callout, Card, CardHeader, Chip, DataTable, FullState, PageHeader, QueryState, Split, Stack } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import s from './UsersPage.module.css'

const ROLE_OPTIONS: { code: AccessRoleCode; label: string; isGroup: boolean }[] = [
  { code: 'GROUP_CONTROLLER', label: 'GROUP_CONTROLLER · Controller de grupo', isGroup: true },
  { code: 'AUDITOR', label: 'AUDITOR · Auditor de grupo (solo lectura)', isGroup: true },
  { code: 'COMPANY_ACCOUNTANT', label: 'COMPANY_ACCOUNTANT · Contador de empresa', isGroup: false },
  { code: 'COMPANY_VIEWER', label: 'COMPANY_VIEWER · Consulta de empresa', isGroup: false },
]

export function isGroupRole(role: AccessRoleCode): boolean {
  return role === 'GROUP_CONTROLLER' || role === 'AUDITOR'
}

export default function UsersPage() {
  const access = useBackendAccess()
  const backend = useBackend()
  const queryClient = useQueryClient()

  const isController = Boolean(
    access.data?.grants.some(g => g.roleCode === 'GROUP_CONTROLLER' && g.companyId === null) ||
    access.data?.permissions.masterData,
  )

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: ({ signal }) => backend.adminUsers(signal),
    enabled: isController,
  })

  // Estado formulario de alta
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleCode, setRoleCode] = useState<AccessRoleCode>('COMPANY_ACCOUNTANT')
  const [companyId, setCompanyId] = useState<CompanyCode>('GT1')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  // Estado edición de accesos por usuario
  const [editingUser, setEditingUser] = useState<AdminUserDto | null>(null)
  const [editRole, setEditRole] = useState<AccessRoleCode>('COMPANY_ACCOUNTANT')
  const [editCompany, setEditCompany] = useState<CompanyCode>('GT1')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      backend.createAdminUser({
        email: email.trim(),
        password,
        roleCode,
        companyId: isGroupRole(roleCode) ? null : companyId,
      }),
    onSuccess: (created) => {
      setEmail('')
      setPassword('')
      setFormError(null)
      setFormSuccess(`Usuario ${created.email ?? created.userId} creado con rol ${created.roleCode}.`)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err: Error) => {
      setFormSuccess(null)
      setFormError(err.message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { userId: string; roleCode?: AccessRoleCode; companyId?: CompanyCode | null; isActive?: boolean }) =>
      backend.updateAdminUserAccess(payload.userId, {
        roleCode: payload.roleCode,
        companyId: payload.companyId,
        isActive: payload.isActive,
      }),
    onSuccess: (updated) => {
      setEditError(null)
      setEditSuccess(
        updated.isActive
          ? `Acceso actualizado a ${updated.roleCode}${updated.companyId ? ` (${updated.companyId})` : ' (Grupo)'}.`
          : 'Acceso revocado correctamente.',
      )
      setEditingUser(updated)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err: Error) => {
      setEditSuccess(null)
      setEditError(err.message)
    },
  })

  if (access.isPending) {
    return <FullState title="Verificando permisos…" busy />
  }

  if (!isController) {
    return (
      <FullState
        title="Acceso restringido"
        action={<ButtonLink to="/" variant="primary">Volver al inicio</ButtonLink>}
      >
        El panel de administración de usuarios solo está disponible para el rol GROUP_CONTROLLER.
      </FullState>
    )
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    if (!email.trim()) {
      setFormError('El correo electrónico es obligatorio.')
      return
    }
    if (password.length < 8) {
      setFormError('La contraseña temporal debe tener al menos 8 caracteres.')
      return
    }
    createMutation.mutate()
  }

  function startEdit(user: AdminUserDto) {
    setEditingUser(user)
    const initialRole = user.roleCode ?? 'COMPANY_ACCOUNTANT'
    setEditRole(initialRole)
    setEditCompany((user.companyId as CompanyCode | null) ?? 'GT1')
    setEditError(null)
    setEditSuccess(null)
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    updateMutation.mutate({
      userId: editingUser.userId,
      roleCode: editRole,
      companyId: isGroupRole(editRole) ? null : editCompany,
      isActive: true,
    })
  }

  function handleRevoke(user: AdminUserDto) {
    updateMutation.mutate({
      userId: user.userId,
      isActive: false,
    })
  }

  const columns: Column<AdminUserDto>[] = [
    {
      key: 'email',
      header: 'Usuario / Correo',
      render: (u) => (
        <div className={s.userCell}>
          <span className={s.userEmail}>{u.email ?? 'Sin correo visible'}</span>
          <code className={s.userId}>{u.userId}</code>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      render: (u) => u.roleCode ? <Chip tone="brand">{u.roleCode}</Chip> : <Chip tone="neutral">Sin rol asignado</Chip>,
    },
    {
      key: 'company',
      header: 'Alcance / Empresa',
      render: (u) => {
        if (u.companyId) {
          const comp = COMPANIES.find(c => c.code === u.companyId)
          return <Chip tone="key">{comp ? `${u.companyId} · ${comp.name}` : u.companyId}</Chip>
        }
        return <Chip tone="info">Corporativo · 6 empresas del grupo</Chip>
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (u) => u.isActive ? <Chip tone="ok">Activo</Chip> : <Chip tone="err">Revocado</Chip>,
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      render: (u) => (
        <div className={s.rowActions}>
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              startEdit(u)
            }}
          >
            Editar acceso
          </Button>
          {u.isActive && (
            <Button
              variant="ghost"
              disabled={updateMutation.isPending}
              onClick={(e) => {
                e.stopPropagation()
                handleRevoke(u)
              }}
            >
              Revocar
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <Stack>
      <PageHeader
        eyebrow="ADMINISTRACIÓN · SEGURIDAD RLS"
        title="Usuarios"
        subtitle="Alta de usuarios en Supabase Auth y asignación de roles y empresas en userCompanyAccess. Visible únicamente para GROUP_CONTROLLER."
      />

      <Split aside={400}>
        <Stack>
          <Card aria-label="Lista de usuarios">
            <CardHeader
              title="Usuarios registrados"
              aside={<Chip tone="info" icon={Users}>{usersQuery.data?.length ?? 0} usuarios</Chip>}
            />
            <QueryState
              query={usersQuery}
              isEmpty={rows => rows.length === 0}
              emptyTitle="Sin usuarios registrados"
              emptyText="Aún no hay filas en userCompanyAccess."
            >
              {rows => (
                <DataTable
                  columns={columns}
                  rows={rows}
                  rowKey={r => r.userId}
                  caption="Usuarios y accesos por empresa"
                  selectedKey={editingUser?.userId}
                  onRowClick={startEdit}
                />
              )}
            </QueryState>
          </Card>

          {editingUser && (
            <Card aria-label="Editar acceso de usuario">
              <CardHeader
                title={`Editar acceso · ${editingUser.email ?? editingUser.userId}`}
                aside={<Chip tone={editingUser.isActive ? 'ok' : 'err'}>{editingUser.isActive ? 'Activo' : 'Revocado'}</Chip>}
              />
              <form className={s.form} onSubmit={handleEditSubmit}>
                <div className={s.formGrid}>
                  <label className={s.field}>
                    <span className={s.label}>Rol en Quadra</span>
                    <select
                      aria-label="Editar rol"
                      value={editRole}
                      onChange={e => setEditRole(e.target.value as AccessRoleCode)}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={s.field}>
                    <span className={s.label}>Empresa asignada</span>
                    {isGroupRole(editRole) ? (
                      <input type="text" value="Corporativo · Todas las empresas del grupo" disabled aria-label="Editar empresa" />
                    ) : (
                      <select
                        aria-label="Editar empresa"
                        value={editCompany}
                        onChange={e => setEditCompany(e.target.value as CompanyCode)}
                      >
                        {COMPANIES.map(c => (
                          <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                        ))}
                      </select>
                    )}
                  </label>
                </div>

                {editError && <Callout tone="err">{editError}</Callout>}
                {editSuccess && <Callout tone="ok">{editSuccess}</Callout>}

                <div className={s.actions}>
                  <Button type="submit" variant="primary" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                  {editingUser.isActive && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={updateMutation.isPending}
                      onClick={() => handleRevoke(editingUser)}
                    >
                      Revocar acceso
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>
                    Cerrar
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </Stack>

        <Card tone="navy" aria-label="Formulario de alta de usuario">
          <CardHeader
            title="Nuevo usuario"
            aside={<ShieldCheck size={18} aria-hidden />}
          />
          <p className={s.asideText}>
            Crea la cuenta en Supabase Auth desde el servidor y registra su permiso en <code>userCompanyAccess</code>.
          </p>
          <form className={s.form} onSubmit={handleCreateSubmit}>
            <label className={s.field}>
              <span className={s.labelOnDark}>Correo electrónico</span>
              <input
                type="email"
                name="email"
                placeholder="usuario@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>

            <label className={s.field}>
              <span className={s.labelOnDark}>Contraseña temporal</span>
              <input
                type="password"
                name="password"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>

            <label className={s.field}>
              <span className={s.labelOnDark}>Rol</span>
              <select
                name="roleCode"
                value={roleCode}
                onChange={e => setRoleCode(e.target.value as AccessRoleCode)}
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </label>

            <label className={s.field}>
              <span className={s.labelOnDark}>Empresa</span>
              {isGroupRole(roleCode) ? (
                <input
                  type="text"
                  value="Corporativo · Todas las empresas del grupo"
                  disabled
                  aria-label="Empresa"
                />
              ) : (
                <select
                  name="companyId"
                  aria-label="Empresa"
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value as CompanyCode)}
                >
                  {COMPANIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                  ))}
                </select>
              )}
            </label>

            {formError && <Callout tone="err">{formError}</Callout>}
            {formSuccess && <Callout tone="ok">{formSuccess}</Callout>}

            <Button
              type="submit"
              variant="accent"
              icon={UserPlus}
              block
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creando usuario…' : 'Crear usuario'}
            </Button>
          </form>
        </Card>
      </Split>
    </Stack>
  )
}
