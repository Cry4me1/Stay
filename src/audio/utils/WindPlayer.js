/**
 * WindPlayer - 风声场景专用播放器
 * 
 * 特点：
 * - 将软风录音与 WindSynth 数字合成风声混合
 * - 随机切换不同的软风录音片段
 * - 提供自然、层次丰富的风声体验
 */

import { WindSynth } from '../synthesizers/WindSynth.js';

export class WindPlayer {
    /**
     * @param {AudioContext} context 
     * @param {Object} options
     * @param {string[]} options.softWindUrls - 软风录音 URL 列表
     * @param {number} [options.synthMix=0.4] - 合成风声混合比例 (0-1)
     * @param {number} [options.recordingMix=0.6] - 录音混合比例 (0-1)
     * @param {number} [options.crossfadeDuration=4] - 交叉淡化时间
     */
    constructor(context, options = {}) {
        this.context = context;
        this.softWindUrls = options.softWindUrls || [];
        this.synthMix = options.synthMix ?? 0.4;
        this.recordingMix = options.recordingMix ?? 0.6;
        this.crossfadeDuration = options.crossfadeDuration || 4;

        // 输出节点
        this.output = context.createGain();

        // === 合成风声层 ===
        this.windSynth = new WindSynth(context, {
            intensity: 0.5,
            gustFrequency: 0.12
        });
        this.synthGain = context.createGain();
        this.synthGain.gain.value = this.synthMix;

        // === 录音风声层 ===
        this.recordingBuffers = [];
        this.currentSource = null;
        this.nextSource = null;
        this.recordingGain = context.createGain();
        this.recordingGain.gain.value = this.recordingMix;

        // 录音层滤波器 - 轻微低通使其更柔和
        this.recordingFilter = context.createBiquadFilter();
        this.recordingFilter.type = 'lowpass';
        this.recordingFilter.frequency.value = 4000;
        this.recordingFilter.Q.value = 0.5;

        // 连接音频路径
        this.windSynth.connect(this.synthGain);
        this.synthGain.connect(this.output);

        this.recordingFilter.connect(this.recordingGain);
        this.recordingGain.connect(this.output);

        this.isPlaying = false;
        this.isLoaded = false;
        this.crossfadeTimer = null;
        this._currentBufferIndex = -1;
    }

