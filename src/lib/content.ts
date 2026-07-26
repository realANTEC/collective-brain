/* ==========================================================================
   CONTENT
   --------------------------------------------------------------------------
   Every string, number and record the site renders lives here.

   All figures, citations, contributors and answer bodies below are
   ILLUSTRATIVE PRODUCT DEMONSTRATION DATA for a concept product. Journal
   names, author names and statistics are invented for the demo; nothing here
   describes a real study, a real person, or a real measured result.
   ========================================================================== */

export const SITE = {
  name: 'Collective Brain',
  tagline: 'The AI that never forgets what humanity learns.',
  description:
    "Every conversation becomes part of humanity's evolving intelligence.",
} as const;

/* -- Navigation ---------------------------------------------------------- */

export const NAV_LINKS = [
  { label: 'The Core', href: '#core' },
  { label: 'Memory', href: '#memory' },
  { label: 'Validation', href: '#validation' },
  { label: 'Pricing', href: '#pricing' },
] as const;

/* -- Section register ----------------------------------------------------
   The index numbers are rendered in the UI as instrument labels, and the ids
   are the scroll anchors. Keep this array in sync with the camera keyframes in
   components/three/choreography.ts - they are index-matched.

   Note there is one MORE keyframe than there are entries here: the footer
   registers itself as anchor 9 so the core can withdraw behind it. It is not a
   numbered section, so it does not belong in this list. */

