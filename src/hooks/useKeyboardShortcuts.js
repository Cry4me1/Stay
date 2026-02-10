/**
 * ═══════════════════════════════════════════════════════════════
 * useKeyboardShortcuts - 键盘快捷键 Hook
 * ═══════════════════════════════════════════════════════════════
 * 
 * 通用的键盘快捷键管理 Hook
 * 
 * 设计考量：
 * 1. 统一的按键处理入口
 * 2. 自动忽略输入框内的按键
 * 3. 自动阻止已绑定按键的默认行为
 * 4. 支持组合键（可扩展）
 */

import { useCallback, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} KeyboardOptions
 * @property {boolean} [preventDefault=true] - 是否阻止默认行为
 * @property {boolean} [ignoreInputs=true] - 是否忽略输入框内的按键
 * @property {string[]} [ignoredTags=['INPUT', 'TEXTAREA', 'SELECT']] - 忽略的元素标签
 */

/**
 * @typedef {Object.<string, (event: KeyboardEvent) => void>} KeyHandlers
 */

// ─────────────────────────────────────────────────────────────
// 默认配置
// ─────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
    preventDefault: true,
    ignoreInputs: true,
    ignoredTags: ['INPUT', 'TEXTAREA', 'SELECT']
};

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 标准化按键名称
 * 
 * @param {string} key - 原始按键名
 * @returns {string} 标准化后的按键名
 */
function normalizeKey(key) {
    // 特殊按键映射
    const keyMap = {
        ' ': 'space',
        'arrowup': 'up',
        'arrowdown': 'down',
        'arrowleft': 'left',
        'arrowright': 'right',
        'escape': 'esc'
    };

    const lowered = key.toLowerCase();
    return keyMap[lowered] || lowered;
}

// ─────────────────────────────────────────────────────────────
// Hook 实现
// ─────────────────────────────────────────────────────────────

/**
 * 键盘快捷键 Hook
 * 
 * @param {KeyHandlers} handlers - 按键处理函数映射
 * @param {KeyboardOptions} [options] - 配置选项
 * 
 * @example
 * ```jsx
 * function Player() {
 *   const [playing, setPlaying] = useState(false);
 *   const [volume, setVolume] = useState(0.7);
 *   
 *   useKeyboardShortcuts({
 *     // 使用标准化名称
 *     'space': () => setPlaying(p => !p),
 *     'up': () => setVolume(v => Math.min(1, v + 0.1)),
 *     'down': () => setVolume(v => Math.max(0, v - 0.1)),
 *     
 *     // 或使用原始按键名
 *     'h': () => toggleUI(),
 *     '1': () => switchScene('rain'),
 *     '2': () => switchScene('cafe'),
 *     '3': () => switchScene('wind')
 *   });
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function useKeyboardShortcuts(handlers, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };

    // 使用 ref 存储 handlers，避免每次更新都重新绑定事件
    const handlersRef = useRef(handlers);

    // 同步更新 ref
    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    // 事件处理
    const handleKeyDown = useCallback((event) => {
        // 检查是否应忽略此事件
        if (config.ignoreInputs) {
            const tagName = event.target.tagName.toUpperCase();
            if (config.ignoredTags.includes(tagName)) {
                return;
            }

            // 也检查 contentEditable 元素
            if (event.target.isContentEditable) {
                return;
            }
        }

        // 标准化按键名
        const key = normalizeKey(event.key);

        // 查找处理函数（支持原始名和标准化名）
        const handler = handlersRef.current[key] || handlersRef.current[event.key];

        if (handler) {
            if (config.preventDefault) {
                event.preventDefault();
            }
            handler(event);
        }
    }, [config.ignoreInputs, config.ignoredTags, config.preventDefault]);

    // 绑定/解绑事件
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}

// ─────────────────────────────────────────────────────────────
// 预设快捷键配置
// ─────────────────────────────────────────────────────────────

/**
 * 创建 Stay 默认快捷键配置
 * 
 * @param {Object} actions - 操作函数集合
 * @param {Function} actions.togglePlay - 切换播放/暂停
 * @param {Function} actions.toggleUi - 切换 UI 显示
 * @param {Function} actions.switchScene - 切换场景
 * @param {Function} actions.changeVolume - 调节音量
 * 
 * @returns {KeyHandlers} 快捷键处理函数映射
 * 
 * @example
 * ```jsx
 * const { actions } = useStay();
 * useKeyboardShortcuts(createStayKeyHandlers(actions));
 * ```
 */
export function createStayKeyHandlers({
    togglePlay,
    toggleUi,
    switchScene,
    changeVolume
}) {
    return {
        'space': togglePlay,
        'h': toggleUi,
        '1': () => switchScene('rain'),
        '2': () => switchScene('cafe'),
        '3': () => switchScene('wind'),
        'up': () => changeVolume(0.1),
        'down': () => changeVolume(-0.1)
    };
}
