// Tests for S1's decision-making half (LYR-187 R2 / LYR-195).
//
// These decisions send every other scout somewhere. Get the region wrong and S2
// searches US job boards for a firm in Riyadh. They are plain functions
// precisely so they can be tested against fixed inputs here, rather than
// against a live API.
//
//   Run:  node --test src/lib/roi/research/scouts/__tests__/s1Derive.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let d
let tmpDir

before(async () => {
  const cacheRoot = path.resolve(
    here,
    '../../../../../..',
    'node_modules/.cache',
  )
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 's1-derive-test-'))
  const outfile = path.join(tmpDir, 's1Derive.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../s1Derive.ts')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  d = await import(pathToFileURL(outfile).href)
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── normalizeDomain ──────────────────────────────────────────────────────────

test('normalizeDomain strips everything that is not the hostname', () => {
  for (const input of [
    'acmelaw.com',
    'ACMELAW.com',
    'www.acmelaw.com',
    'https://acmelaw.com',
    'https://www.acmelaw.com/about?utm_source=x#team',
    '  http://WWW.AcmeLaw.com/  ',
  ]) {
    assert.equal(d.normalizeDomain(input), 'acmelaw.com', `for ${input}`)
  }
})

test('normalizeDomain keeps a real subdomain', () => {
  assert.equal(d.normalizeDomain('careers.acmelaw.com'), 'careers.acmelaw.com')
  assert.equal(d.normalizeDomain('acmelaw.co.uk'), 'acmelaw.co.uk')
})

test('normalizeDomain rejects what is not a domain', () => {
  for (const bad of ['', '   ', 'acmelaw', 'not a domain', 'http://', '...']) {
    assert.equal(d.normalizeDomain(bad), null, `expected null for "${bad}"`)
  }
})

// ── countryFromDomain ────────────────────────────────────────────────────────

test('countryFromDomain reads a ccTLD', () => {
  assert.equal(d.countryFromDomain('altamimi.ae'), 'AE')
  assert.equal(d.countryFromDomain('firm.sa'), 'SA')
  assert.equal(d.countryFromDomain('firm.qa'), 'QA')
  assert.equal(d.countryFromDomain('gowlingwlg.uk'), 'GB')
  assert.equal(d.countryFromDomain('kanzlei.de'), 'DE')
})

test('countryFromDomain reads a second-level ccTLD', () => {
  assert.equal(d.countryFromDomain('acmelaw.co.uk'), 'GB')
  assert.equal(d.countryFromDomain('firm.com.sa'), 'SA')
})

test('a generic TLD yields null rather than defaulting to the US', () => {
  /* The case that matters most. Most Gulf firms use .com, so treating .com as
     American would misroute exactly the group the coverage test focuses on. */
  for (const domain of [
    'altamimi.com',
    'acmelaw.org',
    'firm.io',
    'firm.legal',
    'firm.consulting',
  ]) {
    assert.equal(d.countryFromDomain(domain), null, `for ${domain}`)
  }
})

// ── regionForCountry ─────────────────────────────────────────────────────────

test('regionForCountry maps the segments the scouts route on', () => {
  assert.equal(d.regionForCountry('US'), 'US')
  assert.equal(d.regionForCountry('GB'), 'UK')
  assert.equal(d.regionForCountry('UK'), 'UK')
  for (const gcc of ['AE', 'SA', 'QA', 'KW', 'BH', 'OM']) {
    assert.equal(d.regionForCountry(gcc), 'GCC', `for ${gcc}`)
  }
  for (const eu of ['DE', 'FR', 'NL', 'IE', 'ES']) {
    assert.equal(d.regionForCountry(eu), 'EU', `for ${eu}`)
  }
})

test('regionForCountry is case-insensitive and whitespace-tolerant', () => {
  assert.equal(d.regionForCountry('ae'), 'GCC')
  assert.equal(d.regionForCountry(' gb '), 'UK')
})

test('an unknown or missing country is OTHER, not a guess', () => {
  assert.equal(d.regionForCountry(null), 'OTHER')
  assert.equal(d.regionForCountry(''), 'OTHER')
  assert.equal(d.regionForCountry('JP'), 'OTHER')
  assert.equal(d.regionForCountry('ZZ'), 'OTHER')
})

// ── size bands ───────────────────────────────────────────────────────────────

