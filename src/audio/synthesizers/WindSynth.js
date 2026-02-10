/**
 * WindSynth - 风声合成器
 * 
 * 信号链:
 * BrownNoise → LowpassFilter(LFO调制) → GainNode(LFO调制) → Output
 *                                                           ↑
 *                                          呼啸效果 (高通 + 共振)
 */

import { NoiseGenerator } from '../utils/NoiseGenerator.js';
import { BaseSynth } from './BaseSynth.js';

export class WindSynth extends BaseSynth {
    /**
     * @param {AudioContext} context 
     * @param {Object} options 
     * @param {number} [options.intensity=0.5] - 风的强度 (0-1)
     * @param {number} [options.gustFrequency=0.15] - 阵风频率 (Hz)
     */
    constructor(context, options = {}) {
        super(context);

        this.intensity = options.intensity || 0.5;
        this.gustFrequency = options.gustFrequency || 0.15;

        // 主噪声源
        this.noiseGen = null;

        // 主低通滤波器 (LFO 调制)
        this.lowpassFilter = context.createBiquadFilter();
        this.lowpassFilter.type = 'lowpass';
        this.lowpassFilter.frequency.value = 400;
        this.lowpassFilter.Q.value = 2;

        // 基底音量
        this.baseGain = context.createGain();
        this.baseGain.gain.value = 0.5;

        // 呼啸效果层 - 高通滤波 + 共振
        this.whistleFilter = context.createBiquadFilter();
        this.whistleFilter.type = 'bandpass';
        this.whistleFilter.frequency.value = 800;
        this.whistleFilter.Q.value = 8; // 高共振产生呼啸

        this.whistleGain = context.createGain();
        this.whistleGain.gain.value = 0.1;

        // LFO 用于调制滤波器和音量
        this.filterLFO = null;
        this.volumeLFO = null;

        // 连接节点
        this.lowpassFilter.connect(this.baseGain);
        this.baseGain.connect(this.output);

        this.whistleFilter.connect(this.whistleGain);
        this.whistleGain.connect(this.output);

        this.isPlaying = false;

        // 阵风定时器
        this.gustTimer = null;
    }

    /**
     * 启动风声
     */
    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        // 创建布朗噪音基底
        this.noiseGen = new NoiseGenerator(this.context, 'brown');
        this.noiseGen.connect(this.lowpassFilter);
        this.noiseGen.connect(this.whistleFilter);
        this.noiseGen.start();

        // 创建 LFO 调制
        this._createLFOs();

        // 启动阵风效果
        this._startGusts();

