/**
 * CafePlayer - 咖啡馆场景专用播放器
 * 
 * 特点：
 * - 背景人声通过低通滤波使其模糊有氛围感
 * - 随机触发器具声效（杯碟、咖啡倒入等）
 */

export class CafePlayer {
    /**
     * @param {AudioContext} context 
     * @param {Object} options
     * @param {string} options.ambienceUrl - 背景人声环境音 URL
     * @param {string[]} options.sfxUrls - 器具声效 URL 列表
     * @param {number} [options.sfxInterval=8] - 器具声触发间隔 (秒)
     */
    constructor(context, options = {}) {
        this.context = context;
        this.ambienceUrl = options.ambienceUrl;
        this.sfxUrls = options.sfxUrls || [];
        this.sfxInterval = options.sfxInterval || 8;

        // 输出节点
        this.output = context.createGain();

        // 背景环境音
        this.ambienceBuffer = null;
        this.ambienceSource = null;
        this.ambienceGain = context.createGain();
        this.ambienceGain.gain.value = 1.0; // 提高背景音量

        // 低通滤波器 - 使人声模糊
        this.lowpassFilter = context.createBiquadFilter();
        this.lowpassFilter.type = 'lowpass';
        this.lowpassFilter.frequency.value = 1200; // 截止频率
        this.lowpassFilter.Q.value = 0.7;

        // 高切滤波器 - 进一步柔化
        this.highShelf = context.createBiquadFilter();
        this.highShelf.type = 'highshelf';
        this.highShelf.frequency.value = 2000;
        this.highShelf.gain.value = -6; // 降低高频

        // 器具声效
        this.sfxBuffers = [];
        this.sfxGain = context.createGain();
        this.sfxGain.gain.value = 0.5; // 降低器具声音量，避免吐人

        // 连接音频路径
        // 背景: source → lowpass → highshelf → gain → output
        this.lowpassFilter.connect(this.highShelf);
        this.highShelf.connect(this.ambienceGain);
        this.ambienceGain.connect(this.output);

        // 器具声: source → gain → output (不加滤波，保持清晰)
        this.sfxGain.connect(this.output);

        this.isPlaying = false;
        this.isLoaded = false;
        this.sfxTimer = null;
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
                console.warn(`[CafePlayer] Failed to load ${url}:`, error);
                return null;
            }
        };

        // 加载背景环境音
        if (this.ambienceUrl) {
            this.ambienceBuffer = await loadBuffer(this.ambienceUrl);
        }

        // 加载器具声效
        const sfxPromises = this.sfxUrls.map(url => loadBuffer(url));
        const sfxResults = await Promise.all(sfxPromises);
        this.sfxBuffers = sfxResults.filter(b => b !== null);

        this.isLoaded = this.ambienceBuffer !== null;

        console.log(`[CafePlayer] Loaded: ambience=${!!this.ambienceBuffer}, sfx=${this.sfxBuffers.length}`);
    }

    /**
     * 开始播放
     */
    start() {
        if (!this.isLoaded || this.isPlaying) return;

        this.isPlaying = true;

        // 播放背景环境音（循环）
        if (this.ambienceBuffer) {
            this.ambienceSource = this.context.createBufferSource();
            this.ambienceSource.buffer = this.ambienceBuffer;
            this.ambienceSource.loop = true;
            this.ambienceSource.connect(this.lowpassFilter);

            // 淡入
            const now = this.context.currentTime;
            this.ambienceGain.gain.setValueAtTime(0, now);
            this.ambienceGain.gain.linearRampToValueAtTime(1.0, now + 1.5);

            this.ambienceSource.start();
        }

        // 开始随机触发器具声
        this._startSfx();

        console.log('[CafePlayer] Started');
    }

    /**
     * 停止播放
     * @param {number} [fadeTime=1.5]
     */
    async stop(fadeTime = 1.5) {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        this._stopSfx();

        // 淡出
        const now = this.context.currentTime;
        this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, now);
        this.ambienceGain.gain.linearRampToValueAtTime(0, now + fadeTime);

        await new Promise(resolve => setTimeout(resolve, fadeTime * 1000));

        if (this.ambienceSource) {
            try {
                this.ambienceSource.stop();
                this.ambienceSource.disconnect();
            } catch (e) { }
            this.ambienceSource = null;
        }

        console.log('[CafePlayer] Stopped');
    }

    /**
     * 开始随机触发器具声
     */
    _startSfx() {
        if (this.sfxBuffers.length === 0) return;

        const triggerSfx = () => {
            if (!this.isPlaying) return;

            // 随机间隔
            const interval = this.sfxInterval * 1000 * (0.5 + Math.random());

            // 随机播放一个器具声
            this._playRandomSfx();

            this.sfxTimer = setTimeout(triggerSfx, interval);
        };

        // 延迟启动第一次
        this.sfxTimer = setTimeout(triggerSfx, 2000 + Math.random() * 3000);
    }

    /**
     * 停止器具声触发
     */
    _stopSfx() {
        if (this.sfxTimer) {
            clearTimeout(this.sfxTimer);
            this.sfxTimer = null;
        }
    }

    /**
     * 随机播放一个器具声
     * 只播放音频的前一段，避免循环敲击
     * 增强随机处理避免听起来重复
     * 添加滤波器处理增加音色变化
     */
    _playRandomSfx() {
        if (this.sfxBuffers.length === 0) return;

        // 避免连续播放同一个声音
        let bufferIndex;
        if (this.sfxBuffers.length > 1) {
            do {
                bufferIndex = Math.floor(Math.random() * this.sfxBuffers.length);
            } while (bufferIndex === this._lastSfxIndex);
        } else {
            bufferIndex = 0;
        }
        this._lastSfxIndex = bufferIndex;

        const buffer = this.sfxBuffers[bufferIndex];
        const now = this.context.currentTime;

        const source = this.context.createBufferSource();
        source.buffer = buffer;

        // 随机音高和速度变化
        source.playbackRate.value = 0.8 + Math.random() * 0.4; // 0.8-1.2
        source.detune.value = (Math.random() - 0.5) * 300; // ±150 cents

        // 随机起始位置
        const maxOffset = Math.max(0, buffer.duration * 0.4 - 1);
        const startOffset = Math.random() * maxOffset;

        // === 柔化滤波器处理 ===

        // 始终添加柔化低通滤波器
        const softener = this.context.createBiquadFilter();
        softener.type = 'lowpass';
        softener.frequency.value = 3000 + Math.random() * 2000; // 3000-5000Hz
        softener.Q.value = 0.5;

        // 随机附加滤波器增加音色变化
        const filterType = Math.random();
        const filter = this.context.createBiquadFilter();

        if (filterType < 0.5) {
            // 低通 - 声音更闷/更远
            filter.type = 'lowpass';
            filter.frequency.value = 1500 + Math.random() * 2500; // 1500-4000Hz
            filter.Q.value = 0.3 + Math.random() * 0.5;
        } else {
            // 峰值EQ - 轻微调整
            filter.type = 'peaking';
            filter.frequency.value = 800 + Math.random() * 2000;
            filter.Q.value = 0.5 + Math.random() * 1;
            filter.gain.value = -3 + Math.random() * 4; // -3 to +1 dB
        }

        // 随机音量 (降低以避免吐人)
        const gain = this.context.createGain();
        const volume = 0.15 + Math.random() * 0.45; // 0.15-0.6

        // 随机播放时长
        const availableDuration = buffer.duration - startOffset;
        const playDuration = Math.min(availableDuration, 0.6 + Math.random() * 1.2);
        const fadeInTime = 0.15 + Math.random() * 0.1; // 较长的淡入 (0.15-0.25秒)
        const fadeOutStart = Math.max(fadeInTime + 0.1, playDuration - 0.3);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + fadeInTime); // 柔和淡入
        gain.gain.setValueAtTime(volume, now + fadeOutStart);
        gain.gain.linearRampToValueAtTime(0, now + playDuration); // 淡出

        // 连接音频链: source → softener → filter → gain → output
        source.connect(softener);
        softener.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        // 从随机位置开始播放
        source.start(now, startOffset, playDuration);

        // 清理
        setTimeout(() => {
            try {
                source.disconnect();
                softener.disconnect();
                filter.disconnect();
                gain.disconnect();
            } catch (e) { }
        }, playDuration * 1000 + 100);
    }

    /**
     * 设置滤波器频率（控制人声模糊程度）
     * @param {number} frequency - 越低越模糊 (500-3000)
     */
    setFilterFrequency(frequency) {
        const now = this.context.currentTime;
        this.lowpassFilter.frequency.setValueAtTime(frequency, now);
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
        this.ambienceBuffer = null;
        this.sfxBuffers = [];
        this.disconnect();
    }
}