export const SECTIONS = [
  { id: 'hero', index: '01', label: 'Origin' },
  { id: 'core', index: '02', label: 'The Knowledge Core' },
  { id: 'connections', index: '03', label: 'Connections' },
  { id: 'convergence', index: '04', label: 'Convergence' },
  { id: 'graph', index: '05', label: 'Expansion' },
  { id: 'memory', index: '06', label: 'Memory' },
  { id: 'validation', index: '07', label: 'Validation' },
  { id: 'pricing', index: '08', label: 'Access' },
  { id: 'cta', index: '09', label: 'Begin' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/* -- Hero ---------------------------------------------------------------- */

export const HERO = {
  /** Split for line-by-line reveal. The serif word is called out separately. */
  headline: [
    { text: 'The AI That', accent: null },
    { text: 'Learns', accent: 'Forever.' },
  ],
  subhead:
    "Every conversation becomes part of humanity's evolving intelligence.",
  body: 'Most models reset when you close the tab. Collective Brain does the opposite - each answer is refined by the corrections, evidence and expert review that came before it.',
  searchPlaceholders: [
    'What is quantum computing?',
    'What is the best protein?',
    'Why did Rome fall?',
    'How does CRISPR actually edit DNA?',
    'Is intermittent fasting supported by evidence?',
    'What causes the placebo effect?',
  ],
  primaryCta: { label: 'Enter the Core', href: '#core' },
  secondaryCta: { label: 'See how memory works', href: '#memory' },
} as const;

/* -- Live telemetry ------------------------------------------------------
   Rendered as a slowly drifting readout. Values are seeds, not truths. */

export const TELEMETRY = [
  { key: 'nodes', label: 'Knowledge nodes', value: 8_420_119, drift: 40 },
  { key: 'links', label: 'Verified links', value: 61_204_883, drift: 260 },
  { key: 'corrections', label: 'Corrections merged today', value: 12_804, drift: 6 },
  { key: 'validators', label: 'Active validators', value: 4_217, drift: 3 },
] as const;

/* -- Section 02: The Core ------------------------------------------------ */

export const CORE_SECTION = {
  eyebrow: 'The Knowledge Core',
  headline: 'One memory,',
  headlineAccent: 'shared.',
  body: 'Not a database of documents. A live structure of claims, each one anchored to the evidence that supports it and the corrections that have refined it.',
  hint: 'Drag to rotate. Shift + scroll to zoom.',
  facets: [
    {
      index: '01',
      title: 'Claims, not documents',
      body: 'The atomic unit is a single testable statement - so evidence can attach to exactly the thing it supports.',
    },
    {
      index: '02',
      title: 'Every edge is sourced',
      body: 'Connections between claims carry their own provenance. Nothing links to anything without a reason on the record.',
    },
    {
      index: '03',
      title: 'Contradiction is first-class',
      body: 'When two well-supported claims disagree, the graph holds both and surfaces the tension rather than picking a winner.',
    },
  ],
} as const;

/* -- Section 03: Connections --------------------------------------------- */

export const CONNECTIONS_SECTION = {
  eyebrow: 'Connections',
  headline: 'Knowledge is not a list.',
  headlineAccent: "It's a shape.",
  body: 'A question about protein synthesis touches metabolism, which touches sleep, which touches the reliability of the studies that measured it. Collective Brain traverses those edges instead of pretending they are separate topics.',
  stats: [
    { value: 7.2, suffix: 'x', label: 'more supporting context per answer', decimals: 1 },
    { value: 340, suffix: 'ms', label: 'median graph traversal', decimals: 0 },
    { value: 96.4, suffix: '%', label: 'of claims trace to a primary source', decimals: 1 },
  ],
} as const;

/* -- Section 04: Convergence --------------------------------------------- */

export const CONVERGENCE_SECTION = {
  eyebrow: 'Convergence',
  headline: 'Ten thousand conversations,',
  headlineAccent: 'one conclusion.',
  body: 'Separate people asking adjacent questions produce evidence that belongs together. The Core merges those threads continuously - so the ten-thousandth person to ask gets the sharpened answer, not the first draft.',
  /** Conversation fragments that visually merge into a single refined answer. */
  threads: [
    {
      id: 't1',
      author: 'Materials researcher',
      region: 'Zurich',
      question: 'Does the coherence time figure account for gate error?',
      contribution: 'Flagged an ambiguity in how coherence was reported.',
    },
    {
      id: 't2',
      author: 'Graduate student',
      region: 'Bengaluru',
      question: 'Why do two sources give different qubit counts?',
      contribution: 'Surfaced a conflict between two vendor claims.',
    },
    {
      id: 't3',
      author: 'Science journalist',
      region: 'São Paulo',
      question: 'Is "quantum advantage" the same as "supremacy"?',
      contribution: 'Prompted a terminology split in the answer.',
    },
    {
      id: 't4',
      author: 'Verified physicist',
      region: 'Toronto',
      question: 'The error-correction threshold here is out of date.',
      contribution: 'Submitted a correction. Merged after 3 reviews.',
    },
    {
      id: 't5',
      author: 'Curious reader',
      region: 'Lagos',
      question: 'Can you explain this without the maths?',
      contribution: 'Triggered a plain-language layer on the answer.',
    },
  ],
  merged: {
    label: 'Merged answer, revision 41',
    text: 'Quantum advantage describes a specific measured task where a quantum processor outperforms the best known classical method - a narrower and more defensible claim than the older term it replaced.',
    confidence: 94,
  },
} as const;

/* -- Section 05: Graph expansion ----------------------------------------- */

export const GRAPH_SECTION = {
  eyebrow: 'Expansion',
  headline: 'It grows every time',
  headlineAccent: 'someone asks.',
  body: 'A question is not a read operation. Each one adds a traversal path, an ambiguity signal, and - when the answer is wrong - a correction that propagates to everyone who asked before you.',
  events: [
    { t: '0.0s', label: 'Query received', detail: 'Parsed into 4 candidate claims' },
    { t: '0.1s', label: 'Graph traversal', detail: '2,841 nodes visited across 6 domains' },
    { t: '0.3s', label: 'Evidence weighted', detail: '17 sources ranked by replication strength' },
    { t: '0.6s', label: 'Conflicts surfaced', detail: '2 well-supported claims disagree' },
    { t: '0.9s', label: 'Answer composed', detail: 'Confidence 91% - dissent preserved' },
    { t: '1.2s', label: 'Path written back', detail: 'New edge strengthens 3 adjacent claims' },
  ],
} as const;

/* -- Section 06: How memory works ---------------------------------------- */

export const MEMORY_SECTION = {
  eyebrow: 'Memory',
  headline: 'How a correction',
  headlineAccent: 'travels.',
  body: 'A single verified fix does not patch one answer. It propagates along every edge that depended on the claim it corrected.',
  pipeline: [
    {
      index: '01',
      title: 'Signal',
      body: 'A reader disputes a claim, or a new paper contradicts it. Both enter the same queue.',
    },
    {
      index: '02',
      title: 'Evidence',
      body: 'The challenge must carry a source. Assertions without evidence never reach review.',
    },
    {
      index: '03',
      title: 'Review',
      body: 'Domain validators assess it independently. Their weight comes from a track record, not a title.',
    },
    {
      index: '04',
      title: 'Merge',
      body: 'On consensus the claim is versioned - the old value is retained, never deleted.',
    },
    {
      index: '05',
      title: 'Propagation',
      body: 'Every downstream claim that leaned on the old value is re-scored and, if needed, re-composed.',
    },
    {
      index: '06',
      title: 'Notice',
      body: 'Anyone who received the superseded answer is told what changed and why.',
    },
  ],
} as const;

/* -- Features ------------------------------------------------------------ */

export const FEATURES = [
  {
    id: 'timeline',
    index: '01',
    name: 'Knowledge Timeline',
    blurb: 'Watch a claim change its mind.',
    body: 'Every answer carries its own history. See what was believed in 2019, what evidence moved it, and how confident the Core was at each step.',
  },
  {
    id: 'citations',
    index: '02',
    name: 'Living Citations',
    blurb: 'Sources that stay awake.',
    body: 'A citation is a live edge, not a footnote. When a cited paper is retracted or replicated, every answer that leaned on it updates its confidence.',
  },
  {
    id: 'corrections',
    index: '03',
    name: 'Community Corrections',
    blurb: 'Being wrong is a feature.',
    body: 'Anyone can challenge a claim with evidence. Verified corrections are merged, attributed, and propagated across the entire graph.',
  },
  {
    id: 'dna',
    index: '04',
    name: 'Knowledge DNA',
    blurb: 'See where an answer came from.',
    body: 'A visual lineage of every claim that contributed - which sources, which corrections, which conversations, and how much each one weighed.',
  },
  {
    id: 'heatmap',
    index: '05',
    name: 'Memory Heatmap',
    blurb: 'Which ideas move the others.',
    body: 'Some claims are load-bearing. The heatmap shows which nodes, if they changed, would ripple furthest through the graph.',
  },
  {
    id: 'reasoning',
    index: '06',
    name: 'AI Reasoning Map',
    blurb: 'The path, not just the destination.',
    body: 'An animated trace of the concepts the Core traversed to reach its answer - inspectable, and challengeable at any step.',
  },
] as const;

/* -- Section 07: Validation ---------------------------------------------- */

export const VALIDATION_SECTION = {
  eyebrow: 'Validation',
  headline: 'Truth needs',
  headlineAccent: 'a quorum.',
  body: 'No single reviewer can promote a claim. Weight accrues to contributors whose past corrections survived scrutiny - and decays when they do not.',
  ledger: [
    {
      id: 'c1',
      claim: 'Error-correction threshold for surface codes',
      status: 'merged',
      reviews: 5,
      agree: 5,
      delta: '+6 confidence',
      note: 'Threshold figure updated to reflect a newer estimate.',
    },
    {
      id: 'c2',
      claim: 'Protein requirement for resistance-trained adults',
      status: 'merged',
      reviews: 7,
      agree: 6,
      delta: '+11 confidence',
      note: 'Range widened; earlier figure came from a single small cohort.',
    },
    {
      id: 'c3',
      claim: 'Primary cause of the Western Roman collapse',
      status: 'contested',
      reviews: 9,
      agree: 4,
      delta: 'held',
      note: 'Two competing accounts both survive review. Both are shown.',
    },
    {
      id: 'c4',
      claim: 'Ocean heat uptake rate, 2005 to present',
      status: 'merged',
      reviews: 6,
      agree: 6,
      delta: '+4 confidence',
      note: 'Superseded by a longer observation window.',
    },
    {
      id: 'c5',
      claim: 'Efficacy claim for a popular sleep supplement',
      status: 'rejected',
      reviews: 8,
      agree: 1,
      delta: '-19 confidence',
      note: 'Submitted evidence did not survive replication check.',
    },
  ],
  principles: [
    {
      title: 'Evidence or silence',
      body: 'A challenge without a source is not a challenge. It never enters the queue.',
    },
    {
      title: 'Weight is earned',
      body: 'Reviewer influence tracks the survival rate of their past corrections, per domain.',
    },
    {
      title: 'Dissent is preserved',
      body: 'Rejected positions stay visible with their reasoning. The graph records the argument, not just the verdict.',
    },
    {
      title: 'Nothing is deleted',
      body: 'Superseded claims are versioned. You can always read what the Core used to believe.',
    },
  ],
} as const;

/* -- Live activity feed ---------------------------------------------------
   Cycled in the UI to simulate a system in continuous use. */

export const ACTIVITY = [
  { actor: 'Validator', region: 'Kyoto', action: 'merged a correction to', target: 'Photosynthetic efficiency limits' },
  { actor: 'Reader', region: 'Dublin', action: 'challenged', target: 'Optimal sleep duration range' },
  { actor: 'Validator', region: 'Nairobi', action: 'confirmed replication for', target: 'Malaria vector resistance data' },
  { actor: 'Reader', region: 'Vancouver', action: 'requested a plain-language layer on', target: 'Bayesian inference' },
  { actor: 'Validator', region: 'Lisbon', action: 'flagged a retraction affecting', target: 'Gut microbiome and mood' },
  { actor: 'Reader', region: 'Seoul', action: 'surfaced a conflict in', target: 'Battery energy density claims' },
  { actor: 'Validator', region: 'Santiago', action: 'raised confidence on', target: 'Antarctic ice shelf thinning' },
  { actor: 'Reader', region: 'Warsaw', action: 'traced the lineage of', target: 'The Antonine Plague death toll' },
  { actor: 'Validator', region: 'Boston', action: 'split a claim into two on', target: 'Quantum advantage terminology' },
  { actor: 'Reader', region: 'Cairo', action: 'asked for dissenting views on', target: 'Dietary saturated fat' },
] as const;

/* -- Pricing ------------------------------------------------------------- */

export const PRICING = {
  eyebrow: 'Access',
  headline: 'Everyone reads.',
  headlineAccent: 'Everyone contributes.',
  body: 'The graph is only as good as the number of people checking it. Reading is free, permanently, and every plan writes back to the same Core.',
  note: 'Prices shown in USD. Annual billing saves two months.',
  tiers: [
    {
      id: 'open',
      name: 'Open',
      price: 0,
      cadence: 'forever',
      summary: 'Full read access to the Core and every citation behind it.',
      features: [
        'Unlimited questions',
        'Full source lineage on every answer',
        'Knowledge Timeline and conflicting viewpoints',
        'Submit corrections for review',
      ],
      cta: 'Start reading',
      featured: false,
    },
    {
      id: 'contributor',
      name: 'Contributor',
      price: 24,
      cadence: 'per month',
      summary: 'For people who work with the graph daily and write back to it.',
      features: [
        'Everything in Open',
        'Knowledge DNA and Memory Heatmap',
        'AI Reasoning Map with step-level challenge',
        'Private workspaces with shared memory',
        'Correction queue priority',
        'API access, 100k traversals per month',
      ],
      cta: 'Become a contributor',
      featured: true,
      badge: 'Most chosen',
    },
    {
      id: 'institution',
      name: 'Institution',
      price: null,
      cadence: 'custom',
      summary: 'For labs, newsrooms and universities that need provenance guarantees.',
      features: [
        'Everything in Contributor',
        'Verified validator seats',
        'Domain-scoped private subgraphs',
        'Retraction and replication webhooks',
        'Audit export of every claim version',
        'Dedicated review liaison',
      ],
      cta: 'Talk to us',
      featured: false,
    },
  ],
} as const;

/* -- Section 09: CTA ----------------------------------------------------- */

export const CTA_SECTION = {
  eyebrow: 'Begin',
  headline: 'Ask something',
  headlineAccent: 'worth keeping.',
  body: 'Your first question joins eight million others. The answer you get back is the one all of them made possible.',
  primary: { label: 'Enter the Core', href: '/answer' },
  secondary: { label: 'Read the method', href: '#memory' },
} as const;

/* -- Footer -------------------------------------------------------------- */

export const FOOTER = {
  columns: [
    {
      title: 'Product',
      links: [
        { label: 'The Core', href: '#core' },
        { label: 'Memory', href: '#memory' },
        { label: 'Validation', href: '#validation' },
        { label: 'Pricing', href: '#pricing' },
      ],
    },
    {
      title: 'Method',
      links: [
        { label: 'Sample answer', href: '/answer' },
        { label: 'Correction policy', href: '/answer#community' },
        { label: 'Conflicting viewpoints', href: '/answer#conflict' },
        { label: 'Versioning', href: '/answer#timeline' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '#' },
        { label: 'Careers', href: '#' },
        { label: 'Press', href: '#' },
        { label: 'Contact', href: '#' },
      ],
    },
  ],
  legal: 'A concept product. All figures, citations and contributors shown are illustrative.',
} as const;

/* ==========================================================================
   ANSWER PAGE
   ========================================================================== */

export const ANSWER = {
  query: 'What is quantum computing?',
  revision: 41,
  confidence: 94,
  lastRefined: '4 hours ago',
  contributors: 1_284,

  summary:
    'Quantum computing uses systems that hold superpositions of states to run algorithms that are structurally unavailable to classical machines. For a narrow set of problems - factoring, simulating quantum chemistry, some optimisation - this yields a provable asymptotic advantage. For most everyday computing it yields none at all.',

  plainLanguage:
    'A normal computer answers questions by trying possibilities in sequence. A quantum computer can hold many possibilities at once and use interference to cancel out the wrong ones. That helps enormously with a few specific problems and does nothing for most others.',

  /** The stacked layers of the answer, rendered as a scrolling reveal. */
  layers: [
    { id: 'summary', index: '01', label: 'Summary' },
    { id: 'evidence', index: '02', label: 'Evidence' },
    { id: 'sources', index: '03', label: 'Sources' },
    { id: 'reasoning', index: '04', label: 'Reasoning map' },
    { id: 'community', index: '05', label: 'Community' },
    { id: 'timeline', index: '06', label: 'Historical evolution' },
    { id: 'conflict', index: '07', label: 'Conflicting viewpoints' },
    { id: 'related', index: '08', label: 'Related discoveries' },
  ],

  evidence: [
    {
      claim: 'Superposition and interference are the mechanism, not parallelism.',
      strength: 97,
      basis: 'Consistent across every standard formulation of the theory.',
      support: 41,
      dispute: 0,
    },
    {
      claim: 'Advantage is proven only for specific problem classes.',
      strength: 95,
      basis: 'Complexity-theoretic results, independently reproduced.',
      support: 33,
      dispute: 1,
    },
    {
      claim: 'Error correction, not qubit count, is the binding constraint.',
      strength: 88,
      basis: 'Consensus across current experimental groups.',
      support: 27,
      dispute: 4,
    },
    {
      claim: 'Commercially useful fault tolerance remains unachieved.',
      strength: 82,
      basis: 'Holds as of the most recent review window.',
      support: 22,
      dispute: 7,
    },
  ],

  sources: [
    {
      title: 'Threshold theorems for fault-tolerant computation',
      kind: 'Foundational result',
      year: 1997,
      weight: 96,
      status: 'replicated',
      note: 'Establishes that arbitrary-length computation is possible below an error threshold.',
    },
    {
      title: 'Polynomial-time factoring on a quantum machine',
      kind: 'Foundational result',
      year: 1994,
      weight: 98,
      status: 'replicated',
      note: 'The result that made the field consequential rather than curious.',
    },
    {
      title: 'Surface-code overhead under realistic noise',
      kind: 'Preprint',
      year: 2023,
      weight: 74,
      status: 'under review',
      note: 'Overhead estimates vary by an order of magnitude between groups.',
    },
    {
      title: 'Benchmark protocol for cross-platform comparison',
      kind: 'Method',
      year: 2024,
      weight: 81,
      status: 'replicated',
      note: 'Adopted after vendor-reported figures proved incomparable.',
    },
    {
      title: 'Claimed advantage on a sampling task',
      kind: 'Experiment',
      year: 2019,
      weight: 58,
      status: 'contested',
      note: 'Classical simulation later narrowed the reported gap substantially.',
    },
  ],

  /** Nodes for the animated reasoning chain. Positions are 0-100 percentages. */
  reasoning: {
    nodes: [
      { id: 'q', label: 'Query', x: 6, y: 50, kind: 'root' },
      { id: 'sup', label: 'Superposition', x: 26, y: 22, kind: 'concept' },
      { id: 'int', label: 'Interference', x: 26, y: 50, kind: 'concept' },
      { id: 'ent', label: 'Entanglement', x: 26, y: 78, kind: 'concept' },
      { id: 'alg', label: 'Algorithm classes', x: 50, y: 34, kind: 'concept' },
      { id: 'noise', label: 'Decoherence', x: 50, y: 68, kind: 'concept' },
      { id: 'ec', label: 'Error correction', x: 72, y: 68, kind: 'concept' },
      { id: 'adv', label: 'Where advantage holds', x: 72, y: 34, kind: 'concept' },
      { id: 'a', label: 'Answer', x: 94, y: 50, kind: 'leaf' },
    ],
    edges: [
      ['q', 'sup'], ['q', 'int'], ['q', 'ent'],
      ['sup', 'alg'], ['int', 'alg'], ['ent', 'alg'],
      ['ent', 'noise'], ['int', 'noise'],
      ['noise', 'ec'], ['alg', 'adv'],
      ['ec', 'a'], ['adv', 'a'],
    ] as Array<[string, string]>,
  },

  community: {
    corrections: [
      {
        author: 'Verified validator',
        domain: 'Quantum information',
        when: '4 hours ago',
        change: 'Replaced "supremacy" with "advantage" throughout and added the reason for the terminology shift.',
        reviews: 5,
        agree: 5,
        accepted: true,
      },
      {
        author: 'Verified validator',
        domain: 'Computational complexity',
        when: '2 days ago',
        change: 'Narrowed the claim about speedups: exponential advantage is not general, only class-specific.',
        reviews: 6,
        agree: 6,
        accepted: true,
      },
      {
        author: 'Contributor',
        domain: 'Hardware',
        when: '6 days ago',
        change: 'Proposed raising the qubit-count figure using a vendor announcement.',
        reviews: 4,
        agree: 1,
        accepted: false,
      },
    ],
    discussion: [
      {
        author: 'Reader',
        region: 'Helsinki',
        when: '11 hours ago',
        text: 'The plain-language layer helped, but the phrase "tries all answers at once" is still the most common misconception. Worth naming it explicitly as wrong.',
        votes: 214,
      },
      {
        author: 'Verified validator',
        region: 'Delft',
        when: '9 hours ago',
        text: 'Agreed. Added a line to the summary. Superposition is not parallel search - interference does the work.',
        votes: 388,
      },
      {
        author: 'Reader',
        region: 'Austin',
        when: '3 hours ago',
        text: 'Can the timeline show when the 2019 advantage claim was downgraded? That context changes how I read the sources.',
        votes: 96,
      },
    ],
  },

  timeline: [
    {
      year: '1994',
      confidence: 40,
      title: 'The field becomes consequential',
      body: 'A polynomial-time factoring algorithm turns quantum computing from a thought experiment into a security question.',
    },
    {
      year: '1997',
      confidence: 55,
      title: 'Fault tolerance is shown possible',
      body: 'Threshold theorems establish that noise does not have to be fatal, given enough overhead.',
    },
    {
      year: '2019',
      confidence: 72,
      title: 'First advantage claim',
      body: 'A sampling experiment is reported as beyond classical reach. The claim is immediately contested.',
    },
    {
      year: '2021',
      confidence: 64,
      title: 'The claim narrows',
      body: 'Improved classical simulation closes much of the reported gap. Confidence in the strong reading falls.',
    },
    {
      year: '2024',
      confidence: 88,
      title: 'Benchmarks become comparable',
      body: 'A shared protocol replaces vendor-reported figures, and the field converges on error correction as the constraint.',
    },
    {
      year: 'Now',
      confidence: 94,
      title: 'Current position',
      body: 'Advantage is real, narrow, and gated on fault tolerance rather than raw qubit count.',
    },
  ],

  conflict: {
    summary:
      'Two well-supported positions disagree on timelines. The Core holds both rather than averaging them into a claim neither side makes.',
    positions: [
      {
        stance: 'Near-term useful',
        weight: 46,
        body: 'Error-corrected machines capable of commercially meaningful chemistry simulation arrive within the decade; overhead estimates have fallen consistently.',
        backing: '9 validators, 14 sources',
        tone: 'blue',
      },
      {
        stance: 'Structurally further out',
        weight: 54,
        body: 'Overhead estimates fall because assumptions get more favourable, not because hardware closed the gap. The binding constraint is physical, not engineering.',
        backing: '11 validators, 19 sources',
        tone: 'amber',
      },
    ],
  },

  related: [
    { title: 'Why error correction dominates qubit count', confidence: 91 },
    { title: 'What post-quantum cryptography actually protects', confidence: 89 },
    { title: 'Simulating molecules: the first real application', confidence: 84 },
    { title: 'How classical simulation keeps catching up', confidence: 87 },
    { title: 'Decoherence, explained without the maths', confidence: 93 },
    { title: 'The terminology shift from supremacy to advantage', confidence: 96 },
  ],
} as const;

/* -- Command palette ----------------------------------------------------- */

export const COMMANDS = [
  { id: 'core', label: 'Go to the Knowledge Core', hint: 'Section', target: '#core' },
  { id: 'memory', label: 'How memory works', hint: 'Section', target: '#memory' },
  { id: 'validation', label: 'Community validation', hint: 'Section', target: '#validation' },
  { id: 'pricing', label: 'Pricing', hint: 'Section', target: '#pricing' },
  { id: 'answer', label: 'Open a sample answer', hint: 'Page', target: '/answer' },
  { id: 'top', label: 'Back to top', hint: 'Navigation', target: '#hero' },
] as const;

/* -- Preloader ----------------------------------------------------------- */

export const BOOT_SEQUENCE = [
  'Establishing link to the Core',
  'Loading 8,420,119 knowledge nodes',
  'Resolving 61,204,883 verified edges',
  'Replaying 12,804 corrections merged today',
  'Weighting sources by replication strength',
  'Core online',
] as const;
