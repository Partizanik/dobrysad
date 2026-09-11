#!/usr/bin/env python3
"""
Шаг 0 конвейера очистки спрайтов, ПЕРЕД clean_sprites.py: превращает плоский
белый фон в прозрачность.

clean_sprites.py умеет вырезать тень и "подложку" из объекта, который уже
частично прозрачен (alpha-канал уже отделяет объект+тень+подложку от фона) --
именно так были подготовлены самые первые ассеты (people/trees/buildings/...).
Но часть более новых исходников (например графика_отсортировано/vehicles,
.../boats) сохранена как обычный непрозрачный RGB/RGBA со сплошным белым
холстом вместо фона -- clean_sprites.py в этом случае ничего не находит
(alpha везде 255, bbox = весь холст), и картинка проходит "чистку" без единого
изменения. Этот скрипт закрывает разрыв: находит связную область
почти-белых пикселей, которая касается края кадра (значит это фон, а не
случайно белая деталь ВНУТРИ объекта -- капот машины, парус, доска), и делает
её прозрачной с плавным краем. После него уже можно (и нужно) запускать
clean_sprites.py как обычно -- он доберёт тень/подложку/обрезку.

Использование:
    python3 tools/dewhite_sprites.py file1.png file2.png ...
    python3 tools/dewhite_sprites.py --dry-run file1.png   # только напечатать размер найденного фона
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

WHITE_MEAN = 235   # пиксель ярче этого (среднее по R/G/B) -- строгий фон, ищем
                   # среди него компонент, касающийся края кадра
WEAK_MEAN = 195    # более мягкий порог -- используется только чтобы ДОРАСТИТЬ
                   # уже найденный краевой фон в мягкую тень/блик под объектом
                   # (гистерезис, как в Canny): яркость плавно падает от чистого
                   # белого угла к самому объекту, и мягкая полупрозрачная тень
                   # прямо под колёсами/корпусом -- продолжение того же градиента,
                   # просто не достающее до края кадра само по себе
WEAK_SAT_MAX = 0.12  # мягкий порог трогает только малонасыщенные (серые/белые)
                     # пиксели -- чтобы не "перетечь" в цветные детали объекта
STRUCTURE = np.ones((3, 3), dtype=int)
FEATHER_PX = 8     # ширина полосы у границы объекта, где яркостный градиент
                   # ещё влияет на альфу; глубже в фон -- всегда полная прозрачность


def dewhite(im):
    arr = np.array(im.convert('RGB')).astype(np.float32)
    h, w, _ = arr.shape
    mean = arr.mean(axis=2)
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)

    strong_candidate = mean >= WHITE_MEAN
    strong_labeled, _ = ndimage.label(strong_candidate, structure=STRUCTURE)
    border_labels = set(strong_labeled[0, :].tolist()) | set(strong_labeled[-1, :].tolist()) \
        | set(strong_labeled[:, 0].tolist()) | set(strong_labeled[:, -1].tolist())
    border_labels.discard(0)
    strong_bg = np.isin(strong_labeled, list(border_labels)) if border_labels else np.zeros((h, w), dtype=bool)

    # гистерезис: расширяем строгий краевой фон в соседние мягкие (тень/блик)
    # области, но только там, где они низконасыщенные -- иначе просто берём
    # компоненты слабой маски, которые пересекаются со strong_bg
    weak_candidate = (mean >= WEAK_MEAN) & (sat <= WEAK_SAT_MAX)
    weak_labeled, weak_n = ndimage.label(weak_candidate, structure=STRUCTURE)
    if weak_n > 0:
        touching = set(np.unique(weak_labeled[strong_bg])) if strong_bg.any() else set()
        touching.discard(0)
        bg_mask = strong_bg | (np.isin(weak_labeled, list(touching)) if touching else np.zeros((h, w), dtype=bool))
    else:
        bg_mask = strong_bg
    alpha = np.full((h, w), 255, dtype=np.uint8)
    if bg_mask.any():
        # внутри самой фоновой области яркость плавно колеблется -- у реального
        # фото это не ровно 255 даже в "чистом" углу (лёгкая виньетка/шум), из-за
        # чего наивный яркостный градиент по ВСЕЙ фоновой области оставлял почти
        # весь фон слегка непрозрачным, и getbbox() потом не обрезал картинку
        # вообще. Поэтому яркостный градиент применяем ТОЛЬКО в узкой полосе
        # FEATHER_PX у границы объекта/тени (там он даёт сглаженный край) --
        # а везде глубже в фоне альфа жёстко 0, независимо от яркости.
        dist_from_edge = ndimage.distance_transform_edt(bg_mask)
        near_edge = dist_from_edge <= FEATHER_PX
        t = np.clip((255.0 - mean) / (255.0 - WHITE_MEAN), 0, 1)
        alpha_bg = np.where(near_edge, np.clip(t * 255, 0, 255), 0).astype(np.uint8)
        alpha = np.where(bg_mask, alpha_bg, alpha)
    rgba = np.dstack([np.array(im.convert('RGB')), alpha])
    return Image.fromarray(rgba, 'RGBA'), int(bg_mask.sum()), h * w


def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    files = [a for a in args if a != '--dry-run']
    if not files:
        print(__doc__)
        return
    for path in files:
        im = Image.open(path)
        out, bg_px, total_px = dewhite(im)
        pct = 100.0 * bg_px / total_px if total_px else 0
        print(f"{path}: background {bg_px}/{total_px}px ({pct:.1f}%)")
        if not dry_run:
            out.save(path)


if __name__ == '__main__':
    main()
