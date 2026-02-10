/**
 * BaseSynth - 合成器抽象基类
 * 所有环境音合成器都继承自此类
 */

export class BaseSynth {
    /**
     * @param {AudioContext} context 
     */
    constructor(context) {
        this.context = context;
        this.output = context.createGain();
        this.isPlaying = false;

        // 默认淡入淡出时间 (秒)
        this.defaultFadeTime = 1.5;
    }

    /**
     * 启动合成器
     * @abstract
     */
    start() {
        throw new Error('start() must be implemented by subclass');
    }

    /**
     * 停止合成器
     * @param {number} [fadeTime] - 淡出时间 (秒)
     * @abstract
     */
    stop(fadeTime) {
        throw new Error('stop() must be implemented by subclass');
    }

    /**
     * 获取输出节点
     * @returns {GainNode}
     */
    getOutput() {
        return this.output;
    }

    /**
     * 连接到目标节点
     * @param {AudioNode} destination 
     */
    connect(destination) {
        this.output.connect(destination);
    }

    /**
     * 断开所有连接
     */
    disconnect() {
        this.output.disconnect();
    }

    /**
     * 淡入效果
     * @param {number} duration - 淡入时间 (秒)
     * @param {number} [targetVolume=1] - 目标音量
     */
    fadeIn(duration = this.defaultFadeTime, targetVolume = 1) {
        const now = this.context.currentTime;
        this.output.gain.cancelScheduledValues(now);
        this.output.gain.setValueAtTime(0, now);
        this.output.gain.linearRampToValueAtTime(targetVolume, now + duration);
    }

    /**
     * 淡出效果
     * @param {number} duration - 淡出时间 (秒)
     * @returns {Promise} - 淡出完成后 resolve
     */
    fadeOut(duration = this.defaultFadeTime) {
        return new Promise(resolve => {
            const now = this.context.currentTime;
            const currentVolume = this.output.gain.value;

            this.output.gain.cancelScheduledValues(now);
            this.output.gain.setValueAtTime(currentVolume, now);
            this.output.gain.linearRampToValueAtTime(0, now + duration);

            setTimeout(resolve, duration * 1000);
        });
    }

    /**
     * 释放所有资源
     * @abstract
     */
    dispose() {
        this.disconnect();
    }

    /**
     * 创建带包络的一次性声音
     * @param {OscillatorNode | AudioBufferSourceNode} source 
     * @param {Object} envelope 
     * @param {number} envelope.attack - 起音时间 (秒)
     * @param {number} envelope.decay - 衰减时间 (秒)
     * @param {number} envelope.sustain - 持续电平 (0-1)
     * @param {number} envelope.release - 释放时间 (秒)
     * @param {number} [volume=1] - 最大音量
     * @returns {GainNode}
     */
    createEnvelope(source, envelope, volume = 1) {
        const envGain = this.context.createGain();
        const now = this.context.currentTime;
        const { attack, decay, sustain, release } = envelope;

        envGain.gain.setValueAtTime(0, now);
        envGain.gain.linearRampToValueAtTime(volume, now + attack);
        envGain.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay);

        // 在 sustain 后安排 release
        const releaseTime = now + attack + decay + 0.1;
        envGain.gain.setValueAtTime(volume * sustain, releaseTime);
        envGain.gain.linearRampToValueAtTime(0, releaseTime + release);

        source.connect(envGain);

        // 自动停止和清理
        const totalTime = attack + decay + 0.1 + release;
        setTimeout(() => {
            try {
                source.stop();
                source.disconnect();
                envGain.disconnect();
            } catch (e) {
                // 忽略已清理的节点
            }
        }, totalTime * 1000 + 100);

        return envGain;
    }
}
