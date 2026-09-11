#!/usr/bin/env python3
"""
Одноразовый скрипт очистки PNG-спрайтов (нано банана 2) для Dobry Sad.

Что делает с каждым файлом в www/assets/{people,trees,boats,buildings,landmarks}
(список категорий -- CATEGORIES ниже):
  1. Убирает мягкую падающую тень (полупрозрачный, малонасыщенный "блоб" без единого
     непрозрачного пикселя внутри -- отличает тень от самого объекта, у которого
     всегда есть плотное, полностью непрозрачное "тело").
  2. Убирает "подложку" земли/грунта/камней/брусчатки под объектом (только для
     категорий PAD_CATEGORIES -- у зданий нижняя часть остаётся, это фундамент,
     а не мусор) -- по сужению непрозрачной ширины снизу вверх: подложка почти
     всегда широкая и плоская, сам объект в месте контакта с землёй заметно уже.
  3. Обрезает bounding box строго по оставшемуся объекту ("под корень").
  4. Убирает рваные края -- полупрозрачную пыль (alpha < DUST_ALPHA) обнуляет,
     а на новой нижней границе слегка "закрывает" alpha-градиент, чтобы не было
     плавного полупрозрачного шлейфа среза.

Использование:
    python3 tools/clean_sprites.py            # обработать www/assets, backup в www/assets_backup_orig
    python3 tools/clean_sprites.py --dry-run  # только напечатать, что было бы сделано
"""
import sys, os, shutil
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'www', 'assets')
BACKUP = ROOT + '_backup_orig'

# категории, где применяется УЗКО-НАПРАВЛЕННОЕ удаление "подложки" по сужению
# ширины строк снизу вверх. Только деревья и лодки -- у них одна опорная точка
# (ствол/корпус), поэтому ширина монотонно сужается вверх от подставки.
# У людей (и вообще двуногих) этот метод ломает ноги/ступни (расставлены в
# стороны -> выглядят как "широкая подложка" для эвристики) -- для людей серую/
# нейтральную подложку (брусчатка и т.п.) убирает remove_shadow по цвету, без
# риска для самих ног. Здания и landmarks не трогаем вообще -- фундамент/база
# это часть архитектуры, а не мусорный слой.
PAD_CATEGORIES = {'trees', 'boats', 'vehicles'}
# категории, где вообще применяется удаление тени. Здания/landmarks исключены:
# их каменные/дощатые стены сами по себе серые и текстурные -- под тот же
# цветовой критерий, что и тень, может по ошибке попасть кусок фундамента
# (проверено на woodwork_01 -- вырезало часть каменной кладки). Пользователь
# просил чистку именно для people/техники/деревьев/лодок/собак/столбов, зданий
# в списке нет -- поэтому buildings/landmarks просто пропускаются целиком.
# vehicles (телега/машина) добавлена вместе с фоновым транспортом -- тот же
# исходник "объект на брусчатке с мягкой тенью на белом фоне", что у деревьев
# и лодок, значит нужна та же обработка (раньше категория была пропущена: в
# ассетах лежала только одна уже вручную вычищенная телега, автоматический
# конвейер её никогда не касался).
SHADOW_CATEGORIES = {'people', 'trees', 'boats', 'vehicles'}
ALL_CATEGORIES = {'people', 'trees', 'boats', 'buildings', 'landmarks', 'vehicles'}

DUST_ALPHA = 10          # alpha ниже этого -- считаем пылью/шумом, обнуляем
SHADOW_OPAQUE_FRAC = 0.02   # если в компоненте почти нет полностью непрозрачных пикселей -- это тень
SHADOW_SAT_MAX = 0.22       # порог насыщенности (0..1) для "тень выглядит серой"
PAD_WIDTH_RATIO = 0.42      # строка "подложки" -- шире этой доли от макс. ширины объекта
PAD_TAPER_RATIO = 0.62      # объект начинается там, где ширина строки падает ниже этой доли от подложки


