import { fields, get, set, validValue, makeInitial } from './model.js';
import { matches } from './conditions.js';
import { newNovelGame, novelChoices, novelSegments, chooseNovel, assertNovelInvariants } from './novel.js';
export { matches } from './conditions.js';
export { validateStory } from './validate.js';

const clone = value => structuredClone(value);
function log(state, kind, detail) {
  state.history.push({ seq: state.history.length, at: state.story_time, transaction: state.revision, kind, ...detail });
}
function effects(state, items, story, cause) {
  for (const effect of items) {
    if (!matches(state, effect.when ?? true)) continue;
    if (effect.op === 'set') {
      const before = get(state, effect.path);
      set(state, effect.path, effect.value);
      if (before !== effect.value) log(state, 'change', { cause, path: effect.path, before, value: effect.value });
    } else if (effect.op === 'learn') {
      if (!state.knowledge.includes(effect.id)) {
        state.knowledge.push(effect.id);
        state.journal.push({ id: effect.id, at: state.story_time, text: effect.value });
        log(state, 'knowledge', { cause, id: effect.id });
      }
    } else if (effect.op === 'evidence') {
      if (state.evidence.some(e => e.id === effect.id)) continue;
      const definition = story.evidence[effect.id];
      if (!definition || !matches(state, definition.available_if ?? true)) throw new Error(`Preuve indisponible : ${effect.id}`);
      state.evidence.push({ id: effect.id, obtained_at: state.story_time, location: state.scene_id, ...clone(definition) });
      if (definition.scope !== 'emotional') state.proof[definition.scope] += definition.strength;
      log(state, 'evidence', { cause, id: effect.id, source: definition.source });
    } else throw new Error(`Effet inconnu : ${effect.op}`);
  }
}
function schedule(state, items, story, cause) {
  for (const item of items) {
    if (!matches(state, item.when ?? true)) continue;
    // A semantic key can only be enqueued once in a run, even after cancellation.
    if (state.pending_events.some(e => e.key === item.key) || state.resolved_events.some(e => e.key === item.key)) continue;
    state.pending_events.push({ key: item.key, event: item.event, due_at: state.story_time + item.after, priority: story.events[item.event].priority });
    log(state, 'scheduled', { cause, key: item.key, event: item.event, due_at: state.story_time + item.after });
  }
}
function advance(state, target, story) {
  let guard = 0;
  while (true) {
    state.pending_events.sort((a, b) => a.due_at - b.due_at || a.priority - b.priority || a.key.localeCompare(b.key, 'en'));
    const next = state.pending_events[0];
    if (!next || next.due_at > target) break;
    if (++guard > 200) throw new Error('Cycle d’événements');
    state.pending_events.shift();
    state.story_time = next.due_at;
    const event = story.events[next.event];
    const triggered = matches(state, event.when ?? true);
    state.resolved_events.push({ ...next, triggered });
    log(state, triggered ? 'event' : 'cancelled', { key: next.key, event: next.event });
    if (triggered) {
      effects(state, event.effects, story, next.key);
      schedule(state, event.schedule ?? [], story, next.key);
    }
  }
  state.story_time = target;
}
function enter(state, id, story) {
  const scene = story.scenes[id];
  if (!scene || !matches(state, scene.available_if ?? true)) throw new Error(`Scène indisponible : ${id}`);
  if (state.visits.includes(id)) throw new Error(`Retour interdit à la scène initiale : ${id}`);
  state.scene_id = id; state.episode = scene.episode; state.phase = scene.phase;
  state.visits.push(id);
  log(state, 'scene', { id });
  effects(state, scene.entry_effects, story, id);
}
export function newGame(story, runId = globalThis.crypto.randomUUID(), options = {}) {
  if (story.kind === 'novel') return newNovelGame(story, runId, options);
  const state = makeInitial(runId, story);
  log(state, 'created', { run_id: runId, story_version: story.version });
  schedule(state, story.initial_events, story, 'initial');
  enter(state, story.start, story);
  assertInvariants(state, story);
  return state;
}
export function availableChoices(state, story) {
  if (story.kind === 'novel') return novelChoices(state, story);
  if (state.ending !== 'none') return [];
  return story.scenes[state.scene_id].choices.filter(c =>
    matches(state, c.available_if ?? true) && (c.expires_at === undefined || state.story_time + c.duration_minutes <= c.expires_at));
}
export function sceneSegments(state, story) {
  if (story.kind === 'novel') return novelSegments(state, story);
  const segments = story.scenes[state.scene_id].segments.filter(s => matches(state, s.when ?? true));
  for (const s of segments) {
    if (['suzanne', 'worker', 'brune', 'karim', 'laurent'].includes(s.speaker_id) && state[s.speaker_id].status === 'dead') throw new Error(`Dialogue d’une personne morte : ${s.id}`);
  }
  if (!segments.length) throw new Error(`Scène muette : ${state.scene_id}`);
  return segments;
}
function finalize(state) {
  const strong = state.proof.modern >= 5 && state.proof.historical >= 2;
  const institution = state.valette.trust >= 1 && state.cecile.status !== 'escaped';
  if (strong && institution) {
    set(state, 'cecile.status', 'arrested');
    state.ending = state.suzanne.status === 'dead' || state.worker.status === 'dead' ? 'tragic' : 'justice';
  } else if (state.proof.historical >= 2 || state.proof.modern >= 3) {
    state.ending = 'truth';
    if (state.cecile.status !== 'escaped') set(state, 'cecile.status', state.proof.modern >= 3 ? 'investigated' : 'unnoticed');
  } else state.ending = 'impunity';
  log(state, 'outcome', { ending: state.ending, cecile: state.cecile.status, proof: clone(state.proof) });
}
export function choose(previous, choiceId, story) {
  if (story.kind === 'novel') return chooseNovel(previous, choiceId, story);
  assertInvariants(previous, story);
  const choice = availableChoices(previous, story).find(c => c.id === choiceId);
  if (!choice) throw new Error(`Choix expiré ou indisponible : ${choiceId}`);
  const state = clone(previous);
  state.revision++;
  log(state, 'choice', { scene: previous.scene_id, choice: choiceId, duration: choice.duration_minutes });
  schedule(state, choice.schedule, story, choiceId);
  advance(state, state.story_time + choice.duration_minutes, story);
  effects(state, choice.effects, story, choiceId);
  state.rakoto.fatigue = Math.min(10, Math.floor(state.story_time / 60));
  if (choice.finalize) finalize(state);
  enter(state, choice.finalize ? `END_${state.ending}` : choice.target, story);
  assertInvariants(state, story, previous);
  return state;
}
export function assertInvariants(state, story, previous) {
  if (story.kind === 'novel') return assertNovelInvariants(state, story, previous);
  for (const [path, spec] of Object.entries(fields)) if (!validValue(spec, get(state, path))) throw new Error(`État invalide : ${path}`);
  if (!story.scenes[state.scene_id] || state.story_version !== story.version) throw new Error('Version ou scène inconnue');
  if (state.suzanne.status === 'dead' && state.suzanne.testimony_given && !state.evidence.some(e => e.id === 'suzanne_testimony')) throw new Error('Témoignage sans provenance');
  if (state.worker.testimony_given && !state.evidence.some(e => e.id === 'worker_testimony')) throw new Error('Témoignage ouvrier sans provenance');
  if (state.world.quarry === 'destroyed' && state.archives.status !== 'destroyed' && state.archives.status !== 'seized') throw new Error('Archives réapparues');
  if (state.flags.register_saved !== state.evidence.some(e => e.id === 'register')) throw new Error('Registre miraculeux');
  if (state.history.some((h, i) => h.seq !== i)) throw new Error('Journal non continu');
  if (new Set(state.visits).size !== state.visits.length) throw new Error('Scène initiale répétée');
  if (new Set(state.evidence.map(e => e.id)).size !== state.evidence.length) throw new Error('Preuve dupliquée');
  const keys = [...state.pending_events, ...state.resolved_events].map(e => e.key);
  if (new Set(keys).size !== keys.length) throw new Error('Événement rejoué');
  if (state.pending_events.some(e => e.due_at < state.story_time || !story.events[e.event])) throw new Error('Agenda invalide');
  for (const scope of ['historical', 'modern']) if (state.proof[scope] !== state.evidence.filter(e => e.scope === scope).reduce((sum, e) => sum + e.strength, 0)) throw new Error('Solidité incohérente');
  if (previous) {
    for (const who of ['suzanne', 'worker', 'brune', 'karim', 'laurent']) if (previous[who].status === 'dead' && state[who].status !== 'dead') throw new Error('Résurrection');
    if (previous.world.quarry === 'destroyed' && state.world.quarry !== 'destroyed') throw new Error('Bâtiment reconstruit');
    if (previous.archives.status === 'destroyed' && state.archives.status !== 'destroyed') throw new Error('Archives restaurées');
    if (previous.cecile.status === 'arrested' && state.cecile.status !== 'arrested') throw new Error('Libération implicite');
    if (state.story_time < previous.story_time) throw new Error('Retour temporel');
    if (JSON.stringify(state.history.slice(0, previous.history.length)) !== JSON.stringify(previous.history)) throw new Error('Historique modifié');
    for (const evidence of previous.evidence) if (!state.evidence.some(e => e.id === evidence.id)) throw new Error('Preuve effacée');
  }
  sceneSegments(state, story);
  if (state.ending === 'none' && !availableChoices(state, story).length) throw new Error('Impasse logicielle');
  return true;
}
