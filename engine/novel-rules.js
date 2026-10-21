export const choices = {
  copies_precoces:['oui','non'], fuite:['oui','non'], premier:['suzanne','garage','mairie'],
  aveu:['oui','non'], billets:['conserves','absents'], mazet_engage:['oui','non'],
  chassaing_action:['partir','finir_copie'], images_fete:['conservees','absentes'],
  karim_action:['ecouter','transmettre','avertir'], strategie:['camion','registre','valette'],
  protection_mazet:['immediate','apres_tri','aucune'], piste_brune:['discrete','elargie'],
  expertise:['complementaire','limitee'], approche_laurent:['directe','valette'],
  laurent_action:['proteger','transmettre','laisser'], trace_brune:['complete','limitee'],
  protection_brune:['effective','quitter'], participation_brune:['oui','non'],
  alerte_roussel:['retenue','prematuree'], telephone_action:['signaler','copier','suivre'],
  sauvetage:['personne','boite','attendre'], confrontation:['encadree','marche']
};
export const derivedDomains = {
  suzanne:['protegee','morte'], chassaing:['protege','mort'], statut_laurent:['protege','retenu','libre'], telephone:['saisi','copie','perdu'], identite:['confirmee','en_cours'],
  mazet_final:['vivant','mort'], brune18:['presente','refuse','fuit','morte'],
  boite:['complete','partielle','detruite'], laurent_final:['vivant','mort'],
  roussel23:['arrete','fuite'], cecile24:['arretee','libre','fuite'],
  fin:['justice','verite','tragique','impunite'], pere_brune:['etaye','partiel','inaccessible'],
  jeanne_lien:['proche','distance']
};
export const domains={...choices,...derivedDomains};
export const defaults={
  copies_precoces:'oui',fuite:'non',premier:'suzanne',aveu:'oui',billets:'conserves',
  mazet_engage:'oui',chassaing_action:'partir',images_fete:'conservees',karim_action:'ecouter',
  strategie:'registre',protection_mazet:'immediate',piste_brune:'discrete',
  expertise:'complementaire',approche_laurent:'valette',laurent_action:'proteger',
  trace_brune:'complete',protection_brune:'effective',participation_brune:'oui',
  alerte_roussel:'retenue',telephone_action:'signaler',sauvetage:'attendre',confrontation:'encadree'
};
export function derive(input={}) {
  for(const [key,value] of Object.entries(input)) {
    if(!(key in choices))throw new Error(`Décision inconnue ou issue calculée : ${key}`);
    if(!choices[key].includes(value))throw new Error(`Valeur invalide : ${key}=${value}`);
  }
  const s={...defaults,...input};
  if(s.strategie==='registre'&&s.mazet_engage!=='oui')throw new Error('Le registre exige l’accord et l’accès de Mazet au chapitre 8.');
  s.chassaing=s.chassaing_action==='partir'?'protege':'mort';
  s.statut_laurent={proteger:'protege',transmettre:'retenu',laisser:'libre'}[s.laurent_action];
  s.telephone={signaler:'saisi',copier:'copie',suivre:'perdu'}[s.telephone_action];
  s.suzanne=s.premier==='suzanne'?'protegee':'morte';
  s.identite=s.expertise==='complementaire'?'confirmee':'en_cours';
  s.mazet_final=s.strategie==='registre'&&(s.protection_mazet==='aucune'||s.protection_mazet==='apres_tri'&&s.fuite==='oui')?'mort':'vivant';
  s.brune18=s.protection_brune==='effective'?(s.participation_brune==='oui'?'presente':'refuse'):(s.piste_brune==='elargie'?'morte':'fuit');
  s.boite={personne:'detruite',boite:'complete',attendre:'partielle'}[s.sauvetage];
  s.laurent_final=s.statut_laurent==='libre'&&s.sauvetage==='boite'?'mort':'vivant';
  s.roussel23=s.alerte_roussel==='retenue'&&(s.telephone!=='perdu'||s.strategie==='camion')?'arrete':'fuite';
  const dossierEtaye=s.telephone==='saisi'&&(s.boite!=='detruite'||s.roussel23==='arrete')||s.boite==='complete'&&s.telephone==='copie'&&s.roussel23==='arrete';
  s.cecile24=s.confrontation==='marche'?'fuite':dossierEtaye?'arretee':'libre';
  const veriteEtayee=s.identite==='confirmee'||s.trace_brune==='complete'||s.chassaing==='protege'&&s.suzanne==='protegee';
  const mortMajeure=s.suzanne==='morte'||s.chassaing==='mort'||s.mazet_final==='mort'||s.brune18==='morte'||s.sauvetage==='boite';
  s.fin=s.cecile24==='arretee'?(mortMajeure?'tragique':'justice'):(veriteEtayee?'verite':'impunite');
  s.pere_brune=s.billets==='conserves'?'etaye':s.boite==='complete'?'partiel':'inaccessible';
  s.jeanne_lien=s.aveu==='oui'?'proche':'distance';
  return s;
}

// Only expose consequences whose inputs have actually been decided.
export const dependencies = {
  suzanne: ['premier'], chassaing: ['chassaing_action'], statut_laurent: ['laurent_action'],
  telephone: ['telephone_action'], identite: ['expertise'],
  mazet_final: ['strategie', 'protection_mazet', 'fuite'],
  brune18: ['protection_brune', 'participation_brune', 'piste_brune'],
  boite: ['sauvetage'], laurent_final: ['statut_laurent', 'sauvetage'],
  roussel23: ['alerte_roussel', 'telephone', 'strategie'],
  cecile24: ['confrontation', 'telephone', 'boite', 'roussel23'],
  fin: ['cecile24', 'identite', 'trace_brune', 'chassaing', 'suzanne', 'mazet_final', 'brune18', 'sauvetage'],
  pere_brune: ['billets', 'boite'], jeanne_lien: ['aveu']
};
export function derivePartial(decisions) {
  const safe = { ...decisions };
  if (safe.mazet_engage === 'non' && !safe.strategie) safe.strategie = 'camion';
  const complete = derive(safe), result = { ...decisions };
  for (const [key, inputs] of Object.entries(dependencies)) if (inputs.every(input => Object.hasOwn(result, input))) result[key] = complete[key];
  return result;
}
export function novelMatches(condition, variables, strict = true) {
  if (condition === 'Commun' || condition === true) return true;
  return condition.split('&').every(raw => {
    const match = raw.trim().match(/^([a-z0-9_]+)(=|!=)([a-z0-9_\/]+)$/);
    if (!match) throw new Error(`Condition du roman invalide : ${condition}`);
    const [, key, op, values] = match;
    if (!Object.hasOwn(variables, key)) { if (strict) throw new Error(`Décision encore inconnue : ${key}`); return false; }
    const found = values.split('/').includes(variables[key]); return op === '=' ? found : !found;
  });
}
