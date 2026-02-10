/**
 * ═══════════════════════════════════════════════════════════════
 * useStay - Stay 主状态管理 Hook
 * ═══════════════════════════════════════════════════════════════
 * 
 * 设计理念：
 * 1. 单一数据源：所有状态集中管理，避免状态分散
 * 2. 命令式音频控制：AudioEngine 是命令式的，Hook 负责同步状态
 * 3. 声明式 UI：React 组件只需关心状态，不直接操作 AudioEngine
 * 4. 最小重渲染：使用 useRef 存储不需要触发重渲染的值
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine.js';

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {'rain' | 'cafe' | 'wind'} SceneType
 * @typedef {'idle' | 'switching' | 'playing'} PlaybackState
 */

/**
 * @typedef {Object} AudioData
 * @property {number} low - 低频能量 (0-1)
 * @property {number} mid - 中频能量 (0-1)
 * @property {number} high - 高频能量 (0-1)
 * @property {number} volume - 总音量 (0-1)
 */

/**
 * @typedef {Object} StayState
 * @property {SceneType} currentScene - 当前场景
 * @property {boolean} isPlaying - 是否正在播放
 * @property {boolean} uiVisible - UI 是否可见
 * @property {number} volume - 音量 (0-1)
 * @property {AudioData} audioData - 实时音频分析数据
 * @property {PlaybackState} playbackState - 播放状态机状态
 */

/**
 * @typedef {Object} StayActions
 * @property {(scene: SceneType) => Promise<void>} switchScene - 切换场景
 * @property {() => Promise<void>} togglePlay - 切换播放/暂停
 * @property {(value: number) => void} setVolume - 设置音量
 * @property {(delta: number) => void} changeVolume - 调节音量
 * @property {() => void} toggleUi - 切换 UI 显示
 * @property {() => void} resetUiTimer - 重置 UI 自动隐藏计时器
 */

// ─────────────────────────────────────────────────────────────
// 常量配置
// ─────────────────────────────────────────────────────────────

const CONFIG = {
    FADE_DURATION: 3,           // 场景切换淡入淡出时间（秒）
    UI_HIDE_DELAY: 5000,        // UI 自动隐藏延迟（毫秒）
    UI_TRIGGER_ZONE: 0.2,       // UI 触发区域（底部 20%）
    VOLUME_STEP: 0.1,           // 音量调节步进
    DEFAULT_VOLUME: 0.7,        // 默认音量
    AUDIO_UPDATE_INTERVAL: 50   // 音频数据更新间隔（毫秒）
};

/** 数字键到场景的映射 */
const SCENE_KEYS = { '1': 'rain', '2': 'cafe', '3': 'wind' };

// ─────────────────────────────────────────────────────────────
// 主 Hook
// ─────────────────────────────────────────────────────────────

