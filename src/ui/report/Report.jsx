import React from 'react'
import { Card } from '@/src/ui/core/Card'
import { Icon } from '@/src/ui/core/Icon'
import { ProvenanceMark } from '@/src/ui/roi/ProvenanceMark'
import styles from '@/src/ui/report/Report.module.css'

const SECTION_REFS = [
  'start',
  'company',
  'workflows',
  'map',
  'uplift',
  'outlook',
  'delay',
  'roadmap',
  'next',
]

function hasContent(value) {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' && value.trim().length > 0
}

function failureNotice(message) {
  if (!hasContent(message)) return null
  return (
    <div className={styles.failure} role="status">
      {message}
    </div>
  )
}

function ReportSection({ section, children }) {
  if (!section || !children) return null
  return (
    <section
      id={section.ref}
      className={styles.section}
      aria-labelledby={`${section.ref}-title`}
    >
      <header className={styles.sectionHeader}>
        <h2 id={`${section.ref}-title`} className={styles.sectionTitle}>
          {section.title}
        </h2>
        {hasContent(section.sub) && (
          <p className={styles.sectionSub}>{section.sub}</p>
        )}
      </header>
      {children}
    </section>
  )
}

function Metric({ label, value, mark }) {
  if (!hasContent(value)) return null
  return (
    <div className={styles.metric}>
      <span className={styles.eyebrow}>{label}</span>
      <strong className={styles.metricValue}>
        {value}
        {mark && <ProvenanceMark kind={mark} />}
      </strong>
    </div>
  )
}

function WorkflowRow({ row }) {
  return (
    <details className={styles.workflow}>
      <summary className={styles.workflowSummary}>
        <div className={styles.workflowName}>
          <strong>{row.workflow}</strong>
          <span>{row.agent}</span>
        </div>
        <div className={styles.workflowMetrics}>
          <Metric label="Hours back" value={row.hours} mark={row.mark} />
          <Metric label="Annual gain" value={row.gain} mark={row.mark} />
        </div>
        <Icon
          name="chevron-down"
          size={20}
          className={styles.workflowChevron}
        />
      </summary>
      <div className={styles.workflowDetails}>
        <div className={styles.todayAfter}>
          {hasContent(row.today) && (
            <div>
              <span className={styles.eyebrow}>Today</span>
              <p>{row.today}</p>
              {hasContent(row.total) && (
                <strong className={styles.inlineValue}>{row.total}</strong>
              )}
            </div>
          )}
          {hasContent(row.agent) && (
            <div>
              <span className={styles.eyebrow}>After</span>
              <p>{row.agent}</p>
            </div>
          )}
        </div>
        {hasContent(row.scope) && (
          <div>
            <span className={styles.eyebrow}>Scope</span>
            <p>{row.scope}</p>
          </div>
        )}
        {hasContent(row.formula) && (
          <div className={styles.formula}>
            <span className={styles.eyebrow}>Hours today</span>
            <p>{row.formula}</p>
          </div>
        )}
        {hasContent(row.remaining) && hasContent(row.remainPct) && (
          <div className={styles.remaining}>
            <div className={styles.remainingLabel}>
              <span className={styles.eyebrow}>
                Hours that stay with a person
              </span>
              <strong>{row.remaining}</strong>
            </div>
            <div
              className={styles.remainingTrack}
              role="img"
              aria-label={`${row.remainPct} of hours stay with a person`}
            >
              <span
                className={styles.remainingBar}
                style={{ width: row.remainPct }}
              />
            </div>
          </div>
        )}
        {(hasContent(row.od) || hasContent(row.uplift)) && (
          <div className={styles.valueSplit}>
            <div className={styles.odMetric}>
              <Metric label="Wages you get back" value={row.od} />
              {hasContent(row.od) && (
                <span className={styles.muted}>the operational dividend</span>
              )}
            </div>
            <Metric label="What the freed time earns" value={row.uplift} />
          </div>
        )}
        {Array.isArray(row.assumptions) && row.assumptions.length > 0 && (
          <ul className={styles.assumptions}>
            {row.assumptions.map((assumption) => (
              <li key={`${assumption.name}-${assumption.value}`}>
                <strong>
                  {assumption.name}: {assumption.value}
                </strong>
                <span>{assumption.why}</span>
              </li>
            ))}
          </ul>
        )}
        {hasContent(row.chain) && (
          <div className={styles.formula}>
            <span className={styles.eyebrow}>WHAT WE MULTIPLIED BY</span>
            <p className={styles.chain}>{row.chain}</p>
          </div>
        )}
      </div>
    </details>
  )
}

