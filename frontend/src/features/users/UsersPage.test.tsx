import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AdminUserDto, Backend, MeDto } from '@/shared/api/backend'
import UsersPage from './UsersPage'

const mockBackend: Partial<Backend> = {}
let mockAccessState: { data?: MeDto; isPending: boolean } = { isPending: false }

vi.mock('@/shared/api/useBackend', () => ({
  useBackend: () => mockBackend,
}))

vi.mock('@/shared/auth/useBackendAccess', () => ({
  useBackendAccess: () => mockAccessState,
}))

function renderUsersPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/usuarios']}>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const SAMPLE_USERS: AdminUserDto[] = [
  {
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'controller@quadra.demo',
    roleCode: 'GROUP_CONTROLLER',
    companyId: null,
    isActive: true,
    grants: [],
  },
  {
    userId: '00000000-0000-4000-8000-000000000003',
    email: 'contador.gt1@quadra.demo',
    roleCode: 'COMPANY_ACCOUNTANT',
    companyId: 'GT1',
    isActive: true,
    grants: [],
  },
]

describe('UsersPage (OBJETIVO 2)', () => {
  it('bloquea el acceso si el usuario no es GROUP_CONTROLLER', () => {
    mockAccessState = {
      isPending: false,
      data: {
        userId: '00000000-0000-4000-8000-000000000003',
        dbUserId: '00000000-0000-4000-8000-000000000003',
        dbRole: 'authenticated',
        grants: [{ companyId: 'GT1', roleCode: 'COMPANY_ACCOUNTANT' }],
        permissions: { readAll: false, writeAll: false, approveLoads: false, masterData: false },
      },
    }
    renderUsersPage()
    expect(screen.getByText('Acceso restringido')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('muestra la lista de usuarios, permite crear usuario (con companyId null para rol de grupo) y editar o revocar accesos para GROUP_CONTROLLER', async () => {
    mockAccessState = {
      isPending: false,
      data: {
        userId: '00000000-0000-4000-8000-000000000001',
        dbUserId: '00000000-0000-4000-8000-000000000001',
        dbRole: 'authenticated',
        grants: [{ companyId: null, roleCode: 'GROUP_CONTROLLER' }],
        permissions: { readAll: true, writeAll: true, approveLoads: true, masterData: true },
      },
    }
    mockBackend.adminUsers = vi.fn().mockResolvedValue(SAMPLE_USERS)
    mockBackend.createAdminUser = vi.fn().mockImplementation(async (input) => ({
      userId: '00000000-0000-4000-8000-000000000099',
      email: input.email,
      roleCode: input.roleCode,
      companyId: input.companyId,
      isActive: true,
      grants: [],
    }))
    mockBackend.updateAdminUserAccess = vi.fn().mockImplementation(async (userId, input) => ({
      userId,
      email: 'contador.gt1@quadra.demo',
      roleCode: input.roleCode ?? 'COMPANY_ACCOUNTANT',
      companyId: input.companyId ?? null,
      isActive: input.isActive ?? true,
      grants: [],
    }))

    renderUsersPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument()
    expect(await screen.findByText('controller@quadra.demo')).toBeInTheDocument()
    expect(screen.getByText('contador.gt1@quadra.demo')).toBeInTheDocument()

    // Alta de usuario con rol de grupo (companyId debe enviarse como null)
    const createCard = screen.getByLabelText('Formulario de alta de usuario')
    await userEvent.type(within(createCard).getByLabelText(/Correo electrónico/i), 'auditor.nuevo@quadra.demo')
    await userEvent.type(within(createCard).getByLabelText(/Contraseña temporal/i), 'Temporal2026!')
    await userEvent.selectOptions(within(createCard).getByLabelText(/^Rol$/i), 'AUDITOR')
    expect(within(createCard).getByLabelText('Empresa')).toBeDisabled()

    await userEvent.click(within(createCard).getByRole('button', { name: 'Crear usuario' }))
    await waitFor(() =>
      expect(mockBackend.createAdminUser).toHaveBeenCalledWith({
        email: 'auditor.nuevo@quadra.demo',
        password: 'Temporal2026!',
        roleCode: 'AUDITOR',
        companyId: null,
      }),
    )

    // Editar acceso de un usuario existente
    const editButtons = screen.getAllByRole('button', { name: 'Editar acceso' })
    await userEvent.click(editButtons[1])
    const editCard = await screen.findByLabelText('Editar acceso de usuario')
    await userEvent.selectOptions(within(editCard).getByLabelText('Editar rol'), 'COMPANY_VIEWER')
    await userEvent.selectOptions(within(editCard).getByLabelText('Editar empresa'), 'MX1')
    await userEvent.click(within(editCard).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(mockBackend.updateAdminUserAccess).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000003',
        { roleCode: 'COMPANY_VIEWER', companyId: 'MX1', isActive: true },
      ),
    )
  })
})