def rgb_to_sat(rgb):
    r, g, b = rgb[..., 0] / 255.0, rgb[..., 1] / 255.0, rgb[..., 2] / 255.0
    mx = np.max(np.stack([r, g, b], axis=-1), axis=-1)
    mn = np.min(np.stack([r, g, b], axis=-1), axis=-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return sat


def label_components(mask):
    from scipy import ndimage
    structure = np.ones((3, 3), dtype=int)  # 8-связность
    labeled, n = ndimage.label(mask, structure=structure)
    return labeled, n


def remove_shadow(arr):
    """arr: HxWx4 uint8. Возвращает новый alpha-канал с удалёнными тенями.

    В этих ассетах тень нарисована ПОЧТИ ПОЛНОСТЬЮ НЕПРОЗРАЧНОЙ (alpha~255),
    просто серой/малонасыщенной -- значит, отличить её от объекта по alpha
    нельзя, только по цвету. Ищем компоненты связности среди "серых" пикселей
    (низкая насыщенность, не белых и не чёрных) и оставляем только те, что
    визуально ведут себя как падающая тень: большая площадь, широкая и плоская
    (w/h > 1.1) форма, расположенная в НИЖНЕЙ половине спрайта (например, тёмная
    кепка на голове тоже серая, но она наверху и компактная -- не попадает под
    эти условия и остаётся нетронутой).
    """
    from scipy import ndimage
    alpha = arr[..., 3].astype(np.float32)
    h, w = alpha.shape
    if h == 0 or w == 0:
        return arr[..., 3]
    r, g, b = arr[..., 0].astype(np.float32), arr[..., 1].astype(np.float32), arr[..., 2].astype(np.float32)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    greyish = (sat < 0.15) & (mx > 20) & (mx < 215) & (alpha > 50)
    if not greyish.any():
        return arr[..., 3]
    structure = np.ones((3, 3), dtype=int)
    labeled, n = ndimage.label(greyish, structure=structure)
    new_alpha = arr[..., 3].copy()
    for i in range(1, n + 1):
        comp = labeled == i
        count = comp.sum()
        if count < 800:
            continue
        ys, xs = np.where(comp)
        cw = xs.max() - xs.min()
        ch = ys.max() - ys.min()
        top_frac = ys.min() / h
        if top_frac > 0.42 and cw > ch * 1.05:
            new_alpha[comp] = 0
    return new_alpha


def remove_ground_pad(alpha):
    """Убирает широкую плоскую 'подложку' снизу, сужая контур до самого объекта."""
    h, w = alpha.shape
    opaque = alpha >= 128
    if not opaque.any():
        return alpha
    col_any = opaque.any(axis=0)
    cols = np.where(col_any)[0]
    obj_w = cols.max() - cols.min() + 1
    if obj_w <= 0:
        return alpha

    row_widths = np.zeros(h, dtype=np.int32)
    for y in range(h):
        row = np.where(opaque[y])[0]
        if row.size:
            row_widths[y] = row.max() - row.min() + 1

    rows_with_content = np.where(row_widths > 0)[0]
    if rows_with_content.size == 0:
        return alpha
    bottom = rows_with_content.max()

    pad_threshold = obj_w * PAD_WIDTH_RATIO
    taper_threshold = None
    cut_row = None
    y = bottom
    seen_wide = False
    while y >= rows_with_content.min():
        rw = row_widths[y]
        if rw >= pad_threshold:
            seen_wide = True
            if taper_threshold is None:
                taper_threshold = rw
            y -= 1
            continue
        if seen_wide and rw > 0 and rw < taper_threshold * PAD_TAPER_RATIO:
            cut_row = y + 1
            break
        if seen_wide and rw == 0:
            cut_row = y + 1
            break
        y -= 1

    if cut_row is None or cut_row >= bottom:
        return alpha
    # не отрезаем больше 35% высоты объекта -- защита от переусердствования
    obj_rows = rows_with_content.max() - rows_with_content.min() + 1
    if (bottom - cut_row) > obj_rows * 0.35:
        return alpha

    new_alpha = alpha.copy()
    new_alpha[cut_row:, :] = 0
    return new_alpha


def tidy_edges(alpha):
    alpha = alpha.copy()
    alpha[alpha < DUST_ALPHA] = 0
    return alpha


def crop_to_content(im):
    bbox = im.getbbox()
    if not bbox:
        return im
    # 1px запас, чтобы не срезать сглаживание по краю
    l, t, r, b = bbox
    l = max(0, l - 1); t = max(0, t - 1)
    r = min(im.width, r + 1); b = min(im.height, b + 1)
    return im.crop((l, t, r, b))


def process_file(path, category, dry_run=False):
    im = Image.open(path).convert('RGBA')
    arr = np.array(im)
    if category in SHADOW_CATEGORIES:
        arr[..., 3] = remove_shadow(arr)
    if category in PAD_CATEGORIES:
        arr[..., 3] = remove_ground_pad(arr[..., 3])
    arr[..., 3] = tidy_edges(arr[..., 3])
    out = Image.fromarray(arr, 'RGBA')
    out = crop_to_content(out)
    before = im.size
    after = out.size
    if not dry_run:
        out.save(path)
    print(f"{path}: {before} -> {after}")


def main():
    dry_run = '--dry-run' in sys.argv
    explicit_files = [a for a in sys.argv[1:] if a != '--dry-run']
    if explicit_files:
        # точечный режим: чистим только перечисленные файлы. process_file() не идемпотентна --
        # crop_to_content()'s 1px запас плюс tidy_edges() могут на ПОВТОРНОМ прогоне срезать ещё
        # ~1px сглаженного края с каждой стороны (уже видели на cart_horse.png: 504x440 -> 502x438
        # после случайного повторного полного прогона), так что уже готовые файлы лучше не трогать
        # без необходимости -- отсюда и этот режим, вместо обязательного "проход по всем категориям".
        for path in explicit_files:
            category = os.path.basename(os.path.dirname(os.path.abspath(path)))
            process_file(path, category, dry_run=dry_run)
        return
    if not dry_run and not os.path.isdir(BACKUP):
        shutil.copytree(ROOT, BACKUP)
        print(f"Backup оригиналов сохранён в {BACKUP}")
    for category in sorted(ALL_CATEGORIES):
        cat_dir = os.path.join(ROOT, category)
        if not os.path.isdir(cat_dir):
            continue
        for fname in sorted(os.listdir(cat_dir)):
            if not fname.lower().endswith('.png'):
                continue
            process_file(os.path.join(cat_dir, fname), category, dry_run=dry_run)


if __name__ == '__main__':
    main()
