/**
 * AudioEngine - Stay 音频引擎主控制器
 * 
 * 基于完整录音文件的环境音播放
 * 支持每个场景多个音频文件随机播放
 */

import { AudioAnalyzer } from './utils/AudioAnalyzer.js';
import { CafePlayer } from './utils/CafePlayer.js';
import { LoopPlayer } from './utils/LoopPlayer.js';
import { WindPlayer } from './utils/WindPlayer.js';

/**
 * @typedef {'rain' | 'cafe' | 'wind'} SceneType
 */

/**
 * @typedef {Object} AudioAnalysisData
 * @property {number} lowFrequency - 低频能量 (0-1)
 * @property {number} midFrequency - 中频峰值 (0-1)
 * @property {number} highFrequency - 高频变化 (0-1)
 * @property {number} volume - 总音量 (0-1)
 */

/**
 * @typedef {Object} SceneConfig
 * @property {string[]} files - 音频文件路径列表
 * @property {number} [crossfadeDuration=2] - 交叉淡化时间
 */

/**
 * 默认场景配置
 * @type {Object.<SceneType, SceneConfig>}
 */
const DEFAULT_SCENES = {
    rain: {
        files: [
            'src/audio/loops/rain/gentle-rain-from-window.mp3',
            'src/audio/loops/rain/rain-and-birds.mp3',
            'src/audio/loops/rain/rain-on-concrete-sound-30331.mp3',
        ],
        crossfadeDuration: 3
    },
    cafe: {
        type: 'cafe', // 使用专用 CafePlayer
        ambience: 'src/audio/loops/coffee/people-talking-at-cafe-ambience.mp3',
        sfx: [
            'src/audio/loops/coffee/cup_spoon_hotwater.mp3',
            'src/audio/loops/coffee/glass-cup-set-down71326.mp3',
            'src/audio/loops/coffee/coffee-pouring-into-a-cup.mp3',
            'src/audio/loops/coffee/teacup-clink-sfx-单次.mp3',
        ],
        sfxInterval: 6,
    },
    wind: {
        type: 'wind', // 使用专用 WindPlayer
        softWindFiles: [
            'src/audio/loops/wind/storegraphic-soft-wind-314945.mp3',
            'src/audio/loops/wind/storegraphic-soft-wind-316392.mp3',
            'src/audio/loops/wind/storegraphic-soft-wind-477404.mp3',
            'src/audio/loops/wind/storegraphic-soft-wind-leaves-316393.mp3',
        ],
        synthMix: 0.35,      // 合成风声比例
        recordingMix: 0.65,  // 录音风声比例
        crossfadeDuration: 4
    }
};

export class AudioEngine {
    /**
     * @param {Object} options
     * @param {number} [options.defaultVolume=0.7] - 默认音量
     * @param {number} [options.crossfadeDuration=1.5] - 场景切换淡入淡出时间 (秒)
     * @param {Object.<SceneType, SceneConfig>} [options.scenes] - 自定义场景配置
     */
    constructor(options = {}) {
        this.options = {
            defaultVolume: 0.7,
            crossfadeDuration: 1.5,
            scenes: { ...DEFAULT_SCENES, ...options.scenes },
            ...options
        };

        /** @type {AudioContext | null} */
        this.audioContext = null;

        /** @type {GainNode | null} */
        this.masterGain = null;

        /** @type {AudioAnalyzer | null} */
        this.analyzer = null;

        /** @type {Map<SceneType, LoopPlayer>} */
        this.players = new Map();

        /** @type {LoopPlayer | null} */
        this.currentPlayer = null;

        /** @type {SceneType | null} */
        this.currentScene = null;

        /** @type {boolean} */
        this.isInitialized = false;

        /** @type {boolean} */
        this.isPlaying = false;

        /** @type {number | null} */
        this.animationFrameId = null;

        /** @type {Map<SceneType, boolean>} */
        this.loadingStatus = new Map();
    }

