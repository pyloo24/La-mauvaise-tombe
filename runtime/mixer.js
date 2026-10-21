import { defaultMix } from './sound-library.js';
import { effectStart, isTimedAmbience, soundLength } from './sound-timing.js';
const bounded=value=>Math.max(0,Math.min(1,Number(value)||0));
export const ambienceDucking = (layer, mix, voiceGain = 1) => (mix.voice ?? 1) > 0 && voiceGain > 0 ? bounded(layer.ducking ?? mix.ducking) : 1;

// Independent buses keep replacements, voice takes and the timing direction separate.
export class Mixer {
  constructor(soundscape={},onWarning) {
    this.assets=soundscape.assets||{};this.mix={...defaultMix,...soundscape.mix};
    this.volume=.85;this.level=1;this.effectLevel=1;this.voiceGain=1;
    this.layers=new Map();this.timedLayers=new Set();this.retiring=new Set();this.effects=new Set();this.currentTracks=new Set();this.buffers=new Map();this.voiceBuffers=new Map();this.epoch=0;
    this.speaking=false;this.silent=false;
    this.onWarning=onWarning;this.warned=new Set();
  }
  async resume() {
    if(!this.context) {
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      const ctx=this.context=new AudioContext();
      this.master=ctx.createGain();this.background=ctx.createGain();this.foley=ctx.createGain();this.voice=ctx.createGain();
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.15;
      this.background.connect(this.master);this.foley.connect(this.master);this.voice.connect(this.master);
      this.master.connect(limiter).connect(ctx.destination);
    }
    if(this.media&&!this.mediaSource) {this.mediaSource=this.context.createMediaElementSource(this.media);this.mediaSource.connect(this.voice);}
    await this.context.resume();this.updateGains();
  }
  attach(audio) {this.media=audio.native||audio;}
  get routed() {return Boolean(this.mediaSource);}
  ramp(node,value,seconds=.08) {
    if(!node||!this.context)return;
    const param=node.gain,time=this.context.currentTime;
    if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(time);
    else{param.cancelScheduledValues(time);param.setValueAtTime(param.value,time);}
    param.linearRampToValueAtTime(value,time+Math.max(.005,seconds));
  }
  updateGains() {
    this.ramp(this.master,this.volume);
    this.ramp(this.voice,this.mix.voice*this.voiceGain);
    this.ramp(this.background,this.silent?0:this.mix.ambience*this.level);
    for(const track of new Set([...this.layers.values(),...this.timedLayers,...this.retiring]))this.ramp(track.duckGain,this.speaking?ambienceDucking(track,this.mix,this.voiceGain):1);
    this.ramp(this.foley,this.silent?0:this.mix.effects*this.effectLevel);
  }
  setVolume(value){this.volume=bounded(value);this.updateGains();}
  setLevel(value){this.level=bounded(value);this.updateGains();}
  setEffects(value){this.effectLevel=bounded(value);this.updateGains();}
  setSpeaking(value){this.speaking=value;this.updateGains();}
  setVoiceGain(value){this.voiceGain=bounded(value);this.updateGains();}
  prepareVoice(){
    if(!this.context||!this.voice)return;
    // A new take starts at its chosen level, including after a muted take.
    const at=this.context.currentTime;this.voice.gain.cancelScheduledValues(at);
    this.voice.gain.setValueAtTime(this.mix.voice*this.voiceGain,at);
  }
  setSilence(value){this.silent=value;this.updateGains();}
  pause(){return this.context?.suspend().catch(()=>{});}
  async voiceBuffer(url){
    const context=this.context;if(!context)throw new Error('Mixage indisponible');
    if(this.voiceBuffers.has(url)){const cached=this.voiceBuffers.get(url);this.voiceBuffers.delete(url);this.voiceBuffers.set(url,cached);return cached;}
    const pending=fetch(url).then(response=>{if(!response.ok)throw new Error('Prise indisponible');return response.arrayBuffer();}).then(bytes=>context.decodeAudioData(bytes)).catch(error=>{if(this.voiceBuffers.get(url)===pending)this.voiceBuffers.delete(url);throw error;});
    this.voiceBuffers.set(url,pending);while(this.voiceBuffers.size>3)this.voiceBuffers.delete(this.voiceBuffers.keys().next().value);
    return pending;
  }
  async buffer(id) {
    const url=this.assets[id]?.url,context=this.context;if(!url||!context)return null;
    if(!this.buffers.has(url)) {
      const pending=fetch(url).then(response=>{if(!response.ok)throw new Error('Son indisponible');return response.arrayBuffer();}).then(bytes=>context.decodeAudioData(bytes)).catch(()=>{this.buffers.delete(url);if(this.context===context&&!this.warned.has(url)){this.warned.add(url);this.onWarning?.(`Le son « ${this.assets[id].label||id} » ne peut pas être lu dans ce navigateur. Essayez un remplacement WAV ou MP3.`);}return null;});
      this.buffers.set(url,pending);
    }
    return this.buffers.get(url);
  }
  release(track,fade=0) {
    this.retiring.add(track);
    this.ramp(track.gain,0,fade);
    try{track.source.stop(this.context.currentTime+Math.max(.01,fade));}catch{}
  }
  async begin(entry,{elapsed=0,continuousElapsed=elapsed}={}) {
    const epoch=++this.epoch;this.preparedEffects=[];this.preparedLayers=[];this.currentTracks=new Set();this.setSilence(false);this.setVoiceGain(entry.voiceGain);
    if(!this.context)return;
    const requests=[...entry.layers,...entry.effects];
    const decoded=await Promise.all(requests.map(async item=>[item.assetId,await this.buffer(item.assetId)]));
    if(epoch!==this.epoch)return;
    const buffers=new Map(decoded),continuous=entry.layers.filter(layer=>!isTimedAmbience(layer)),wanted=new Set(continuous.map(layer=>layer.assetId));
    for(const [id,track]of this.layers)if(!wanted.has(id)){this.release(track,track.fadeOut);this.layers.delete(id);}
    for(const layer of continuous) {
      // A timed continuation owns this ambience until its scheduled end.
      if([...this.timedLayers].some(track=>track.assetId===layer.assetId&&track.endAt>this.context.currentTime))continue;
      const old=this.layers.get(layer.assetId);
      if(old){old.fadeOut=layer.fadeOut;old.ducking=layer.ducking;this.ramp(old.duckGain,this.speaking?ambienceDucking(old,this.mix,this.voiceGain):1);if(old.target!==layer.gain){this.ramp(old.gain,layer.gain,Math.max(layer.fadeIn,this.mix.crossfade));old.target=layer.gain;}continue;}
      const buffer=buffers.get(layer.assetId);if(!buffer)continue;
      const source=this.context.createBufferSource(),gain=this.context.createGain(),duckGain=this.context.createGain();source.buffer=buffer;source.loop=true;
      const fade=Math.max(layer.fadeIn,this.mix.crossfade);
      gain.gain.value=fade===0?layer.gain:continuousElapsed>0?layer.gain*Math.min(1,continuousElapsed/fade):0;duckGain.gain.value=this.speaking?ambienceDucking(layer,this.mix,this.voiceGain):1;source.connect(gain).connect(duckGain).connect(this.background);
      const track={source,gain,duckGain,ducking:layer.ducking,fadeOut:layer.fadeOut,target:layer.gain};this.layers.set(layer.assetId,track);
      source.onended=()=>{this.retiring.delete(track);source.disconnect();gain.disconnect();duckGain.disconnect();};
      source.start(this.context.currentTime,continuousElapsed%buffer.duration);if(continuousElapsed<fade)this.ramp(gain,layer.gain,fade-continuousElapsed);
    }
    this.preparedEffects=entry.effects.map(cue=>({cue,buffer:buffers.get(cue.assetId)}));
    this.preparedLayers=entry.layers.filter(isTimedAmbience).map(cue=>({cue,buffer:buffers.get(cue.assetId)}));
  }
  envelope(gain,cue,length,skipped,at){
    const fadeIn=Math.min(cue.fadeIn,length/2),fadeOut=Math.min(cue.fadeOut,length/2);
    const level=skipped<fadeIn?cue.gain*skipped/fadeIn:fadeOut>0&&skipped>length-fadeOut?cue.gain*(length-skipped)/fadeOut:cue.gain;
    gain.gain.setValueAtTime(level,at);
    if(skipped<fadeIn)gain.gain.linearRampToValueAtTime(cue.gain,at+fadeIn-skipped);
    if(skipped<length-fadeOut)gain.gain.setValueAtTime(cue.gain,at+length-fadeOut-skipped);
    gain.gain.linearRampToValueAtTime(0,at+length-skipped);
  }
  cueEffects(duration,elapsed=0) {
    if(!this.context)return;
    for(const {cue,buffer}of this.preparedEffects||[]) {
      if(!buffer)continue;
      const start=effectStart(cue,duration),length=soundLength(cue,buffer,'effects'),skipped=Math.max(0,elapsed-start);
      if(skipped>=length)continue;
      const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;
      source.connect(gain).connect(this.foley);
      const at=this.context.currentTime+Math.max(0,start-elapsed),endAt=at+length-skipped;
      this.envelope(gain,cue,length,skipped,at);
      const track={source,gain,endAt};this.effects.add(track);this.currentTracks.add(track);
      source.onended=()=>{this.effects.delete(track);this.currentTracks.delete(track);source.disconnect();gain.disconnect();};source.start(at,skipped);source.stop(endAt);
    }
    for(const {cue,buffer}of this.preparedLayers||[]) {
      if(!buffer)continue;
      const start=cue.offset||0,length=cue.duration,skipped=Math.max(0,elapsed-start);
      if(skipped>=length)continue;
      const source=this.context.createBufferSource(),gain=this.context.createGain(),duckGain=this.context.createGain();
      source.buffer=buffer;source.loop=true;source.connect(gain).connect(duckGain).connect(this.background);
      const at=this.context.currentTime+Math.max(0,start-elapsed),endAt=at+length-skipped;
      this.envelope(gain,cue,length,skipped,at);
      duckGain.gain.value=this.speaking?ambienceDucking(cue,this.mix,this.voiceGain):1;
      const track={source,gain,duckGain,assetId:cue.assetId,ducking:cue.ducking,endAt};this.timedLayers.add(track);this.currentTracks.add(track);
      source.onended=()=>{this.timedLayers.delete(track);this.currentTracks.delete(track);source.disconnect();gain.disconnect();duckGain.disconnect();};source.start(at,skipped%buffer.duration);source.stop(endAt);
    }
  }
  clearEffects(clearPrepared=true){
    const tracks=clearPrepared?new Set([...this.effects,...this.timedLayers]):this.currentTracks;
    for(const track of tracks){try{track.source.stop();}catch{}this.effects.delete(track);this.timedLayers.delete(track);}
    this.currentTracks.clear();if(clearPrepared){this.preparedEffects=[];this.preparedLayers=[];}
  }
  tailRemaining(){return this.context?Math.max(0,...[...this.effects,...this.timedLayers].map(track=>track.endAt-this.context.currentTime)):0;}
  finish(){this.epoch++;this.clearEffects();for(const track of this.layers.values())this.release(track,track.fadeOut);this.layers.clear();this.setSpeaking(false);}
  stop(){this.epoch++;this.clearEffects();for(const track of new Set([...this.layers.values(),...this.retiring]))this.release(track,.03);this.layers.clear();this.silent=false;this.speaking=false;this.updateGains();}
  async close(){this.stop();const context=this.context;this.context=null;this.buffers.clear();this.voiceBuffers.clear();if(context&&context.state!=='closed')await context.close();}
}
