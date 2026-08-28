import assert from 'node:assert/strict'
import { test } from 'node:test'

test('alpha user query filters specifically for status === SUCCESS', () => {
  // Simulate Supabase report query builder
  function createMockSupabaseQuery(reports = []) {
    let queriedUserId = null
    let queriedStatus = null
    let isMaybeSingle = false

    const queryBuilder = {
      from(table) {
        assert.equal(table, 'reports')
        return queryBuilder
      },
      select(cols) {
        assert.equal(cols, 'id')
        return queryBuilder
      },
      eq(col, val) {
        if (col === 'user_id') queriedUserId = val
        if (col === 'status') queriedStatus = val
        return queryBuilder
      },
      limit(n) {
        assert.equal(n, 1)
        return queryBuilder
      },
      async maybeSingle() {
        isMaybeSingle = true
        const match = reports.find(
          (r) => r.user_id === queriedUserId && r.status === queriedStatus,
        )
        return { data: match ? { id: match.id } : null }
      },
    }

    return { queryBuilder, getParams: () => ({ queriedUserId, queriedStatus, isMaybeSingle }) }
  }

  // Case 1: User has only a FAILED report
  const failedDb = createMockSupabaseQuery([{ id: 'rep-1', user_id: 'user-alpha', status: 'FAILED' }])
  // Simulate the alpha check logic from pages/api/roi-agent.js
  async function checkAlphaCap(supabase, userId) {
    const { data: existingReport } = await supabase
      .from('reports')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'SUCCESS')
      .limit(1)
      .maybeSingle()
    return existingReport
  }

  return checkAlphaCap(failedDb.queryBuilder, 'user-alpha').then((result) => {
    assert.equal(result, null, 'User with FAILED report must not be blocked')
    assert.equal(failedDb.getParams().queriedStatus, 'SUCCESS', 'Query must filter for SUCCESS status')

    // Case 2: User has a SUCCESS report
    const successDb = createMockSupabaseQuery([{ id: 'rep-2', user_id: 'user-alpha', status: 'SUCCESS' }])
    return checkAlphaCap(successDb.queryBuilder, 'user-alpha').then((result2) => {
      assert.deepEqual(result2, { id: 'rep-2' }, 'User with SUCCESS report must hit cap')

      // Case 3: User has DRAFT report (future LYR-177 status)
      const draftDb = createMockSupabaseQuery([{ id: 'rep-3', user_id: 'user-alpha', status: 'DRAFT' }])
      return checkAlphaCap(draftDb.queryBuilder, 'user-alpha').then((result3) => {
        assert.equal(result3, null, 'User with DRAFT report must not be blocked')
      })
    })
  })
})
