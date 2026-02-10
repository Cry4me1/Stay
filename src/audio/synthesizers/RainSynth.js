/**
 * RainSynth - 雨声合成器 (混合版本)
 * 
 * 信号链:
 * WhiteNoise → LowpassFilter(800Hz) → GainNode → Output
 *                                        ↑
 * 真实雨滴采样 OR 合成脉冲 (智能回退)
 */

import { NoiseGenerator } from '../utils/NoiseGenerator.js';
import { SampleLoader } from '../utils/SampleLoader.js';
import { BaseSynth } from './BaseSynth.js';

export class RainSynth extends BaseSynth {
    /**
     * @param {AudioContext} context 
     * @param {Object} options 
     * @param {number} [options.filterFrequency=800] - 低通滤波截止频率
     * @param {number} [options.dropIntensity=0.5] - 雨滴强度 (0-1)
     * @param {SampleLoader} [options.sampleLoader] - 采样加载器
     */
    constructor(context, options = {}) {
        super(context);

        this.filterFrequency = options.filterFrequency || 800;
        this.dropIntensity = options.dropIntensity || 0.5;
        this.sampleLoader = options.sampleLoader || null;

        // 基底噪声
        this.noiseGen = null;

        // 滤波器
        this.lowpassFilter = context.createBiquadFilter();
        this.lowpassFilter.type = 'lowpass';
        this.lowpassFilter.frequency.value = this.filterFrequency;
        this.lowpassFilter.Q.value = 1;

        // 基底音量
        this.baseGain = context.createGain();
        this.baseGain.gain.value = 0.4;

        // 雨滴层
        this.dropsGain = context.createGain();
        this.dropsGain.gain.value = 0.4;

        // 连接节点
        this.lowpassFilter.connect(this.baseGain);
        this.baseGain.connect(this.output);
        this.dropsGain.connect(this.output);

        // 雨滴定时器
        this.dropTimer = null;
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

        // 检查是否有任何雨滴采样
        for (let i = 1; i <= 5; i++) {
            if (this.sampleLoader.has(`raindrop_${i}`)) {
                this.useSamples = true;
                console.log('[RainSynth] Using real samples');
                return;
            }
        }

        this.useSamples = false;
        console.log('[RainSynth] Using synthesized drops (no samples found)');
    }

    /**
     * 启动雨声
     */
    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this._checkSamplesAvailable();

        // 创建白噪音基底
        this.noiseGen = new NoiseGenerator(this.context, 'white');
        this.noiseGen.connect(this.lowpassFilter);
        this.noiseGen.start();

        // 启动雨滴生成
        this._startDrops();

        // 淡入
        this.fadeIn();
    }

    /**
     * 停止雨声
     * @param {number} [fadeTime=1.5] - 淡出时间
     */
    async stop(fadeTime = 1.5) {
        if (!this.isPlaying) return;

        // 停止生成新雨滴
        this._stopDrops();

        // 淡出
        await this.fadeOut(fadeTime);

        // 停止噪声
        if (this.noiseGen) {
            this.noiseGen.dispose();
            this.noiseGen = null;
        }

        this.isPlaying = false;
    }

    /**
     * 开始生成随机雨滴
     */
    _startDrops() {
        const generateDrop = () => {
            if (!this.isPlaying) return;

            // 随机间隔 80-300ms (更自然的间隔)
            const minInterval = 80 * (1 - this.dropIntensity * 0.4);
            const maxInterval = 300 * (1 - this.dropIntensity * 0.3);
            const interval = minInterval + Math.random() * (maxInterval - minInterval);

            // 创建雨滴声
            this._createDrop();

            // 安排下一个雨滴
            this.dropTimer = setTimeout(generateDrop, interval);
        };

        generateDrop();
    }

    /**
     * 停止雨滴生成
     */
    _stopDrops() {
        if (this.dropTimer) {
            clearTimeout(this.dropTimer);
            this.dropTimer = null;
        }
    }

    /**
     * 创建单个雨滴声
     */
    _createDrop() {
        if (this.useSamples) {
            this._playSampleDrop();
        } else {
            this._playSynthDrop();
        }
    }

    /**
     * 播放真实采样雨滴
     */
    _playSampleDrop() {
        const sampleName = this.sampleLoader.getRandomVariant('raindrop', 5);
        if (!sampleName) {
            this._playSynthDrop();
            return;
        }

        // 随机变化
        const volume = 0.3 + Math.random() * 0.4 * this.dropIntensity;
        const playbackRate = 0.8 + Math.random() * 0.4; // 0.8-1.2
        const detune = (Math.random() - 0.5) * 200; // -100 to +100 cents

        this.sampleLoader.play(sampleName, {
            destination: this.dropsGain,
            volume,
            playbackRate,
            detune
        });
    }

    /**
     * 播放合成雨滴 (改进版)
     */
    _playSynthDrop() {
        const now = this.context.currentTime;

        // 更自然的雨滴：使用更短的脉冲和更平滑的包络
        const duration = 0.01 + Math.random() * 0.015; // 10-25ms
        const bufferSize = Math.floor(this.context.sampleRate * duration);
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);

        // 更自然的包络曲线
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            // 快速起音，平滑衰减
            const envelope = Math.exp(-t * 8) * (1 - Math.exp(-t * 50));
            data[i] = (Math.random() * 2 - 1) * envelope;
        }

        const source = this.context.createBufferSource();
        source.buffer = buffer;

        // 带通滤波使声音更清脆
        const filter = this.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 3000 + Math.random() * 2000;
        filter.Q.value = 2;

        const dropGain = this.context.createGain();
        const volume = 0.15 + Math.random() * 0.25 * this.dropIntensity;
        dropGain.gain.setValueAtTime(volume, now);

        source.connect(filter);
        filter.connect(dropGain);
        dropGain.connect(this.dropsGain);

        source.start(now);

        source.onended = () => {
            source.disconnect();
            filter.disconnect();
            dropGain.disconnect();
        };
    }

    /**
     * 设置雨滴强度
     * @param {number} intensity - 0-1
     */
    setDropIntensity(intensity) {
        this.dropIntensity = Math.max(0, Math.min(1, intensity));
        this.dropsGain.gain.setValueAtTime(0.2 + intensity * 0.5, this.context.currentTime);
    }

    /**
     * 释放资源
     */
    dispose() {
        this.stop(0);
        this.lowpassFilter.disconnect();
        this.baseGain.disconnect();
        this.dropsGain.disconnect();
        super.dispose();
    }
}
