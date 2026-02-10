/**
 * CafeSynth - 咖啡馆环境音合成器 (混合版本)
 * 
 * 信号链:
 * PinkNoise → BandpassFilter(300-2000Hz) → GainNode(0.3) → Output
 *                                                           ↑
 * 真实杯碟采样 OR 合成音效 (智能回退)
 */

import { NoiseGenerator } from '../utils/NoiseGenerator.js';
import { SampleLoader } from '../utils/SampleLoader.js';
import { BaseSynth } from './BaseSynth.js';

export class CafeSynth extends BaseSynth {
    /**
     * @param {AudioContext} context 
     * @param {Object} options 
     * @param {number} [options.murmurLevel=0.4] - 背景嘈杂声音量
     * @param {number} [options.clinkFrequency=0.15] - 杯碟声频率 (每秒次数)
     * @param {SampleLoader} [options.sampleLoader] - 采样加载器
     */
    constructor(context, options = {}) {
        super(context);

        this.murmurLevel = options.murmurLevel || 0.4;
        this.clinkFrequency = options.clinkFrequency || 0.15;
        this.sampleLoader = options.sampleLoader || null;

        // 背景噪声
        this.noiseGen = null;

        // 带通滤波器 - 模拟人声频率范围
        this.bandpassFilter = context.createBiquadFilter();
        this.bandpassFilter.type = 'bandpass';
        this.bandpassFilter.frequency.value = 800;
        this.bandpassFilter.Q.value = 0.5;

        // 低频增强
        this.lowShelf = context.createBiquadFilter();
        this.lowShelf.type = 'lowshelf';
        this.lowShelf.frequency.value = 300;
        this.lowShelf.gain.value = 3;

        // 背景音量控制
        this.murmurGain = context.createGain();
        this.murmurGain.gain.value = this.murmurLevel;

        // 杯碟声音量
        this.clinkGain = context.createGain();
        this.clinkGain.gain.value = 0.25;

        // 连接节点
        this.bandpassFilter.connect(this.lowShelf);
        this.lowShelf.connect(this.murmurGain);
        this.murmurGain.connect(this.output);
        this.clinkGain.connect(this.output);

        // 杯碟声定时器
        this.clinkTimer = null;
        this.isPlaying = false;

        // 检测采样是否可用
        this.useSamples = false;
    }

    /**
     * 设置采样加载器
     * @param {SampleLoader} loader 
     */
    setSampleLoader(loader) {
        this.sampleLoader = loader;
        this._checkSamplesAvailable();
    }

    /**
     * 检查采样是否可用
     */
    _checkSamplesAvailable() {
        if (!this.sampleLoader) {
            this.useSamples = false;
            return;
        }

        // 检查是否有任何杯碟采样
        const sampleNames = ['cup_clink_1', 'cup_clink_2', 'cup_clink_3', 'spoon_stir'];
        for (const name of sampleNames) {
            if (this.sampleLoader.has(name)) {
                this.useSamples = true;
                console.log('[CafeSynth] Using real samples');
                return;
            }
        }

        this.useSamples = false;
        console.log('[CafeSynth] Using synthesized clinks (no samples found)');
    }

    /**
     * 启动咖啡馆环境音
     */
    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this._checkSamplesAvailable();

        // 创建粉红噪音基底
        this.noiseGen = new NoiseGenerator(this.context, 'pink');
        this.noiseGen.connect(this.bandpassFilter);
        this.noiseGen.start();

        // 启动杯碟声生成
        this._startClinks();

