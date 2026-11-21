import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ChartColumn,
  CheckCircle2,
  CircleDollarSign,
  CircleMinus,
  Database,
  FileSpreadsheet,
  GitBranch,
  Grid3x3,
  History,
  LayoutGrid,
  Link2,
  Lock,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Upload,
  Users,
} from 'lucide-react'
import { useAuth } from '@/shared/auth'
import s from './LandingPage.module.css'

const PIPELINE_STEPS = [
  {
    step: 1,
    code: 'VALIDAR',
    title: 'Carga CSV y Validación Preventiva',
    route: '/validacion',
    description:
      'Asistente de 4 pasos que valida encabezados, tipos y reglas V01–V10 antes de tocar el consolidado. Crea una versión nueva sin sobrescribir la anterior.',
    bullets: [
      'Ordenamiento de hallazgos por impacto en USD, no por número de fila.',
      'Bloqueo en CUARENTENA ante errores críticos (tasa invertida, signo contrario, desbalance).',
      'Segregación de funciones: el contador sube y valida; solo el GROUP_CONTROLLER aprueba.',
    ],
  },
  {
    step: 2,
    code: 'CONCILIAR',
    title: 'Conciliación Bilateral por Llave Única',
    route: '/conciliacion',
    description:
      'Cada operación entre empresas nace en pareja (Emisor CxC/Ingreso ↔ Receptor CxP/Gasto). Se cruza por icDocumentId y se visualiza en matriz 6 × 6.',
    bullets: [
      'Clasificación automática: CONCILIADO, CONCILIADO_FX, DIFERENCIA_MONTO, CORTE, SIN_CONTRAPARTE.',
      'Nunca mezcla una diferencia cambiaria con una diferencia de monto.',
      'Flujo auditable para aceptar diferencia o disputar con contraparte.',
    ],
  },
  {
    step: 3,
    code: 'CONVERTIR',
    title: 'Conversión Multimoneda bajo NIC 21',
    route: '/tasas',
    description:
      'Una sola tabla versionada de tasas para todo el grupo (GTQ → USD, MXN → USD, USD → USD) con huella criptográfica SHA-256.',
    bullets: [
      'P&L se convierte a tasa promedio; Balance a tasa de cierre; Patrimonio a tasa histórica.',
      'El efecto de conversión patrimonial se aísla en la cuenta 3900 (CTA).',
      'Verificador de impacto cambiario entre escenarios V1 y V2.',
    ],
  },
  {
    step: 4,
    code: 'ELIMINAR',
    title: 'Eliminaciones Automáticas E1–E4 y E7',
    route: '/eliminaciones',
    description:
      'Los asientos nacen de los pares conciliados; nadie los captura a mano. Lo que no concilia no se elimina a la fuerza.',
    bullets: [
      'E1 Ventas/Servicios (4200↔5200, 4300↔6200) y E4 Intereses (7300↔7200) con FX aislado en 7900.',
      'E2 Saldos CxC/CxP (1250↔2150) y E3 Préstamos IC (1600↔2250) con CTA en 3900.',
      'Vista interactiva Antes | Después y libro completo de líneas contables.',
    ],
  },
  {
    step: 5,
    code: 'EXPLICAR',
    title: 'Rentabilidad (ROIC, ROCE, EVA) y Puente V1→V2',
    route: '/rentabilidad',
    description:
      'Indicadores calculados en SQL sobre cifras depuradas, con comparativo Sin eliminar vs Eliminado y cascada de desviaciones.',
    bullets: [
      'Desglose de ROIC, ROCE y EVA con linaje por componente y ranking por empresa.',
      'Puente waterfall V1 → V2 por efecto (Volumen, Precio, Costo, Tipo de cambio).',
      'Resumen ejecutivo verificado para dirección sin cifras inventadas.',
    ],
  },
] as const

