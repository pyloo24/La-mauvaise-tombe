import { fields, validValue } from './model.js';
import { validateCondition } from './conditions.js';
import { validateNovel } from './novel.js';
export function validateStory(story) {
  if (story.kind === 'novel') return validateNovel(story);
  const fail = message => { throw new Error(`Contenu : ${message}`); };
  const exact = (obj, keys, where) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail(`${where} doit être un objet`);
    for (const key of Object.keys(obj)) if (!keys.includes(key)) fail(`${where}.${key} inconnu`);
  };
  const str = (v, where) => { if (typeof v !== 'string' || !v.trim()) fail(`${where} vide`); };
  exact(story, ['version', 'title', 'start', 'initial_events', 'speakers', 'ambiences', 'evidence', 'events', 'scenes'], 'racine');
  str(story.version, 'version'); str(story.title, 'title');
  if (!story.scenes?.[story.start]) fail('scène initiale absente');
  for (const collection of ['speakers', 'ambiences', 'evidence', 'events', 'scenes']) exact(story[collection], Object.keys(story[collection] || {}), collection);
  for (const [id, speaker] of Object.entries(story.speakers)) { exact(speaker, ['label'], id); str(speaker.label, id); }
  for (const [id, ambience] of Object.entries(story.ambiences)) str(ambience, id);
  const schedules = (items, where) => {
    if (!Array.isArray(items)) fail(`${where} doit être une liste`);
    for (const item of items) {
      exact(item, ['event', 'after', 'when', 'key'], where);
      if (!story.events[item.event]) fail(`${where} : événement ${item.event} absent`);
      if (!Number.isSafeInteger(item.after) || item.after < 0 || item.after > 1440) fail(`${where} : durée invalide`);
      str(item.key, `${where}.key`);
      validateCondition(item.when ?? true, where);
    }
  };
  const effects = (items, where) => {
    if (!Array.isArray(items)) fail(`${where} doit être une liste`);
    for (const effect of items) {
      exact(effect, ['op', 'path', 'value', 'id', 'when'], where);
      validateCondition(effect.when ?? true, where);
      if (effect.op === 'set') {
        if (!fields[effect.path] || !validValue(fields[effect.path], effect.value)) fail(`${where} : variable ou valeur invalide ${effect.path}`);
        if (['story_time', 'ending', 'proof.historical', 'proof.modern'].includes(effect.path)) fail(`${where} : variable réservée ${effect.path}`);
        if (effect.id !== undefined) fail(`${where} : id interdit pour set`);
      } else if (effect.op === 'evidence') {
        if (!story.evidence[effect.id]) fail(`${where} : preuve ${effect.id} absente`);
        if (effect.path !== undefined || effect.value !== undefined) fail(`${where} : preuve mal formée`);
      } else if (effect.op === 'learn') {
        str(effect.id, `${where}.id`); str(effect.value, `${where}.value`);
        if (effect.path !== undefined) fail(`${where} : learn mal formé`);
      } else fail(`${where} : effet inconnu ${effect.op}`);
    }
  };
  schedules(story.initial_events, 'initial_events');
  for (const [id, evidence] of Object.entries(story.evidence)) {
    exact(evidence, ['title', 'source', 'strength', 'scope', 'kind', 'preserved', 'available_if'], id);
    str(evidence.title, id); str(evidence.source, id);
    if (!['historical', 'modern', 'emotional'].includes(evidence.scope) || !['copy', 'original', 'testimony', 'observation'].includes(evidence.kind)) fail(`${id} : catégorie invalide`);
    if (!Number.isSafeInteger(evidence.strength) || evidence.strength < 0 || evidence.strength > 3 || typeof evidence.preserved !== 'boolean') fail(`${id} : solidité invalide`);
    validateCondition(evidence.available_if ?? true, id);
  }
  for (const [id, event] of Object.entries(story.events)) {
    exact(event, ['title', 'priority', 'when', 'effects', 'schedule'], id);
    str(event.title, id);
    if (!Number.isSafeInteger(event.priority)) fail(`${id} : priorité invalide`);
    validateCondition(event.when ?? true, id); effects(event.effects, id); schedules(event.schedule ?? [], id);
  }
  const segmentIds = new Set();
  for (const [id, scene] of Object.entries(story.scenes)) {
    exact(scene, ['episode', 'chapter_anchor', 'phase', 'title', 'location', 'synopsis', 'available_if', 'entry_effects', 'segments', 'choices', 'ending'], id);
    str(scene.title, id); str(scene.location, id); str(scene.synopsis, id);
    if (!Number.isInteger(scene.episode) || scene.episode < 1 || scene.episode > 5 || !Number.isInteger(scene.chapter_anchor) || scene.chapter_anchor < 1 || scene.chapter_anchor > 25) fail(`${id} : jalon invalide`);
    if (!fields.phase.enum.includes(scene.phase) || typeof scene.ending !== 'boolean') fail(`${id} : phase ou fin invalide`);
    validateCondition(scene.available_if ?? true, id); effects(scene.entry_effects, id);
    if (!Array.isArray(scene.segments) || !scene.segments.length) fail(`${id} : segments absents`);
    for (const segment of scene.segments) {
      exact(segment, ['id', 'text', 'speaker_id', 'emotion', 'ambience_id', 'pause_ms', 'when', 'sfx'], id);
      str(segment.id, id); str(segment.text, id); str(segment.emotion, id);
      if (segmentIds.has(segment.id)) fail(`segment dupliqué ${segment.id}`); segmentIds.add(segment.id);
      if (!story.speakers[segment.speaker_id] || !Object.hasOwn(story.ambiences, segment.ambience_id)) fail(`${segment.id} : voix ou ambiance inconnue`);
      if (!Number.isSafeInteger(segment.pause_ms) || segment.pause_ms < 0 || segment.pause_ms > 10000) fail(`${segment.id} : pause invalide`);
      if (segment.sfx !== undefined && (!Array.isArray(segment.sfx) || segment.sfx.some(s => !['phone', 'door', 'paper'].includes(s)))) fail(`${segment.id} : bruitage inconnu`);
      validateCondition(segment.when ?? true, segment.id);
    }
    if (!Array.isArray(scene.choices) || (scene.ending ? scene.choices.length !== 0 : !scene.choices.length)) fail(`${id} : choix absents ou fin non terminale`);
    const choiceIds = new Set();
    for (const choice of scene.choices) {
      exact(choice, ['id', 'label', 'hint', 'duration_minutes', 'available_if', 'expires_at', 'effects', 'schedule', 'target', 'finalize'], id);
      str(choice.id, id); str(choice.label, id); str(choice.hint, id);
      if (choiceIds.has(choice.id)) fail(`${id} : choix dupliqué`); choiceIds.add(choice.id);
      if (!Number.isSafeInteger(choice.duration_minutes) || choice.duration_minutes < 1 || choice.duration_minutes > 240) fail(`${id} : durée invalide`);
      if (choice.expires_at !== undefined && (!Number.isSafeInteger(choice.expires_at) || choice.expires_at < 0)) fail(`${id} : échéance invalide`);
      if (choice.finalize !== undefined && typeof choice.finalize !== 'boolean') fail(`${id} : finalize invalide`);
      if (choice.finalize ? choice.target !== '$ending' : !story.scenes[choice.target]) fail(`${id} : destination absente ${choice.target}`);
      validateCondition(choice.available_if ?? true, id); effects(choice.effects, id); schedules(choice.schedule, id);
    }
  }
  for (const key of ['justice', 'tragic', 'truth', 'impunity']) if (!story.scenes[`END_${key}`]?.ending) fail(`fin ${key} absente`);
  return { scenes: Object.keys(story.scenes).length, events: Object.keys(story.events).length, segments: segmentIds.size };
}
