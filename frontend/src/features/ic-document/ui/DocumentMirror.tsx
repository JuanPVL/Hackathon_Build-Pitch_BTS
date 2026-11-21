import { MirrorPair } from '@/shared/ui'
import { resultInfo } from '@/entities/ic'
import { legView } from '../domain/document'
import type { IcDocumentDetail } from '../domain/types'

/** Las dos patas del documento (CxC y su CxP espejo) unidas por la llave. */
export function DocumentMirror({ doc }: { doc: Pick<IcDocumentDetail, 'key' | 'receivable' | 'payable' | 'result'> }) {
  return <MirrorPair documentKey={doc.key} statusLabel={resultInfo(doc.result).mirrorLabel} issuer={legView(doc.receivable)} receiver={legView(doc.payable)} />
}
