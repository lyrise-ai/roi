export default function GeneratingView({ generationLog }) {
  return (
    <div className="text-center py-12 px-8">
      <div
        className="text-5xl mb-6 inline-block"
        style={{ animation: 'spin 1.2s linear infinite' }}
      >
        ⟳
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        Building your ROI report…
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Our AI is researching your company and modelling your automation
        potential. This takes about 45–90 seconds.
      </p>
      <div className="font-mono text-xs text-gray-600 bg-gray-50 rounded-lg p-4 h-32 overflow-y-auto text-left whitespace-pre-wrap border border-gray-100">
        {generationLog || 'Starting…'}
      </div>
    </div>
  )
}