        // 淡入
        this.fadeIn();
    }

    /**
     * 停止咖啡馆环境音
     * @param {number} [fadeTime=1.5] - 淡出时间
     */
    async stop(fadeTime = 1.5) {
        if (!this.isPlaying) return;

        this._stopClinks();
        await this.fadeOut(fadeTime);

        if (this.noiseGen) {
            this.noiseGen.dispose();
            this.noiseGen = null;
        }

        this.isPlaying = false;
    }

    /**
     * 开始生成随机杯碟声
     */
    _startClinks() {
        const generateClink = () => {
            if (!this.isPlaying) return;

            // 随机间隔 4-10秒
            const baseInterval = 1000 / this.clinkFrequency;
            const variation = baseInterval * 0.6;
            const interval = baseInterval + (Math.random() - 0.5) * variation * 2;

            // 创建杯碟声
            this._createClink();

            this.clinkTimer = setTimeout(generateClink, interval);
        };

        // 延迟启动
        this.clinkTimer = setTimeout(generateClink, 2000 + Math.random() * 4000);
    }

    /**
     * 停止杯碟声生成
     */
    _stopClinks() {
        if (this.clinkTimer) {
            clearTimeout(this.clinkTimer);
            this.clinkTimer = null;
        }
    }

    /**
     * 创建杯碟/勺子声
     */
    _createClink() {
        if (this.useSamples) {
            this._playSampleClink();
        } else {
            this._playSynthClink();
        }
    }

    /**
     * 播放真实采样
     */
    _playSampleClink() {
        // 随机选择采样类型
        const sampleNames = [];
        if (this.sampleLoader.has('cup_clink_1')) sampleNames.push('cup_clink_1');
        if (this.sampleLoader.has('cup_clink_2')) sampleNames.push('cup_clink_2');
        if (this.sampleLoader.has('cup_clink_3')) sampleNames.push('cup_clink_3');
        if (this.sampleLoader.has('spoon_stir')) sampleNames.push('spoon_stir');

        if (sampleNames.length === 0) {
            this._playSynthClink();
            return;
        }

        const sampleName = sampleNames[Math.floor(Math.random() * sampleNames.length)];

        // 随机变化
        const volume = 0.3 + Math.random() * 0.4;
        const playbackRate = 0.9 + Math.random() * 0.2;
        const detune = (Math.random() - 0.5) * 100;

        this.sampleLoader.play(sampleName, {
            destination: this.clinkGain,
            volume,
            playbackRate,
            detune
        });
    }

    /**
     * 播放合成杯碟声 (改进版)
     */
    _playSynthClink() {
        const now = this.context.currentTime;

        // 增加混响感的更真实合成
        const isGlass = Math.random() > 0.4;

        // 创建多个泛音层
        const frequencies = isGlass
            ? [3200, 4800, 6400, 8000] // 玻璃
            : [2400, 3600, 4800];      // 陶瓷

        frequencies.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            osc.type = 'sine';

            // 添加轻微频率漂移
            const freqDrift = freq * (1 + (Math.random() - 0.5) * 0.05);
            osc.frequency.setValueAtTime(freqDrift, now);
            osc.frequency.exponentialRampToValueAtTime(freqDrift * 0.85, now + 0.1);

            // 包络
            const envGain = this.context.createGain();
            const volume = (0.15 / (i + 1)) * (0.6 + Math.random() * 0.4);

            envGain.gain.setValueAtTime(0, now);
            envGain.gain.linearRampToValueAtTime(volume, now + 0.003);
            envGain.gain.exponentialRampToValueAtTime(volume * 0.2, now + 0.03);
            envGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + i * 0.02);

            osc.connect(envGain);
            envGain.connect(this.clinkGain);

            osc.start(now);
            osc.stop(now + 0.2 + i * 0.02);

            osc.onended = () => {
                osc.disconnect();
                envGain.disconnect();
            };
        });
    }

    /**
     * 设置背景嘈杂音量
     * @param {number} level - 0-1
     */
    setMurmurLevel(level) {
        this.murmurLevel = Math.max(0, Math.min(1, level));
        this.murmurGain.gain.setValueAtTime(this.murmurLevel, this.context.currentTime);
    }

    /**
     * 释放资源
     */
    dispose() {
        this.stop(0);
        this.bandpassFilter.disconnect();
        this.lowShelf.disconnect();
        this.murmurGain.disconnect();
        this.clinkGain.disconnect();
        super.dispose();
    }
}
