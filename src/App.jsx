import { useEffect, useState } from 'react';
import ControlBar from './components/ControlBar';
import SceneVisualizer from './components/SceneVisualizer';
import { useStay } from './hooks/useStay';

/**
 * Stay App - Main Component
 * 
 * 让网页陪你待着。
 */
function App() {
    const [error, setError] = useState(null);
    const [ready, setReady] = useState(false);

    // Try to initialize useStay, catch any errors
    let state, actions;
    try {
        const stayHook = useStay();
        state = stayHook.state;
        actions = stayHook.actions;
    } catch (e) {
        console.error('[App] Error in useStay:', e);
        if (!error) setError(e.message);
    }

    useEffect(() => {
        setReady(true);
    }, []);

    // Show error screen if hook failed
    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
                <div className="text-center">
                    <p className="text-xl mb-4">初始化失败</p>
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            </div>
        );
    }

    // Show loading while not ready
    if (!ready || !state) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
                <p className="text-xl">加载中...</p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full">
            {/* Background Visualizer */}
            <SceneVisualizer
                scene={state.currentScene}
                audioData={state.audioData}
            />

            {/* Control Bar */}
            <ControlBar
                visible={state.uiVisible}
                scene={state.currentScene}
                volume={state.volume}
                onSceneChange={actions.switchScene}
                onVolumeChange={actions.setVolume}
                onToggleHide={actions.toggleUi}
                onInteraction={actions.resetUiTimer}
            />

            {/* Click anywhere to start (first interaction required for audio) */}
            {!state.isPlaying && (
                <div
                    className="absolute inset-0 flex items-center justify-center cursor-pointer z-10"
                    onClick={() => actions.switchScene(state.currentScene)}
                >
                    <div className="text-center text-white/60 transition-opacity duration-500 hover:text-white/90">
                        <p className="text-2xl font-light tracking-widest mb-2">Stay</p>
                        <p className="text-sm opacity-60">点击任意位置开始</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;

