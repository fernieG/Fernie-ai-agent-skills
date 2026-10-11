import { resolveIssue } from '../coordinator.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Fictional historical dates ONLY. Never commit a user's menstrual data.
// Formula mirrors MyCycle v4 (PR #3): use median of last six admissible
// intervals when at least three intervals exist, otherwise configured typical
// cycle length; ±max(2,ceil((max-min)/2)) days around the estimate.
export const syntheticMyCycleIssue = {
  id: 'DEMO-MYCYCLE-PREDICTION',
  objective: 'Calculate and independently verify the next predicted cycle start',
  startAgent: 'project_manager',
  sourceIds: ['SPEC-MYCYCLE-V4-PREDICTION', 'SYNTHETIC-HISTORY-001'],
  localOnly: true,
  requiresHumanApproval: false,
  asOf: '2025-04-15',
  confirmedStarts: ['2025-01-14', '2025-02-10', '2025-03-12', '2025-04-07'],
  typicalCycleLength: 28,
  expected: { date: '2025-05-04', startWindow: '2025-05-02', endWindow: '2025-05-06' }
};

function ordinal(iso) {
  const ms = Date.parse(iso + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) return NaN;
  return Math.floor(ms / 86400000);
}
function addDate(iso, days) {
  return new Date((ordinal(iso) + days) * 86400000).toISOString().slice(0, 10);
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateMyCycleV4(starts, typicalCycleLength) {
  if (!Array.isArray(starts) || starts.length < 1 ||
    starts.some(s => typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      !Number.isFinite(ordinal(s)))) throw new Error('Missing or invalid confirmed period starts');
  if (!Number.isInteger(typicalCycleLength) ||
    typicalCycleLength < 15 || typicalCycleLength > 60) {
    throw new Error('Invalid typical cycle length');
  }
  const confirmed = [...starts].sort();
  if (new Set(confirmed).size !== confirmed.length) throw new Error('Duplicate confirmed start date');
  const lengths = [];
  for (let i = 1; i < confirmed.length; i++) {
    const n = ordinal(confirmed[i]) - ordinal(confirmed[i - 1]);
    if (n >= 15 && n <= 60) lengths.push(n);
  }
  const last = lengths.slice(-6);
  const cycleLength = Math.round(last.length >= 3 ? median(last) : typicalCycleLength);
  const variation = last.length ? Math.max(...last) - Math.min(...last) : 4;
  const window = Math.max(2, Math.ceil(variation / 2));
  const date = addDate(confirmed.at(-1), cycleLength);
  return {
    date,
    cycleLength,
    startWindow: addDate(date, -window),
    endWindow: addDate(date, window),
    daysObserved: last,
    cyclesUsed: last.length,
    windowDays: window,
    confidence: last.length >= 3 ?
      (variation <= 4 ? 'High' : variation <= 8 ? 'Medium' : 'Limited') : 'Limited',
    predictionNotConfirmation: true
  };
}

export function myCycleAgents() {
  return {
    async project_manager() {
      return {
        status: 'handoff',
        nextAgent: 'data_validation',
        reason: 'A user-facing date needs verified history before calculation; request input validation.'
      };
    },
    async data_validation({ issue }) {
      try {
        calculateMyCycleV4(issue.confirmedStarts, issue.typicalCycleLength);
      } catch {
        return { status: 'unresolved',
          reason: 'Confirmed starts/settings are invalid; do not invent missing health history.' };
      }
      return {
        status: 'handoff', nextAgent: 'prediction',
        reason: 'Validated date-only source record; request deterministic forecast.',
        artifact: {
          id: 'ART-INPUT-CHECK', type: 'validated_input',
          evidenceIds: ['SYNTHETIC-HISTORY-001'],
          content: { count: issue.confirmedStarts.length, datesChecked: true }
        }
      };
    },
    async prediction({ issue, artifacts }) {
      if (!artifacts.some(a => a.id === 'ART-INPUT-CHECK')) {
        return { status: 'unresolved', reason: 'No confirmed history validation exists.' };
      }
      const forecast = calculateMyCycleV4(issue.confirmedStarts, issue.typicalCycleLength);
      return {
        status: 'handoff', nextAgent: 'qa_review',
        reason: 'Forecast produced; ask a separate reviewer to compare evidence and expected output.',
        artifact: {
          id: 'ART-PREDICTION', type: 'prediction',
          evidenceIds: ['ART-INPUT-CHECK', 'SPEC-MYCYCLE-V4-PREDICTION'],
          content: forecast
        }
      };
    },
    async qa_review({ issue, artifacts }) {
      const forecast = artifacts.find(a => a.id === 'ART-PREDICTION')?.content;
      if (!forecast) return { status: 'unresolved', reason: 'No forecast artifact received.' };
      const expected = issue.expected;
      if (!expected || ['date', 'startWindow', 'endWindow']
        .some(k => typeof expected[k] !== 'string')) {
        return {
          status: 'needs_human',
          reason: 'No independent acceptance oracle was supplied; cannot claim verified.'
        };
      }
      const match = forecast.date === expected.date &&
        forecast.startWindow === expected.startWindow &&
        forecast.endWindow === expected.endWindow;
      if (!match) return { status: 'unresolved', reason: 'QA acceptance values differ from forecast.' };
      return {
        status: 'complete', reason: 'QA compared all forecast window dates against synthetic acceptance values.',
        artifact: {
          id: 'ART-QA-PREDICTION', type: 'qa_evidence',
          evidenceIds: ['ART-PREDICTION', 'SYNTHETIC-HISTORY-001'],
          content: { comparedThreeDates: true }
        }
      };
    }
  };
}

export function verifyMyCycle({ issue, artifacts }) {
  const result = artifacts.find(a => a.id === 'ART-PREDICTION')?.content;
  const validated = artifacts.find(a => a.id === 'ART-INPUT-CHECK')?.content;
  const qa = artifacts.find(a => a.id === 'ART-QA-PREDICTION')?.content;
  // Acceptance fixture is independently defined; it must not be filled from
  // the predictor output. This is a local algorithmic verification only.
  const passed = validated?.datesChecked === true &&
    validated.count === issue.confirmedStarts.length &&
    qa?.comparedThreeDates === true &&
    !!result && !!issue.expected &&
    ['date', 'startWindow', 'endWindow'].every(k => result[k] === issue.expected[k]);
  return {
    passed,
    reason: passed ?
      'Synthetic forecast and uncertainty window match independent acceptance values.' :
      'Forecast not verified against the synthetic acceptance values.'
  };
}

export function runMyCycleDemo(options = {}) {
  const issue = { ...structuredClone(syntheticMyCycleIssue), ...options };
  return resolveIssue({
    issue, agents: myCycleAgents(), verify: verifyMyCycle
  });
}

if (process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runMyCycleDemo().then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.status !== 'resolved_local') process.exitCode = 1;
  }).catch(error => {
    process.stderr.write(String(error) + '\n');
    process.exitCode = 1;
  });
}
