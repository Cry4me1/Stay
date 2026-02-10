/**
 * AudioAnalyzer - 频谱分析工具类
 * 提供实时音频数据分析，输出用于驱动视觉动画的标准化数据
 */

/**
 * @typedef {Object} AudioAnalysisData
 * @property {number} lowFrequency - 低频能量 (0-1), 用于控制大背景波动
 * @property {number} midFrequency - 中频峰值 (0-1), 用于控制中等元素
 * @property {number} highFrequency - 高频变化 (0-1), 用于控制细节闪烁
 * @property {number} volume - 总音量 (0-1), 用于全局强度
 */

export class AudioAnalyzer {
    /**
     * @param {AudioContext} context 
     * @param {Object} options 
     * @param {number} [options.fftSize=2048] - FFT 大小
     * @param {number} [options.smoothingTimeConstant=0.8] - 平滑系数
     */
    constructor(context, options = {}) {
        this.context = context;

        // 创建分析器节点
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = options.fftSize || 2048;
        this.analyser.smoothingTimeConstant = options.smoothingTimeConstant || 0.8;

        // 频率数据缓冲区
        this.frequencyBinCount = this.analyser.frequencyBinCount;
        this.frequencyData = new Uint8Array(this.frequencyBinCount);
        this.timeDomainData = new Uint8Array(this.frequencyBinCount);

        // 平滑后的输出值 (EMA 指数移动平均)
        this.smoothedData = {
            lowFrequency: 0,
            midFrequency: 0,
            highFrequency: 0,
            volume: 0
        };

        // 平滑系数 (越小越平滑，但响应越慢)
        this.smoothingFactor = 0.15;

        // 计算频率 bin 边界
        // 采样率通常是 44100Hz 或 48000Hz
        // 每个 bin 代表的频率 = 采样率 / fftSize
        const nyquist = context.sampleRate / 2;
        const binFrequency = nyquist / this.frequencyBinCount;

        // 频段划分 (基于常见音频特征)
        // 低频: 20-250Hz (贝斯、鼓点)
        // 中频: 250-2000Hz (人声、乐器主体)
        // 高频: 2000-8000Hz (清晰度、细节)
        this.lowBinStart = Math.floor(20 / binFrequency);
        this.lowBinEnd = Math.floor(250 / binFrequency);
        this.midBinStart = this.lowBinEnd;
        this.midBinEnd = Math.floor(2000 / binFrequency);
        this.highBinStart = this.midBinEnd;
        this.highBinEnd = Math.floor(8000 / binFrequency);
    }

    /**
     * 获取分析器节点的输入
     * @returns {AnalyserNode}
     */
    getInput() {
        return this.analyser;
    }

    /**
     * 获取分析器节点（用于连接到输出）
     * @returns {AnalyserNode}
     */
    getOutput() {
        return this.analyser;
    }

    /**
     * 计算指定频段的平均能量
     * @param {number} startBin 
     * @param {number} endBin 
     * @returns {number} 0-1 范围的能量值
     */
    _getAverageEnergy(startBin, endBin) {
        let sum = 0;
        const clampedEnd = Math.min(endBin, this.frequencyBinCount);
        const count = clampedEnd - startBin;

        if (count <= 0) return 0;

        for (let i = startBin; i < clampedEnd; i++) {
            sum += this.frequencyData[i];
        }

        // 归一化到 0-1 (原始值范围是 0-255)
        return (sum / count) / 255;
    }

    /**
     * 计算 RMS (均方根) 音量
     * @returns {number} 0-1 范围的音量值
     */
    _getRMSVolume() {
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        let sum = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            // 时域数据以 128 为中心 (0-255)
            const normalized = (this.timeDomainData[i] - 128) / 128;
            sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / this.timeDomainData.length);

        // 适当放大，使环境音能有明显的音量指示
        return Math.min(rms * 2, 1);
    }

    /**
     * 应用指数移动平均平滑
     * @param {number} currentSmoothed 
     * @param {number} newValue 
     * @returns {number}
     */
    _smooth(currentSmoothed, newValue) {
        return currentSmoothed * (1 - this.smoothingFactor) + newValue * this.smoothingFactor;
    }

    /**
     * 更新分析数据
     * 应在 requestAnimationFrame 中调用
     */
    update() {
        // 获取频率数据
        this.analyser.getByteFrequencyData(this.frequencyData);

        // 计算各频段原始值
        const rawLow = this._getAverageEnergy(this.lowBinStart, this.lowBinEnd);
        const rawMid = this._getAverageEnergy(this.midBinStart, this.midBinEnd);
        const rawHigh = this._getAverageEnergy(this.highBinStart, this.highBinEnd);
        const rawVolume = this._getRMSVolume();

        // 应用平滑
        this.smoothedData.lowFrequency = this._smooth(this.smoothedData.lowFrequency, rawLow);
        this.smoothedData.midFrequency = this._smooth(this.smoothedData.midFrequency, rawMid);
        this.smoothedData.highFrequency = this._smooth(this.smoothedData.highFrequency, rawHigh);
        this.smoothedData.volume = this._smooth(this.smoothedData.volume, rawVolume);
    }

    /**
     * 获取当前分析数据
     * @returns {AudioAnalysisData}
     */
    getData() {
        return { ...this.smoothedData };
    }

    /**
     * 获取原始频率数据 (用于自定义可视化)
     * @returns {Uint8Array}
     */
    getRawFrequencyData() {
        return this.frequencyData;
    }

    /**
     * 重置平滑数据
     */
    reset() {
        this.smoothedData = {
            lowFrequency: 0,
            midFrequency: 0,
            highFrequency: 0,
            volume: 0
        };
    }

    /**
     * 设置平滑系数
     * @param {number} factor - 0-1 之间，越小越平滑
     */
    setSmoothingFactor(factor) {
        this.smoothingFactor = Math.max(0.01, Math.min(1, factor));
    }

    /**
     * 释放资源
     */
    dispose() {
        this.analyser.disconnect();
    }
}