test('sizeBandForHeadcount buckets on the provider vocabulary', () => {
  assert.equal(d.sizeBandForHeadcount(1), '1-10')
  assert.equal(d.sizeBandForHeadcount(10), '1-10')
  assert.equal(d.sizeBandForHeadcount(11), '11-50')
  assert.equal(d.sizeBandForHeadcount(30), '11-50')
  assert.equal(d.sizeBandForHeadcount(50), '11-50')
  assert.equal(d.sizeBandForHeadcount(51), '51-200')
  assert.equal(d.sizeBandForHeadcount(200), '51-200')
  assert.equal(d.sizeBandForHeadcount(201), '201-500')
  assert.equal(d.sizeBandForHeadcount(5000), '1001-5000')
  assert.equal(d.sizeBandForHeadcount(10001), '10001+')
  assert.equal(d.sizeBandForHeadcount(250000), '10001+')
})

test('sizeBandForHeadcount refuses nonsense rather than bucketing it', () => {
  for (const bad of [0, -5, NaN, Infinity, null, undefined, '30']) {
    assert.equal(d.sizeBandForHeadcount(bad), null, `for ${bad}`)
  }
})

test('normalizeSizeBand accepts the spellings providers actually send', () => {
  assert.equal(d.normalizeSizeBand('11-50'), '11-50')
  assert.equal(d.normalizeSizeBand('11 - 50'), '11-50')
  assert.equal(d.normalizeSizeBand('11 to 50'), '11-50')
  assert.equal(d.normalizeSizeBand('  51-200  '), '51-200')
  assert.equal(d.normalizeSizeBand('10001+'), '10001+')
})

test('normalizeSizeBand drops a band it does not recognise', () => {
  /* Coercing "about 40 people" to the nearest band would be inventing
     precision the source never carried. */
  for (const bad of ['about 40 people', '', 'large', '12-37', null]) {
    assert.equal(d.normalizeSizeBand(bad), null, `for ${bad}`)
  }
})

// ── verticalFromText ─────────────────────────────────────────────────────────

test('verticalFromText matches on what the page says', () => {
  assert.equal(
    d.verticalFromText('Our practice areas include commercial litigation.'),
    'legal',
  )
  assert.equal(
    d.verticalFromText(
      'Chartered accountants providing audit and tax advisory',
    ),
    'accounting',
  )
  assert.equal(
    d.verticalFromText('A management consulting firm for mid-market clients'),
    'consulting',
  )
  assert.equal(
    d.verticalFromText('An AI-first job portal and hiring platform'),
    'recruitment',
  )
})

test('verticalFromText is case-insensitive', () => {
  assert.equal(d.verticalFromText('PRACTICE AREAS'), 'legal')
})

test('verticalFromText returns null when the text does not say', () => {
  /* Null goes to the interview. A guess goes onto the reveal screen with a
     source link that does not support it. */
  for (const text of [
    '',
    '   ',
    'We help businesses grow.',
    'Welcome to our site',
  ]) {
    assert.equal(d.verticalFromText(text), null, `for "${text}"`)
  }
})

test('a law firm that also advises is legal, not consulting', () => {
  assert.equal(
    d.verticalFromText(
      'Our practice areas span corporate law; we also offer business advisory.',
    ),
    'legal',
  )
})

// ── countryFromText ──────────────────────────────────────────────────────────

test('countryFromText reads a country out of a footer address', () => {
  assert.equal(
    d.countryFromText('Level 12, Al Fattan Tower, Dubai, United Arab Emirates'),
    'AE',
  )
  assert.equal(d.countryFromText('Registered in England and Wales'), 'GB')
  assert.equal(d.countryFromText('Kingdom of Saudi Arabia'), 'SA')
})

test('countryFromText falls back to an unambiguous city', () => {
  assert.equal(d.countryFromText('Office: Riyadh | Jeddah'), 'SA')
  assert.equal(d.countryFromText('Our Doha office'), 'QA')
  assert.equal(d.countryFromText('1 King Street, London EC2'), 'GB')
})

test('countryFromText matches on word boundaries, not substrings', () => {
  /* "uae" inside "nuance" and "ksa" inside a hashed asset name are the two
     that actually bite on real pages. */
  assert.equal(d.countryFromText('a nuanced approach to advisory work'), null)
  assert.equal(d.countryFromText('/assets/ksa8f2b1.js'), null)
})

