import { SAVE_VERSION } from './model.js';
import { newGame, choose, assertInvariants } from './engine.js';
const PREFIX = 'mauvaise-tombe:v1:';
export const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export function exportGame(state) {
  return JSON.stringify({ format: 'la-mauvaise-tombe', save_version: SAVE_VERSION, state }, null, 2);
}
export function importGame(text, story) {
  if (text.length > 2_000_000) throw new Error('Sauvegarde trop volumineuse');
  const envelope = JSON.parse(text);
  if (envelope.format !== 'la-mauvaise-tombe' || envelope.save_version !== SAVE_VERSION) throw new Error('Format de sauvegarde incompatible');
  const saved = envelope.state;
  if (saved?.story_version !== story.version || !Array.isArray(saved.history)) throw new Error('Version du récit incompatible');
  if (saved.history.length > 10000) throw new Error('Historique trop volumineux');
  let replay = newGame(story, saved.run_id, story.kind === 'novel' ? saved.initial_options : {});
  for (const decision of saved.history.filter(e => e.kind === 'choice')) {
    if (decision.scene !== replay.scene_id) throw new Error('Ordre des décisions altéré');
    replay = choose(replay, decision.choice, story);
  }
  if (stable(replay) !== stable(saved)) throw new Error('Sauvegarde altérée : son état ne correspond pas à ses décisions');
  assertInvariants(replay, story);
  return replay;
}
export class SaveStore {
  constructor(storage, story) {
    this.storage = storage; this.story = story;
    this.prefix = story.kind === 'novel' ? `mauvaise-tombe:${story.version}:v1:` : PREFIX;
    this.activeKey = story.kind === 'novel' ? `mauvaise-tombe:${story.version}:active` : 'mauvaise-tombe:active';
  }
  key(id) { return this.prefix + id; }
  load(id) {
    const text = this.storage.getItem(this.key(id));
    return text ? importGame(text, this.story) : null;
  }
  list() {
    const list = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(this.prefix)) continue;
      try {
        const state = this.load(key.slice(this.prefix.length));
        list.push({ id: state.run_id, time: state.story_time, ending: state.ending, revision: state.revision, title: this.story.scenes[state.scene_id].title });
      } catch (error) { list.push({ id: key.slice(this.prefix.length), corrupt: true, error: error.message }); }
    }
    return list.sort((a, b) => b.revision - a.revision || a.id.localeCompare(b.id));
  }
  create(state) {
    if (this.storage.getItem(this.key(state.run_id))) throw new Error('Cette partie existe déjà');
    this.storage.setItem(this.key(state.run_id), exportGame(state));
    this.storage.setItem(this.activeKey, state.run_id);
    return state;
  }
  commit(previous, next) {
    const current = this.load(previous.run_id);
    if (!current || current.revision !== previous.revision || stable(current) !== stable(previous)) throw new Error('La partie a changé dans un autre onglet. Reprenez sa dernière sauvegarde.');
    if (next.run_id !== previous.run_id || next.revision !== previous.revision + 1) throw new Error('Transaction invalide');
    // One setItem replaces the whole snapshot: no half-written action.
    this.storage.setItem(this.key(next.run_id), exportGame(next));
    return next;
  }
  restore(text) {
    const imported = importGame(text, this.story);
    const current = this.load(imported.run_id);
    if (current && stable(current) !== stable(imported)) throw new Error('Cet identifiant existe : importer un ancien embranchement écraserait la partie.');
    if (!current) this.create(imported);
    this.storage.setItem(this.activeKey, imported.run_id);
    return imported;
  }
}
