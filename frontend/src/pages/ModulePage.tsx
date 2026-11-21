import { Link } from 'react-router-dom'
import { ArrowUpRight, Database, Plug } from 'lucide-react'
import { modules } from '../components/AppLayout'

export function ModulePage({ path }: { path: string }) {
  const module = modules.find(item => item.path === path)!
  const Icon = module.icon
  return <><div className="page-heading"><div><p className="eyebrow">QUADRA / CONSOLIDACIÓN</p><h1>{module.title}</h1><p>{module.description}</p></div><span className="badge">Integración pendiente</span></div>{path === '/' ? <><section className="welcome card"><div><p className="eyebrow">CONTROL Y CLARIDAD</p><h2>De los datos al resultado consolidado.</h2><p>Comienza con las cargas de cada empresa y avanza hasta un resultado trazable.</p><Link className="button" to="/cargas">Revisar cargas <ArrowUpRight size={17} /></Link></div><LayersIllustration /></section><section className="module-grid" aria-label="Módulos de consolidación">{modules.slice(1).map(({ path, title, description, icon: ItemIcon }) => <Link className="card module-card" to={path} key={path}><ItemIcon size={23} /><h3>{title}</h3><p>{description}</p><span>Abrir módulo <ArrowUpRight size={16} /></span></Link>)}</section></> : <section className="card empty-state"><span className="empty-icon"><Icon size={32} /></span><h2>Listo para conectar tus datos</h2><p>Esta sección mostrará la información del backend cuando se integre el contrato de la API.</p><span className="badge"><Plug size={14} /> NestJS · API pendiente</span></section>}</>
}
function LayersIllustration() {
  return <div className="flow-preview" aria-hidden="true"><Database size={32} /><span>Datos de empresas</span><div className="flow-line" /><strong>USD</strong><span>Visión consolidada</span></div>
}
