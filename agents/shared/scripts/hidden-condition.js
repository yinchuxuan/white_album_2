/* global include, parseTimelineTime */
include("lib/timeline/time.js");

// Card-local all composes DSL state predicates; currentTime ranges use parsed dates.
const hiddenConditionOperators = ['eq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'regex', 'exists'];
const hiddenRangeOperators = ['gt', 'gte', 'lt', 'lte'];

function validateHiddenCondition(condition) {
  if (condition && Object.keys(condition).length === 1 && Object.hasOwn(condition, 'all')) {
    if (!Array.isArray(condition.all) || !condition.all.length) throw new Error('Hidden condition all requires a non-empty array');
    condition.all.forEach(validateHiddenCondition);
    return;
  }
  if (!condition || Object.keys(condition).length !== 1 || !condition.state
    || Array.isArray(condition.state) || typeof condition.state !== 'object'
    || !Object.keys(condition.state).length) throw new Error('Hidden condition requires a non-empty state predicate');
  for (const [path, expected] of Object.entries(condition.state)) {
    if (!path || path.split('.').some(key => !key || ['__proto__', 'prototype', 'constructor'].includes(key))) {
      throw new Error(`Invalid hidden condition state path: ${path}`);
    }
    if (expected === null || typeof expected !== 'object') continue;
    if (Array.isArray(expected) || !Object.keys(expected).length) throw new Error(`Invalid hidden condition: ${path}`);
    for (const [operator, value] of Object.entries(expected)) {
      if (!hiddenConditionOperators.includes(operator)) throw new Error(`Unsupported hidden condition operator: ${operator}`);
      if (['in', 'nin'].includes(operator) && !Array.isArray(value)) throw new Error(`${operator} requires an array`);
      if (operator === 'exists' && typeof value !== 'boolean') throw new Error('exists requires a boolean');
      if (operator === 'regex') new RegExp(value);
      if (path === 'timeline.currentTime' && hiddenRangeOperators.includes(operator)) {
        parseTimelineTime(value, `hidden condition ${path}.${operator}`);
      }
    }
  }
}

function matchesHiddenCondition(condition, state) {
  if (condition.all) return condition.all.every(item => matchesHiddenCondition(item, state));
  return Object.entries(condition.state).every(([path, expected]) => {
    let actual = state, exists = true;
    for (const key of path.split('.')) {
      if (actual === null || typeof actual !== 'object' || !Object.hasOwn(actual, key)) { exists = false; break; }
      actual = actual[key];
    }
    if (expected === null || typeof expected !== 'object') return exists && actual === expected;
    return Object.entries(expected).every(([operator, value]) => {
      if (operator === 'exists') return exists === value;
      if (!exists) return false;
      if (operator === 'eq') return actual === value;
      const timeRange = path === 'timeline.currentTime' && hiddenRangeOperators.includes(operator);
      const left = timeRange ? parseTimelineTime(actual, `hidden condition ${path}`) : actual;
      const right = timeRange ? parseTimelineTime(value, `hidden condition ${path}.${operator}`) : value;
      if (operator === 'gt') return typeof left === typeof right && left > right;
      if (operator === 'gte') return typeof left === typeof right && left >= right;
      if (operator === 'lt') return typeof left === typeof right && left < right;
      if (operator === 'lte') return typeof left === typeof right && left <= right;
      if (operator === 'in') return value.includes(actual);
      if (operator === 'nin') return !value.includes(actual);
      if (operator === 'contains') return (typeof actual === 'string' || Array.isArray(actual)) && actual.includes(value);
      if (operator === 'regex') return typeof actual === 'string' && new RegExp(value).test(actual);
      return false;
    });
  });
}