const KPI_EXPLANATIONS = [
  {
    category: 'KPIs DE CONCILIACIÓN INTERCOMPANY',
    items: [
      {
        name: 'Cobertura de Documentos IC (131 de 131)',
        why: 'Mide cuántas facturas, préstamos e intereses intragrupo tienen sus dos patas identificadas por llave única antes de correr las eliminaciones.',
      },
      {
        name: 'Cuadran Exacto (39 documentos · USD 0.00)',
        why: 'Operaciones pactadas en la misma moneda donde emisor y receptor reportan exactamente el mismo monto en USD. Se eliminan directamente.',
      },
      {
        name: 'Diferencia Cambiaria (92 documentos · Aislada en 7900 / 3900)',
        why: 'Ambas empresas registraron el mismo monto en moneda origen (GTQ o MXN), pero las tasas generan un diferencial dentro de tolerancia (USD 50 o 2 %). El sistema concilia y envía el diferencial a la cuenta 7900 (P&L) o 3900 (CTA).',
      },
      {
        name: 'Pendientes sin Eliminar (Control anti-ajuste forzado)',
        why: 'Operaciones sin contraparte o con diferencia real de monto/mes. QUADRA prohíbe eliminarlas a la fuerza para no ocultar errores en un bolsón de ajustes.',
      },
    ],
  },
  {
    category: 'KPIs FINANCIEROS Y DE CREACIÓN DE VALOR',
    items: [
      {
        name: 'Ventas Consolidadas (USD 12,957,553 vs USD 13,935,093 Agregado)',
        why: 'Evita inflar los ingresos del grupo en +7.5 % al descontar automáticamente los USD 977,540 que las 6 empresas se facturaron entre sí.',
      },
      {
        name: 'EBIT · Utilidad Operativa (USD 2,408,907)',
        why: 'Ventas − costo de ventas − gastos operativos antes de intereses e impuestos. Aísla el resultado operativo real y el impacto neto de diferencias cambiarias IC (+USD 328).',
      },
      {
        name: 'ROIC (11.95 %) y ROCE (13.22 % vs 11.91 % sin eliminar)',
        why: 'ROIC mide NOPAT ÷ Capital Invertido. ROCE mide EBIT ÷ Capital Empleado: al eliminar el préstamo intragrupo de USD 2.00 M (US2 → MX2), el capital empleado baja de 20.22 M a 18.22 M y revela +1.31 pp de rentabilidad real.',
      },
      {
        name: 'EVA · Valor Económico Agregado (+USD 142,157)',
        why: 'NOPAT − (WACC × Capital Invertido). Permite identificar qué empresas crean valor por encima del costo de capital (MX1 +376 K, US1 +163 K) y cuáles requieren intervención (MX2 −426 K).',
      },
    ],
  },
] as const

const MODULES = [
  { path: '/', title: '01 · Presupuesto consolidado', icon: LayoutGrid, desc: 'Pipeline de 5 pasos, ecuación Agregado − Eliminaciones = Consolidado, KPIs, P&L / Balance con linaje por cuenta y EVA por empresa.' },
  { path: '/validacion', title: '02 · Carga CSV y validación', icon: Upload, desc: 'Asistente de carga CSV en 4 pasos, estado de las 12 cargas por empresa, hallazgos V01–V10 por impacto en USD y flujo Validar / Aprobar.' },
  { path: '/conciliacion', title: '03 · Conciliación intercompany', icon: Link2, desc: '4 KPIs explicados, filtro por tipo de operación, tabla de pares espejo CxC ↔ CxP y panel "Cada diferencia tiene nombre".' },
  { path: '/cuenta-corriente', title: '04 · Cuenta corriente 6 × 6', icon: Grid3x3, desc: 'Matriz bilateral de saldos, facturado y recibido entre las 6 empresas con inspección de documentos por par.' },
  { path: '/documentos/IC-F1-2027-12', title: '05 · Documento IC y linaje', icon: FileSpreadsheet, desc: 'Comparativo espejo Emisor vs Receptor, descomposición de diferencia, trazabilidad al archivo CSV y acciones Aceptar / Disputar.' },
  { path: '/tasas', title: '06 · Tasas del grupo (NIC 21)', icon: CircleDollarSign, desc: '75 tasas del escenario (GTQ, MXN, USD), reglas normativas NIC 21, tabla mensual Ene–Dic y efecto de conversión CTA.' },
  { path: '/eliminaciones', title: '07 · Eliminaciones E1–E4', icon: CircleMinus, desc: 'Comparativo Antes | Después por regla contable, verificación de diferencia cambiaria aislada, libro de asientos y panel de capital.' },
  { path: '/rentabilidad', title: '08 · Rentabilidad y valor', icon: ChartColumn, desc: 'Fórmulas y componentes con linaje de ROIC, ROCE y EVA, ranking por empresa y comparativos Sin eliminar y Sin validar.' },
  { path: '/desviaciones', title: '09 · Puente de desviaciones V1→V2', icon: TrendingUp, desc: 'Cascada waterfall de 4 efectos calculada en SQL, tabla de causas por empresa, puente de EVA y resumen ejecutivo para el director.' },
  { path: '/corridas', title: '10 · Corridas inmutables', icon: History, desc: 'Historial de corridas congeladas con verificación de linaje, hash SHA-256 de tasas y las 12 cargas asociadas.' },
  { path: '/hallazgos', title: '11 · Hallazgos del grupo', icon: TriangleAlert, desc: 'Vista centralizada de bloqueantes, advertencias e informativas con sugerencia automática y aceptación con justificación.' },
  { path: '/usuarios', title: '12 · Administración de usuarios RLS', icon: Users, desc: 'Alta de usuarios en Supabase Auth y gestión de roles (GROUP_CONTROLLER, AUDITOR, COMPANY_ACCOUNTANT, COMPANY_VIEWER).' },
] as const

