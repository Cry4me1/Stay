/**
 * Stay Audio Engine
 * 
 * 完全基于代码合成的环境音引擎
 * 提供三种环境音：雨声、咖啡馆、风声
 * 实时输出频谱数据用于驱动视觉动画
 */

export { AudioEngine, createAudioEngine } from './AudioEngine.js';
export { BaseSynth } from './synthesizers/BaseSynth.js';
export { CafeSynth } from './synthesizers/CafeSynth.js';
export { RainSynth } from './synthesizers/RainSynth.js';
export { WindSynth } from './synthesizers/WindSynth.js';
export { AudioAnalyzer } from './utils/AudioAnalyzer.js';
export { NoiseGenerator, createBrownNoise, createPinkNoise, createWhiteNoise } from './utils/NoiseGenerator.js';
export { SampleLoader } from './utils/SampleLoader.js';
export { WindPlayer } from './utils/WindPlayer.js';

