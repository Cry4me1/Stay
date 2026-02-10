/**
 * ═══════════════════════════════════════════════════════════════
 * useUIVisibility - UI 可见性管理 Hook
 * ═══════════════════════════════════════════════════════════════
 * 
 * 独立的 UI 可见性管理模块，可单独使用或作为 useStay 的组成部分
 * 
 * 职责：
 * 1. 自动隐藏计时器管理
 * 2. 鼠标区域检测触发显示
 * 3. 强制显示/隐藏模式切换
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// 默认配置
// ─────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
    hideDelay: 5000,      // 自动隐藏延迟（毫秒）
    triggerZone: 0.2,     // 触发区域（底部比例 0-1）
    enableMouseTrigger: true  // 是否启用鼠标触发
};

// ─────────────────────────────────────────────────────────────
// Hook 实现
// ─────────────────────────────────────────────────────────────

/**
 * UI 可见性管理 Hook
 * 
 * @param {Object} options - 配置选项
 * @param {number} [options.hideDelay=5000] - 自动隐藏延迟（毫秒）
 * @param {number} [options.triggerZone=0.2] - 鼠标触发区域（底部比例）
 * @param {boolean} [options.enableMouseTrigger=true] - 是否启用鼠标触发
 * 
 * @returns {Object} 可见性控制对象
 * 
 * @example
 * ```jsx
 * function Controls() {
 *   const { visible, toggle, resetTimer } = useUIVisibility({
 *     hideDelay: 3000,
 *     triggerZone: 0.25
 *   });
 *   
 *   return (
 *     <div 
 *       className={visible ? 'controls visible' : 'controls hidden'}
 *       onMouseEnter={resetTimer}
 *     >
 *       <button onClick={toggle}>Toggle UI</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUIVisibility(options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };

    // ═══════════════════════════════════════════════════════════
    // 状态
    // ═══════════════════════════════════════════════════════════

    const [visible, setVisible] = useState(true);

    // ═══════════════════════════════════════════════════════════
    // Refs
    // ═══════════════════════════════════════════════════════════

    /** @type {React.MutableRefObject<number | null>} 自动隐藏计时器 */
    const timerRef = useRef(null);

    /** @type {React.MutableRefObject<boolean>} 强制隐藏标志 */
    const forcedRef = useRef(false);

    // ═══════════════════════════════════════════════════════════
    // 内部方法
    // ═══════════════════════════════════════════════════════════

    /**
     * 清除计时器
     */
    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    /**
     * 重置自动隐藏计时器
     * 
     * 行为：
     * 1. 如果处于强制隐藏模式，不执行任何操作
     * 2. 清除现有计时器
     * 3. 显示 UI
     * 4. 启动新的自动隐藏计时器
     */
    const resetTimer = useCallback(() => {
        // 强制模式下不响应
        if (forcedRef.current) return;

        clearTimer();
        setVisible(true);

        timerRef.current = setTimeout(() => {
            setVisible(false);
        }, config.hideDelay);
    }, [config.hideDelay, clearTimer]);

    /**
     * 切换强制显示/隐藏模式
     * 
     * 行为：
     * - 进入强制隐藏：清除计时器，隐藏 UI
     * - 退出强制隐藏：恢复自动控制模式
     */
    const toggle = useCallback(() => {
        forcedRef.current = !forcedRef.current;

        if (forcedRef.current) {
            // 进入强制隐藏
            clearTimer();
            setVisible(false);
        } else {
            // 退出强制隐藏，恢复自动控制
            resetTimer();
        }
    }, [clearTimer, resetTimer]);

    /**
     * 强制显示 UI（临时打破强制隐藏状态）
     */
    const show = useCallback(() => {
        forcedRef.current = false;
        resetTimer();
    }, [resetTimer]);

    /**
     * 强制隐藏 UI
     */
    const hide = useCallback(() => {
        forcedRef.current = true;
        clearTimer();
        setVisible(false);
    }, [clearTimer]);

    // ═══════════════════════════════════════════════════════════
    // 鼠标区域检测
    // ═══════════════════════════════════════════════════════════

    useEffect(() => {
        if (!config.enableMouseTrigger) return;

        const handleMouseMove = (e) => {
            // 检查是否在触发区域（底部 N%）
            const threshold = window.innerHeight * (1 - config.triggerZone);
            const inZone = e.clientY > threshold;

            if (inZone && !forcedRef.current) {
                resetTimer();
            }
        };

        // passive: true 优化滚动性能
        window.addEventListener('mousemove', handleMouseMove, { passive: true });

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            clearTimer();
        };
    }, [config.triggerZone, config.enableMouseTrigger, resetTimer, clearTimer]);

    // ═══════════════════════════════════════════════════════════
    // 返回值
    // ═══════════════════════════════════════════════════════════

    return {
        /** 当前是否可见 */
        visible,

        /** 切换强制显示/隐藏模式 */
        toggle,

        /** 重置自动隐藏计时器（显示 UI） */
        resetTimer,

        /** 强制显示 */
        show,

        /** 强制隐藏 */
        hide,

        /** 检查是否处于强制隐藏模式 */
        isForced: () => forcedRef.current
    };
}
