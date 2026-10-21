import { fields, get, validValue } from './model.js';
export function matches(state, condition = true) {
  if (typeof condition === 'boolean') return condition;
  if (condition.all) return condition.all.every(c => matches(state, c));
  if (condition.any) return condition.any.some(c => matches(state, c));
  if (condition.not !== undefined) return !matches(state, condition.not);
  const value = get(state, condition.path);
  switch (condition.op) {
    case 'eq': return value === condition.value;
    case 'ne': return value !== condition.value;
    case 'gte': return value >= condition.value;
    case 'lt': return value < condition.value;
    default: throw new Error(`Opérateur inconnu : ${condition.op}`);
  }
}
export function validateCondition(condition, where = 'condition') {
  if (typeof condition === 'boolean') return;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) throw new Error(`${where} : condition invalide`);
  const keys = Object.keys(condition);
  for (const operator of ['all', 'any']) {
    if (Object.hasOwn(condition, operator)) {
      if (keys.length !== 1 || !Array.isArray(condition[operator]) || !condition[operator].length) throw new Error(`${where} : ${operator} attend une liste non vide`);
      condition[operator].forEach(c => validateCondition(c, where)); return;
    }
  }
  if (Object.hasOwn(condition, 'not')) {
    if (keys.length !== 1) throw new Error(`${where} : not exclusif`);
    validateCondition(condition.not, where); return;
  }
  if (keys.sort().join(',') !== 'op,path,value' || !fields[condition.path]) throw new Error(`${where} : variable ou clés inconnues`);
  const spec = fields[condition.path];
  if (!['eq', 'ne', 'gte', 'lt'].includes(condition.op) || !validValue(spec, condition.value)) throw new Error(`${where} : opérateur ou type invalide`);
  if (['gte', 'lt'].includes(condition.op) && spec.type !== 'integer') throw new Error(`${where} : comparaison numérique attendue`);
}
