import { choices, domains, derivePartial, novelMatches } from './novel-rules.js';

const clone = value => structuredClone(value);
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const endings = { justice: 'justice', verite: 'truth', tragique: 'tragic', impunite: 'impunity' };
function record(state, kind, detail = {}) {
  state.history.push({ seq: state.history.length, at: state.story_time, transaction: state.revision, kind, ...detail });
}
function actorStatus(state, id, status, cause) {
  const before = state.world.actors[id];
  if (before === 'dead' && status !== 'dead') throw new Error(`Résurrection : ${id}`);
  state.world.actors[id] = status;
  if (before !== status) record(state, 'change', { cause, path: `world.actors.${id}`, before, value: status });
}
function schedule(state, key, after, effect, priority = 10) {
  if ([...state.pending_events, ...state.resolved_events].some(event => event.key === key)) return;
  const event = { key, effect, priority, due_at: state.story_time + after };
  state.pending_events.push(event); record(state, 'scheduled', event);
}
function advance(state, time) {
  if (time < state.story_time) return;
  while (true) {
    state.pending_events.sort((a, b) => a.due_at - b.due_at || a.priority - b.priority || a.key.localeCompare(b.key));
    const event = state.pending_events[0]; if (!event || event.due_at > time) break;
    state.pending_events.shift(); state.story_time = event.due_at; let triggered = true;
    switch (event.effect) {
      case 'meeting_start': state.world.meeting = 'underway'; break;
      case 'meeting': state.world.meeting = 'finished'; break;
      case 'garage': state.world.garage = 'closed'; break;
      case 'suzanne': if (state.world.actors.suzanne === 'protected') triggered = false; else actorStatus(state, 'suzanne', 'dead', event.key); break;
      case 'chassaing': if (state.world.actors.chassaing === 'protected') triggered = false; else actorStatus(state, 'chassaing', 'dead', event.key); break;
      case 'mazet': if (state.world.actors.worker === 'protected') triggered = false; else actorStatus(state, 'worker', 'dead', event.key); break;
      case 'brune_attack': if (state.world.actors.brune === 'protected') triggered = false; else actorStatus(state, 'brune', 'dead', event.key); break;
      case 'brune_departure': if (state.world.actors.brune === 'protected') triggered = false; else actorStatus(state, 'brune', 'fled', event.key); break;
      case 'rescue': state.world.occupant_saved = true; break;
      case 'occupant':
        if (state.world.occupant_saved) triggered = false;
        else actorStatus(state, state.variables.statut_laurent === 'libre' ? 'laurent' : 'marcel', 'dead', event.key);
        break;
      default: throw new Error(`Événement du roman inconnu : ${event.effect}`);
    }
    state.resolved_events.push({ ...event, triggered }); record(state, triggered ? 'event' : 'cancelled', { ...event, triggered });
  }
  state.story_time = time;
}
function decide(state, key, value, origin = 'player') {
  if (!choices[key]?.includes(value)) throw new Error(`Décision invalide : ${key}=${value}`);
  if (Object.hasOwn(state.decisions, key)) throw new Error(`Décision déjà prise : ${key}`);
  state.decisions[key] = value; state.variables = derivePartial(state.decisions);
  record(state, origin === 'player' ? 'decision' : 'autonomous', { key, value, origin });
}
function enterChapter(state, scene) {
  if (scene.chapter_anchor === state.chapter) return;
  const chapter = scene.chapter_anchor;
  const gap = scene.chapter_gap || 0;
  state.chapter_bases[chapter] = chapter === 3 ? state.chapter_bases[2] : state.story_time + gap;
  advance(state, Math.max(state.story_time, state.chapter_bases[chapter]));
  state.chapter = chapter;
  if (chapter === 3) {
    const base = state.chapter_bases[3];
    schedule(state, 'reunion_ouverte', base + 405 - state.story_time, 'meeting_start');
    schedule(state, 'reunion_terminee', base + 465 - state.story_time, 'meeting');
    schedule(state, 'garage_ferme', base + 440 - state.story_time, 'garage');
    schedule(state, 'rendez_vous_suzanne', base + 420 - state.story_time, 'suzanne');
  }
}
function prepareScene(state, scene) {
  enterChapter(state, scene);
  const base = state.chapter_bases[scene.chapter_anchor];
  if (scene.id === 'D_premier') advance(state, base + 365);
  if (scene.group === 'C03-06') advance(state, base + 440);
  if (scene.id === 'D_chassaing_action') schedule(state, 'menace_chassaing', 45, 'chassaing');
  if (scene.group === 'C09-07') advance(state, (state.milestones.chassaing || state.story_time) + 70);
  if (scene.id === 'D_protection_mazet') schedule(state, 'ouvrier_expose', state.decisions.fuite === 'oui' ? 20 : 65, 'mazet');
  if (scene.group === 'C13-05' && state.decisions.strategie === 'registre') advance(state, state.milestones.mazet + 80);
  if (scene.group === 'C15-05') advance(state, base + 21 * 1440);
  if (scene.id === 'D_protection_brune') {
    const expanded = state.decisions.piste_brune === 'elargie';
    schedule(state, 'menace_brune', expanded ? 20 : 60, expanded ? 'brune_attack' : 'brune_departure');
    const consent = state.initial_options.brune_consent === 'auto'
      ? state.decisions.aveu === 'oui' && state.decisions.piste_brune === 'discrete' ? 'oui' : 'non'
      : state.initial_options.brune_consent;
    decide(state, 'participation_brune', consent, 'Brune');
  }
  if (scene.group === 'C18-07') advance(state, state.milestones.brune + 70);
  if (scene.id === 'D_sauvetage') schedule(state, 'occupant_bureau_haut', 12, 'occupant', 20);
  if (scene.group === 'C23-08') actorStatus(state, 'lionel', state.variables.roussel23 === 'arrete' ? 'detained' : 'fled', 'intervention_roussel');
  if (scene.group === 'C24-09') actorStatus(state, 'cecile', { arretee: 'detained', fuite: 'fled', libre: 'alive' }[state.variables.cecile24], 'confrontation_cecile');
  if (scene.group === 'C21-04') { advance(state, state.milestones.incendie + 30); state.world.bureau_haut = 'destroyed'; }
}
function move(state, index, story) {
  while (index < story.sequence.length) {
    const scene = story.scenes[story.sequence[index]];
    enterChapter(state, scene);
    if (scene.decision_key && scene.available_if && !novelMatches(scene.available_if, state.variables)) {
      if (scene.decision_key === 'protection_mazet') decide(state, 'protection_mazet', 'immediate', 'not_applicable');
      index++; continue;
    }
    prepareScene(state, scene);
    if (!scene.segments.some(segment => novelMatches(segment.when, state.variables))) { index++; continue; }
    state.cursor = index; state.scene_id = scene.id; state.episode = scene.episode; state.phase = scene.phase;
    if (state.visits.includes(scene.id)) throw new Error(`Passage déjà lu : ${scene.id}`);
    state.visits.push(scene.id); record(state, 'scene', { id: scene.id, chapter: scene.chapter_anchor });
    if (scene.ending) {
      state.ending = endings[state.variables.fin];
      if (!state.ending) throw new Error('Dénouement encore indéterminé');
      record(state, 'outcome', { ending: state.ending, family: state.variables.fin });
    }
    return;
  }
  throw new Error('Le roman n’a pas de scène terminale');
}
export function newNovelGame(story, runId = globalThis.crypto.randomUUID(), options = {}) {
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId)) throw new Error('Identifiant de partie invalide');
  if (Object.keys(options).some(key => key !== 'brune_consent') || !['auto', 'oui', 'non'].includes(options.brune_consent || 'auto')) throw new Error('Paramètres autonomes invalides');
  const state = { run_id: runId, story_version: story.version, revision: 0, story_time: 0, episode: 1, phase: 'lecture',
    scene_id: story.start, ending: 'none', cursor: -1, chapter: 0, chapter_bases: {}, milestones: {},
    initial_options: { brune_consent: options.brune_consent || 'auto' }, decisions: {}, variables: {},
    world: { actors: Object.fromEntries(Object.keys(story.speakers).map(id => [id, ['paul','nadia','etienne','angele','noeline','michel'].includes(id) ? 'dead' : 'alive'])),
      meeting: 'pending', garage: 'open', magasin_bas: 'intact', bureau_haut: 'intact', register_saved: false, occupant_saved: false },
    pending_events: [], resolved_events: [], history: [], visits: [], journal: [], evidence: [], knowledge: [] };
  record(state, 'created', { run_id: runId, story_version: story.version, options: state.initial_options });
  move(state, 0, story); assertNovelInvariants(state, story); return state;
}
export function novelSegments(state, story) {
  const segments = story.scenes[state.scene_id].segments.filter(segment => novelMatches(segment.when, state.variables));
  for (const segment of segments) if (segment.speaker_confirmed && segment.delivery_context === 'live' && state.world.actors[segment.speaker_id] === 'dead') throw new Error(`Une personne morte parle au présent : ${segment.id}`);
  if (!segments.length) throw new Error(`Passage vide : ${state.scene_id}`);
  return segments;
}
export function novelChoices(state, story) {
  if (state.ending !== 'none') return [];
  const scene = story.scenes[state.scene_id];
  if (!scene.decision_key) return [{ id: 'continue', label: 'Continuer le récit', hint: 'Lire ou écouter le passage suivant.', duration_minutes: 0, continuation: true }];
  return scene.choices.filter(choice => !(scene.decision_key === 'strategie' && choice.value === 'registre' && state.decisions.mazet_engage !== 'oui'));
}
export function chooseNovel(previous, id, story) {
  assertNovelInvariants(previous, story);
  const choice = novelChoices(previous, story).find(candidate => candidate.id === id);
  if (!choice) throw new Error(`Choix expiré ou indisponible : ${id}`);
  const state = clone(previous), scene = story.scenes[state.scene_id];
  state.revision++; record(state, 'choice', { scene: state.scene_id, choice: id, duration: choice.duration_minutes });
  if (scene.decision_key) {
    const key = scene.decision_key;
    if (key === 'chassaing_action') state.milestones.chassaing = state.story_time;
    if (key === 'protection_mazet') state.milestones.mazet = state.story_time;
    if (key === 'protection_brune') state.milestones.brune = state.story_time;
    if (key === 'sauvetage') {
      state.milestones.incendie = state.story_time;
      if (choice.value === 'attendre') schedule(state, 'secours_occupant', 10, 'rescue', 0);
    }
    advance(state, state.story_time + choice.duration_minutes);
    decide(state, key, choice.value);
    if (key === 'premier' && choice.value === 'suzanne') actorStatus(state, 'suzanne', 'protected', id);
    if (key === 'chassaing_action' && choice.value === 'partir') actorStatus(state, 'chassaing', 'protected', id);
    if (key === 'strategie') {
      state.world.magasin_bas = choice.value === 'valette' && state.decisions.aveu === 'oui' ? 'secured' : 'destroyed';
      state.world.register_saved = choice.value === 'registre';
      if (choice.value === 'registre') actorStatus(state, 'worker', 'exposed', id);
    }
    if (key === 'protection_mazet' && choice.value !== 'aucune' && state.world.actors.worker !== 'dead') actorStatus(state, 'worker', 'protected', id);
    if (key === 'laurent_action') actorStatus(state, 'laurent', { proteger: 'protected', transmettre: 'detained', laisser: 'alive' }[choice.value], id);
    if (key === 'protection_brune' && choice.value === 'effective') actorStatus(state, 'brune', 'protected', id);
    if (key === 'sauvetage' && choice.value === 'personne') state.world.occupant_saved = true;
    state.journal.push({ id: `decision_${key}`, at: state.story_time, text: choice.label + '.' });
  }
  move(state, state.cursor + 1, story); assertNovelInvariants(state, story, previous); return state;
}
export function assertNovelInvariants(state, story, previous) {
  if (state.story_version !== story.version || story.sequence[state.cursor] !== state.scene_id) throw new Error('Version ou passage du roman invalide');
  if (!Number.isSafeInteger(state.story_time) || state.story_time < 0 || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('Horloge du roman invalide');
  if (stable(derivePartial(state.decisions)) !== stable(state.variables)) throw new Error('Conséquences du roman altérées');
  if (new Set(state.visits).size !== state.visits.length || state.history.some((event, i) => event.seq !== i)) throw new Error('Historique du roman invalide');
  const events = [...state.pending_events, ...state.resolved_events];
  if (new Set(events.map(e => e.key)).size !== events.length || state.pending_events.some(e => e.due_at < state.story_time)) throw new Error('Agenda du roman invalide');
  if (state.decisions.strategie === 'registre' && state.decisions.mazet_engage !== 'oui') throw new Error('Accès au registre sans accord');
  if (state.world.actors.paul !== 'dead' || state.world.actors.nadia !== 'dead') throw new Error('Canon ancien altéré');
  if (state.variables.mazet_final && state.world.actors.worker === 'dead' && state.variables.mazet_final !== 'mort') throw new Error('Sort de Mazet contradictoire');
  if (state.variables.brune18 === 'morte' && state.chapter >= 19 && state.world.actors.brune !== 'dead') throw new Error('Sort de Brune contradictoire');
  if (state.variables.laurent_final === 'mort' && state.chapter >= 22 && state.world.actors.laurent !== 'dead') throw new Error('Sort de Laurent contradictoire');
  if (previous) {
    if (state.story_time < previous.story_time || state.cursor <= previous.cursor) throw new Error('Retour dans le roman interdit');
    if (stable(state.history.slice(0, previous.history.length)) !== stable(previous.history)) throw new Error('Historique modifié');
    for (const [key, value] of Object.entries(previous.decisions)) if (state.decisions[key] !== value) throw new Error('Décision réécrite');
    for (const [id, status] of Object.entries(previous.world.actors)) if (status === 'dead' && state.world.actors[id] !== 'dead') throw new Error(`Résurrection : ${id}`);
    for (const place of ['magasin_bas','bureau_haut']) if (previous.world[place] === 'destroyed' && state.world[place] !== 'destroyed') throw new Error('Archives réapparues');
  }
  novelSegments(state, story);
  if (state.ending === 'none' && !novelChoices(state, story).length) throw new Error('Impasse dans le roman');
  return true;
}
export function validateNovel(story) {
  if (story.kind !== 'novel' || !story.version || !Array.isArray(story.sequence) || story.sequence[0] !== story.start || !story.scenes[story.start]) throw new Error('Structure du roman invalide');
  if (new Set(story.sequence).size !== story.sequence.length || Object.keys(story.scenes).length !== story.sequence.length) throw new Error('Passages dupliqués ou non ordonnés');
  const ids = new Set(), chapters = new Set(), decisionKeys = new Set();
  for (const id of story.sequence) {
    const scene = story.scenes[id]; if (!scene || scene.id !== id) throw new Error(`Passage absent : ${id}`);
    chapters.add(scene.chapter_anchor);
    if (scene.decision_key) {
      if (!choices[scene.decision_key] || decisionKeys.has(scene.decision_key)) throw new Error(`Décision inconnue ou dupliquée : ${id}`);
      decisionKeys.add(scene.decision_key);
      for (const choice of scene.choices) if (!choices[scene.decision_key].includes(choice.value) || !Number.isInteger(choice.duration_minutes) || choice.duration_minutes < 1 || !choice.label) throw new Error(`Option invalide : ${id}`);
    }
    for (const segment of scene.segments) {
      if (!segment.text?.trim() || !story.speakers[segment.speaker_id] || ids.has(segment.id)) throw new Error(`Segment invalide : ${segment.id}`);
      ids.add(segment.id);
      if (!['live','past','recording','document'].includes(segment.delivery_context) || typeof segment.speaker_confirmed !== 'boolean') throw new Error(`Attribution invalide : ${segment.id}`);
      if (segment.when !== 'Commun') for (const clause of segment.when.split('&')) {
        const match = clause.trim().match(/^([a-z0-9_]+)(=|!=)([a-z0-9_\/]+)$/);
        if (!match || !domains[match[1]] || match[3].split('/').some(value => !domains[match[1]].includes(value))) throw new Error(`Condition invalide : ${segment.id}`);
      }
    }
  }
  if (chapters.size !== 25 || decisionKeys.size !== Object.keys(story.decisions).length || !story.scenes[story.sequence.at(-1)].ending) throw new Error('Roman incomplet');
  return { scenes: story.sequence.length, events: 9, segments: ids.size, chapters: chapters.size, decisions: decisionKeys.size };
}