/**
 * Stay 主状态管理 Hook
 * 
 * 整合音频控制、UI 可见性、键盘快捷键于一体
 * 
 * @returns {{ state: StayState, actions: StayActions }}
 * 
 * @example
 * ```jsx
 * function App() {
 *   const { state, actions } = useStay();
 *   
 *   return (
 *     <div>
 *       <VisualLayer audioData={state.audioData} />
 *       <button onClick={actions.togglePlay}>
 *         {state.isPlaying ? 'Pause' : 'Play'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useStay() {
    // ═══════════════════════════════════════════════════════════
    // 核心状态（触发重渲染）
    // ═══════════════════════════════════════════════════════════

    /** @type {[SceneType, Function]} */
    const [currentScene, setCurrentScene] = useState('rain');

    /** @type {[boolean, Function]} */
    const [isPlaying, setIsPlaying] = useState(false);

    /** @type {[boolean, Function]} */
    const [uiVisible, setUiVisible] = useState(true);

    /** @type {[number, Function]} */
    const [volume, setVolume] = useState(CONFIG.DEFAULT_VOLUME);

    /** @type {[AudioData, Function]} */
    const [audioData, setAudioData] = useState({ low: 0, mid: 0, high: 0, volume: 0 });

    /** @type {[PlaybackState, Function]} 场景切换状态（用于过渡动画） */
    const [playbackState, setPlaybackState] = useState('idle');

    // ═══════════════════════════════════════════════════════════
    // Refs（不触发重渲染）
    // 
    // 设计考量：
    // - 计时器 ID、标志位等不需要触发 UI 更新
    // - 使用 Ref 可避免闭包陷阱，始终访问最新值
    // ═══════════════════════════════════════════════════════════

    /** @type {React.MutableRefObject<AudioEngine | null>} 音频引擎实例 */
    const engineRef = useRef(null);

    /** @type {React.MutableRefObject<number | null>} UI 自动隐藏计时器 */
    const uiHideTimerRef = useRef(null);

    /** @type {React.MutableRefObject<number | null>} 音频数据更新定时器 */
    const audioUpdateIntervalRef = useRef(null);

    /** @type {React.MutableRefObject<boolean>} H键强制隐藏标志 */
    const uiForcedHiddenRef = useRef(false);

    /** @type {React.MutableRefObject<boolean>} 场景切换锁（防止重入） */
    const isSwitchingRef = useRef(false);

    // ═══════════════════════════════════════════════════════════
    // 音频引擎初始化与清理
    // 
    // 生命周期：
    // - 挂载时：创建 AudioEngine 实例并初始化
    // - 卸载时：销毁实例释放资源
    // ═══════════════════════════════════════════════════════════

    useEffect(() => {
        // 仅创建实例，不初始化 AudioContext
        // AudioContext 必须在用户手势（点击/按键）后才能启动
        const engine = new AudioEngine({ defaultVolume: volume });
        engineRef.current = engine;

        // 清理函数
        return () => {
            if (engineRef.current) {
                engineRef.current.destroy();
                engineRef.current = null;
            }
        };
    }, []); // 空依赖 = 仅在挂载/卸载时执行

    /**
     * 确保引擎已初始化（延迟到首次用户交互时调用）
     * Chrome 的自动播放策略要求 AudioContext 必须在用户手势后创建/恢复
     */
    const ensureInit = useCallback(async () => {
        const engine = engineRef.current;
        if (!engine) return false;
        if (engine.isInitialized) return true;

        try {
            await engine.init();
            return true;
        } catch (err) {
            console.error('[useStay] AudioEngine init failed:', err);
            return false;
        }
    }, []);

    // ═══════════════════════════════════════════════════════════
    // 音频数据实时更新
    // 
    // 性能优化：
    // - 仅在播放时启动定时器
    // - 使用 50ms 间隔（20fps），足够驱动视觉效果
    // - 停止时立即清零，避免残留数据
    // ═══════════════════════════════════════════════════════════

    useEffect(() => {
        if (!isPlaying) {
            // 停止时清零音频数据
            setAudioData({ low: 0, mid: 0, high: 0, volume: 0 });
            return;
        }

        // 播放时定期更新音频数据
        audioUpdateIntervalRef.current = setInterval(() => {
            if (engineRef.current) {
                const data = engineRef.current.getAudioData();
                setAudioData({
                    low: data.lowFrequency,
                    mid: data.midFrequency,
                    high: data.highFrequency,
                    volume: data.volume
                });
            }
        }, CONFIG.AUDIO_UPDATE_INTERVAL);

        return () => {
            if (audioUpdateIntervalRef.current) {
                clearInterval(audioUpdateIntervalRef.current);
                audioUpdateIntervalRef.current = null;
            }
        };
    }, [isPlaying]);

    // ═══════════════════════════════════════════════════════════
    // 场景切换（状态机核心逻辑）
    // 
    // 状态机转换：
    //   idle ──────► switching ──────► playing
    //    │              │                 │
    //    ▼              ▼                 ▼
    //   (等待)     (淡入淡出中)      (正常播放)
    // 
    // 关键行为：
    // - 使用锁防止快速连续切换导致的竞态
    // - 相同场景播放中不重复切换
    // - 切换失败时回退到之前状态
    // ═══════════════════════════════════════════════════════════

    const switchScene = useCallback(async (newScene) => {
        // 首次交互时初始化 AudioContext（满足 Chrome 自动播放策略）
        const ready = await ensureInit();
        if (!ready) return;

        const engine = engineRef.current;

        // 前置检查
        if (!engine) {
            console.warn('[useStay] Engine not ready');
            return;
        }
        if (isSwitchingRef.current) {
            console.warn('[useStay] Scene switch in progress, ignored');
            return;
        }
        if (newScene === currentScene && isPlaying) {
            return; // 已在播放相同场景
        }

        // 加锁 + 进入切换状态
        isSwitchingRef.current = true;
        setPlaybackState('switching');

        try {
            if (currentScene && isPlaying && newScene !== currentScene) {
                // 场景切换：使用交叉淡化
                await engine.switchScene(newScene, CONFIG.FADE_DURATION);
            } else {
                // 首次播放或从暂停恢复
                await engine.play(newScene);
            }

            // 切换成功，更新状态
            setCurrentScene(newScene);
            setIsPlaying(true);
            setPlaybackState('playing');

        } catch (error) {
            console.error('[useStay] Scene switch failed:', error);
            // 切换失败，回退状态
            setPlaybackState(isPlaying ? 'playing' : 'idle');

        } finally {
            // 释放锁
            isSwitchingRef.current = false;
        }
    }, [currentScene, isPlaying, ensureInit]);

    // ═══════════════════════════════════════════════════════════
    // 播放控制
    // 
    // 行为：
    // - 播放中 → 暂停：淡出后停止
    // - 暂停中 → 播放：恢复当前场景
    // ═══════════════════════════════════════════════════════════

    const togglePlay = useCallback(async () => {
        // 首次交互时初始化 AudioContext（满足 Chrome 自动播放策略）
        const ready = await ensureInit();
        if (!ready) return;

        const engine = engineRef.current;
        if (!engine) return;

        if (isPlaying) {
            // 暂停：淡出后停止
            await engine.stop(CONFIG.FADE_DURATION);
            setIsPlaying(false);
            setPlaybackState('idle');
        } else {
            // 恢复播放：使用当前场景
            await switchScene(currentScene);
        }
    }, [isPlaying, currentScene, switchScene, ensureInit]);

    // ═══════════════════════════════════════════════════════════
    // 音量控制
    // 
    // 设计：
    // - changeVolume: 增量调节（用于键盘）
    // - setVolumeAbsolute: 绝对值设置（用于滑块）
    // - 同步更新 AudioEngine
    // ═══════════════════════════════════════════════════════════

    const changeVolume = useCallback((delta) => {
        setVolume(prev => {
            const newVolume = Math.max(0, Math.min(1, prev + delta));
            if (engineRef.current) {
                engineRef.current.setVolume(newVolume);
            }
            return newVolume;
        });
    }, []);

    const setVolumeAbsolute = useCallback((value) => {
        const clampedValue = Math.max(0, Math.min(1, value));
        setVolume(clampedValue);
        if (engineRef.current) {
            engineRef.current.setVolume(clampedValue);
        }
    }, []);

    // ═══════════════════════════════════════════════════════════
    // UI 可见性管理
    // 
    // 状态机：
    //   visible ◄─────────────► hidden
    //      │                        │
    //      │   (5秒无操作)          │ (鼠标移入底部区域)
    //      └───────────►────────────┘
    //           (H键强制切换)
    // 
    // 特殊逻辑：
    // - H键强制隐藏会禁用自动显示
    // - 再次按H恢复自动控制
    // ═══════════════════════════════════════════════════════════

    const resetUiTimer = useCallback(() => {
        // 如果被 H 键强制隐藏，不响应自动显示
        if (uiForcedHiddenRef.current) return;

        // 清除现有计时器
        if (uiHideTimerRef.current) {
            clearTimeout(uiHideTimerRef.current);
        }

        // 显示 UI
        setUiVisible(true);

        // 设置自动隐藏计时器
        uiHideTimerRef.current = setTimeout(() => {
            setUiVisible(false);
        }, CONFIG.UI_HIDE_DELAY);
    }, []);

    const toggleUiForced = useCallback(() => {
        uiForcedHiddenRef.current = !uiForcedHiddenRef.current;

        if (uiForcedHiddenRef.current) {
            // 强制隐藏：清除计时器并隐藏
            if (uiHideTimerRef.current) {
                clearTimeout(uiHideTimerRef.current);
                uiHideTimerRef.current = null;
            }
            setUiVisible(false);
        } else {
            // 取消强制隐藏：恢复自动控制
            resetUiTimer();
        }
    }, [resetUiTimer]);

    // ═══════════════════════════════════════════════════════════
    // 鼠标区域检测
    // 
    // 行为：鼠标移入底部 20% 区域时显示 UI
    // 优化：使用 passive 事件监听器
    // ═══════════════════════════════════════════════════════════

    useEffect(() => {
        const handleMouseMove = (e) => {
            const isInTriggerZone = e.clientY > window.innerHeight * (1 - CONFIG.UI_TRIGGER_ZONE);

            if (isInTriggerZone && !uiForcedHiddenRef.current) {
                resetUiTimer();
            }
        };

        // passive: true 优化滚动性能
        window.addEventListener('mousemove', handleMouseMove, { passive: true });

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (uiHideTimerRef.current) {
                clearTimeout(uiHideTimerRef.current);
                uiHideTimerRef.current = null;
            }
        };
    }, [resetUiTimer]);

    // ═══════════════════════════════════════════════════════════
    // 键盘快捷键
    // 
    // 快捷键列表：
    // - Space: 播放/暂停
    // - H: 隐藏/显示 UI
    // - 1/2/3: 快速切换场景
    // - ↑/↓: 音量调节
    // 
    // 注意：忽略输入框内的按键
    // ═══════════════════════════════════════════════════════════

    useEffect(() => {
        const handleKeyDown = (e) => {
            // 忽略输入框内的按键
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;

                case 'h':
                    e.preventDefault();
                    toggleUiForced();
                    break;

                case '1':
                case '2':
                case '3':
                    e.preventDefault();
                    switchScene(SCENE_KEYS[e.key]);
                    break;

                case 'arrowup':
                    e.preventDefault();
                    changeVolume(CONFIG.VOLUME_STEP);
                    break;

                case 'arrowdown':
                    e.preventDefault();
                    changeVolume(-CONFIG.VOLUME_STEP);
                    break;

                default:
                    // 未知快捷键，不处理
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, toggleUiForced, switchScene, changeVolume]);

    // ═══════════════════════════════════════════════════════════
    // 返回值（使用 useMemo 缓存）
    // 
    // 结构设计：
    // - state: 只读状态对象
    // - actions: 操作函数集合
    // 
    // 这种结构便于：
    // - 解构使用
    // - 传递给子组件
    // - 进行 TypeScript 类型推断
    // ═══════════════════════════════════════════════════════════

    return useMemo(() => ({
        // 状态（只读）
        state: {
            currentScene,
            isPlaying,
            uiVisible,
            volume,
            audioData,
            playbackState
        },

        // 操作
        actions: {
            switchScene,
            togglePlay,
            setVolume: setVolumeAbsolute,
            changeVolume,
            toggleUi: toggleUiForced,
            resetUiTimer
        }
    }), [
        // 状态依赖
        currentScene, isPlaying, uiVisible, volume, audioData, playbackState,
        // 操作依赖（useCallback 保证稳定性）
        switchScene, togglePlay, setVolumeAbsolute, changeVolume, toggleUiForced, resetUiTimer
    ]);
}

// 导出配置供外部使用（如需自定义）
export { CONFIG as STAY_CONFIG };
