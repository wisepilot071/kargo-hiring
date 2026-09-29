/**
 * Shared vocabulary used by the mock (extractive) AI provider to find
 * job-relevant evidence in free text. This is NOT a hard-coded rubric — it's
 * a keyword net used only to *locate* candidate evidence strings, which are
 * then quoted verbatim in scoring output. The actual rubric (names, weights,
 * inclusion) is still derived per-run from the JD + historical hire text.
 */
export type Concept = {
  key: string;
  label: string;
  keywords: string[];
};

export const CONCEPTS: Concept[] = [
  {
    key: "autonomous_ownership",
    label: "Autonomous ownership without senior layer above",
    keywords: [
      "sole", "independently", "owned", "ownership", "no committee", "no layer",
      "without a product layer", "without oversight", "no escalation", "most senior",
      "reports to the ceo", "reports to ceo", "full ownership",
    ],
  },
  {
    key: "ship_kill_discipline",
    label: "Evidence-based ship/iterate/kill discipline",
    keywords: [
      "killed", "shipped", "redirected", "usage data showed", "based on data",
      "a/b test", "iterated", "pivoted", "adoption", "re-prioritized", "reprioritized",
    ],
  },
  {
    key: "customer_discovery",
    label: "Ground-level customer / operations discovery",
    keywords: [
      "discovery", "customer", "freight forwarder", "in the room", "ground level",
      "onboarding", "workflow", "operations team", "field", "daily users",
    ],
  },
  {
    key: "engineering_collaboration",
    label: "Direct, unbuffered engineering collaboration",
    keywords: [
      "engineering lead", "with the engineering team", "eng spec", "engineering spec",
      "collaboration with the engineering", "worked directly with engineers", "api documentation",
    ],
  },
  {
    key: "zero_to_one",
    label: "Building process/function from zero",
    keywords: [
      "from scratch", "from zero", "first pm", "built the", "no handbook", "no design system",
      "no sprint template", "built a team", "wrote the", "developed standard operating procedures",
      "sop", "process that hadn't existed",
    ],
  },
  {
    key: "logistics_domain",
    label: "Logistics / freight / customs domain fluency",
    keywords: [
      "freight", "logistics", "customs", "carrier", "shipment", "port", "cha ", "3pl",
      "dgft", "bill of lading", "nvocc", "supply chain", "warehouse", "forwarder",
    ],
  },
  {
    key: "written_retrospection",
    label: "Written retrospection under pressure / failure",
    keywords: [
      "post-mortem", "postmortem", "retrospective", "root cause", "incident report",
      "outage", "on-call", "escalation management",
    ],
  },
  {
    key: "integration_platform",
    label: "Integration / platform architecture ownership",
    keywords: [
      "integration", "api gateway", "platform", "erp", "third-party", "webhook",
      "architecture", "data layer", "migration",
    ],
  },
  {
    key: "reliability_data_quality",
    label: "Reliability & data-quality standard setting",
    keywords: [
      "uptime", "reliability", "data quality", "sla", "incident", "zero downtime",
      "no data loss",
    ],
  },
  {
    key: "cross_functional",
    label: "Cross-functional collaboration / influence",
    keywords: [
      "cross-functional", "sales, engineering", "sales and", "across sales",
      "customer operations", "stakeholder",
    ],
  },
  {
    key: "measurable_impact",
    label: "Quantified, measurable impact",
    keywords: ["%", "reduced", "increased", "grew", "improved"],
  },
];

export function findMatches(bullets: string[], concept: Concept): string[] {
  const lower = (s: string) => s.toLowerCase();
  return bullets.filter((b) => concept.keywords.some((kw) => lower(b).includes(kw)));
}

export function hasDigitOrCurrency(text: string): boolean {
  return /\d/.test(text) || /₹|\$|%/.test(text);
}

export function hasOwnershipLanguage(text: string): boolean {
  return /sole|independently|owned|without a layer|no committee|no escalation|led the|drove/i.test(text);
}
