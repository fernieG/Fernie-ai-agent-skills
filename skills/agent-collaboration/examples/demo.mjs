import { resolveIssue } from '../coordinator.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Entire example is synthetic. The rule is supplied as approved data,
// not invented by an agent. Workers are deterministic mock specialists.
export const demoIssue = {
  id: 'DEMO-TEST-COVERAGE',
  objective: 'Produce independently verified boundary tests for an approved free-delivery rule',
  startAgent: 'project_manager',
  sourceIds: ['DOC-DEMO-001'],
  localOnly: true,
  requiresHumanApproval: false,
  rule: {
    sourceId: 'DOC-DEMO-001',
    minOrderValue: 50,
    operator: '>=',
    outcome: 'free_delivery'
  }
};

export function makeDemoAgents({ corruptTests = false } = {}) {
  return {
    async project_manager({ issue }) {
      return {
        status: 'handoff',
        reason: 'The missing artifact is test coverage; ask the analyst to anchor the rule in source evidence.',
        nextAgent: 'business_analyst'
      };
    },
    async business_analyst({ issue }) {
      if (issue.rule?.sourceId !== issue.sourceIds[0] ||
        !Number.isFinite(issue.rule?.minOrderValue) ||
        issue.rule?.operator !== '>=') {
        return {
          status: 'unresolved',
          reason: 'No supported validated rule; clarification must precede test generation.'
        };
      }
      return {
        status: 'handoff',
        reason: 'Rule documented and interpreted; ask test engineering to produce the executable boundary cases.',
        nextAgent: 'test_engineer',
        artifact: {
          id: 'ART-RULE',
          type: 'business_rule',
          evidenceIds: [issue.rule.sourceId],
          content: {
            minOrderValue: issue.rule.minOrderValue,
            operator: issue.rule.operator,
            outcome: issue.rule.outcome
          }
        }
      };
    },
    async test_engineer({ artifacts }) {
      const rule = artifacts.find(a => a.id === 'ART-RULE')?.content;
      if (!rule) {
        return { status: 'unresolved', reason: 'Business rule evidence is missing.' };
      }
      const t = rule.minOrderValue;
      const cases = [t - 1, t, t + 1].map(value => ({
        orderValue: value,
        freeDelivery: value >= t
      }));
      if (corruptTests) cases[1].freeDelivery = false;
      return {
        status: 'handoff',
        nextAgent: 'quality_reviewer',
        reason: 'Boundary tests drafted from the validated rule; ask QA to check objective coverage.',
        artifact: {
          id: 'ART-TESTS',
          type: 'test_cases',
          evidenceIds: ['ART-RULE'],
          content: { cases }
        }
      };
    },
    async quality_reviewer({ artifacts }) {
      const rule = artifacts.find(a => a.id === 'ART-RULE')?.content;
      const tests = artifacts.find(a => a.id === 'ART-TESTS')?.content?.cases ?? [];
      const boundarySet = new Set(tests.map(x => x.orderValue));
      const coversBoundary = !!rule &&
        [rule.minOrderValue - 1, rule.minOrderValue, rule.minOrderValue + 1]
          .every(x => boundarySet.has(x));
      return {
        status: 'complete',
        reason: coversBoundary
          ? 'Three boundary input values are present; independent final verifier checks expected results.'
          : 'Coverage incomplete; do not report a delivered solution.',
        artifact: {
          id: 'ART-QA',
          type: 'qa_review',
          evidenceIds: ['ART-TESTS'],
          content: { coversBoundary }
        }
      };
    }
  };
}

export async function verifyDemo({ issue, artifacts }) {
  const rule = artifacts.find(x => x.id === 'ART-RULE');
  const tests = artifacts.find(x => x.id === 'ART-TESTS');
  const review = artifacts.find(x => x.id === 'ART-QA');
  const t = issue.rule?.minOrderValue;
  const cases = tests?.content?.cases;
  const result = Number.isFinite(t) && rule?.content.minOrderValue === t &&
    rule?.evidenceIds.includes(issue.rule.sourceId) &&
    Array.isArray(cases) && cases.length === 3 &&
    [t - 1, t, t + 1].every(value =>
      cases.some(c => c.orderValue === value &&
        c.freeDelivery === (value >= t))) &&
    review?.content.coversBoundary === true;
  return {
    passed: result === true,
    reason: result
      ? 'Boundary tests are complete and expected results match the supplied approved rule.'
      : 'Boundary coverage or expected results are inconsistent with the source rule.'
  };
}

export async function runDemo(options = {}) {
  return resolveIssue({
    issue: { ...structuredClone(demoIssue), ...options.issue },
    agents: makeDemoAgents(options.agents),
    verify: verifyDemo
  });
}

if (process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runDemo().then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.status !== 'resolved_local') process.exitCode = 1;
  }).catch(error => {
    process.stderr.write(String(error) + '\n');
    process.exitCode = 1;
  });
}
