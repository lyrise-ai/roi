import { useEffect, useState } from 'react'
import { Icon } from '@components/ui'
import styles from './ProfitMapReport.module.css'

const SECTIONS = [
  ['starting-point', 'Recommended starting point'],
  ['snapshot', 'Company snapshot'],
  ['workflows', 'Proposed AI workflows'],
  ['process-map', 'Process map'],
  ['uplift', 'Profit uplift'],
  ['outlook', 'Three-year outlook'],
  ['delay', 'Cost of delay'],
  ['roadmap', 'Roadmap'],
  ['next-steps', 'Next steps'],
]

function SectionHeading({ eyebrow, title, intro }) {
  return (
    <header className={styles.sectionHeading}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h2>{title}</h2>
      {intro ? <p className={styles.sectionIntro}>{intro}</p> : null}
    </header>
  )
}

function ReportNav({ activeSection, visibleSections }) {
  return (
    <nav className={styles.nav} aria-label="Report sections">
      <p className={styles.navLabel}>In this report</p>
      <ol>
        {visibleSections.map(([id, label], index) => (
          <li key={id}>
            <a
              className={activeSection === id ? styles.navActive : ''}
              href={`#${id}`}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Metric({ label, value, detail, tone = '' }) {
  return (
    <div className={`${styles.metric} ${tone ? styles[tone] : ''}`}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={styles.metricValue}>{value}</p>
      {detail ? <p className={styles.metricDetail}>{detail}</p> : null}
    </div>
  )
}

function CompanySnapshot({ snapshot }) {
  if (!snapshot?.length) return null

  return (
    <section className={styles.section} id="snapshot">
      <SectionHeading
        eyebrow="02"
        title="Company snapshot"
        intro="The context behind this map, kept visible so the model has a place to stand."
      />
      <div className={styles.snapshotGrid}>
        {snapshot.map((item) => (
          <div className={styles.snapshotRow} key={item.label}>
            <p className={styles.snapshotLabel}>{item.label}</p>
            <p className={styles.snapshotValue}>{item.value}</p>
            {item.source ? (
              <p className={styles.source}>{item.source}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function WorkflowRow({ workflow, expanded, onToggle }) {
  const details = workflow.details
  return (
    <article
      className={`${styles.workflow} ${expanded ? styles.workflowExpanded : ''}`}
    >
      <button
        type="button"
        className={styles.workflowSummary}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={styles.workflowName}>{workflow.name}</span>
        <span className={styles.workflowAgent}>{workflow.agent}</span>
        <span className={styles.workflowFigure}>{workflow.hours}</span>
        <span className={styles.workflowFigure}>{workflow.gain}</span>
        <Icon name="chevron-down" size={18} />
      </button>
      {expanded ? (
        <div className={styles.workflowDetails}>
          <div className={styles.hoursCompare}>
            <Metric label="Hours today" value={details.hoursToday} />
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
            <Metric label="Hours after" value={details.hoursAfter} />
            <p className={styles.personNote}>{details.personHours}</p>
          </div>
          <div className={styles.detailGrid}>
            <div>
              <p className={styles.detailLabel}>What is in scope</p>
              <p className={styles.detailText}>{details.scope}</p>
            </div>
            <div>
              <p className={styles.detailLabel}>The formula</p>
              <p className={styles.formula}>{details.formula}</p>
            </div>
          </div>
          <div className={styles.splitGrid}>
            <Metric
              label="Wages you get back"
              value={details.wagesBack}
              detail="the operational dividend"
            />
            <Metric
              label="Freed time"
              value={details.freedTime}
              detail="capacity returned to the team"
            />
          </div>
          <div className={styles.assumptions}>
            <div className={styles.assumptionsHeading}>
              <p className={styles.eyebrow}>Check the model</p>
              <h3>What we multiplied by</h3>
            </div>
            <div className={styles.assumptionGrid}>
              {details.assumptions.map((assumption) => (
                <div className={styles.assumption} key={assumption.name}>
                  <p className={styles.detailLabel}>{assumption.name}</p>
                  <p className={styles.assumptionValue}>{assumption.value}</p>
                  <p className={styles.detailText}>{assumption.reason}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.fullSum}>
            <p className={styles.detailLabel}>The full sum, start to finish</p>
            <p className={styles.formula}>{details.fullSum}</p>
          </div>
        </div>
      ) : null}
    </article>
  )
}

function Workflows({ workflows, rejected }) {
  const [expandedId, setExpandedId] = useState(null)
  if (!workflows?.length) return null

  return (
    <section className={styles.section} id="workflows">
      <SectionHeading
        eyebrow="03"
        title="Proposed AI workflows"
        intro="The highest-density opportunities, ordered by the value they could return."
      />
      <div className={styles.workflowTable}>
        <div className={styles.workflowHeader} aria-hidden="true">
          <span>Workflow</span>
          <span>Agent</span>
          <span>Hours returned</span>
          <span>Gain / year</span>
          <span />
        </div>
        {workflows.map((workflow) => (
          <WorkflowRow
            key={workflow.id}
            workflow={workflow}
            expanded={expandedId === workflow.id}
            onToggle={() =>
              setExpandedId(expandedId === workflow.id ? null : workflow.id)
            }
          />
        ))}
      </div>
      {rejected?.length ? (
        <div className={styles.rejected}>
          <p className={styles.detailLabel}>Also considered, and left out</p>
          {rejected.map((item) => (
            <p key={item.name}>
              <strong>{item.name}</strong> {item.reason}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ProcessMap({ processMap }) {
  if (!processMap?.steps?.length) return null
  return (
    <section className={styles.section} id="process-map">
      <SectionHeading
        eyebrow="04"
        title={processMap.title}
        intro={processMap.intro}
      />
      <div className={styles.processMap}>
        {processMap.steps.map((step, index) => (
          <div className={styles.processStep} key={step.name}>
            <span className={styles.stepNumber}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3>{step.name}</h3>
            <p>{step.detail}</p>
            <span className={styles.stepOwner}>{step.owner}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ReportScreen({ report }) {
  const [activeSection, setActiveSection] = useState('starting-point')
  const { company, reportSections } = report
  const sections = reportSections || {}
  const visibleSections = SECTIONS.filter(([id]) => {
    if (id === 'snapshot') return sections.snapshot?.length
    if (id === 'workflows') return sections.workflows?.length
    if (id === 'process-map') return sections.processMap?.steps?.length
    return true
  })

  useEffect(() => {
    const observed = SECTIONS.map(([id]) => document.getElementById(id)).filter(
      Boolean,
    )
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 },
    )
    observed.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>LyRise Profit Map · {company.name}</p>
          <h1>{sections.startingPoint?.title || 'Where to start'}</h1>
          <p className={styles.heroIntro}>{sections.startingPoint?.body}</p>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendDot} aria-hidden="true" />
          {report.legend ||
            'Solid values are yours. Anything marked carries its source.'}
        </div>
      </header>
      <div className={styles.layout}>
        <ReportNav
          activeSection={activeSection}
          visibleSections={visibleSections}
        />
        <div className={styles.content}>
          <section className={styles.section} id="starting-point">
            <SectionHeading
              eyebrow="01"
              title="Recommended starting point"
              intro={sections.startingPoint?.recommendation}
            />
            <div className={styles.startingPoint}>
              <p className={styles.startingPointName}>
                {sections.startingPoint?.workflowName}
              </p>
              <p>{sections.startingPoint?.why}</p>
            </div>
          </section>
          <CompanySnapshot snapshot={sections.snapshot} />
          <Workflows
            workflows={sections.workflows}
            rejected={sections.rejected}
          />
          <ProcessMap processMap={sections.processMap} />
          <section className={styles.section} id="uplift">
            <SectionHeading
              eyebrow="05"
              title={sections.profitUplift?.title || 'Profit uplift'}
              intro={sections.profitUplift?.intro}
            />
            <div className={styles.metricGrid}>
              {sections.profitUplift?.metrics?.map((metric) => (
                <Metric key={metric.label} {...metric} />
              ))}
            </div>
          </section>
          <section className={styles.section} id="outlook">
            <SectionHeading
              eyebrow="06"
              title="Three-year outlook"
              intro={sections.outlook?.intro}
            />
            <div className={styles.outlookGrid}>
              {sections.outlook?.years?.map((year) => (
                <Metric key={year.label} {...year} />
              ))}
            </div>
          </section>
          <section className={styles.section} id="delay">
            <SectionHeading
              eyebrow="07"
              title="Cost of delay"
              intro={sections.costOfDelay?.intro}
            />
            <div className={styles.delayPanel}>
              <p className={styles.delayValue}>{sections.costOfDelay?.value}</p>
              <p className={styles.delayPeriod}>
                {sections.costOfDelay?.period}
              </p>
              <p>{sections.costOfDelay?.body}</p>
            </div>
          </section>
          <section className={styles.section} id="roadmap">
            <SectionHeading
              eyebrow="08"
              title="Roadmap"
              intro={sections.roadmap?.intro}
            />
            <div className={styles.roadmap}>
              {sections.roadmap?.phases?.map((phase, index) => (
                <div className={styles.phase} key={phase.name}>
                  <span className={styles.stepNumber}>0{index + 1}</span>
                  <div>
                    <h3>{phase.name}</h3>
                    <p>{phase.detail}</p>
                  </div>
                  <span className={styles.phaseWhen}>{phase.when}</span>
                </div>
              ))}
            </div>
          </section>
          <section className={styles.section} id="next-steps">
            <SectionHeading
              eyebrow="09"
              title="Next steps"
              intro={sections.nextSteps?.intro}
            />
            <div className={styles.nextSteps}>
              {sections.nextSteps?.steps?.map((step, index) => (
                <div key={step} className={styles.nextStep}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <footer className={styles.footer}>{report.disclaimer}</footer>
    </main>
  )
}

export default ReportScreen
