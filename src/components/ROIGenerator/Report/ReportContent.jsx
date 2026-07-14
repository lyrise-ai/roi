import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReportUIProvider } from './ReportUIContext'
import { buildReportViewModel } from './reportViewModel'
import { NAV_ITEMS } from './navItems'
import SectionNav from './SectionNav'
import HeroSection from './sections/HeroSection'
import SimilarCompaniesSection from './sections/SimilarCompaniesSection'
import PatternSection from './sections/PatternSection'
import CompanySnapshotSection from './sections/CompanySnapshotSection'
import WorkflowsSection from './sections/WorkflowsSection'
import ProfitUpliftSection from './sections/ProfitUpliftSection'
import OutlookSection from './sections/OutlookSection'
import CostOfDelaySection from './sections/CostOfDelaySection'
import ResilienceSection from './sections/ResilienceSection'
import SourcesSection from './sections/SourcesSection'
import RisksSection from './sections/RisksSection'
import RoadmapSection from './sections/RoadmapSection'
import NextStepsSection from './sections/NextStepsSection'
import EndingSection from './sections/EndingSection'

function TrackedSection({
  sectionKey,
  highlightedSections,
  registerSectionRef,
  children,
}) {
  const isHighlighted = highlightedSections.has(sectionKey)
  return (
    <div
      ref={(el) => registerSectionRef(sectionKey, el)}
      className={`rounded-2xl transition-shadow duration-700 ${
        isHighlighted ? 'shadow-[0_0_0_3px_#5B48F8]' : ''
      }`}
    >
      {children}
    </div>
  )
}

// Orchestrator for the report body: owns all interaction state (hover/open
// popover/accordion/scroll-spy), replacing the old iframe-rendered static
// HTML. `navRef` is forwarded up so the toolbar's product tour can spotlight
// the nav sidebar; `onReady` hands the imperative `scrollToSection` back to
// ReportViewer for the "Sections updated" chat chips.
export default function ReportContent({
  reportState,
  highlightedSections,
  navRef,
  onReady,
  isAlpha,
  reportId,
  canManageShares,
  onDownload,
  downloadStatus,
  onAward,
  onCredibilityAnswer,
}) {
  const [hoveredTip, setHoveredTip] = useState(null)
  const [openAssumption, setOpenAssumption] = useState(null)
  const [openWorkflow, setOpenWorkflow] = useState(null)
  const [openLever, setOpenLever] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')

  const sectionRefs = useRef({})
  const scrollElRef = useRef(null)

  const registerSectionRef = useCallback((key, el) => {
    sectionRefs.current[key] = el
  }, [])

  const scrollToSection = useCallback((key) => {
    const el = sectionRefs.current[key]
    const container = scrollElRef.current
    if (!el || !container) return
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const target = container.scrollTop + (elRect.top - containerRect.top) - 16
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    setActiveSection(key)
  }, [])

  const handleScroll = useCallback(() => {
    const container = scrollElRef.current
    if (!container) return
    const containerTop = container.getBoundingClientRect().top
    let best = 'overview'
    for (const { key } of NAV_ITEMS) {
      const el = sectionRefs.current[key]
      if (el && el.getBoundingClientRect().top - containerTop - 100 <= 0)
        best = key
    }
    setActiveSection((cur) => (cur === best ? cur : best))
  }, [])

  useEffect(() => {
    onReady?.({ scrollToSection })
  }, [onReady, scrollToSection])

  const viewModel = useMemo(
    () => buildReportViewModel(reportState),
    [reportState],
  )

  const ctx = useMemo(
    () => ({
      hoveredTip,
      setHoveredTip,
      openAssumption,
      setOpenAssumption,
      openWorkflow,
      setOpenWorkflow,
      openLever,
      setOpenLever,
      activeSection,
      scrollToSection,
      registerSectionRef,
      highlightedSections,
    }),
    [
      hoveredTip,
      openAssumption,
      openWorkflow,
      openLever,
      activeSection,
      scrollToSection,
      registerSectionRef,
      highlightedSections,
    ],
  )

  if (!viewModel) return null

  return (
    <ReportUIProvider value={ctx}>
      <div className="flex h-full flex-1 overflow-hidden">
        <div
          ref={navRef}
          className="w-[216px] shrink-0 overflow-hidden border-r border-[#E5E7EB]"
        >
          <SectionNav />
        </div>
        <div
          id="report-scroll-container"
          ref={scrollElRef}
          onScroll={handleScroll}
          className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#F1F2F5] px-9 pb-[90px] pt-7"
        >
          <div className="mx-auto flex w-full max-w-[800px] min-w-0 flex-col gap-[18px]">
            <TrackedSection
              sectionKey="overview"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <HeroSection
                hero={viewModel.hero}
                confidence={viewModel.confidence}
                company={viewModel.company}
                recipientLine={viewModel.recipientLine}
                currentDate={viewModel.currentDate}
                currency={viewModel.currency}
              />
            </TrackedSection>

            <SimilarCompaniesSection companies={viewModel.similarCompanies} />
            <PatternSection text={viewModel.patternText} />

            <TrackedSection
              sectionKey="snapshot"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <CompanySnapshotSection facts={viewModel.companySnapshot} />
            </TrackedSection>

            <TrackedSection
              sectionKey="workflows"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <WorkflowsSection
                workflows={viewModel.workflows}
                totals={viewModel.workflowTotals}
              />
            </TrackedSection>

            <TrackedSection
              sectionKey="uplift"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <ProfitUpliftSection
                levers={viewModel.levers}
                leverTotal={viewModel.leverTotal}
                odVsPu={viewModel.odVsPu}
                currency={viewModel.currency}
              />
            </TrackedSection>

            <TrackedSection
              sectionKey="outlook"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <OutlookSection outlook={viewModel.outlook} />
            </TrackedSection>

            <TrackedSection
              sectionKey="delay"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <CostOfDelaySection costOfDelay={viewModel.costOfDelay} />
            </TrackedSection>

            <TrackedSection
              sectionKey="resilience"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <ResilienceSection rows={viewModel.resilience} />
            </TrackedSection>

            <TrackedSection
              sectionKey="sources"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <SourcesSection sources={viewModel.sources} />
            </TrackedSection>

            <TrackedSection
              sectionKey="risks"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <RisksSection risks={viewModel.risks} />
            </TrackedSection>

            <TrackedSection
              sectionKey="roadmap"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <RoadmapSection
                phases={viewModel.roadmap}
                pilotRecommendation={viewModel.pilotRecommendation}
              />
            </TrackedSection>

            <TrackedSection
              sectionKey="next"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <NextStepsSection
                ctaParagraph={viewModel.ctaParagraph}
                recipientLine={viewModel.recipientLine}
              />
            </TrackedSection>

            <TrackedSection
              sectionKey="ending"
              highlightedSections={highlightedSections}
              registerSectionRef={registerSectionRef}
            >
              <EndingSection
                isAlpha={isAlpha}
                reportId={reportId}
                canManageShares={canManageShares}
                onDownload={onDownload}
                downloadStatus={downloadStatus}
                onAward={onAward}
                onCredibilityAnswer={onCredibilityAnswer}
              />
            </TrackedSection>
          </div>
        </div>
      </div>
    </ReportUIProvider>
  )
}
