import { CloudRain, Coffee, Eye, Wind } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * ControlBar Component
 * 
 * A minimalist, auto-hiding control bar for the Stay application.
 * 
 * @param {Object} props
 * @param {boolean} props.visible - Whether the UI is currently visible
 * @param {'rain' | 'cafe' | 'wind'} props.scene - Current active scene
 * @param {number} props.volume - Current volume (0-1)
 * @param {(scene: string) => void} props.onSceneChange - Callback for scene switching
 * @param {(volume: number) => void} props.onVolumeChange - Callback for volume change
 * @param {() => void} props.onToggleHide - Callback for hiding the UI fully
 * @param {() => void} props.onInteraction - Callback to reset auto-hide timer
 */
const ControlBar = ({
    visible,
    scene,
    volume,
    onSceneChange,
    onVolumeChange,
    onToggleHide,
    onInteraction
}) => {
    // Internal hover state to prevent hiding while interacting with the bar itself
    // Note: While useStay handles global mouse move, interacting with the slider 
    // might strictly not generate mouse move events if holding still. 
    // But usually onInteraction is enough.

    return (
        <div
            className={`
        fixed bottom-8 left-1/2 -translate-x-1/2
        flex items-center gap-8
        px-8 py-4
        bg-black/40 backdrop-blur-sm
        rounded-full
        transition-all duration-500 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}
            onMouseMove={onInteraction}
            onTouchStart={onInteraction}
        >
            {/* Scene Switcher */}
            <div className="flex items-center gap-6">
                <SceneButton
                    active={scene === 'rain'}
                    icon={CloudRain}
                    label="Rain"
                    onClick={() => onSceneChange('rain')}
                />
                <SceneButton
                    active={scene === 'cafe'}
                    icon={Coffee}
                    label="Cafe"
                    onClick={() => onSceneChange('cafe')}
                />
                <SceneButton
                    active={scene === 'wind'}
                    icon={Wind}
                    label="Wind"
                    onClick={() => onSceneChange('wind')}
                />
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-white/20" />

            {/* Volume Slider */}
            <VolumeSlider
                volume={volume}
                onChange={onVolumeChange}
                onInteraction={onInteraction}
            />

            {/* Divider */}
            <div className="w-px h-8 bg-white/20" />

            {/* Hide Button */}
            <button
                onClick={onToggleHide}
                className="
          group relative flex flex-col items-center justify-center
          text-white/60 hover:text-white
          transition-colors duration-300
        "
                aria-label="Hide UI"
            >
                <Eye className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
            </button>
        </div>
    );
};

// --- Subcomponents ---

const SceneButton = ({ active, icon: Icon, label, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`
        group relative flex flex-col items-center gap-1
        transition-all duration-300
        ${active ? 'text-white opacity-100' : 'text-white opacity-40 hover:opacity-100'}
      `}
        >
            <div className={`p-1 transition-transform duration-300 ${active ? '' : 'group-hover:scale-110'}`}>
                <Icon strokeWidth={1.5} className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-medium tracking-wider uppercase">{label}</span>

            {/* Active Indicator Line */}
            <span
                className={`
          absolute -bottom-2
          h-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]
          transition-all duration-300 ease-out
          ${active ? 'w-full opacity-100' : 'w-0 opacity-0'}
        `}
            />
        </button>
    );
};

const VolumeSlider = ({ volume, onChange, onInteraction }) => {
    const [isDragging, setIsDragging] = useState(false);
    const trackRef = useRef(null);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        updateVolume(e);
        onInteraction();
    };

    const updateVolume = (e) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const x = e.clientX || e.touches?.[0]?.clientX;
        if (x === undefined) return;

        // Calculate percentage
        let percent = (x - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));

        onChange(percent);
    };

    // Global mouse up/move handlers for dragging
    useEffect(() => {
        const handleMove = (e) => {
            if (isDragging) {
                updateVolume(e);
                onInteraction(); // Keep UI alive while dragging
            }
        };
        const handleUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
            window.addEventListener('touchmove', handleMove);
            window.addEventListener('touchend', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleUp);
        };
    }, [isDragging, onChange, onInteraction]);

    return (
        <div
            className="group relative w-32 h-10 flex items-center cursor-pointer"
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
        >
            {/* Hover area / Interaction zone */}

            {/* Track Background (Line) */}
            <div
                ref={trackRef}
                className={`
          absolute top-1/2 left-0 w-full h-0.5 -mt-px
          bg-white/20 rounded-full
          transition-all duration-300
          ${isDragging ? 'opacity-50' : ''}
        `}
            />

            {/* Active Track (Fill) */}
            <div
                className={`
          absolute top-1/2 left-0 h-0.5 -mt-px
          bg-white rounded-full
          ${isDragging ? 'transition-none shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'transition-all duration-300 group-hover:shadow-[0_0_8px_rgba(255,255,255,0.3)]'}
        `}
                style={{ width: `${volume * 100}%` }}
            />

            {/* Thumb (Dot) */}
            <div
                className={`
          absolute top-1/2 -mt-1.5 -ml-1.5 w-3 h-3
          bg-white rounded-full
          shadow-md
          ${isDragging ? 'transition-none scale-125 shadow-[0_0_15px_rgba(255,255,255,0.8)]' : 'transition-all duration-300 ease-out opacity-100 group-hover:scale-110'}
        `}
                style={{ left: `${volume * 100}%` }}
            />
        </div>
    );
};

export default ControlBar;
