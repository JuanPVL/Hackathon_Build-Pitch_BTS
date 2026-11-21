/** Componentes compartidos de QUADRA. Los módulos importan solo desde aquí. */
export {
  Button, ButtonLink, Card, CardHeader, Eyebrow, Chip, PageHeader, StatCard,
  Grid, Split, Stack, SegmentedControl, BarMeter, Callout, toneForSign, textTone,
} from './primitives'
export type { ButtonVariant, CardTone, ChipTone, ValueTone, SegmentOption } from './primitives'
export { DataTable, ResponsiveTable } from './DataTable'
export type { Column, DataTableProps } from './DataTable'
export { Equation, MirrorPair, Stepper, Pipeline } from './brand'
export type { EquationTerm, Leg, StepItem, StepState, PipelineStep } from './brand'
export { FullState, StateMessage, QueryState } from './states'
export type { QueryLike } from './states'