test('countryFromText returns null when there is no address', () => {
  assert.equal(d.countryFromText('We are a modern firm.'), null)
  assert.equal(d.countryFromText(''), null)
})

// ── htmlToText ───────────────────────────────────────────────────────────────

test('htmlToText drops script and style bodies before matching', () => {
  /* A bundled JS blob is full of words that mean nothing about the business;
     left in, it produces false vertical hits. */
  const html = `
    <html><head><style>.litigation { color: red }</style>
    <script>const practiceAreas = ["audit"]</script></head>
    <body><h1>Acme &amp; Co</h1><p>Chartered accountants</p></body></html>`

  const text = d.htmlToText(html)

  assert.ok(text.includes('Acme & Co'))
  assert.ok(text.includes('Chartered accountants'))
  assert.ok(!text.includes('color: red'))
  assert.ok(!text.includes('practiceAreas'))
  assert.equal(d.verticalFromText(text), 'accounting')
})

test('htmlToText collapses whitespace and survives junk input', () => {
  assert.equal(d.htmlToText('<p>a</p>\n\n  <p>b</p>'), 'a b')
  assert.equal(d.htmlToText(''), '')
  assert.equal(d.htmlToText(null), '')
})

// ── ambiguity: the rule that stopped two live misreads ───────────────────────

test('a footer naming several countries resolves to null, not the first match', () => {
  /* Regression for two real failures: morganlewis.com (Philadelphia) resolved
     to AE and hlbhamt.com (Dubai) resolved to IN, both because a global office
     list was scanned first-match-wins. A wrong country misroutes every scout;
     null just routes to 'OTHER' at low confidence. */
  const officeList =
    'Our offices: London, New York, Dubai, Singapore, Frankfurt and Riyadh.'

  assert.equal(d.countryFromText(officeList), null)
  assert.ok(d.countryCandidates(officeList).length > 1)
})

test('one country named many ways is still one country', () => {
  assert.equal(
    d.countryFromText('Dubai, United Arab Emirates — our Abu Dhabi office'),
    'AE',
  )
  assert.equal(d.countryFromText('Registered in England and Wales'), 'GB')
})

test('countryCandidates reports the distinct set', () => {
  assert.deepEqual(d.countryCandidates('Doha and Manama').sort(), ['BH', 'QA'])
  assert.deepEqual(d.countryCandidates('nothing here'), [])
})

// ── structured data ──────────────────────────────────────────────────────────

test('countryFromStructuredData reads schema.org addressCountry', () => {
  const jsonLd = `<script type="application/ld+json">
    {"@type":"Organization","address":{"@type":"PostalAddress","addressCountry":"AE"}}
    </script>`
  assert.equal(d.countryFromStructuredData(jsonLd), 'AE')

  const microdata = `<span itemprop="addressCountry" content="GB">UK</span>`
  assert.equal(
    d.countryFromStructuredData(
      microdata.replace('content=', 'addressCountry='),
    ),
    'GB',
  )
})

test('countryFromStructuredData accepts a full country name', () => {
  assert.equal(
    d.countryFromStructuredData('"addressCountry": "United Arab Emirates"'),
    'AE',
  )
})

test('several marked-up offices are ambiguous, so null', () => {
  const both = `"addressCountry":"AE" ... "addressCountry":"US"`
  assert.equal(d.countryFromStructuredData(both), null)
})

test('countryFromStructuredData survives markup with no address', () => {
  assert.equal(
    d.countryFromStructuredData('<html><body>hi</body></html>'),
    null,
  )
  assert.equal(d.countryFromStructuredData(''), null)
  assert.equal(d.countryFromStructuredData(null), null)
})

// ── registration statements ──────────────────────────────────────────────────

test('countryFromRegistration reads the country of incorporation', () => {
  assert.equal(
    d.countryFromRegistration('Acme LLP is registered in England and Wales.'),
    'GB',
  )
  assert.equal(
    d.countryFromRegistration('Registered office is in Dubai, licence 12345'),
    'AE',
  )
})

test('countryFromRegistration returns null when there is no such statement', () => {
  assert.equal(d.countryFromRegistration('We are a modern firm.'), null)
  assert.equal(d.countryFromRegistration(''), null)
})