    /**
     * 初始化音频引擎
     * @returns {Promise<void>}
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // 创建音频上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // 创建主音量节点
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.options.defaultVolume;

            // 创建分析器
            this.analyzer = new AudioAnalyzer(this.audioContext, {
                fftSize: 2048,
                smoothingTimeConstant: 0.85
            });

            // 连接音频路径
            this.masterGain.connect(this.analyzer.getInput());
            this.analyzer.getOutput().connect(this.audioContext.destination);

            // 启动分析循环
            this._startAnalysisLoop();

            this.isInitialized = true;

            console.log('[AudioEngine] Initialized');

            // 异步预加载所有场景
            this._preloadScenes();

        } catch (error) {
            console.error('[AudioEngine] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * 预加载所有场景
     */
    async _preloadScenes() {
        const scenes = Object.keys(this.options.scenes);

        for (const scene of scenes) {
            this._loadScene(scene);
        }
    }

    /**
     * 加载单个场景
     * @param {SceneType} scene 
     */
    async _loadScene(scene) {
        if (this.players.has(scene)) return;

        const config = this.options.scenes[scene];
        if (!config) {
            console.warn(`[AudioEngine] No config for scene: ${scene}`);
            return;
        }

        this.loadingStatus.set(scene, true);

        let player;

        try {
            // 咖啡馆使用专用播放器
            if (config.type === 'cafe') {
                player = new CafePlayer(this.audioContext, {
                    ambienceUrl: config.ambience,
                    sfxUrls: config.sfx || [],
                    sfxInterval: config.sfxInterval || 8
                });
                await player.load();
            } else if (config.type === 'wind') {
                // 风声使用专用播放器（混合录音与合成）
                player = new WindPlayer(this.audioContext, {
                    softWindUrls: config.softWindFiles || [],
                    synthMix: config.synthMix ?? 0.35,
                    recordingMix: config.recordingMix ?? 0.65,
                    crossfadeDuration: config.crossfadeDuration || 4
                });
                await player.load();
            } else {
                // 其他场景使用通用 LoopPlayer
                if (!config.files || config.files.length === 0) {
                    console.warn(`[AudioEngine] No files for scene: ${scene}`);
                    return;
                }
                player = new LoopPlayer(this.audioContext, {
                    crossfadeDuration: config.crossfadeDuration || 2
                });
                await player.load(config.files);
            }

            player.connect(this.masterGain);
            this.players.set(scene, player);
            console.log(`[AudioEngine] Scene loaded: ${scene}`);
        } catch (error) {
            console.error(`[AudioEngine] Failed to load scene ${scene}:`, error);
        }

        this.loadingStatus.set(scene, false);
    }

    /**
     * 检查场景是否已加载
     * @param {SceneType} scene 
     * @returns {boolean}
     */
    isSceneLoaded(scene) {
        return this.players.has(scene) && this.players.get(scene).isLoaded;
    }

    /**
     * 播放指定场景
     * @param {SceneType} scene 
     */
    async play(scene) {
        if (!this.isInitialized) {
            console.warn('[AudioEngine] Not initialized');
            return;
        }

        // 如果正在播放相同场景
        if (this.currentScene === scene && this.isPlaying) {
            return;
        }

        // 确保场景已加载
        if (!this.isSceneLoaded(scene)) {
            console.log(`[AudioEngine] Loading scene: ${scene}`);
            await this._loadScene(scene);

            if (!this.isSceneLoaded(scene)) {
                console.error(`[AudioEngine] Scene not available: ${scene}`);
                return;
            }
        }

        // 停止当前
        if (this.currentPlayer) {
            this.currentPlayer.stop(0);
        }

        // 播放新场景
        const player = this.players.get(scene);
        player.start();

        this.currentPlayer = player;
        this.currentScene = scene;
        this.isPlaying = true;

        console.log(`[AudioEngine] Playing: ${scene}`);
    }

    /**
     * 停止播放
     * @param {number} [fadeTime=1.5] 
     */
    async stop(fadeTime = this.options.crossfadeDuration) {
        if (!this.isPlaying || !this.currentPlayer) return;

        await this.currentPlayer.stop(fadeTime);

        this.currentPlayer = null;
        this.currentScene = null;
        this.isPlaying = false;

        console.log('[AudioEngine] Stopped');
    }

