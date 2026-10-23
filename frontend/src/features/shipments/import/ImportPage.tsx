import { useState } from 'react'
import { Link } from 'react-router'
import type { ImportCommitResult, ImportCreated, ImportMapping } from '../../../api/types'
import { Notice } from '../../../components/Notice'
import { PageHeader } from '../../../components/PageHeader'
import { ConfirmStep } from './ConfirmStep'
import { FileStep } from './FileStep'
import { MappingStep } from './MappingStep'
import { ReviewStep } from './ReviewStep'

type WizardState =
  | { step: 'file' }
  | { step: 'mapping'; upload: ImportCreated; mapping?: ImportMapping }
  | { step: 'review'; upload: ImportCreated; mapping: ImportMapping }
  | { step: 'confirm'; upload: ImportCreated; mapping: ImportMapping }
  | { step: 'done'; fileName: string; result: ImportCommitResult }

const STEPS = [
  { key: 'file', label: 'Izbor fajla' },
  { key: 'mapping', label: 'Mapiranje kolona' },
  { key: 'review', label: 'Pregled i ispravke' },
  { key: 'confirm', label: 'Potvrda' },
] as const

/** Excel import in four steps: file -> column mapping -> errors, duplicates and corrections -> confirm. */
export function ImportPage() {
  const [state, setState] = useState<WizardState>({ step: 'file' })
  const currentIndex = state.step === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === state.step)

  return (
    <section>
      <PageHeader title="Uvoz pošiljki iz Excel-a" actions={<Link to="/shipments">Nazad na pošiljke</Link>} />

      <ol className="stepper" aria-label="Koraci uvoza">
        {STEPS.map((s, index) => (
          <li
            key={s.key}
            className={`stepper__item${index < currentIndex ? ' stepper__item--done' : ''}`}
            aria-current={index === currentIndex ? 'step' : undefined}
          >
            <span className="stepper__number">{index + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {state.step === 'file' && <FileStep onUploaded={(upload) => setState({ step: 'mapping', upload })} />}

      {state.step === 'mapping' && (
        <MappingStep
          upload={state.upload}
          initial={state.mapping}
          onBack={() => setState({ step: 'file' })}
          onMapped={(mapping) => setState({ step: 'review', upload: state.upload, mapping })}
        />
      )}

      {state.step === 'review' && (
        <ReviewStep
          importId={state.upload.importId}
          onBack={() => setState({ step: 'mapping', upload: state.upload, mapping: state.mapping })}
          onNext={() => setState({ step: 'confirm', upload: state.upload, mapping: state.mapping })}
        />
      )}

      {state.step === 'confirm' && (
        <ConfirmStep
          importId={state.upload.importId}
          fileName={state.upload.fileName}
          onBack={() => setState({ step: 'review', upload: state.upload, mapping: state.mapping })}
          onCommitted={(result) => setState({ step: 'done', fileName: state.upload.fileName, result })}
        />
      )}

      {state.step === 'done' && (
        <Notice tone="success" title={`Upisano pošiljki: ${state.result.created}`} role="status">
          <p>
            Fajl „{state.fileName}“ je uvezen; preskočeno redova: {state.result.skipped}.
          </p>
          <p className="notice__actions">
            <Link to="/shipments">Pogledaj pošiljke</Link>
            <button type="button" onClick={() => setState({ step: 'file' })}>
              Novi uvoz
            </button>
          </p>
        </Notice>
      )}
    </section>
  )
}
