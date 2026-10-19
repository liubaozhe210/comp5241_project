"""
程序化封面渲染器 —— 玻璃拟态 3D 物体。

用 numpy 做 SDF 光线步进（sphere tracing）：
  玻璃材质 = 折射方向采样环境 + 三通道色散 + 菲涅尔 + 高光 + 边缘光
  哑光材质 = 兰伯特 + 软阴影
场景固定在象牙白影棚里（渐变背景 + 地面 + 柔光箱），每门课换一套配色与构图。

用法：
  python generate-covers.py                # 生成全部封面 + 登录页主视觉
  python generate-covers.py --only c1      # 只渲染一张（调试用）
  python generate-covers.py --ss 1         # 降低超采样倍数，更快
输出： ../assets/cover-*.jpg, ../assets/hero-glass.jpg
"""
import argparse
import math
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))

COVER_SIZE = (1200, 640)
HERO_SIZE = (1200, 1400)

# 影棚底色（象牙白）
BG_TOP = np.array([0.965, 0.949, 0.914], np.float32)
BG_BOTTOM = np.array([0.894, 0.871, 0.824], np.float32)
FLOOR_COL = np.array([0.949, 0.933, 0.898], np.float32)

# 每门课的强调色（低饱和，学术感）
TINTS = {
    'c1': '#2B3A67',  # 软件工程：靛蓝
    'c2': '#1F5F5B',  # 数据挖掘：墨绿
    'c3': '#7A2B2B',  # 计算机视觉：赭红
    'c4': '#3A4048',  # 深度学习：石板灰
    'c5': '#4C5227',  # 分布式系统：橄榄
    'c6': '#5A2E5A',  # 云计算：梅紫
    'g1': '#2B3A67',
    'g2': '#1F5F5B',
    'g3': '#7A2B2B',
    'hero': '#2B3A67',
}