function WorkflowSection({ model }) {
  const failedRows = Array.isArray(model.failedRows) ? model.failedRows : []
  if (
    !model.workflowRows?.length &&
    !failedRows.length &&
    !model.rejected?.length &&
    !hasContent(model.workflowsSub) &&
    !hasContent(model.totalHours) &&
    !hasContent(model.totalGain) &&
    !hasContent(model.totalsFailed)
  ) {
    return null
  }

  return (
    <div className={styles.stack}>
      {hasContent(model.workflowsSub) && (
        <p className={styles.sectionDescription}>{model.workflowsSub}</p>
      )}
      {model.workflowRows?.map((row) => (
        <WorkflowRow key={row.id} row={row} />
      ))}
      {failedRows.map((row, index) => (
        <Card key={`${row.workflow}-${index}`} tone="subtle">
          <div className={styles.failedRow}>
            <strong>{row.workflow}</strong>
            <p>{row.message}</p>
          </div>
        </Card>
      ))}
      {hasContent(model.totalsFailed)
        ? failureNotice(model.totalsFailed)
        : (hasContent(model.totalHours) || hasContent(model.totalGain)) && (
            <div className={styles.workflowTotals}>
              {hasContent(model.totalsLabel) && (
                <strong className={styles.workflowTotalsLabel}>
                  {model.totalsLabel}
                </strong>
              )}
              <Metric label="Hours back" value={model.totalHours} />
              <Metric label="Annual gain" value={model.totalGain} />
            </div>
          )}
      {model.rejected?.map((row) => (
        <Card key={row.workflow} tone="subtle">
          <div className={styles.rejectedRow}>
            <strong>{row.workflow}</strong>
            <p>{row.reason}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}

function ProcessMap({ steps }) {
  if (!steps?.length) return null
  return (
    <ol className={styles.processMap}>
      {steps.map((step) => (
        <li key={step.n} className={styles.processStep}>
          <span className={styles.stepNumber}>{step.n}</span>
          <div className={styles.stepDescription}>
            <strong>{step.step}</strong>
            {hasContent(step.detail) && <p>{step.detail}</p>}
          </div>
          {hasContent(step.today) && (
            <div className={styles.stepOwner}>
              <span className={styles.eyebrow}>Today</span>
              <span>{step.today}</span>
            </div>
          )}
          <div className={styles.stepOwner}>
            <span className={styles.eyebrow}>After</span>
            <span>
              {step.after === 'agent'
                ? 'Agent'
                : step.after === 'agent-drafts'
                  ? 'Agent drafts; person reviews'
                  : 'Unchanged'}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ProfitUplift({ model }) {
  const failed = hasContent(model.totalsFailed)
  return (
    <div className={styles.stack}>
      {model.levers?.map((lever) => (
        <div className={styles.lever} key={`${lever.label}-${lever.from}`}>
          <div>
            <strong>{lever.label}</strong>
            {hasContent(lever.from) && (
              <span className={styles.muted}>{lever.from}</span>
            )}
          </div>
          <strong className={styles.leverValue}>{lever.value}</strong>
        </div>
      ))}
      {failed ? (
        failureNotice(model.totalsFailed)
      ) : (
        <>
          <div className={styles.totalRow}>
            <Metric label="Wages you get back" value={model.totalOd} />
            <Metric label="Profit from the hours" value={model.totalUplift} />
          </div>
          {hasContent(model.odPct) && hasContent(model.upliftPct) && (
            <div className={styles.split}>
              <div
                className={styles.splitBar}
                role="img"
                aria-label={`${model.odPct} wages you get back, ${model.upliftPct} profit from the hours`}
              >
                <span
                  className={styles.odBar}
                  style={{ width: model.odPct }}
                  title={model.odPct}
                />
                <span
                  className={styles.upliftBar}
                  style={{ width: model.upliftPct }}
                  title={model.upliftPct}
                />
              </div>
              <div className={styles.splitLabels}>
                <span>Wages you get back · {model.odPct}</span>
                <span>Profit from the hours · {model.upliftPct}</span>
              </div>
            </div>
          )}
          {hasContent(model.legend) && (
            <p className={styles.legend}>{model.legend}</p>
          )}
        </>
      )}
    </div>
  )
}

function Outlook({ model }) {
  if (hasContent(model.totalsFailed)) {
    return failureNotice(model.totalsFailed)
  }
  if (!model.outlook?.length) return null
  return (
    <div className={styles.outlook}>
      {model.outlook.map((year) => (
        <div className={styles.outlookYear} key={year.label}>
          <strong>{year.total}</strong>
          <div className={styles.outlookTrack}>
            <div
              className={styles.outlookColumn}
              style={{ height: year.heightPct }}
              role="img"
              aria-label={`${year.label}: ${year.total}`}
            >
              <span className={styles.odBar} style={{ height: year.odPct }} />
              <span
                className={styles.upliftBar}
                style={{ height: year.upliftPct }}
              />
            </div>
          </div>
          <span>{year.label}</span>
        </div>
      ))}
    </div>
  )
}

function Roadmap({ phases }) {
  if (!phases?.length) return null
  return (
    <ol className={styles.roadmap}>
      {phases.map((phase) => (
        <li key={`${phase.weeks}-${phase.phase}`} className={styles.phase}>
          <span className={styles.eyebrow}>{phase.weeks}</span>
          <strong>{phase.phase}</strong>
          {hasContent(phase.detail) && <p>{phase.detail}</p>}
        </li>
      ))}
    </ol>
  )
}

function NextSteps({ model }) {
  const hasNextContent =
    hasContent(model.nextCopy) ||
    model.journey?.length ||
    hasContent(model.guaranteeCopy) ||
    model.confirm?.length
  if (!hasNextContent) return null
  return (
    <div className={styles.stack}>
      {hasContent(model.nextCopy) && <p>{model.nextCopy}</p>}
      {model.journey?.length > 0 && (
        <ol className={styles.journey}>
          {model.journey.map((step) => (
            <li key={step.n}>
              <span className={styles.stepNumber}>{step.n}</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      )}
      {hasContent(model.guaranteeCopy) && (
        <Card tone="accent">
          <p>{model.guaranteeCopy}</p>
        </Card>
      )}
      {model.confirm?.length > 0 && (
        <div className={styles.confirm}>
          {hasContent(model.confirmSub) && <p>{model.confirmSub}</p>}
          <ul>
            {model.confirm.map((item) => (
              <li key={item.item}>
                <strong>{item.item}</strong>
                {hasContent(item.note) && <span>{item.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function Report({ model, className, ...rest }) {
  if (!model) return null

  const sections = Array.isArray(model.sections) ? model.sections : []
  const sectionFor = (ref) => sections.find((section) => section.ref === ref)
  const visibleRefs = new Set(
    SECTION_REFS.filter((ref) => {
      switch (ref) {
        case 'start':
          return hasContent(model.thesis)
        case 'company':
          return model.snapshot?.length > 0
        case 'workflows':
          return (
            model.workflowRows?.length > 0 ||
            model.failedRows?.length > 0 ||
            model.rejected?.length > 0 ||
            hasContent(model.workflowsSub) ||
            hasContent(model.totalHours) ||
            hasContent(model.totalGain) ||
            hasContent(model.totalsFailed)
          )
        case 'map':
          return model.processMap?.length > 0 || hasContent(model.mapTitle)
        case 'uplift':
          return (
            model.levers?.length > 0 ||
            hasContent(model.totalOd) ||
            hasContent(model.totalUplift) ||
            hasContent(model.totalsFailed)
          )
        case 'outlook':
          return model.outlook?.length > 0 || hasContent(model.totalsFailed)
        case 'delay':
          return (
            hasContent(model.delayMonthly) ||
            hasContent(model.delayCopy) ||
            hasContent(model.totalsFailed)
          )
        case 'roadmap':
          return model.roadmap?.length > 0
        case 'next':
          return (
            hasContent(model.nextCopy) ||
            model.journey?.length > 0 ||
            hasContent(model.guaranteeCopy) ||
            model.confirm?.length > 0
          )
        default:
          return false
      }
    }),
  )

  return (
    <article
      className={[styles.report, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {model.nav?.some((item) => visibleRefs.has(item.ref)) && (
        <nav className={styles.nav} aria-label="Report sections">
          {model.nav
            .filter((item) => visibleRefs.has(item.ref))
            .map((item) => (
              <a href={`#${item.ref}`} key={item.ref}>
                {item.label}
              </a>
            ))}
        </nav>
      )}

      <div className={styles.sections}>
        <ReportSection section={sectionFor('start')}>
          {visibleRefs.has('start') && (
            <Card tone="accent" className={styles.thesis}>
              <p>{model.thesis}</p>
            </Card>
          )}
        </ReportSection>

        <ReportSection section={sectionFor('company')}>
          {visibleRefs.has('company') && (
            <div className={styles.snapshot}>
              {model.snapshot.map((item) => (
                <Card
                  key={`${item.label}-${item.value}`}
                  className={styles.snapshotCard}
                >
                  <span className={styles.eyebrow}>{item.label}</span>
                  <strong>{item.value}</strong>
                  <a
                    href={item.source}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.source}
                  >
                    {item.tag}
                    <Icon name="arrow-right" size={14} />
                  </a>
                </Card>
              ))}
            </div>
          )}
        </ReportSection>

        <ReportSection section={sectionFor('workflows')}>
          {visibleRefs.has('workflows') && <WorkflowSection model={model} />}
        </ReportSection>

        <ReportSection section={sectionFor('map')}>
          {visibleRefs.has('map') && (
            <div className={styles.stack}>
              {hasContent(model.mapTitle) && (
                <h3 className={styles.subheading}>{model.mapTitle}</h3>
              )}
              <ProcessMap steps={model.processMap} />
            </div>
          )}
        </ReportSection>

        <ReportSection section={sectionFor('uplift')}>
          {visibleRefs.has('uplift') && <ProfitUplift model={model} />}
        </ReportSection>

        <ReportSection section={sectionFor('outlook')}>
          {visibleRefs.has('outlook') && <Outlook model={model} />}
        </ReportSection>

        <ReportSection section={sectionFor('delay')}>
          {visibleRefs.has('delay') &&
            (hasContent(model.totalsFailed) ? (
              failureNotice(model.totalsFailed)
            ) : (
              <Card className={styles.delay}>
                {hasContent(model.delayMonthly) && (
                  <strong className={styles.delayValue}>
                    {model.delayMonthly}
                  </strong>
                )}
                {hasContent(model.delayCopy) && <p>{model.delayCopy}</p>}
              </Card>
            ))}
        </ReportSection>

        <ReportSection section={sectionFor('roadmap')}>
          {visibleRefs.has('roadmap') && <Roadmap phases={model.roadmap} />}
        </ReportSection>

        <ReportSection section={sectionFor('next')}>
          {visibleRefs.has('next') && <NextSteps model={model} />}
        </ReportSection>
      </div>

      {hasContent(model.disclaimer) && (
        <footer className={styles.disclaimer}>{model.disclaimer}</footer>
      )}
    </article>
  )
}

export default Report
