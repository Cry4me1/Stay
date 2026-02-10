/**
 * Color Utilities
 * 
 * Provides helper functions for color manipulation, specifically for
 * interpolating between colors in the HSL space to ensure smooth,
 * vibrant transitions.
 */

/**
 * Converts a hex color string to an RGB object.
 * @param {string} hex - Hex color code (e.g., "#ffffff" or "#fff")
 * @returns {{r: number, g: number, b: number} | null} RGB object or null if invalid
 */
export function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

/**
 * Converts RGB values to HSL.
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{h: number, s: number, l: number}} HSL object (h: 0-360, s: 0-1, l: 0-1)
 */
export function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: h * 360, s, l };
}

/**
 * Converts HSL values to a CSS color string.
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-1)
 * @param {number} l - Lightness (0-1)
 * @returns {string} CSS hsl() string
 */
export function hslToString(h, s, l) {
    return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/**
 * Linearly interpolates between two numbers.
 */
function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

/**
 * Interpolates between two hex colors in HSL space.
 * @param {string} color1 - Start hex color
 * @param {string} color2 - End hex color
 * @param {number} t - Interpolation factor (0-1)
 * @returns {string} Interpolated color as CSS HSL string
 */
export function lerpColorHSL(color1, color2, t) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    if (!rgb1 || !rgb2) return color1;

    const hsl1 = rgbToHsl(rgb1.r, rgb1.g, rgb1.b);
    const hsl2 = rgbToHsl(rgb2.r, rgb2.g, rgb2.b);

    // Handle hue wrapping for shortest path (e.g. 350 -> 10 should go through 0, not 180)
    let h1 = hsl1.h;
    let h2 = hsl2.h;
    const d = h2 - h1;

    if (h1 > h2 && h1 - h2 > 180) {
        h2 += 360;
    } else if (h2 > h1 && h2 - h1 > 180) {
        h1 += 360;
    }

    const h = lerp(h1, h2, t) % 360;
    const s = lerp(hsl1.s, hsl2.s, t);
    const l = lerp(hsl1.l, hsl2.l, t);

    return hslToString(h, s, l);
}
