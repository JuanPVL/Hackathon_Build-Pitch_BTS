import { Link } from 'react-router-dom'
import { CalendarClock, Lock } from 'lucide-react'
import { formatRunDate } from '../domain/runInfo'
import s from './RunMeta.module.css'

export function RunMeta({ runId, generatedAt }: { runId: string; generatedAt: string }) {
  return (
    <p className={s.meta}>
      <span><Lock size={14} aria-hidden /> Corrida <Link to={`/corridas/${runId}`}>{runId}</Link> · inmutable</span>
      <span><CalendarClock size={14} aria-hidden /> {formatRunDate(generatedAt)}</span>
    </p>
  )
}
