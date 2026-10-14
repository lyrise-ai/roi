import * as React from 'react'
import Link from 'next/link'
import styles from '@/src/ui/report/Report.module.css'

const Section = ({ section, children }) => (
  <section className={styles.section} id={section.ref}>
    <header className={styles.sectionHeader}>
      <h2>{section.title}</h2>
      {section.sub && <p>{section.sub}</p>}
    </header>
    {children}
  </section>
)

const Metric = ({ label, value, note }) => (
  <div className={styles.metric}>
    <span className={styles.metricLabel}>{label}</span>
    <strong className={styles.metricValue}>{value}</strong>
    {note && <span className={styles.metricNote}>{note}</span>}
  </div>
)

const WorkflowRow = ({ row }) => (
  <details className={styles.workflow} id={`workflow-${row.id}`}>
    <summary className={styles.workflowSummary}>
      <span className={styles.workflowTitle}>
        <strong>{row.workflow}</strong>
        <span>{row.agent}</span>
      </span>
      <span className={styles.workflowMetrics}>
        <span>
          <small>Hours back / year</small>
          <strong>{row.hours} hrs</strong>
        </span>
        <span>
          <small>Annual gain</small>
          <strong>{row.gain}</strong>
        </span>
      </span>
      <span className={styles.viewDetails}>View details</span>
    </summary>
    <div className={styles.workflowDetails}>
      <div className={styles.detailGrid}>
        <div>
          <h4>Today</h4>
          <p>{row.today}</p>
        </div>
        <div>
          <h4>Proposed scope</h4>
          <p>{row.scope}</p>
          <p className={styles.proposalNote}>
            Proposed workflow only. Validate the steps and human controls with
            your team.
          </p>
        </div>
      </div>

      <div className={styles.rowMetrics}>
        <Metric label="Hours spent today" value={`${row.total} hrs / year`} />
        <Metric label="Hours returned" value={`${row.hours} hrs / year`} />
        <Metric label="Annual gain" value={row.gain} />
        <Metric label="Wage savings" value={row.od} />
        <Metric label="Profit uplift" value={row.uplift} />
      </div>

      <div className={styles.remaining}>
        <div>
          <strong>{row.remaining} hrs remain with people</strong>
          <span>{row.remainPct} of today’s hours</span>
        </div>
        <div
          className={styles.remainingTrack}
          role="img"
          aria-label={`${row.remainPct} of current hours remain with people`}
        >
          <span style={{ width: row.remainPct }} />
        </div>
      </div>

      <p className={styles.formula}>{row.formula}</p>

      <div className={styles.assumptions}>
        <h4>Assumptions used</h4>
        <ul>
          {row.assumptions.map((assumption) => (
            <li key={assumption.name}>
              <span>
                <strong>
                  {assumption.name}: {assumption.value}
                </strong>
                <small>{assumption.why}</small>
              </span>
              <span
                className={
                  assumption.given ? styles.givenMark : styles.estimatedMark
                }
              >
                {assumption.given ? 'Your answer' : 'Estimated'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <details className={styles.calculation}>
        <summary>Show calculation</summary>
        <pre>{row.chain}</pre>
      </details>
    </div>
  </details>
)

const getSection = (model, ref) =>
  model.sections.find((section) => section.ref === ref)

export function Report({ model }) {
  const companyName =
    model.snapshot.find((row) => row.label.toLowerCase() === 'company')
      ?.value || 'Profit Map'
  const isPartial = (model.failedRows?.length || 0) > 0

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>LyRise Profit Map</span>
        <h1>{companyName}</h1>
        <p>{model.disclaimer}</p>
      </header>

      <nav className={styles.desktopNav} aria-label="Report sections">
        {model.nav.map((item) => (
          <a key={item.ref} href={`#${item.ref}`}>
            {item.label}
          </a>
        ))}
      </nav>
      <label className={styles.mobileNav}>
        <span>Jump to section</span>
        <select
          aria-label="Jump to section"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) window.location.hash = event.target.value
          }}
        >
          <option value="" disabled>
            Choose a section
          </option>
          {model.nav.map((item) => (
            <option key={item.ref} value={item.ref}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.reportBody}>
        {getSection(model, 'start') && (
          <Section section={getSection(model, 'start')}>
            <div className={styles.thesis}>
              <p>{model.thesis}</p>
            </div>
          </Section>
        )}

        {getSection(model, 'company') && (
          <Section section={getSection(model, 'company')}>
            <div className={styles.snapshot}>
              {model.snapshot.map((item, index) => (
                <article
                  className={styles.snapshotItem}
                  key={`${item.label}-${index}`}
                >
                  <span className={styles.eyebrow}>{item.label}</span>
                  <p>{item.value}</p>
                  {item.source ? (
                    <a href={item.source} target="_blank" rel="noreferrer">
                      {item.tag}
                    </a>
                  ) : (
                    <span className={styles.sourceTag}>{item.tag}</span>
                  )}
                </article>
              ))}
            </div>
          </Section>
        )}

        {getSection(model, 'workflows') && (
          <Section section={getSection(model, 'workflows')}>
            <p className={styles.intro}>{model.workflowsSub}</p>
            <div className={styles.workflowList}>
              {model.workflowRows.map((row) => (
                <WorkflowRow key={row.id} row={row} />
              ))}
            </div>

            {model.failedRows?.length > 0 && (
              <div className={styles.failures} role="status">
                <h3>Workflows not included in the totals</h3>
                {model.failedRows.map((row, index) => (
                  <div key={`${row.workflow}-${index}`}>
                    <strong>{row.workflow}</strong>
                    <p>{row.message}</p>
                  </div>
                ))}
              </div>
            )}

            {model.totalsFailed ? (
              <p className={styles.totalsFailed} role="status">
                {model.totalsFailed}
              </p>
            ) : (
              <div className={styles.totalCard}>
                <div>
                  <span>{model.totalsLabel}</span>
                  {isPartial && (
                    <small>
                      Incomplete workflows are excluded from these totals.
                    </small>
                  )}
                </div>
                <Metric
                  label="Hours back / year"
                  value={`${model.totalHours} hrs`}
                />
                <Metric label="Total annual gain" value={model.totalGain} />
              </div>
            )}
          </Section>
        )}

        {getSection(model, 'map') && (
          <Section section={getSection(model, 'map')}>
            <h3 className={styles.subheading}>{model.mapTitle}</h3>
            <ol className={styles.processMap}>
              {model.processMap.map((step) => (
                <li key={step.n}>
                  <span className={styles.stepNumber}>{step.n}</span>
                  <div>
                    <strong>{step.step}</strong>
                    <p>{step.detail}</p>
                    <div className={styles.processPeople}>
                      <span>Today: {step.today}</span>
                      <span>
                        Proposed:{' '}
                        {step.after === 'agent-drafts'
                          ? 'AI drafts; person reviews'
                          : step.after === 'agent'
                            ? 'AI agent supports'
                            : 'Person remains responsible'}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {getSection(model, 'uplift') && (
          <Section section={getSection(model, 'uplift')}>
            {model.totalsFailed ? (
              <p className={styles.totalsFailed}>{model.totalsFailed}</p>
            ) : (
              <>
                <div className={styles.totalMetrics}>
                  <Metric
                    label="Operational dividend / year"
                    value={model.totalOd}
                  />
                  <Metric
                    label="Additional profit uplift / year"
                    value={model.totalUplift}
                  />
                </div>
                {model.odPct && model.upliftPct && (
                  <div className={styles.splitBar}>
                    <span
                      style={{ width: model.odPct }}
                      title={`Wage savings ${model.odPct}`}
                    />
                    <span
                      style={{ width: model.upliftPct }}
                      title={`Profit uplift ${model.upliftPct}`}
                    />
                  </div>
                )}
                <div className={styles.splitLegend}>
                  <span>
                    Wage savings <strong>{model.odPct}</strong>
                  </span>
                  <span>
                    Profit uplift <strong>{model.upliftPct}</strong>
                  </span>
                </div>
                <div className={styles.levers}>
                  {model.levers.map((lever, index) => (
                    <article key={`${lever.from}-${index}`}>
                      <div>
                        <strong>{lever.label}</strong>
                        <span>{lever.from}</span>
                      </div>
                      <strong>{lever.value}</strong>
                    </article>
                  ))}
                </div>
              </>
            )}
          </Section>
        )}

        {getSection(model, 'outlook') && (
          <Section section={getSection(model, 'outlook')}>
            {model.totalsFailed ? (
              <p className={styles.totalsFailed}>{model.totalsFailed}</p>
            ) : (
              <div className={styles.outlook}>
                {model.outlook?.map((year) => (
                  <article className={styles.outlookYear} key={year.label}>
                    <strong>{year.total}</strong>
                    <div className={styles.outlookTrack}>
                      <div style={{ height: year.heightPct }}>
                        <span style={{ height: year.odPct }} />
                        <span style={{ height: year.upliftPct }} />
                      </div>
                    </div>
                    <span>{year.label}</span>
                  </article>
                ))}
              </div>
            )}
          </Section>
        )}

        {getSection(model, 'delay') && (
          <Section section={getSection(model, 'delay')}>
            {model.totalsFailed ? (
              <p className={styles.totalsFailed}>{model.totalsFailed}</p>
            ) : (
              <div className={styles.delayCard}>
                <strong>{model.delayMonthly}</strong>
                <p>{model.delayCopy}</p>
              </div>
            )}
          </Section>
        )}

        {getSection(model, 'roadmap') && (
          <Section section={getSection(model, 'roadmap')}>
            <ol className={styles.roadmap}>
              {model.roadmap.map((phase) => (
                <li key={phase.phase}>
                  <span>{phase.weeks}</span>
                  <div>
                    <strong>{phase.phase}</strong>
                    <p>{phase.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {getSection(model, 'next') && (
          <Section section={getSection(model, 'next')}>
            <div className={styles.nextSteps}>
              <p>{model.nextCopy}</p>
              <ol>
                {model.journey.map((step) => (
                  <li key={step.n}>
                    <span>{step.n}</span>
                    {step.label}
                  </li>
                ))}
              </ol>
              <p className={styles.disclaimer}>{model.guaranteeCopy}</p>
            </div>
            {model.confirm.length > 0 && (
              <div className={styles.confirm}>
                <h3>Inputs to confirm</h3>
                <p>{model.confirmSub}</p>
                <ul>
                  {model.confirm.map((item, index) => (
                    <li key={`${item.item}-${index}`}>
                      <strong>{item.item}</strong>
                      <span>{item.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        <p className={styles.legend}>{model.legend}</p>
        <footer className={styles.footer}>
          <Link href="/v2">Make your own Profit Map</Link>
        </footer>
      </div>
    </main>
  )
}

export default Report
