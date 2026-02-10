/**
 * LoopPlayer - 循环音频播放器
 * 
 * 支持单个或多个音频文件的循环播放
 * 多个文件时随机选择下一个播放
 */

export class LoopPlayer {
    /**
     * @param {AudioContext} context 
     * @param {Object} options
     * @param {number} [options.crossfadeDuration=2] - 音频间交叉淡化时间 (秒)
     */
    constructor(context, options = {}) {
        this.context = context;
        this.crossfadeDuration = options.crossfadeDuration || 2;

        /** @type {AudioBuffer[]} */
        this.buffers = [];

        /** @type {string[]} */
        this.urls = [];

        /** @type {GainNode} */
        this.output = context.createGain();

        /** @type {AudioBufferSourceNode | null} */
        this.currentSource = null;

        /** @type {GainNode | null} */
        this.currentGain = null;

        /** @type {number} */
        this.currentIndex = -1;

        /** @type {boolean} */
        this.isPlaying = false;

        /** @type {boolean} */
        this.isLoaded = false;

        /** @type {number | null} */
        this.nextTimeout = null;
    }

    /**
     * 加载音频文件
     * @param {string[]} urls - 音频文件 URL 列表
     * @returns {Promise<void>}
     */
    async load(urls) {
        this.urls = urls;
        this.buffers = [];

        const loadPromises = urls.map(async (url, index) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
                return { index, buffer: audioBuffer };
            } catch (error) {
                console.warn(`[LoopPlayer] Failed to load ${url}:`, error);
                return { index, buffer: null };
            }
        });

        const results = await Promise.all(loadPromises);

        // 按顺序存储成功加载的 buffer
        results.forEach(({ index, buffer }) => {
            if (buffer) {
                this.buffers[index] = buffer;
            }
        });

        // 过滤掉失败的
        this.buffers = this.buffers.filter(b => b !== undefined);

        this.isLoaded = this.buffers.length > 0;

        console.log(`[LoopPlayer] Loaded ${this.buffers.length}/${urls.length} files`);
    }

    /**
     * 获取随机的下一个索引 (避免连续重复)
     * @returns {number}
     */
    _getNextIndex() {
        if (this.buffers.length === 0) return -1;
        if (this.buffers.length === 1) return 0;

        // 避免连续播放相同的
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * this.buffers.length);
        } while (nextIndex === this.currentIndex && this.buffers.length > 1);

        return nextIndex;
    }

    /**
     * 开始播放
     */
    start() {
        if (!this.isLoaded) {
            console.warn('[LoopPlayer] No audio loaded');
            return;
        }

        if (this.isPlaying) return;

        this.isPlaying = true;
        this._playNext(true);
    }

    /**
     * 播放下一个音频
     * @param {boolean} isFirst - 是否是第一次播放
     */
    _playNext(isFirst = false) {
        if (!this.isPlaying) return;

        const nextIndex = this._getNextIndex();
        if (nextIndex === -1) return;

        const buffer = this.buffers[nextIndex];
        this.currentIndex = nextIndex;

        // 创建新的源节点
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = false; // 不使用原生循环，自己控制切换

        // 创建音量节点
        const gainNode = this.context.createGain();
        gainNode.gain.value = 0;

        source.connect(gainNode);
        gainNode.connect(this.output);

        const now = this.context.currentTime;
        const fadeTime = isFirst ? 1.5 : this.crossfadeDuration;

        // 淡入
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(1, now + fadeTime);

        // 淡出旧的
        if (this.currentGain && this.currentSource) {
            const oldGain = this.currentGain;
            const oldSource = this.currentSource;

            oldGain.gain.setValueAtTime(oldGain.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + fadeTime);

            // 延迟清理
            setTimeout(() => {
                try {
                    oldSource.stop();
                    oldSource.disconnect();
                    oldGain.disconnect();
                } catch (e) { }
            }, fadeTime * 1000 + 100);
        }

        this.currentSource = source;
        this.currentGain = gainNode;

        source.start(now);

        // 计算下一次切换时间 (提前开始淡化)
        const duration = buffer.duration;
        const nextPlayTime = (duration - this.crossfadeDuration) * 1000;

        // 清除之前的定时器
        if (this.nextTimeout) {
            clearTimeout(this.nextTimeout);
        }

        // 安排下一个
        this.nextTimeout = setTimeout(() => {
            if (this.isPlaying) {
                this._playNext(false);
            }
        }, Math.max(nextPlayTime, 1000));

        console.log(`[LoopPlayer] Playing track ${nextIndex + 1}/${this.buffers.length}`);
    }

    /**
     * 停止播放
     * @param {number} [fadeTime=1.5] - 淡出时间 (秒)
     * @returns {Promise<void>}
     */
    async stop(fadeTime = 1.5) {
        if (!this.isPlaying) return;

        this.isPlaying = false;

        // 清除定时器
        if (this.nextTimeout) {
            clearTimeout(this.nextTimeout);
            this.nextTimeout = null;
        }

        // 淡出当前音频
        if (this.currentGain && this.currentSource) {
            const now = this.context.currentTime;
            this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
            this.currentGain.gain.linearRampToValueAtTime(0, now + fadeTime);

            await new Promise(resolve => setTimeout(resolve, fadeTime * 1000));

            try {
                this.currentSource.stop();
                this.currentSource.disconnect();
                this.currentGain.disconnect();
            } catch (e) { }

            this.currentSource = null;
            this.currentGain = null;
        }
    }

    /**
     * 连接到目标节点
     * @param {AudioNode} destination 
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
        this.buffers = [];
        this.urls = [];
        this.isLoaded = false;
        this.disconnect();
    }
}