def srgb(hexstr):
    v = hexstr.lstrip('#')
    return np.array([int(v[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def norm(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)


# ---------------- SDF 基元 ----------------

def sd_sphere(p, c, r):
    return np.linalg.norm(p - c, axis=-1) - r


def sd_torus(p, c, big_r, small_r, tilt):
    q = p - c
    ct, st = math.cos(tilt), math.sin(tilt)
    x = q[..., 0] * ct - q[..., 1] * st
    y = q[..., 0] * st + q[..., 1] * ct
    rxz = np.sqrt(x * x + q[..., 2] * q[..., 2])
    return np.sqrt((rxz - big_r) ** 2 + y * y) - small_r


def sd_rbox(p, c, half, rad):
    q = np.abs(p - c) - half
    return np.linalg.norm(np.maximum(q, 0.0), axis=-1) + np.minimum(np.max(q, axis=-1), 0.0) - rad


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * h + a * (1.0 - h) - k * h * (1.0 - h)


# ---------------- 场景 ----------------

GLASS, MATTE, FLOOR = 1, 2, 3


def build_scene(seed, hero=False):
    rng = np.random.default_rng(seed)
    objs = []

    if hero:
        objs.append(dict(kind='sphere', c=np.array([0.05, 0.30, 0.10]), r=1.05, mat=GLASS))
        objs.append(dict(kind='torus', c=np.array([0.55, -0.62, 0.75]), big=1.15, small=0.24, tilt=0.55, mat=GLASS))
        objs.append(dict(kind='sphere', c=np.array([-0.95, -0.55, 0.85]), r=0.46, mat=MATTE))
        objs.append(dict(kind='rbox', c=np.array([1.20, 0.95, -0.15]),
                         half=np.array([0.40, 0.40, 0.40]), rad=0.14, mat=GLASS))
    else:
        objs.append(dict(kind='sphere', c=np.array([rng.uniform(-0.1, 0.15), 0.16, 0.1]), r=0.92, mat=GLASS))
        objs.append(dict(kind='torus', c=np.array([0.74, -0.70, 0.55]), big=0.95, small=0.22,
                         tilt=rng.uniform(0.3, 0.9), mat=GLASS))
        objs.append(dict(kind='sphere', c=np.array([-0.98, -0.55, 0.90]), r=0.40, mat=MATTE))
        objs.append(dict(kind='rbox', c=np.array([1.02, 0.72, -0.30]),
                         half=np.array([0.34, 0.34, 0.34]), rad=0.12, mat=GLASS))

    for o in objs:
        o['c'] = o['c'] + rng.normal(0, 0.03, 3).astype(np.float32)

    return objs


def sd_scene(p, objs):
    """返回 (最小距离, 材质编号)"""
    best = np.full(len(p), 1e9, np.float32)
    mat = np.full(len(p), FLOOR, np.int32)

    for o in objs:
        if o['kind'] == 'sphere':
            d = sd_sphere(p, o['c'], o['r'])
        elif o['kind'] == 'torus':
            d = sd_torus(p, o['c'], o['big'], o['small'], o['tilt'])
        else:
            d = sd_rbox(p, o['c'], o['half'], o['rad'])
        closer = d < best
        best = np.where(closer, d, best)
        mat = np.where(closer, o['mat'], mat)

    floor = p[..., 1] + 1.15
    closer = floor < best
    best = np.where(closer, floor, best)
    mat = np.where(closer, FLOOR, mat)
    return best, mat


def sd_objects_only(p, objs):
    best = np.full(len(p), 1e9, np.float32)
    for o in objs:
        if o['kind'] == 'sphere':
            d = sd_sphere(p, o['c'], o['r'])
        elif o['kind'] == 'torus':
            d = sd_torus(p, o['c'], o['big'], o['small'], o['tilt'])
        else:
            d = sd_rbox(p, o['c'], o['half'], o['rad'])
        best = np.minimum(best, d)
    return best


# ---------------- 着色 ----------------

LIGHT_DIR = norm(np.array([-0.42, 0.78, 0.46], np.float32))
GEL_DIR = norm(np.array([0.92, 0.10, -0.38], np.float32))     # 右侧色胶
COOL_DIR = norm(np.array([-0.75, -0.15, 0.65], np.float32))   # 左后冷调


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def env(d, tint):
    """影棚环境：象牙白渐变 + 右侧色胶 + 顶部柔光箱 + 冷调反弹。
    玻璃靠这套有方向性的环境才能"看出是玻璃"。"""
    t = np.clip(0.5 + 0.5 * d[..., 1], 0.0, 1.0)[..., None]
    col = BG_BOTTOM * (1 - t) + BG_TOP * t

    # 右侧色胶带：给折射一点颜色
    band = smoothstep(0.10, 0.62, d[..., 0])[..., None]
    gel = col * 0.42 + tint * 0.86
    col = col * (1 - band * 0.85) + gel * (band * 0.85)

    # 左后冷调，制造第二块可折射的色区
    cool = smoothstep(0.05, 0.70, -d[..., 0] + 0.35 * d[..., 2])[..., None]
    col = col * (1 - cool * 0.30) + (col * 0.78 + np.array([0.72, 0.78, 0.92], np.float32) * 0.35) * (cool * 0.30)

    # 顶部柔光箱（高光来源）
    key = smoothstep(0.80, 0.995, np.sum(d * LIGHT_DIR, axis=-1))[..., None]
    col = col + np.array([1.0, 0.995, 0.98], np.float32) * key * 0.95

    # 底部微亮，模拟桌面反弹
    bounce = smoothstep(-0.15, -0.85, d[..., 1])[..., None]
    col = col + np.array([0.98, 0.96, 0.92], np.float32) * bounce * 0.22

    return np.clip(col, 0.0, 1.7)


def refract(rd, n, eta):
    cosi = np.clip(-np.sum(rd * n, axis=-1), -1.0, 1.0)[..., None]
    k = 1.0 - eta * eta * (1.0 - cosi * cosi)
    out = eta * rd + (eta * cosi - np.sqrt(np.maximum(k, 0.0))) * n
    return norm(np.where(k > 0, out, rd - 2.0 * np.sum(rd * n, axis=-1)[..., None] * n))


def background(rd, tint):
    """背景与阴影捕捉面共用同一个函数，避免出现生硬的地平线接缝"""
    t = np.clip(0.5 + 0.5 * rd[..., 1], 0.0, 1.0)[..., None]
    col = BG_BOTTOM * (1 - t) + BG_TOP * t
    glow = np.exp(-((rd[..., 0] - 0.03) ** 2 + (rd[..., 1] - 0.40) ** 2) * 2.4)[..., None]
    col = col + np.array([1.0, 0.99, 0.96], np.float32) * glow * 0.16
    # 斜向上的极淡色洗，让象牙白不死板
    wash = np.clip(0.55 - 0.75 * rd[..., 0] - 0.45 * rd[..., 1], 0.0, 1.0)[..., None]
    return col * (1.0 - wash * 0.10) + (col * 0.80 + tint * 0.55) * (wash * 0.10)


def shade(o, rd, t, hit, objs, tint):
    n_pix = len(rd)
    col = np.zeros((n_pix, 3), np.float32)

    col_bg = background(rd, tint)
    col = np.where(hit[..., None], col, col_bg)

    if not hit.any():
        return col

    idx = np.where(hit)[0]
    rdh = rd[idx]
    th = t[idx]
    ph = o[idx] + rdh * th[:, None]

    eps = 0.0018
    n = np.stack([
        sd_scene(ph + np.array([eps, 0, 0], np.float32), objs)[0] - sd_scene(ph - np.array([eps, 0, 0], np.float32), objs)[0],
        sd_scene(ph + np.array([0, eps, 0], np.float32), objs)[0] - sd_scene(ph - np.array([0, eps, 0], np.float32), objs)[0],
        sd_scene(ph + np.array([0, 0, eps], np.float32), objs)[0] - sd_scene(ph - np.array([0, 0, eps], np.float32), objs)[0],
    ], axis=-1)
    n = norm(n)
    mat = sd_scene(ph, objs)[1]

    ndv = np.clip(-np.sum(rdh * n, axis=-1), 0.0, 1.0)
    fres = (0.035 + 0.965 * (1.0 - ndv) ** 5)[..., None]

    hv = norm(LIGHT_DIR[None, :] - rdh)
    spec = np.clip(np.sum(n * hv, axis=-1), 0, 1)[..., None] ** 90 * 1.25

    # 软阴影：只对地面/哑光表面算，玻璃不采样阴影（内部折射本身就有明暗）
    sh = np.ones(len(idx), np.float32)
    need_shadow = mat != GLASS
    if need_shadow.any():
        sidx = np.where(need_shadow)[0]
        sp = ph[sidx] + n[sidx] * 0.02
        st = np.full(len(sidx), 0.04, np.float32)
        res = np.ones(len(sidx), np.float32)
        for _ in range(18):
            d = sd_objects_only(sp + LIGHT_DIR[None, :] * st[:, None], objs)
            res = np.minimum(res, np.clip(d / (0.10 + 0.28 * st), 0.0, 1.0))
            st = st + np.clip(d, 0.0, 0.40)
            if (st > 4.0).all():
                break
        sh[sidx] = np.clip(res, 0.0, 1.0) ** 1.3

    # --- 玻璃 ---
    refl = env(norm(rdh - 2.0 * np.sum(rdh * n, axis=-1)[..., None] * n), tint)
    channels = []
    for eta in (1.0 / 1.46, 1.0 / 1.51, 1.0 / 1.57):  # 轻微色散
        rdir = refract(rdh, n, eta)
        rdir = norm(rdir + n * 0.55)  # 假装穿过一段厚度，让折射向内收
        channels.append(env(rdir, tint)[:, len(channels)])
    refr = np.stack(channels, axis=-1)
    refr = refr * 0.84 + tint * 0.22  # 玻璃自带的染色

    glass = refr * (1.0 - fres) + refl * fres
    glass = glass + spec * (0.55 + 0.45 * fres)
    rim = (1.0 - ndv)[..., None] ** 3 * 0.42
    glass = glass + np.clip(tint - 0.25, 0.0, 1.0) * rim

    # --- 哑光（象牙陶瓷）---
    lam = np.clip(np.sum(n * LIGHT_DIR, axis=-1), 0, 1)[..., None]
    sky = (0.5 + 0.5 * n[..., 1])[..., None]
    matte = np.array([0.96, 0.94, 0.90], np.float32) * (0.52 + 0.46 * lam * sh[..., None] + 0.16 * sky)
    matte = matte + spec * 0.22
    matte = matte + np.array([0.75, 0.79, 0.92], np.float32) * (1.0 - ndv)[..., None] ** 3 * 0.20

    # --- 阴影捕捉面：与背景同色，只让投影变暗 ---
    catch = background(rdh, tint) * (1.0 - 0.42 * (1.0 - sh[..., None]))

    out = np.where((mat == GLASS)[..., None], glass,
                   np.where((mat == MATTE)[..., None], matte, catch))
    col[idx] = np.clip(out, 0.0, 1.0)
    return col


# ---------------- 渲染 ----------------

def render(w, h, seed, tint_hex, hero=False, ss=2.0):
    W, H = int(w * ss), int(h * ss)
    objs = build_scene(seed, hero)
    tint = srgb(tint_hex)

    # 相机
    cam = np.array([0.0, 0.32, 3.35], np.float32)
    fwd = norm(np.array([0.0, -0.16, -1.0], np.float32))
    right = norm(np.cross(fwd, np.array([0.0, 1.0, 0.0], np.float32)))
    up = np.cross(right, fwd)

    px = ((np.arange(W, dtype=np.float32) + 0.5) / W * 2.0 - 1.0) * (W / H)
    py = -(np.arange(H, dtype=np.float32) + 0.5) / H * 2.0 + 1.0
    gx, gy = np.meshgrid(px, py)

    fov = 0.62 if hero else 0.54
    dirs = norm(fwd[None, None, :] + gx[..., None] * math.tan(fov) * right[None, None, :]
                + gy[..., None] * math.tan(fov) * up[None, None, :])
    rd = dirs.reshape(-1, 3).astype(np.float32)
    o = np.broadcast_to(cam, rd.shape).astype(np.float32)

    # 光线步进
    t = np.zeros(len(rd), np.float32)
    hit = np.zeros(len(rd), bool)
    for _ in range(96):
        p = o + rd * t[:, None]
        d, _ = sd_scene(p, objs)
        step = np.where(hit, 0.0, np.maximum(d, 0.0) * 0.92)
        t = t + step
        hit = hit | (d < 1e-4)
        if (hit | (t > 9.0)).all():
            break

    col = shade(o, rd, t, hit, objs, tint)
    col = col / (1.0 + 0.28 * col)          # 软压高光，避免出现纯白死区
    col = np.clip((col - 0.012) * 1.06, 0.0, 1.0)
    img = (col * 255).astype(np.uint8).reshape(H, W, 3)
    out = Image.fromarray(img, 'RGB').resize((w, h), Image.LANCZOS)

    # 极轻的颗粒，避免渐变出现色带
    arr = np.asarray(out, np.float32)
    arr = np.clip(arr + np.random.default_rng(seed).normal(0, 1.6, arr.shape), 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    ap.add_argument('--ss', type=float, default=1.6)
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    jobs = []
    for i, key in enumerate(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'g1', 'g2', 'g3']):
        jobs.append((key, COVER_SIZE, 1013 + i * 7919, TINTS[key], False))
    jobs.append(('hero', HERO_SIZE, 4242, TINTS['hero'], True))

    for key, size, seed, tint, hero in jobs:
        if args.only and key != args.only:
            continue
        img = render(size[0], size[1], seed, tint, hero=hero, ss=args.ss)
        path = os.path.join(OUT, f'cover-{key}.jpg' if not hero else 'hero-glass.jpg')
        img.save(path, quality=90, optimize=True, progressive=True)
        print(f'  {key}: {os.path.basename(path)}  {os.path.getsize(path) / 1024:.0f} KB')

    print(f'输出目录: {OUT}')


if __name__ == '__main__':
    main()