test('normalizeDomain stays linear on a hostile string', () => {
  /* `domainInput` is whatever the prospect typed, so this is a trust boundary.
     The natural regex for a hostname — a quantified group of quantified groups
     — backtracks catastrophically here; label-by-label validation does not. */
  const hostile = `${'a-'.repeat(40_000)}!`

  const startedAt = process.hrtime.bigint()
  assert.equal(d.normalizeDomain(hostile), null)
  const ms = Number(process.hrtime.bigint() - startedAt) / 1e6

  assert.ok(ms < 250, `took ${ms.toFixed(1)}ms — validation is backtracking`)
})

test('normalizeDomain rejects over-long names and labels', () => {
  assert.equal(d.normalizeDomain(`${'a'.repeat(64)}.com`), null)
  assert.equal(
    d.normalizeDomain(`${'a'.repeat(250)}.${'b'.repeat(60)}.com`),
    null,
  )
  assert.equal(d.normalizeDomain('-acme.com'), null)
  assert.equal(d.normalizeDomain('acme-.com'), null)
  assert.equal(d.normalizeDomain('acme..com'), null)
})

// ── LYR-221: the company's own name, and the domain it says is really its ────
//
// Every fixture below is the real markup served by that firm on 2026-08-23,
// trimmed to the tags under test.

test('og:site_name is preferred — it is authored for exactly this', () => {
  const html = `<head><meta property="og:site_name" content="Kingsley Napley" />
    <title>Kingsley Napley | Lawyers, Solicitors London</title></head>`
  assert.equal(
    d.companyNameFromHtml(html, 'kingsleynapley.com'),
    'Kingsley Napley',
  )
})

test('a title with a tagline yields the name, not the tagline', () => {
  /* Observed: the name is not reliably the first segment. */
  assert.equal(
    d.companyNameFromHtml(
      '<title>International Law Firm | Gowling WLG | Gowling WLG</title>',
      'gowlingwlg.com',
    ),
    'Gowling WLG',
  )
  assert.equal(
    d.companyNameFromHtml(
      '<title>Accountancy and Business Advice - BDO</title>',
      'bdo.co.uk',
    ),
    'BDO',
  )
})

test('a name that does not match the domain is refused', () => {
  /* The whole point: a wrong name searches for a different company and
     attaches their vacancies to this prospect. */
  assert.equal(
    d.companyNameFromHtml(
      '<title>Simpson Thacher &amp; Bartlett LLP</title>',
      'stalawfirm.com',
    ),
    null,
  )
  /* A Cloudflare interstitial and a CMS default are not names. */
  assert.equal(
    d.companyNameFromHtml('<title>Just a moment...</title>', 'farrer.co.uk'),
    null,
  )
  assert.equal(
    d.companyNameFromHtml('<title>403 Forbidden</title>', 'rsmus.com'),
    null,
  )
  assert.equal(d.companyNameFromHtml('', 'acmelaw.com'), null)
})

test('corporate form is trimmed so the phrase match is not narrowed', () => {
  assert.equal(
    d.companyNameFromHtml('<title>Farrer &amp; Co LLP</title>', 'farrer.co.uk'),
    'Farrer & Co',
  )
})

test('a declared canonical on another TLD is an alias', () => {
  const html = `<link rel="canonical" href="https://www.kingsleynapley.co.uk/" />`
  assert.equal(
    d.canonicalDomainFromHtml(html, 'kingsleynapley.com'),
    'kingsleynapley.co.uk',
  )
})

test('a canonical pointing at a different brand is not an alias', () => {
  /* This is the guard that keeps the alias from becoming the brand-token match
     the search module exists to reject. */
  assert.equal(
    d.canonicalDomainFromHtml(
      '<link rel="canonical" href="https://www.some-cms-host.com/" />',
      'kingsleynapley.com',
    ),
    null,
  )
})

test('no canonical means no alias — bakertilly.ca stays a stranger', () => {
  assert.equal(
    d.canonicalDomainFromHtml('<title>Baker Tilly</title>', 'bakertilly.com'),
    null,
  )
  assert.equal(d.canonicalDomainFromHtml('', 'bakertilly.com'), null)
})

test('a canonical that just restates the domain is not an alias', () => {
  assert.equal(
    d.canonicalDomainFromHtml(
      '<link rel="canonical" href="https://www.bdo.co.uk/en-gb/home" />',
      'bdo.co.uk',
    ),
    null,
  )
})
