/**
 * Deep Research - built-in multi-phase research workflow.
 *
 * 6 phases: Plan → Search → Extract → Group → Crosscheck → Report
 *
 * Takes a research question, breaks it into search lines,
 * searches the web in parallel, extracts facts, deduplicates,
 * runs adversarial crosscheck (jury voting), and produces a cited report.
 *
 * Tunables: JURY_SIZE=3, REJECT_QUORUM=2, SOURCE_BUDGET=15, FACT_CAP=25
 *
 * This is a TypeScript adaptation of MiMo-Code's deep-research.js.
 * The actual workflow runtime integration requires the QuickJS sandbox;
 * this module provides the logic and metadata.
 */

// Tunables
const JURY_SIZE = 3
const REJECT_QUORUM = 2
const SOURCE_BUDGET = 15
const FACT_CAP = 25

export const DEEP_RESEARCH_META = {
  name: "deep-research",
  description: "Multi-phase research: Plan → Search → Extract → Group → Crosscheck → Report",
  whenToUse: "Deep, multi-source, fact-checked research report on any topic",
  phases: [
    { title: "Plan", detail: "Break question into 3-6 search lines" },
    { title: "Search", detail: "Fan-out web searches per line" },
    { title: "Extract", detail: "Read sources and extract facts" },
    { title: "Group", detail: "Deduplicate and group identical facts" },
    { title: "Crosscheck", detail: "Adversarial jury voting per fact" },
    { title: "Report", detail: "Synthesize upheld facts into cited report" },
  ],
}

/**
 * Generate the planning prompt for the research question.
 */
export function buildPlanPrompt(question: string): string {
  return `You are planning a research investigation.

Question: ${question}

Break this question into 3-6 independent search lines that together would answer it comprehensively.
Each search line should be a focused web query that targets a different aspect of the question.

Return a JSON object with:
- lines: array of search query strings
- rationale: brief explanation of why these lines cover the question`
}

/**
 * Generate a search prompt for a specific search line.
 */
export function buildSearchPrompt(line: string): string {
  return `Search the web for: "${line}"

Find the most relevant and authoritative sources. For each result, provide:
- url: the source URL
- title: the page title
- snippet: a brief description of the relevance

Focus on primary sources, official documentation, and reputable publications.`
}

/**
 * Generate a read/extract prompt for a specific source.
 */
export function buildExtractPrompt(url: string, context: string): string {
  return `Read the content at: ${url}

Context: This source was found while researching: "${context}"

Extract the key facts relevant to the research question. For each fact:
- fact: the factual statement
- confidence: high/medium/low
- evidence: direct quote or data point supporting the fact
- weight: 1-5 importance score`
}

/**
 * Generate a grouping prompt for deduplication.
 */
export function buildGroupPrompt(facts: Array<{ fact: string; source: string }>): string {
  const factList = facts.map((f, i) => `${i + 1}. [${f.source}] ${f.fact}`).join("\n")
  return `Group these facts by similarity. Merge duplicates and near-duplicates.

Facts:
${factList}

For each group:
- representative: the best-stated version of the fact
- sources: list of source URLs that support this fact
- merged_count: how many original facts were merged`
}

/**
 * Generate an adversarial crosscheck prompt for a juror.
 */
export function buildCrosscheckPrompt(fact: string, jurorIndex: number): string {
  return `You are juror #${jurorIndex + 1} in an adversarial fact-check.

Fact to evaluate: "${fact}"

Your job is to find reasons this fact might be WRONG, INCOMPLETE, or MISLEADING.
Be skeptical. Look for:
- Contradictions with known facts
- Missing context that changes the meaning
- Outdated information
- Logical fallacies
- Source reliability concerns

Return a JSON object:
- verdict: "uphold" if the fact survives scrutiny, "reject" if it fails
- confidence: 0.0 to 1.0
- reasoning: brief explanation of your verdict`
}

/**
 * Generate the final report prompt.
 */
export function buildReportPrompt(
  question: string,
  facts: Array<{ fact: string; sources: string[] }>,
): string {
  const factDigest = facts
    .map((f, i) => `${i + 1}. ${f.fact}\n   Sources: ${f.sources.join(", ")}`)
    .join("\n\n")

  return `Write a comprehensive research report answering this question:

Question: ${question}

Verified findings (${facts.length} facts cross-checked):
${factDigest}

Structure the report with:
1. Executive summary (2-3 sentences)
2. Key findings (bullet points with citations)
3. Detailed analysis (organized by theme)
4. Conclusion
5. Source list

Use inline citations [1], [2], etc. that reference the source list.`
}

/**
 * Workflow script template for the deep-research workflow.
 * This is the actual script that would be executed by the workflow runtime.
 */
export const DEEP_RESEARCH_SCRIPT = `
export const meta = {
  name: 'deep-research',
  description: 'Multi-phase research with adversarial fact-checking',
  phases: [
    { title: 'Plan' },
    { title: 'Search' },
    { title: 'Extract' },
    { title: 'Group' },
    { title: 'Crosscheck' },
    { title: 'Report' },
  ],
}

const JURY_SIZE = ${JURY_SIZE}
const REJECT_QUORUM = ${REJECT_QUORUM}
const SOURCE_BUDGET = ${SOURCE_BUDGET}
const FACT_CAP = ${FACT_CAP}

// Phase 1: Plan
phase('Plan')
const plan = await agent(
  'Break this research question into 3-6 search lines: ' + args,
  { schema: { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } } } } }
)
const lines = plan?.lines ?? [args]

// Phase 2: Search + Extract
phase('Search')
const searchResults = await parallel(
  lines.map(line => () => agent('Search the web for: ' + line))
)

// Phase 3: Extract
phase('Extract')
const allSources = searchResults.flat().filter(Boolean).slice(0, SOURCE_BUDGET)
const facts = await pipeline(
  allSources,
  (source) => agent('Extract key facts from: ' + (source?.url || source), {
    schema: { type: 'object', properties: { facts: { type: 'array' } } }
  })
)

const flatFacts = facts.filter(Boolean).flatMap(r => r?.facts ?? []).slice(0, FACT_CAP)

// Phase 4: Group
phase('Group')
const grouped = await agent(
  'Group and deduplicate these facts: ' + JSON.stringify(facts),
  { schema: { type: 'object', properties: { groups: { type: 'array' } } } }
)
const groups = grouped?.groups ?? flatFacts

// Phase 5: Crosscheck
phase('Crosscheck')
const verdicts = await parallel(
  groups.slice(0, FACT_CAP).flatMap(fact =>
    Array.from({ length: JURY_SIZE }, (_, i) =>
      () => agent('Juror ' + (i+1) + ': fact-check this: ' + JSON.stringify(fact), {
        schema: { type: 'object', properties: { verdict: { type: 'string' }, reasoning: { type: 'string' } } }
      })
    )
  )
)

// Phase 6: Report
phase('Report')
const report = await agent(
  'Write a research report for: ' + args + '\\n\\nVerified facts: ' + JSON.stringify(groups),
  { schema: { type: 'object', properties: { answer: { type: 'string' }, findings: { type: 'array' } } } }
)

return report
`
