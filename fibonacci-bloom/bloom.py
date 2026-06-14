import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.animation import FuncAnimation
from pathlib import Path

# ── Parameters (tweak freely) ────────────────────────────────────
N_POINTS    = 3000     # total points per layer
WAVE_AMP    = 0.18     # organic sine distortion  (0 = perfect sunflower)
WAVE_FREQ   = 8        # distortion frequency
POINT_SIZE  = 6        # scatter dot size (core)
BG_COLOR    = '#06060f'
ALPHA       = 0.85
N_LAYERS    = 3        # overlapping spiral layers
N_FRAMES    = 48       # animation frames (2 s loop at 24 fps)
BREATHE_AMP = 0.08     # ±8% scale pulse

# Cyclic gradient: baby blue → lavender → violet → lavender → baby blue
BLOOM_CMAP = mcolors.LinearSegmentedColormap.from_list(
    'violet_babyblue',
    ['#89CFF0', '#C3A8E6', '#8A2BE2', '#C3A8E6', '#89CFF0'],
)

PHI = (1 + np.sqrt(5)) / 2   # golden ratio
OUT = Path(__file__).parent


# ── Core generator ────────────────────────────────────────────────
# r = sqrt(n)  →  even density from centre outward (classic phyllotaxis)
# theta = n × 2π / φ  →  golden angle gives natural petal structure
def make_bloom(n, wave_amp, wave_freq, scale=1.0, phase=0.0):
    idx   = np.arange(1, n + 1, dtype=float)
    theta = idx * 2 * np.pi / PHI + phase
    r     = np.sqrt(idx) * scale
    wave  = 1 + wave_amp * np.sin(wave_freq * theta)
    r     = r * wave
    x     = r * np.cos(theta)
    y     = r * np.sin(theta)
    t     = idx / n          # 0→1 colour parameter
    return x, y, t, theta


# ── Colour version ────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(12, 12), facecolor=BG_COLOR)
ax.set_facecolor(BG_COLOR)
ax.set_aspect('equal')
ax.axis('off')

scales = [1.0, 0.62, 0.38]          # each layer a fraction of the outer
phases = [0, np.pi / PHI, np.pi]    # staggered phase offsets


def draw_layers(ax, breath=1.0):
    for layer in range(N_LAYERS):
        n   = N_POINTS - layer * 300
        wa  = WAVE_AMP  * (1 - layer * 0.06)
        wf  = WAVE_FREQ + layer * 2
        x, y, t, theta = make_bloom(n, wa, wf,
                                     scale=scales[layer] * breath,
                                     phase=phases[layer])
        color_t = (theta / (2 * np.pi)) % 1.0
        colors  = BLOOM_CMAP(color_t)
        ax.scatter(x, y, c=colors, s=POINT_SIZE * 12,
                   alpha=0.06, linewidths=0, zorder=layer * 2)
        ax.scatter(x, y, c=colors, s=POINT_SIZE,
                   alpha=ALPHA, linewidths=0, zorder=layer * 2 + 1)


draw_layers(ax)

plt.tight_layout(pad=0)
png = OUT / 'fibonacci_bloom.png'
fig.savefig(png, dpi=200, bbox_inches='tight',
            facecolor=BG_COLOR, pad_inches=0.02)
print(f'Saved colour PNG  → {png}')
plt.close(fig)


# ── Breathing animation GIF ───────────────────────────────────────
# Pre-compute a fixed axis extent so the frame never jumps while breathing
_max_r = np.sqrt(N_POINTS) * (1 + WAVE_AMP) * scales[0] * (1 + BREATHE_AMP) * 1.05
AXIS_LIM = _max_r

fig_a, ax_a = plt.subplots(figsize=(8, 8), facecolor=BG_COLOR)
ax_a.set_facecolor(BG_COLOR)
ax_a.set_aspect('equal')
ax_a.axis('off')
ax_a.set_xlim(-AXIS_LIM, AXIS_LIM)
ax_a.set_ylim(-AXIS_LIM, AXIS_LIM)


def update(frame):
    ax_a.cla()
    ax_a.set_facecolor(BG_COLOR)
    ax_a.set_aspect('equal')
    ax_a.axis('off')
    ax_a.set_xlim(-AXIS_LIM, AXIS_LIM)
    ax_a.set_ylim(-AXIS_LIM, AXIS_LIM)
    breath = 1.0 + BREATHE_AMP * np.sin(frame * 2 * np.pi / N_FRAMES)
    draw_layers(ax_a, breath)


anim = FuncAnimation(fig_a, update, frames=N_FRAMES, interval=1000 // 24)
gif = OUT / 'fibonacci_bloom_breathe.gif'
anim.save(gif, writer='pillow', fps=24, dpi=100)
print(f'Saved breathing GIF → {gif}')
plt.close(fig_a)


# ── Plotter / line-art version (black on white) ───────────────────
fig2, ax2 = plt.subplots(figsize=(12, 12), facecolor='white')
ax2.set_facecolor('white')
ax2.set_aspect('equal')
ax2.axis('off')

# Single dense layer, draw as a connected path
x, y, _, _ = make_bloom(N_POINTS * 2, WAVE_AMP, WAVE_FREQ, scale=1.0)
ax2.plot(x, y, '-', color='black', linewidth=0.3, alpha=0.8)

# Inner delicate layer
x2, y2, _, _ = make_bloom(N_POINTS, WAVE_AMP * 0.5, WAVE_FREQ + 3, scale=0.55)
ax2.plot(x2, y2, '-', color='black', linewidth=0.25, alpha=0.6)

plt.tight_layout(pad=0)
for fmt, path in [('pdf', OUT / 'fibonacci_bloom_plotter.pdf'),
                  ('svg', OUT / 'fibonacci_bloom_plotter.svg')]:
    fig2.savefig(path, bbox_inches='tight', facecolor='white', pad_inches=0.02)
    print(f'Saved plotter {fmt.upper()} → {path}')
plt.close(fig2)
