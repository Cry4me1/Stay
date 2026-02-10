import { useEffect, useRef } from 'react';
import { lerpColorHSL } from '../utils/colorUtils';

// ─────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────

const TRANSITION_DURATION = 3.5;
const AUDIO_SMOOTH_FACTOR = 0.12;

/** 场景配色 */
const SCENE_COLORS = {
    rain: { c1: '#1e2d3d', c2: '#3a6d8f' },
    cafe: { c1: '#3a2518', c2: '#c4915f' },
    wind: { c1: '#1d3a2e', c2: '#5a9878' },
};

// ─────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

/** 安全取数值 */
function safeNum(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }

// ═══════════════════════════════════════════════════════════════
// SceneVisualizer
// ═══════════════════════════════════════════════════════════════

const SceneVisualizer = ({ scene, audioData }) => {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);

    const sceneRef = useRef(scene);
    const audioRef = useRef({ low: 0, mid: 0, high: 0, volume: 0 });
    const smoothAudio = useRef({ low: 0, mid: 0, high: 0, volume: 0 });

    const transRef = useRef({ progress: 1, from: null, to: scene });

    const sceneState = useRef({
        rain: createRainState(),
        cafe: createCafeState(),
        wind: createWindState(),
        time: 0,
    });

    // 同步 props → ref
    useEffect(() => { audioRef.current = audioData; }, [audioData]);

    useEffect(() => {
        if (scene !== sceneRef.current) {
            transRef.current = { progress: 0, from: sceneRef.current, to: scene };
            sceneRef.current = scene;
        }
    }, [scene]);

    // ─── 唯一的动画循环 ───
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let last = performance.now();

        function frame(now) {
            const dtRaw = (now - last) / 1000;
            const dt = Number.isFinite(dtRaw) ? Math.min(Math.max(dtRaw, 0.001), 0.1) : 0.016;
            last = now;

            // resize
            const dpr = window.devicePixelRatio || 1;
            const W = window.innerWidth;
            const H = window.innerHeight;
            if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
                canvas.width = W * dpr;
                canvas.height = H * dpr;
                canvas.style.width = W + 'px';
                canvas.style.height = H + 'px';
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            // 平滑音频
            const raw = audioRef.current;
            const sm = smoothAudio.current;
            sm.low = lerp(sm.low, safeNum(raw.low), AUDIO_SMOOTH_FACTOR);
            sm.mid = lerp(sm.mid, safeNum(raw.mid), AUDIO_SMOOTH_FACTOR);
            sm.high = lerp(sm.high, safeNum(raw.high), AUDIO_SMOOTH_FACTOR);
            sm.volume = lerp(sm.volume, safeNum(raw.volume), AUDIO_SMOOTH_FACTOR);

            // 过渡
            const tr = transRef.current;
            if (tr.progress < 1) {
                tr.progress = Math.min(1, tr.progress + dt / TRANSITION_DURATION);
            }
            const t = easeInOutCubic(clamp01(tr.progress));

            const S = sceneState.current;
            S.time += dt;

            // ─── 绘制 ───
            ctx.clearRect(0, 0, W, H);

            if (tr.progress < 1 && tr.from) {
                // === 过渡中 ===
                const fromC = SCENE_COLORS[tr.from] || SCENE_COLORS.rain;
                const toC = SCENE_COLORS[tr.to] || SCENE_COLORS.rain;
                const c1 = lerpColorHSL(fromC.c1, toC.c1, t);
                const c2 = lerpColorHSL(fromC.c2, toC.c2, t);

                drawBg(ctx, W, H, c1 || fromC.c1, c2 || fromC.c2, sm);

                // 旧场景淡出
                ctx.save();
                ctx.globalAlpha = clamp01(1 - t);
                drawScene(tr.from, ctx, W, H, sm, dt, S);
                ctx.restore();

                // 新场景淡入
                ctx.save();
                ctx.globalAlpha = clamp01(t);
                drawScene(tr.to, ctx, W, H, sm, dt, S);
                ctx.restore();

                // 中间闪光 (40%-60%)
                if (t > 0.4 && t < 0.6) {
                    const flash = 1 - Math.abs((t - 0.5) * 10);
                    ctx.fillStyle = `rgba(255,255,255,${clamp01(flash * 0.12)})`;
                    ctx.fillRect(0, 0, W, H);
                }
            } else {
                // === 正常渲染 ===
                const colors = SCENE_COLORS[tr.to] || SCENE_COLORS.rain;
                drawBg(ctx, W, H, colors.c1, colors.c2, sm);
                drawScene(tr.to, ctx, W, H, sm, dt, S);
            }

            rafRef.current = requestAnimationFrame(frame);
        }

        rafRef.current = requestAnimationFrame(frame);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                inset: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
            }}
        />
    );
};