        // 淡入
        this.fadeIn();
    }

    /**
     * 停止风声
     * @param {number} [fadeTime=1.5] - 淡出时间
     */
    async stop(fadeTime = 1.5) {
        if (!this.isPlaying) return;

        // 停止阵风
        this._stopGusts();

        // 淡出
        await this.fadeOut(fadeTime);

        // 停止 LFO
        this._stopLFOs();

        // 停止噪声
        if (this.noiseGen) {
            this.noiseGen.dispose();
            this.noiseGen = null;
        }

        this.isPlaying = false;
    }

    /**
     * 创建 LFO 振荡器
     */
    _createLFOs() {
        const now = this.context.currentTime;

        // 滤波器频率 LFO
        this.filterLFO = this.context.createOscillator();
        this.filterLFO.type = 'sine';
        this.filterLFO.frequency.value = this.gustFrequency;

        const filterLFOGain = this.context.createGain();
        filterLFOGain.gain.value = 300 * this.intensity; // 调制深度

        this.filterLFO.connect(filterLFOGain);
        filterLFOGain.connect(this.lowpassFilter.frequency);

        // 设置滤波器基础频率
        this.lowpassFilter.frequency.setValueAtTime(
            300 + 200 * this.intensity,
            now
        );

        // 音量 LFO (相位偏移，使变化更自然)
        this.volumeLFO = this.context.createOscillator();
        this.volumeLFO.type = 'sine';
        this.volumeLFO.frequency.value = this.gustFrequency * 0.7; // 稍慢

        const volumeLFOGain = this.context.createGain();
        volumeLFOGain.gain.value = 0.15 * this.intensity;

        this.volumeLFO.connect(volumeLFOGain);
        volumeLFOGain.connect(this.baseGain.gain);

        // 启动 LFO
        this.filterLFO.start(now);
        this.volumeLFO.start(now);

        // 保存引用以便清理
        this.filterLFOGain = filterLFOGain;
        this.volumeLFOGain = volumeLFOGain;
    }

    /**
     * 停止 LFO
     */
    _stopLFOs() {
        if (this.filterLFO) {
            try {
                this.filterLFO.stop();
                this.filterLFO.disconnect();
                this.filterLFOGain.disconnect();
            } catch (e) { }
            this.filterLFO = null;
        }

        if (this.volumeLFO) {
            try {
                this.volumeLFO.stop();
                this.volumeLFO.disconnect();
                this.volumeLFOGain.disconnect();
            } catch (e) { }
            this.volumeLFO = null;
        }
    }

    /**
     * 开始阵风效果
     */
    _startGusts() {
        const generateGust = () => {
            if (!this.isPlaying) return;

            // 随机间隔 5-15秒
            const interval = 5000 + Math.random() * 10000;

            // 触发阵风
            if (Math.random() > 0.3) { // 70% 概率触发
                this._triggerGust();
            }

            this.gustTimer = setTimeout(generateGust, interval);
        };

        // 延迟启动第一次阵风
        this.gustTimer = setTimeout(generateGust, 3000 + Math.random() * 5000);
    }

    /**
     * 停止阵风
     */
    _stopGusts() {
        if (this.gustTimer) {
            clearTimeout(this.gustTimer);
            this.gustTimer = null;
        }
    }

    /**
     * 触发一次阵风
     */
    _triggerGust() {
        const now = this.context.currentTime;
        const duration = 1 + Math.random() * 2; // 1-3秒
        const peakIntensity = 0.5 + Math.random() * 0.5;

        // 滤波器频率变化
        const currentFreq = this.lowpassFilter.frequency.value;
        const peakFreq = currentFreq + 400 * peakIntensity * this.intensity;

        this.lowpassFilter.frequency.cancelScheduledValues(now);
        this.lowpassFilter.frequency.setValueAtTime(currentFreq, now);
        this.lowpassFilter.frequency.linearRampToValueAtTime(peakFreq, now + duration * 0.3);
        this.lowpassFilter.frequency.linearRampToValueAtTime(currentFreq, now + duration);

        // 音量变化
        const currentGain = this.baseGain.gain.value;
        const peakGain = currentGain + 0.2 * peakIntensity * this.intensity;

        this.baseGain.gain.cancelScheduledValues(now);
        this.baseGain.gain.setValueAtTime(currentGain, now);
        this.baseGain.gain.linearRampToValueAtTime(peakGain, now + duration * 0.3);
        this.baseGain.gain.linearRampToValueAtTime(currentGain, now + duration);

        // 呼啸声增强
        const whistlePeak = 0.15 + 0.1 * peakIntensity;
        this.whistleGain.gain.cancelScheduledValues(now);
        this.whistleGain.gain.setValueAtTime(this.whistleGain.gain.value, now);
        this.whistleGain.gain.linearRampToValueAtTime(whistlePeak, now + duration * 0.4);
        this.whistleGain.gain.linearRampToValueAtTime(0.1, now + duration);
    }

    /**
     * 设置风的强度
     * @param {number} intensity - 0-1
     */
    setIntensity(intensity) {
        this.intensity = Math.max(0, Math.min(1, intensity));

        const now = this.context.currentTime;

        // 更新滤波器范围
        this.lowpassFilter.frequency.setValueAtTime(
            300 + 200 * this.intensity,
            now
        );

        // 更新基础音量
        this.baseGain.gain.setValueAtTime(
            0.3 + 0.3 * this.intensity,
            now
        );

        // 更新 LFO 调制深度
        if (this.filterLFOGain) {
            this.filterLFOGain.gain.setValueAtTime(300 * this.intensity, now);
        }
        if (this.volumeLFOGain) {
            this.volumeLFOGain.gain.setValueAtTime(0.15 * this.intensity, now);
        }
    }

    /**
     * 设置阵风频率
     * @param {number} frequency - Hz
     */
    setGustFrequency(frequency) {
        this.gustFrequency = Math.max(0.05, Math.min(0.5, frequency));

        if (this.filterLFO) {
            this.filterLFO.frequency.setValueAtTime(this.gustFrequency, this.context.currentTime);
        }
        if (this.volumeLFO) {
            this.volumeLFO.frequency.setValueAtTime(this.gustFrequency * 0.7, this.context.currentTime);
        }
    }

    /**
     * 释放资源
     */
    dispose() {
        this.stop(0);
        this._stopLFOs();
        this.lowpassFilter.disconnect();
        this.baseGain.disconnect();
        this.whistleFilter.disconnect();
        this.whistleGain.disconnect();
        super.dispose();
    }
}
