/**
 * SampleLoader - 音频采样加载器
 * 用于加载和管理真实音效采样
 */

export class SampleLoader {
    /**
     * @param {AudioContext} context 
     */
    constructor(context) {
        this.context = context;
        this.buffers = new Map();
        this.loading = new Map();
    }

    /**
     * 加载单个音频文件
     * @param {string} name - 采样名称
     * @param {string} url - 音频文件 URL
     * @returns {Promise<AudioBuffer>}
     */
    async load(name, url) {
        // 如果已加载，直接返回
        if (this.buffers.has(name)) {
            return this.buffers.get(name);
        }

        // 如果正在加载，等待完成
        if (this.loading.has(name)) {
            return this.loading.get(name);
        }

        // 开始加载
        const loadPromise = this._fetchAndDecode(url);
        this.loading.set(name, loadPromise);

        try {
            const buffer = await loadPromise;
            this.buffers.set(name, buffer);
            this.loading.delete(name);
            console.log(`[SampleLoader] Loaded: ${name}`);
            return buffer;
        } catch (error) {
            this.loading.delete(name);
            console.warn(`[SampleLoader] Failed to load ${name}:`, error);
            throw error;
        }
    }

    /**
     * 批量加载音频文件
     * @param {Object.<string, string>} samples - { name: url } 映射
     * @returns {Promise<Map<string, AudioBuffer>>}
     */
    async loadAll(samples) {
        const entries = Object.entries(samples);
        const results = await Promise.allSettled(
            entries.map(([name, url]) => this.load(name, url))
        );

        // 记录加载结果
        results.forEach((result, i) => {
            if (result.status === 'rejected') {
                console.warn(`[SampleLoader] Failed: ${entries[i][0]}`);
            }
        });

        return this.buffers;
    }

    /**
     * 获取已加载的采样
     * @param {string} name 
     * @returns {AudioBuffer | undefined}
     */
    get(name) {
        return this.buffers.get(name);
    }

    /**
     * 检查采样是否已加载
     * @param {string} name 
     * @returns {boolean}
     */
    has(name) {
        return this.buffers.has(name);
    }

    /**
     * 播放采样 (一次性)
     * @param {string} name - 采样名称
     * @param {Object} options
     * @param {AudioNode} [options.destination] - 目标节点
     * @param {number} [options.volume=1] - 音量
     * @param {number} [options.playbackRate=1] - 播放速率
     * @param {number} [options.detune=0] - 音高偏移 (cents)
     * @returns {AudioBufferSourceNode | null}
     */
    play(name, options = {}) {
        const buffer = this.buffers.get(name);
        if (!buffer) {
            console.warn(`[SampleLoader] Sample not found: ${name}`);
            return null;
        }

        const {
            destination = this.context.destination,
            volume = 1,
            playbackRate = 1,
            detune = 0
        } = options;

        // 创建源节点
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        source.detune.value = detune;

        // 音量控制
        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        // 连接
        source.connect(gainNode);
        gainNode.connect(destination);

        // 播放
        source.start();

        // 自动清理
        source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
        };

        return source;
    }

    /**
     * 获取随机变体采样名称
     * @param {string} baseName - 基础名称
     * @param {number} maxVariants - 最大变体数
     * @returns {string | null}
     */
    getRandomVariant(baseName, maxVariants) {
        const available = [];
        for (let i = 1; i <= maxVariants; i++) {
            const name = `${baseName}_${i}`;
            if (this.buffers.has(name)) {
                available.push(name);
            }
        }

        if (available.length === 0) {
            return null;
        }

        return available[Math.floor(Math.random() * available.length)];
    }

    /**
     * 清理所有采样
     */
    clear() {
        this.buffers.clear();
        this.loading.clear();
    }

    /**
     * 内部方法：获取并解码音频
     */
    async _fetchAndDecode(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return await this.context.decodeAudioData(arrayBuffer);
    }
}

/**
 * 预定义的采样配置
 */
export const SAMPLE_CONFIGS = {
    rain: {
        // 雨滴采样 (需要手动下载)
        raindrop_1: 'samples/raindrop_1.mp3',
        raindrop_2: 'samples/raindrop_2.mp3',
        raindrop_3: 'samples/raindrop_3.mp3',
    },
    cafe: {
        // 杯碟采样 (需要手动下载)
        cup_clink_1: 'samples/cup_clink_1.mp3',
        cup_clink_2: 'samples/cup_clink_2.mp3',
        spoon_stir: 'samples/spoon_stir.mp3',
    }
};
