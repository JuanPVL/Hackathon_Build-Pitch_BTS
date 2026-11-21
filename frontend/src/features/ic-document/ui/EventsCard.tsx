import { Card, CardHeader, ResponsiveTable } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { eventDate } from '../domain/document'
import type { DocumentEvent } from '../domain/types'
import s from './EventsCard.module.css'

const columns: Column<DocumentEvent>[] = [
  { key: 'event', header: 'Evento', render: e => <strong>{e.event}</strong> },
  { key: 'actor', header: 'Autor', render: e => <span className={s.muted}>{e.actor}</span> },
  { key: 'detail', header: 'Detalle', render: e => <>{e.detail}{e.at && <span className={s.date}> · {eventDate(e.at)}</span>}</> },
]

function EventCard({ event }: { event: DocumentEvent }) {
  return (
    <article className={s.card}>
      <div className={s.cardTop}><strong>{event.event}</strong><span className={s.muted}>{event.actor}</span></div>
      <p>{event.detail}{event.at && <span className={s.date}> · {eventDate(event.at)}</span>}</p>
    </article>
  )
}

/** "Versiones y autores": cada cambio queda con quién lo hizo. */
export function EventsCard({ events }: { events: DocumentEvent[] }) {
  return (
    <Card>
      <CardHeader title="Versiones y autores" />
      {events.length === 0
        ? <p className={s.muted}>Este documento todavía no registra cambios.</p>
        : <ResponsiveTable caption="Versiones del documento: evento, autor y detalle" columns={columns} rows={events} rowKey={e => `${e.event}|${e.actor}|${e.at ?? ''}`} renderCard={e => <EventCard event={e} />} />}
    </Card>
  )
}