    /**
     * 加载音频文件
     */
    async load() {
        const loadBuffer = async (url) => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();
                return await this.context.decodeAudioData(arrayBuffer);
            } catch (error) {
                console.warn(`[WindPlayer] Failed to load ${url}:`, error);
                return null;
            }
        };

        // 加载所有软风录音
        if (this.softWindUrls.length > 0) {
            const promises = this.softWindUrls.map(url => loadBuffer(url));
            const results = await Promise.all(promises);
            this.recordingBuffers = results.filter(b => b !== null);
            console.log(`[WindPlayer] Loaded: ${this.recordingBuffers.length} soft wind recordings`);
        }

        // 即使没有录音也标记为已加载（合成器不需要加载）
        this.isLoaded = true;

        console.log(`[WindPlayer] Ready (recordings: ${this.recordingBuffers.length}, synth: enabled)`);
    }

    /**
     * 开始播放
     */
    start() {
        if (!this.isLoaded || this.isPlaying) return;

        this.isPlaying = true;
        const now = this.context.currentTime;

        // 启动合成风声
        this.windSynth.start();

        // 淡入合成层
        this.synthGain.gain.setValueAtTime(0, now);
        this.synthGain.gain.linearRampToValueAtTime(this.synthMix, now + 1.5);

        // 启动录音层
        this._startRecordingLayer();

        console.log('[WindPlayer] Started');
    }

    /**
     * 启动录音层播放
     */
    _startRecordingLayer() {
        if (this.recordingBuffers.length === 0) return;

        const now = this.context.currentTime;

        // 选择一个随机录音
        this._currentBufferIndex = this._getRandomBufferIndex();
        const buffer = this.recordingBuffers[this._currentBufferIndex];

        // 创建源
        this.currentSource = this.context.createBufferSource();
        this.currentSource.buffer = buffer;
        this.currentSource.loop = false; // 不循环，手动交叉淡化

        // 随机音高微调
        this.currentSource.playbackRate.value = 0.95 + Math.random() * 0.1;
        this.currentSource.detune.value = (Math.random() - 0.5) * 100;

        this.currentSource.connect(this.recordingFilter);

        // 淡入
        this.recordingGain.gain.setValueAtTime(0, now);
        this.recordingGain.gain.linearRampToValueAtTime(this.recordingMix, now + 2);

        this.currentSource.start();

        // 设置交叉淡化定时器
        const bufferDuration = buffer.duration / this.currentSource.playbackRate.value;
        this._scheduleCrossfade(bufferDuration);
    }

    /**
     * 获取随机缓冲区索引（避免连续重复）
     */
    _getRandomBufferIndex() {
        if (this.recordingBuffers.length === 1) return 0;

        let index;
        do {
            index = Math.floor(Math.random() * this.recordingBuffers.length);
        } while (index === this._currentBufferIndex);

        return index;
    }

    /**
     * 调度交叉淡化
     * @param {number} bufferDuration - 当前缓冲区时长
     */
    _scheduleCrossfade(bufferDuration) {
        // 在结束前开始交叉淡化
        const fadeStartTime = (bufferDuration - this.crossfadeDuration) * 1000;

        this.crossfadeTimer = setTimeout(() => {
            if (this.isPlaying) {
                this._performCrossfade();
            }
        }, Math.max(fadeStartTime, 1000));
    }

    /**
     * 执行交叉淡化
     */
    _performCrossfade() {
        if (!this.isPlaying || this.recordingBuffers.length === 0) return;

        const now = this.context.currentTime;

        // 旧源淡出
        const oldSource = this.currentSource;
        const currentGain = this.recordingGain.gain.value;

        // 选择下一个录音
        this._currentBufferIndex = this._getRandomBufferIndex();
        const buffer = this.recordingBuffers[this._currentBufferIndex];

        // 创建新增益节点用于新源
        const newSourceGain = this.context.createGain();
        newSourceGain.gain.setValueAtTime(0, now);
        newSourceGain.gain.linearRampToValueAtTime(1, now + this.crossfadeDuration);

        // 创建旧源增益节点用于淡出
        const oldSourceGain = this.context.createGain();
        oldSourceGain.gain.setValueAtTime(1, now);
        oldSourceGain.gain.linearRampToValueAtTime(0, now + this.crossfadeDuration);

        // 创建新源
        this.currentSource = this.context.createBufferSource();
        this.currentSource.buffer = buffer;
        this.currentSource.loop = false;
        this.currentSource.playbackRate.value = 0.95 + Math.random() * 0.1;
        this.currentSource.detune.value = (Math.random() - 0.5) * 100;

        // 重新连接旧源
        if (oldSource) {
            try {
                oldSource.disconnect();
                oldSource.connect(oldSourceGain);
                oldSourceGain.connect(this.recordingFilter);
            } catch (e) { }
        }

        // 连接新源
        this.currentSource.connect(newSourceGain);
        newSourceGain.connect(this.recordingFilter);

        this.currentSource.start();

        // 清理旧源
        setTimeout(() => {
            try {
                if (oldSource) {
                    oldSource.stop();
                    oldSource.disconnect();
                }
                oldSourceGain.disconnect();
            } catch (e) { }
        }, this.crossfadeDuration * 1000 + 100);

        // 清理新源增益（在一段时间后）
        const bufferDuration = buffer.duration / this.currentSource.playbackRate.value;
        setTimeout(() => {
            try {
                newSourceGain.disconnect();
                this.currentSource.connect(this.recordingFilter);
            } catch (e) { }
        }, this.crossfadeDuration * 1000 + 100);

        // 调度下一次交叉淡化
        this._scheduleCrossfade(bufferDuration);
    }

    /**
     * 停止播放
     * @param {number} [fadeTime=1.5]
     */
    async stop(fadeTime = 1.5) {
        if (!this.isPlaying) return;

        this.isPlaying = false;

        // 停止交叉淡化
        if (this.crossfadeTimer) {
            clearTimeout(this.crossfadeTimer);
            this.crossfadeTimer = null;
        }

        // 淡出
        const now = this.context.currentTime;
        this.synthGain.gain.setValueAtTime(this.synthGain.gain.value, now);
        this.synthGain.gain.linearRampToValueAtTime(0, now + fadeTime);

        this.recordingGain.gain.setValueAtTime(this.recordingGain.gain.value, now);
        this.recordingGain.gain.linearRampToValueAtTime(0, now + fadeTime);

        await this.windSynth.stop(fadeTime);

        await new Promise(resolve => setTimeout(resolve, fadeTime * 1000));

        // 停止录音源
        if (this.currentSource) {
            try {
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch (e) { }
            this.currentSource = null;
        }

        console.log('[WindPlayer] Stopped');
    }

    /**
     * 设置混合比例
     * @param {number} synthMix - 合成风声比例 (0-1)
     * @param {number} recordingMix - 录音风声比例 (0-1)
     */
    setMix(synthMix, recordingMix) {
        const now = this.context.currentTime;

        this.synthMix = Math.max(0, Math.min(1, synthMix));
        this.recordingMix = Math.max(0, Math.min(1, recordingMix));

        this.synthGain.gain.setValueAtTime(this.synthGain.gain.value, now);
        this.synthGain.gain.linearRampToValueAtTime(this.synthMix, now + 0.5);

        this.recordingGain.gain.setValueAtTime(this.recordingGain.gain.value, now);
        this.recordingGain.gain.linearRampToValueAtTime(this.recordingMix, now + 0.5);
    }

    /**
     * 设置风声强度（影响合成层）
     * @param {number} intensity - 0-1
     */
    setIntensity(intensity) {
        this.windSynth.setIntensity(intensity);
    }

    /**
     * 连接到目标
     */
    connect(destination) {
        this.output.connect(destination);
    }

    /**
     * 断开连接
     */
    disconnect() {
        this.output.disconnect();
    }

    /**
     * 释放资源
     */
    dispose() {
        this.stop(0);
        this.windSynth.dispose();
        this.recordingBuffers = [];
        this.disconnect();
    }
}
