function normalizeEvidenceItems(items = []) {
  const seen = new Set()

  return items
    .filter(Boolean)
    .map((item) => ({
      kind: item.kind ?? 'unknown',
      url: item.url ?? null,
      title: item.title ?? null,
      query: item.query ?? null,
      sourceType: item.sourceType ?? null,
      snippet: String(item.snippet ?? item.content ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000),
      facts: item.facts ?? {},
      confidence: item.confidence ?? null,
      usedInSections: Array.isArray(item.usedInSections)
        ? item.usedInSections
        : [],
      createdAt: item.createdAt ?? new Date().toISOString(),
    }))
    .filter((item) => item.snippet || item.url || item.title)
    .filter((item) => {
      const key = [
        item.kind,
        item.url,
        item.query,
        item.title,
        item.snippet.slice(0, 160),
      ].join('|')

      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export async function persistReportEvidence(
  adminSupabase,
  reportId,
  items = [],
) {
  const normalized = normalizeEvidenceItems(items)

  try {
    await adminSupabase
      .from('report_evidence')
      .delete()
      .eq('report_id', reportId)

    if (normalized.length === 0) return { ok: true, count: 0 }

    const rows = normalized.map((item) => ({
      report_id: reportId,
      url: item.url,
      title: item.title,
      source_type: item.sourceType,
      snippet: item.snippet,
      facts_json: {
        kind: item.kind,
        query: item.query,
        ...item.facts,
      },
      confidence: item.confidence,
      used_in_sections: item.usedInSections,
      created_at: item.createdAt,
    }))

    const { error } = await adminSupabase.from('report_evidence').insert(rows)

    if (error) {
      console.error('[report_evidence] insert failed:', error)
      return { ok: false, count: 0, error }
    }

    return { ok: true, count: rows.length }
  } catch (error) {
    console.error('[report_evidence] persistence failed:', error)
    return { ok: false, count: 0, error }
  }
}