// ═══════════════════════════════════════════════════════════════
// 通用
// ═══════════════════════════════════════════════════════════════

function drawBg(ctx, w, h, c1, c2, a) {
    const pulse = 1 + safeNum(a.low) * 0.02;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(pulse, pulse);

    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    try { g.addColorStop(0, c1); g.addColorStop(1, c2); }
    catch { g.addColorStop(0, '#111'); g.addColorStop(1, '#222'); }
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2 - 20, -h / 2 - 20, w + 40, h + 40);
    ctx.restore();
}

function drawScene(name, ctx, w, h, a, dt, S) {
    switch (name) {
        case 'rain': drawRain(ctx, w, h, a, dt, S); break;
        case 'cafe': drawCafe(ctx, w, h, a, dt, S); break;
        case 'wind': drawWind(ctx, w, h, a, dt, S); break;
    }
}

// ═══════════════════════════════════════════════════════════════
// 雨声
// ═══════════════════════════════════════════════════════════════

function createRainState() {
    const W = (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const H = (typeof window !== 'undefined' ? window.innerHeight : 1080);
    const drops = [];
    for (let i = 0; i < 200; i++) drops.push(newDrop(W, H, true));
    return {
        drops,
        ripples: Array.from({ length: 50 }, () => ({ on: false, x: 0, y: 0, r: 0, mr: 0, a: 0 })),
        ri: 0,
        lt: { a: 0, cd: 5 },
    };
}

function newDrop(w, h, scatter) {
    return {
        x: Math.random() * w * 1.2 - w * 0.1,
        y: scatter ? Math.random() * h : -Math.random() * 80,
        spd: 350 + Math.random() * 550,
        len: 8 + Math.random() * 22,
        a: 0.15 + Math.random() * 0.35,
    };
}

function drawRain(ctx, w, h, au, dt, S) {
    const R = S.rain;

    // 闪电
    R.lt.cd -= dt;
    if (R.lt.cd <= 0 && Math.random() < 0.003 + au.high * 0.006) {
        R.lt.a = 0.25 + Math.random() * 0.45;
        R.lt.cd = 3 + Math.random() * 6;
    }
    if (R.lt.a > 0) {
        ctx.fillStyle = `rgba(200,220,255,${R.lt.a})`;
        ctx.fillRect(0, 0, w, h);
        R.lt.a -= dt * 3;
    }

    // 雨滴
    const nActive = Math.floor(60 + au.high * 140);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (let i = 0; i < R.drops.length && i < nActive; i++) {
        const d = R.drops[i];
        d.y += d.spd * dt;
        const alpha = clamp01(d.a + au.high * 0.3);
        ctx.strokeStyle = `rgba(180,210,240,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 0.8, d.y + d.len);
        ctx.stroke();

        if (d.y > h) {
            if (Math.random() < 0.12 + au.mid * 0.4) {
                const rp = R.ripples[R.ri % R.ripples.length];
                rp.on = true; rp.x = d.x; rp.y = h - 15 - Math.random() * 60;
                rp.r = 1; rp.mr = 12 + Math.random() * 22 + au.mid * 12;
                rp.a = 0.25 + au.mid * 0.3;
                R.ri++;
            }
            Object.assign(d, newDrop(w, h, false));
        }
    }

    // 波纹
    ctx.lineWidth = 1;
    for (const rp of R.ripples) {
        if (!rp.on) continue;
        rp.r += dt * 35; rp.a -= dt * 0.55;
        if (rp.a <= 0 || rp.r >= rp.mr) { rp.on = false; continue; }
        ctx.strokeStyle = `rgba(180,210,240,${rp.a})`;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    // 雾气
    const fg = ctx.createLinearGradient(0, h * 0.5, 0, h);
    fg.addColorStop(0, 'rgba(150,180,210,0)');
    fg.addColorStop(1, `rgba(150,180,210,${0.03 + au.low * 0.02})`);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, w, h);
}

// ═══════════════════════════════════════════════════════════════
// 咖啡馆
// ═══════════════════════════════════════════════════════════════

function createCafeState() {
    return {
        steam: Array.from({ length: 30 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, sz: 0, life: 0 })),
        si: 0,
        sp: Array.from({ length: 40 }, () => ({ on: false, x: 0, y: 0, sz: 0, a: 0 })),
        spi: 0,
        gp: 0, fp: 0,
    };
}

function drawCafe(ctx, w, h, au, dt, S) {
    const C = S.cafe;
    C.gp += dt * 0.8;
    C.fp += dt * 0.5;

    // 暖色径向覆盖
    const rg = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, w * 0.7);
    rg.addColorStop(0, `rgba(200,160,100,${0.06 + au.mid * 0.08})`);
    rg.addColorStop(1, 'rgba(200,160,100,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // 光晕
    const gi = 0.08 + au.mid * 0.22;
    const gPulse = Math.sin(C.gp * 2) * 0.025;
    glow(ctx, w * 0.2, h * 0.25, 80 + au.mid * 55, gi + gPulse, '255,200,130');
    glow(ctx, w * 0.75, h * 0.3, 60 + au.mid * 45, (gi + gPulse) * 0.8, '255,190,120');
    glow(ctx, w * 0.5, h * 0.15, 100 + au.mid * 35, (gi + gPulse) * 0.5, '255,210,150');

    // 人影
    const sway = Math.sin(C.fp) * (6 + au.low * 14);
    const fa = 0.05 + au.low * 0.04;
    shadow(ctx, w * 0.25 + sway, h * 0.85, 65, 155, fa);
    shadow(ctx, w * 0.7 - sway * 0.7, h * 0.82, 75, 145, fa * 0.8);
    shadow(ctx, w * 0.45 + sway * 0.5, h * 0.88, 55, 135, fa * 0.6);

    // 蒸汽
    if (Math.random() < 0.35 + au.low * 0.25) {
        const p = C.steam[C.si % C.steam.length];
        p.on = true;
        p.x = w * (0.35 + Math.random() * 0.3);
        p.y = h * 0.75 + Math.random() * h * 0.1;
        p.vx = (Math.random() - 0.5) * 12;
        p.vy = -12 - Math.random() * 22;
        p.sz = 12 + Math.random() * 22;
        p.life = 1;
        C.si++;
    }
    for (const p of C.steam) {
        if (!p.on) continue;
        p.x += p.vx * dt + Math.sin(S.time * 2 + p.y * 0.02) * 0.25;
        p.y += p.vy * dt * (1 + au.low * 0.4);
        p.life -= dt * 0.22;
        p.sz += dt * 7;
        if (p.life <= 0) { p.on = false; continue; }
        ctx.fillStyle = `rgba(255,240,220,${p.life * 0.05})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
        ctx.fill();
    }

    // 光点
    if (Math.random() < au.high * 0.28) {
        const s = C.sp[C.spi % C.sp.length];
        s.on = true; s.x = Math.random() * w; s.y = Math.random() * h * 0.7;
        s.sz = 1 + Math.random() * 2.5; s.a = 0.4 + Math.random() * 0.5;
        C.spi++;
    }
    for (const s of C.sp) {
        if (!s.on) continue;
        s.a -= dt * 1.6;
        if (s.a <= 0) { s.on = false; continue; }
        ctx.fillStyle = `rgba(255,240,200,${s.a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.sz, 0, Math.PI * 2);
        ctx.fill();
    }
}

function glow(ctx, x, y, r, a, rgb) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.5, `rgba(${rgb},${a * 0.35})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function shadow(ctx, x, y, rx, ry, alpha) {
    for (let i = 3; i >= 0; i--) {
        ctx.fillStyle = `rgba(20,15,10,${alpha * (1 - i * 0.22)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx * (1 + i * 0.15), ry * (1 + i * 0.15), 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ═══════════════════════════════════════════════════════════════
// 风声
// ═══════════════════════════════════════════════════════════════

function createWindState() {
    const W = (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const H = (typeof window !== 'undefined' ? window.innerHeight : 1080);
    const grass = [];
    const n = Math.floor(W / 14);
    for (let i = 0; i < n; i++) {
        grass.push({ x: i * 14 + Math.random() * 5, h: 35 + Math.random() * 95, ph: Math.random() * Math.PI * 2, tw: 1 + Math.random() * 1.3 });
    }
    return {
        grass,
        pts: Array.from({ length: 55 }, () => ({
            x: Math.random() * W, y: Math.random() * H,
            vx: 50 + Math.random() * 140, vy: (Math.random() - 0.5) * 25,
            sz: 1 + Math.random() * 2.8, a: 0.2 + Math.random() * 0.35,
        })),
        gust: 0, flow: 0,
    };
}

function drawWind(ctx, w, h, au, dt, S) {
    const Wi = S.wind;
    const wf = 1 + au.low * 2;
    Wi.gust += dt * 0.3;
    Wi.flow += dt * 25 * wf;

    // 雾层
    for (let i = 0; i < 3; i++) {
        const yb = h * (0.3 + i * 0.2);
        const alpha = 0.02 + au.low * 0.02;
        const xs = Math.sin(S.time * 0.3 + i * 2) * 45 * wf;
        const fg = ctx.createLinearGradient(xs - w * 0.2, yb, w + xs, yb);
        fg.addColorStop(0, 'rgba(180,220,200,0)');
        fg.addColorStop(0.3, `rgba(180,220,200,${alpha})`);
        fg.addColorStop(0.7, `rgba(180,220,200,${alpha * 0.5})`);
        fg.addColorStop(1, 'rgba(180,220,200,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, yb - 75, w, 150);
    }

    // 阵风晃动
    const tilt = Math.sin(Wi.gust) * au.low * 0.003;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(tilt);
    ctx.translate(-w / 2, -h / 2);

    // 山峦
    const mAlpha = 0.04 + au.low * 0.02;
    ctx.fillStyle = `rgba(30,60,45,${mAlpha})`;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.6);
    for (let x = 0; x <= w; x += 35) {
        ctx.lineTo(x, h * 0.55 + Math.sin(x * 0.005 + 1) * h * 0.08 + Math.sin(x * 0.012) * h * 0.03);
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

    // 草叶
    const nGrass = Math.floor(w / 14);
    while (Wi.grass.length < nGrass) {
        Wi.grass.push({ x: Wi.grass.length * 14 + Math.random() * 5, h: 35 + Math.random() * 95, ph: Math.random() * Math.PI * 2, tw: 1 + Math.random() * 1.3 });
    }
    for (let i = 0; i < Math.min(Wi.grass.length, nGrass); i++) {
        const b = Wi.grass[i];
        const sw = Math.sin(S.time * 1.5 + b.ph) * (8 + au.mid * 22) * wf;
        ctx.strokeStyle = `rgba(140,200,170,${0.1 + au.mid * 0.14})`;
        ctx.lineWidth = b.tw;
        ctx.beginPath();
        ctx.moveTo(b.x, h);
        ctx.quadraticCurveTo(b.x + sw * 0.4, h - b.h * 0.5, b.x + sw, h - b.h);
        ctx.stroke();
    }

    ctx.restore();

    // 飞行光斑
    const nPts = Math.floor(18 + au.high * 37);
    for (let i = 0; i < Wi.pts.length && i < nPts; i++) {
        const p = Wi.pts[i];
        p.x += p.vx * dt * wf;
        p.y += p.vy * dt + Math.sin(S.time * 3 + i) * 0.4;
        if (p.x > w + 15) { p.x = -8; p.y = Math.random() * h; p.vx = 50 + Math.random() * 140; }
        ctx.fillStyle = `rgba(200,255,220,${clamp01(p.a + au.high * 0.2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
        ctx.fill();
    }
}

export default SceneVisualizer;