    /**
     * 切换场景（带交叉淡化）
     * @param {SceneType} scene 
     * @param {number} [fadeTime=1.5] 
     */
    async switchScene(scene, fadeTime = this.options.crossfadeDuration) {
        if (!this.isInitialized) {
            console.warn('[AudioEngine] Not initialized');
            return;
        }

        if (this.currentScene === scene) return;

        // 确保新场景已加载
        if (!this.isSceneLoaded(scene)) {
            await this._loadScene(scene);
            if (!this.isSceneLoaded(scene)) {
                console.error(`[AudioEngine] Scene not available: ${scene}`);
                return;
            }
        }

        const oldPlayer = this.currentPlayer;
        const newPlayer = this.players.get(scene);

        // 开始新场景
        newPlayer.start();

        this.currentPlayer = newPlayer;
        this.currentScene = scene;
        this.isPlaying = true;

        // 淡出旧场景
        if (oldPlayer) {
            oldPlayer.stop(fadeTime);
        }

        console.log(`[AudioEngine] Switched to: ${scene}`);
    }

    /**
     * 设置主音量
     * @param {number} value - 0-1
     * @param {number} [rampTime=0.1] 
     */
    setVolume(value, rampTime = 0.1) {
        if (!this.masterGain || !this.audioContext) return;

        const clampedValue = Math.max(0, Math.min(1, value));
        const now = this.audioContext.currentTime;

        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(clampedValue, now + rampTime);
    }

    /**
     * 获取当前音量
     * @returns {number}
     */
    getVolume() {
        return this.masterGain ? this.masterGain.gain.value : 0;
    }

    /**
     * 获取音频分析数据
     * @returns {AudioAnalysisData}
     */
    getAudioData() {
        if (!this.analyzer) {
            return { lowFrequency: 0, midFrequency: 0, highFrequency: 0, volume: 0 };
        }
        return this.analyzer.getData();
    }

    /**
     * 获取当前场景
     * @returns {SceneType | null}
     */
    getCurrentScene() {
        return this.currentScene;
    }

    /**
     * 检查是否正在播放
     * @returns {boolean}
     */
    getIsPlaying() {
        return this.isPlaying;
    }

    /**
     * 启动分析循环
     */
    _startAnalysisLoop() {
        const loop = () => {
            if (this.analyzer && this.isPlaying) {
                this.analyzer.update();
            }
            this.animationFrameId = requestAnimationFrame(loop);
        };
        loop();
    }

    /**
     * 停止分析循环
     */
    _stopAnalysisLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * 暂停
     */
    async suspend() {
        if (this.audioContext?.state === 'running') {
            await this.audioContext.suspend();
        }
    }

    /**
     * 恢复
     */
    async resume() {
        if (this.audioContext?.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * 销毁
     */
    destroy() {
        this._stopAnalysisLoop();

        // 停止并清理所有播放器
        this.players.forEach(player => {
            player.stop(0);
            player.dispose();
        });
        this.players.clear();

        if (this.analyzer) {
            this.analyzer.dispose();
            this.analyzer = null;
        }

        if (this.masterGain) {
            this.masterGain.disconnect();
            this.masterGain = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.isInitialized = false;
        this.isPlaying = false;
        this.currentScene = null;
        this.currentPlayer = null;

        console.log('[AudioEngine] Destroyed');
    }

    /**
     * 获取可用场景
     * @returns {SceneType[]}
     */
    getAvailableScenes() {
        return Object.keys(this.options.scenes);
    }

    /**
     * 动态添加场景配置
     * @param {SceneType} scene 
     * @param {SceneConfig} config 
     */
    addScene(scene, config) {
        this.options.scenes[scene] = config;
        // 如果已初始化，立即加载
        if (this.isInitialized) {
            this._loadScene(scene);
        }
    }
}

export function createAudioEngine(options) {
    return new AudioEngine(options);
}
