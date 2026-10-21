export const SAVE_VERSION = 1;
export const fields = {
  'story_time': { type: 'integer', min: 0, max: 1440 },
  'episode': { type: 'integer', min: 1, max: 5 },
  'phase': { enum: ['ouverture', 'rendez_vous', 'carriere', 'conclusion'] },
  'suzanne.status': { enum: ['alive', 'protected', 'missing', 'dead'] },
  'suzanne.testimony_given': { type: 'boolean' },
  'worker.status': { enum: ['alive', 'exposed', 'protected', 'dead'] },
  'worker.testimony_given': { type: 'boolean' },
  'karim.status': { enum: ['free', 'fugitive', 'arrested', 'dead'] },
  'karim.trust': { type: 'integer', min: -2, max: 2 },
  'brune.status': { enum: ['hidden', 'located', 'threatened', 'protected', 'dead'] },
  'brune.willing_to_testify': { type: 'boolean' },
  'laurent.status': { enum: ['free', 'cooperating', 'fugitive', 'detained', 'dead'] },
  'cecile.status': { enum: ['unnoticed', 'suspected', 'investigated', 'wanted', 'arrested', 'escaped'] },
  'valette.trust': { type: 'integer', min: -2, max: 2 },
  'valette.alert_level': { type: 'integer', min: 0, max: 3 },
  'jeanne.trust': { type: 'integer', min: -2, max: 2 },
  'rakoto.confessed': { type: 'boolean' },
  'rakoto.fatigue': { type: 'integer', min: 0, max: 10 },
  'archives.status': { enum: ['intact', 'partially_copied', 'seized', 'destroyed'] },
  'world.quarry': { enum: ['intact', 'secured', 'destroyed'] },
  'world.meeting': { enum: ['pending', 'finished'] },
  'world.garage': { enum: ['open', 'closed'] },
  'flags.shared': { type: 'boolean' },
  'flags.leak_active': { type: 'boolean' },
  'flags.security_active': { type: 'boolean' },
  'flags.jeanne_called': { type: 'boolean' },
  'flags.prepared': { type: 'boolean' },
  'flags.box_found': { type: 'boolean' },
  'flags.madeleine_heard': { type: 'boolean' },
  'flags.register_saved': { type: 'boolean' },
  'flags.suzanne_known': { type: 'boolean' },
  'flags.worker_known': { type: 'boolean' },
  'flags.return_seen': { type: 'boolean' },
  'route.first': { enum: ['none', 'suzanne', 'garage', 'mairie'] },
  'route.preparation': { enum: ['none', 'madeleine', 'garage', 'copies'] },
  'route.quarry': { enum: ['none', 'truck', 'register', 'valette'] },
  'route.response': { enum: ['none', 'protect', 'deliver', 'karim'] },
  'proof.historical': { type: 'integer', min: 0, max: 30 },
  'proof.modern': { type: 'integer', min: 0, max: 30 },
  'ending': { enum: ['none', 'justice', 'tragic', 'truth', 'impunity'] }
};

export function get(state, path) {
  if (!Object.hasOwn(fields, path)) throw new Error(`Variable inconnue : ${path}`);
  return path.split('.').reduce((obj, key) => obj?.[key], state);
}
export function set(state, path, value) {
  const spec = fields[path];
  if (!spec || !validValue(spec, value)) throw new Error(`Valeur invalide pour ${path} : ${JSON.stringify(value)}`);
  const parts = path.split('.');
  const leaf = parts.pop();
  const obj = parts.reduce((o, k) => o[k], state);
  obj[leaf] = value;
}
export function validValue(spec, value) {
  if (spec.enum) return spec.enum.includes(value);
  if (spec.type === 'boolean') return typeof value === 'boolean';
  return Number.isSafeInteger(value) && value >= spec.min && value <= spec.max;
}
export function makeInitial(runId, story) {
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId)) throw new Error('Identifiant de partie invalide');
  return {
    run_id: runId, story_version: story.version, revision: 0, story_time: 0, episode: 1,
    phase: 'ouverture', scene_id: story.start, ending: 'none',
    suzanne: { status: 'alive', testimony_given: false },
    worker: { status: 'alive', testimony_given: false },
    karim: { status: 'free', trust: 0 },
    brune: { status: 'hidden', willing_to_testify: false },
    laurent: { status: 'free' }, cecile: { status: 'unnoticed' },
    valette: { trust: 0, alert_level: 0 }, jeanne: { trust: 0 },
    rakoto: { confessed: false, fatigue: 0 }, archives: { status: 'intact' },
    world: { quarry: 'intact', meeting: 'pending', garage: 'open' },
    flags: { shared: false, leak_active: false, security_active: true, jeanne_called: false,
      prepared: false, box_found: false, madeleine_heard: false, register_saved: false,
      suzanne_known: false, worker_known: false, return_seen: false },
    route: { first: 'none', preparation: 'none', quarry: 'none', response: 'none' },
    proof: { historical: 0, modern: 0 }, evidence: [], knowledge: [],
    pending_events: [], resolved_events: [], history: [], visits: [], journal: []
  };
}
