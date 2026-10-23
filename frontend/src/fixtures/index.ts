import { notFoundScenario, provenScenario } from './infeasibleScenarios'
import type { Scenario } from './scenario'
import { smallScenario } from './smallScenario'
import { test7Scenario } from './test7Scenario'

export type { Scenario, ScenarioOutcome } from './scenario'

export const SCENARIOS = {
  small: smallScenario,
  test7: test7Scenario,
  proven: provenScenario,
  notFound: notFoundScenario,
} satisfies Record<string, Scenario>

export type ScenarioName = keyof typeof SCENARIOS

export function isScenarioName(value: string): value is ScenarioName {
  return Object.hasOwn(SCENARIOS, value)
}