export function LandingPage() {
  const { session } = useAuth()
  const enterPath = session ? '/' : '/login'

  return (
    <div className={s.page}>
      <header className={s.nav}>
        <img src="/brand/quadra-horizontal-negativo.svg" alt="QUADRA" width={165} height={38} />
        <nav className={s.navLinks} aria-label="Secciones de la presentación">
          <a href="#problema" className={s.navLink}>Por qué QUADRA</a>
          <a href="#pipeline" className={s.navLink}>Flujo de 5 pasos</a>
          <a href="#kpis" className={s.navLink}>Para qué sirve cada KPI</a>
          <a href="#arquitectura" className={s.navLink}>Seguridad RLS y Motor SQL</a>
          <a href="#modulos" className={s.navLink}>12 Módulos</a>
        </nav>
        <div className={s.navCtas}>
          <Link to={enterPath} className={s.ctaPrimary}>
            {session ? 'Volver al Dashboard en vivo' : 'Iniciar sesión en QUADRA'}
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </header>

      <section className={s.hero}>
        <div className={s.container}>
          <div className={s.heroGrid}>
            <div>
              <p className={s.eyebrow}>CONSOLIDACIÓN FINANCIERA MULTIEMPRESA · MULTIMONEDA · MULTIPAÍS</p>
              <h1 className={s.heroTitle}>
                Seis presupuestos, tres monedas, <span>un solo número auditable</span> sin doble conteo.
              </h1>
              <p className={s.heroLead}>
                QUADRA transforma las cargas individuales de <strong>6 empresas</strong> en Guatemala (<code>GTQ</code>),
                México (<code>MXN</code>) y Estados Unidos (<code>USD</code>) en estados financieros consolidados con
                validación preventiva, conciliación bilateral por llave única, conversión normativa <strong>NIC 21</strong> y
                linaje completo hasta la fila del archivo CSV.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to={enterPath} className={s.ctaPrimary}>
                  {session ? 'Abrir Consola de Consolidación' : 'Entrar a la Plataforma'}
                  <ArrowRight size={16} aria-hidden />
                </Link>
                <a href="#kpis" className={s.ctaSecondary}>
                  Ver guía de KPIs y datos
                </a>
              </div>
              <div className={s.heroBadges}>
                <span className={s.badge}><CheckCircle2 size={14} color="#4ADE80" /> 6 Empresas · 3 Monedas (GTQ, MXN, USD)</span>
                <span className={s.badge}><ShieldCheck size={14} color="#60A5FA" /> PostgreSQL RLS + JWT ES256</span>
                <span className={s.badge}><GitBranch size={14} color="#FBBF24" /> Linaje 100 % trazable a CSV</span>
              </div>
            </div>

            <div className={s.equationCard} aria-label="Demostración de la ecuación de consolidación">
              <div className={s.eqHeader}>
                <span className={s.eqTag}>DEMO EN VIVO · PRESUPUESTO 2027 (V2) · VENTAS DEL GRUPO</span>
                <span className={s.eqPill}>✓ LINAJE 23/23 CUENTAS OK</span>
              </div>
              <div className={s.eqBoxes}>
                <div className={s.eqBox}>
                  <div className={s.eqLabel}>Agregado (6 empresas)</div>
                  <div className={s.eqValue}>13,935,093</div>
                  <div className={s.eqSub}>Suma simple antes de eliminar (+7.5 % inflado)</div>
                </div>
                <div className={s.eqOp}>−</div>
                <div className={s.eqBox}>
                  <div className={s.eqLabel}>Eliminaciones IC</div>
                  <div className={s.eqValue} style={{ color: '#F59E0B' }}>977,540</div>
                  <div className={s.eqSub}>131 documentos conciliados por llave</div>
                </div>
                <div className={s.eqOp}>=</div>
                <div className={s.eqBoxResult}>
                  <div className={s.eqLabel}>Consolidado Real USD</div>
                  <div className={s.eqValue} style={{ color: '#2563EB' }}>12,957,553</div>
                  <div className={s.eqSub}>Ventas a terceros sin doble conteo</div>
                </div>
              </div>
              <div className={s.kpiStrip}>
                <div className={s.miniKpi}>
                  <div className={s.miniKpiLabel}>EBIT CONSOLIDADO</div>
                  <div className={s.miniKpiVal}>USD 2.41 M</div>
                </div>
                <div className={s.miniKpi}>
                  <div className={s.miniKpiLabel}>ROIC DEL GRUPO</div>
                  <div className={s.miniKpiVal}>11.95 %</div>
                </div>
                <div className={s.miniKpi}>
                  <div className={s.miniKpiLabel}>ROCE (+1.31 pp)</div>
                  <div className={s.miniKpiVal}>13.22 %</div>
                </div>
                <div className={s.miniKpi}>
                  <div className={s.miniKpiLabel}>EVA GENERADO</div>
                  <div className={s.miniKpiVal}>+USD 142 K</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="problema" className={s.sectionAlt}>
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <p className={s.sectionEyebrow}>1 · POR QUÉ LO CONSTRUIMOS</p>
            <h2 className={s.sectionTitle}>El problema que resuelve QUADRA en grupos multiempresa</h2>
            <p className={s.sectionSub}>
              Cuando un grupo corporativo consolida en hojas de cálculo manuales, tres distorsiones financieras contaminan la toma de decisiones del directorio:
            </p>
          </div>
          <div className={s.grid3}>
            <article className={s.card}>
              <span className={s.stepNum} style={{ background: '#DC2626' }}>!</span>
              <h3 className={s.cardTitle}>1. Cargas con errores que destruyen los KPIs</h3>
              <p className={s.cardText}>
                Una sola tasa invertida (<code>18.00</code> en vez de <code>0.0556</code>) o un costo con signo positivo distorsiona el EBIT del grupo a <strong>−USD 41.5 M</strong> y el ROIC a <strong>−191.9 %</strong>.
              </p>
              <p className={s.cardText}>
                <strong>Solución QUADRA:</strong> Validador preventivo con reglas <code>V01–V10</code> que pone la carga en <code>CUARENTENA</code> y ordena los hallazgos por impacto en USD antes de permitir consolidar.
              </p>
            </article>
            <article className={s.card}>
              <span className={s.stepNum} style={{ background: '#D97706' }}>!</span>
              <h3 className={s.cardTitle}>2. Doble conteo de ventas y capital inflado</h3>
              <p className={s.cardText}>
                Sumar las 6 empresas sin eliminar operaciones intercompany infla las ventas en <strong>+USD 977,540 (+7.5 %)</strong> y el capital empleado en <strong>+USD 2.00 M</strong> por préstamos internos, castigando artificialmente el ROCE.
              </p>
              <p className={s.cardText}>
                <strong>Solución QUADRA:</strong> Cruce bilateral automático por llave de documento (<code>icDocumentId</code>) y generación de asientos de eliminación <code>E1–E4</code> sin intervención manual.
              </p>
            </article>
            <article className={s.card}>
              <span className={s.stepNum} style={{ background: '#2563EB' }}>!</span>
              <h3 className={s.cardTitle}>3. Bolsones opacos donde se mezcla FX con errores</h3>
              <p className={s.cardText}>
                En cierres tradicionales, las diferencias por tipo de cambio entre países se mezclan con facturas faltantes o montos mal capturados en una sola cuenta de ajuste sin trazabilidad.
              </p>
              <p className={s.cardText}>
                <strong>Solución QUADRA:</strong> Aísla la diferencia cambiaria legítima en las cuentas <code>7900</code> (P&amp;L) y <code>3900</code> (CTA Balance), y deja los descuadres reales como pendientes visibles.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="pipeline" className={s.section}>
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <p className={s.sectionEyebrow}>2 · METODOLOGÍA EN 5 PASOS</p>
            <h2 className={s.sectionTitle}>Del archivo CSV local al estado financiero consolidado</h2>
            <p className={s.sectionSub}>
              La arquitectura de QUADRA guía al equipo financiero a través de 5 etapas determinísticas ejecutadas íntegramente en el motor SQL:
            </p>
          </div>
          <div className={s.grid5}>
            {PIPELINE_STEPS.map((item) => (
              <article key={item.code} className={s.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={s.stepNum}>{item.step}</span>
                  <strong style={{ fontSize: 12, letterSpacing: '0.06em', color: '#D97706' }}>{item.code}</strong>
                </div>
                <h3 className={s.cardTitle}>{item.title}</h3>
                <p className={s.cardText}>{item.description}</p>
                <ul className={s.list}>
                  {item.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <Link to={session ? item.route : '/login'} className={s.moduleLink}>
                  Ir al paso {item.step} <ArrowRight size={14} aria-hidden />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="kpis" className={s.sectionAlt}>
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <p className={s.sectionEyebrow}>3 · SIGNIFICADO DE LOS DATOS Y KPIs</p>
            <h2 className={s.sectionTitle}>¿Para qué sirve cada indicador en Conciliación y Consolidación?</h2>
            <p className={s.sectionSub}>
              Cada cifra en QUADRA responde a una pregunta operativa o estratégica concreta y conserva su linaje hasta la carga original:
            </p>
          </div>
          <div className={s.grid2}>
            {KPI_EXPLANATIONS.map((group) => (
              <div key={group.category} className={s.cardNavy}>
                <p className={s.eyebrow} style={{ marginBottom: 4 }}>{group.category}</p>
                {group.items.map((kpi) => (
                  <div
                    key={kpi.name}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.07)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: 14, color: '#93C5FD', marginBottom: 4 }}>
                      {kpi.name}
                    </strong>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255, 255, 255, 0.86)' }}>
                      {kpi.why}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="arquitectura" className={s.section}>
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <p className={s.sectionEyebrow}>4 · ARQUITECTURA, SEGURIDAD RLS Y AUDITORÍA</p>
            <h2 className={s.sectionTitle}>Seguridad de grado corporativo y corridas inmutables</h2>
            <p className={s.sectionSub}>
              Ningún cálculo financiero ocurre en el navegador: NestJS autentica con JWKS ES256 y ejecuta cada petición dentro de una transacción PostgreSQL con la identidad real del usuario.
            </p>
          </div>
          <div className={s.grid3}>
            <article className={s.card}>
              <Lock size={22} color="#0F2341" />
              <h3 className={s.cardTitle}>Row-Level Security (RLS) Real</h3>
              <p className={s.cardText}>
                Cada request abre una transacción con <code>set_config(&apos;request.jwt.claims&apos;, ..., true)</code> parametrizado y <code>SET LOCAL ROLE authenticated</code>. Un contador de <code>GT1</code> solo puede leer, subir o validar archivos de <code>GT1</code>.
              </p>
            </article>
            <article className={s.card}>
              <Users size={22} color="#2563EB" />
              <h3 className={s.cardTitle}>4 Roles y Segregación de Funciones</h3>
              <p className={s.cardText}>
                <strong>GROUP_CONTROLLER</strong> (consolida, aprueba cargas y administra usuarios), <strong>AUDITOR</strong> (audita todo el grupo en solo lectura), <strong>COMPANY_ACCOUNTANT</strong> (sube y valida su empresa) y <strong>COMPANY_VIEWER</strong> (consulta su empresa).
              </p>
            </article>
            <article className={s.card}>
              <Database size={22} color="#16A34A" />
              <h3 className={s.cardTitle}>Corridas Inmutables y Bitácora</h3>
              <p className={s.cardText}>
                Las corridas cerradas y los puentes de variación están protegidos por triggers SQL que impiden <code>UPDATE</code> o <code>DELETE</code>. Cada acción registra el <code>userId</code> real del JWT en <code>audit.changeLog</code>.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="modulos" className={s.sectionAlt}>
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <p className={s.sectionEyebrow}>5 · MAPA COMPLETO DEL SISTEMA</p>
            <h2 className={s.sectionTitle}>Explora los 12 módulos de QUADRA</h2>
            <p className={s.sectionSub}>
              Haz clic en cualquier módulo para abrirlo directamente en la aplicación:
            </p>
          </div>
          <div className={s.grid3}>
            {MODULES.map((m) => {
              const Icon = m.icon
              return (
                <article key={m.path} className={s.card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={20} color="#2563EB" aria-hidden />
                    <h3 className={s.cardTitle} style={{ fontSize: 15 }}>{m.title}</h3>
                  </div>
                  <p className={s.cardText}>{m.desc}</p>
                  <Link to={session ? m.path : '/login'} className={s.moduleLink}>
                    Abrir módulo <ArrowRight size={14} aria-hidden />
                  </Link>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footerRow}>
          <div>
            <strong>QUADRA · Plataforma de Consolidación Financiera Multiempresa y Multimoneda</strong>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              Equipo BTS · Hackathon 2026 · NestJS + Drizzle + Supabase Auth (ES256) + PostgreSQL RLS + React
            </div>
          </div>
          <Link to={enterPath} className={s.ctaPrimary}>
            {session ? 'Ir al Dashboard' : 'Iniciar sesión'}
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
