# Промты для Google Nano Banana (Gemini) — Dobry Sad (земля, деревья, люди)

Стиль игры (по образцу `cottage_01.png` / `market_01.png`): изометрия примерно 2:1, мягкий "painterly" рендер (не фотореализм, не мультяшный флэт — что-то среднее, как в тёплых мобильных city-builder играх), тёплая палитра терракота/кремовый/дерево, мягкие тени и мягкое затенение в углах (ambient occlusion), чистые аккуратные края.

Общий "хвост" (уже вписан в конец **каждого** промта ниже, чтобы стиль не расползался):

```
isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark
```

## Как добиться максимальной консистентности в Nano Banana (важно, сделай это первым)

Nano Banana не понимает флаги Midjourney (`--ar`, `--sref`, `--seed` и т.п.) — все промты ниже уже переписаны в обычный текст, ничего вырезать не нужно, просто копируй целиком. Зато у Nano Banana есть кое-что даже мощнее `--sref`: он умеет смотреть на картинку, которую ты прикрепишь к запросу, и повторять её стиль.

1. **Каждый раз, когда пишешь новый запрос — прикрепляй к нему `cottage_01.png` или `market_01.png`** (файлы дома/рынка из игры) как картинку-референс, и добавляй в начало текста фразу вроде: *"Generate this in the exact same isometric art style, color palette, lighting and rendering technique as the attached reference image."* — это твой главный рычаг консистентности, важнее самого текста промта.
2. Если после нескольких генераций получится идеальный результат (например, отличная берёза) — можешь прикреплять к следующим запросам сразу два референса: оригинальное здание + эту удачную берёзу. Так стиль будет держаться ещё крепче.
3. **Прозрачность**: Nano Banana тоже не делает нативный прозрачный PNG. В промтах ниже уже стоит `plain white background` — генерируй на белом фоне и присылай картинки мне, я вырежу фон программно и подготовлю их как спрайты для игры. Сам с этим возиться не нужно.
4. **Соотношение сторон**: для тайлов земли в промте прописано "square image, 1:1", для деревьев и людей — "vertical portrait image" (они выше, чем шире, в игре ставятся как вертикальные спрайты). Если в интерфейсе Nano Banana есть отдельная настройка соотношения сторон — можешь дополнительно выставить её там же (квадрат для земли, портрет для деревьев/людей).
5. Раз генерируешь по одному промту за раз — можешь один раз сгенерировать, посмотреть результат и при необходимости чуть подправить формулировку тут же (Nano Banana хорошо реагирует на уточнения в духе "сделай крону гуще" прямо в диалоге), не обязательно переписывать промт с нуля каждый раз.

---

## A. Земля / трава / грунт (изометрические тайлы)

Тайл — это ромб (диамант), как под домами на скриншотах: смотрим на кусок земли под тем же углом 2:1.

**A1. Трава, основная**
```
top-down isometric ground tile, diamond-shaped tile of lush green grass with subtle blade texture and small tonal variation, tiny clover accents, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**A2. Трава с протоптанной тропинкой**
```
top-down isometric ground tile, diamond-shaped grass tile with a worn dirt footpath cutting diagonally across it, trampled earth and flattened grass edges, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**A3. Просёлочная дорога (грунт)**
```
top-down isometric ground tile, diamond-shaped tile of packed dirt road with faint wheel ruts and small pebbles, warm brown earth tones, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**A4. Брусчатка / променад**
```
top-down isometric ground tile, diamond-shaped tile of old cobblestone pavement, rounded stones in a fan pattern, early 20th century European town square paving, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**A5. Песок / пляж**
```
top-down isometric ground tile, diamond-shaped tile of fine beach sand with gentle ripples and a couple of small pebbles and a seashell, warm cream and tan tones, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**A6. Цветущий луг**
```
top-down isometric ground tile, diamond-shaped grass tile scattered with small wildflowers (daisies, poppies, cornflowers), soft meadow texture, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**A7. Трава с камнями**
```
top-down isometric ground tile, diamond-shaped grass tile with a few scattered mossy rocks and pebbles, patchy short grass, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**A8. Прибрежная галька (у моря)**
```
top-down isometric ground tile, diamond-shaped tile of smooth rounded beach pebbles mixed with wet sand, coastal shoreline texture, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

---

## B. Деревья (отдельные спрайты, вид сбоку/изометрия)

**B1. Яблоня в цвету** *(тематически главное дерево — "Добры Сад" = хороший сад/orchard)*
```
single isometric apple tree, full bloom with white and pink blossoms, sturdy trunk, lush rounded canopy, early 20th century European orchard tree, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B2. Яблоня с плодами**
```
single isometric apple tree heavy with ripe red apples among green leaves, sturdy gnarled trunk, orchard tree, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B3. Берёза** *(культовое дерево для Беларуси/Восточной Европы)*
```
single isometric birch tree, slender white trunk with black markings, light airy canopy of small green leaves, elegant and tall, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B4. Липа** *(классическое дерево для европейских улиц/площадей)*
```
single isometric linden tree, thick trunk, broad dense rounded canopy typical of a European town square shade tree, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B5. Тополь** *(высокий, для аллей)*
```
single isometric tall poplar tree, narrow columnar shape, slender trunk, used for European avenue rows, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B6. Ива** *(для берега/у моря)*
```
single isometric weeping willow tree by the water's edge, long drooping branches, soft flowing foliage, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B7. Ель/сосна** *(хвойное, для разнообразия)*
```
single isometric spruce pine tree, dark green conical silhouette, layered branches, sturdy trunk, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B8. Куст/кустарник**
```
single isometric garden shrub bush, rounded compact shape, small green leaves with a few tiny berries, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**B9. Старое сухое дерево** *(для визуального разнообразия/атмосферы)*
```
single isometric old bare tree, weathered gnarled trunk and bare twisting branches, no leaves, rustic character tree, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

---

## C. Люди, 1900–1930-е (отдельная стоящая фигура, изометрия)

Для людей добавляй в конце `full body, standing pose, facing three-quarter view` — это удержит их в одной изометрической "стойке", как у зданий.

**C1. Молодая девушка — нарядное платье**
```
single isometric young woman, early 1900s-1930s Eastern European fashion, ankle-length light blouse and skirt, wide-brim straw hat, gentle warm smile, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C2. Молодая девушка — простое платье с платком**
```
single isometric young peasant woman, early 20th century Eastern European rural dress, simple linen blouse, long skirt, headscarf tied under the chin, apron, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C3. Молодой парень — костюм**
```
single isometric young man, early 1900s-1930s three-piece suit with waistcoat, bowler hat, neat mustache-free youthful face, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C4. Молодой парень — рабочая одежда**
```
single isometric young working-class man, early 20th century Eastern European worker outfit, simple shirt, suspenders, rolled sleeves, flat cap, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C5. Пожилой мужчина**
```
single isometric elderly man, early 20th century long dark coat, waistcoat, walking cane, wide mustache, hat, gentle stooped posture, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C6. Пожилая женщина**
```
single isometric elderly woman, early 20th century long dark modest dress, wool shawl over shoulders, headscarf, kind wrinkled face, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C7. Мать с коляской (вариант 1)**
```
single isometric young mother pushing an antique 1920s wicker baby pram/stroller, long modest early 20th century dress, warm shawl, gentle expression looking down at the pram, full body, standing/walking pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C8. Мать с коляской (вариант 2)**
```
single isometric mother walking with a vintage 1900s-1930s baby carriage, tall wheels, wicker basket body, hooded canopy, mother in a long coat and hat, full body, walking pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C9. Рыбак на пристани** *(чинит сеть — вписывается в приморскую тему игры)*
```
single isometric fisherman standing on a wooden quay, mending a fishing net draped over his shoulder and arm, early 20th century oilskin coat and rubber boots, flat cap, weathered hands, a wicker fish basket by his feet, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**C10. Лодочник в лодке** *(отдельная сцена с маленькой деревянной лодкой)*
```
single isometric small wooden rowboat with a boatman sitting inside holding a pair of oars, early 20th century fisherman's cap and simple sweater, weathered timber hull, coiled rope, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

---

## D. Бонус — если захочешь ещё больше жизни на карте

Не входило в запрос, но органично впишется в эпоху 1900–1930-х и добавит колорита (генерируй только если будет желание):

**D1. Уличный торговец**
```
single isometric street vendor with a small wooden cart selling flowers or fruit, early 20th century Eastern European market seller, apron, cap, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**D2. Мальчик-разносчик газет**
```
single isometric newspaper boy, early 20th century flat cap, suspenders, holding a stack of newspapers, cheerful pose, full body, standing pose, facing three-quarter view, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

---

## E. Узнаваемые места Гданьска (landmark-декорации, штучные)

Это не рядовые деревья/люди, а уникальные достопримечательности — ставятся на карте в одном экземпляре, как маленькая "визитка" города. Взял три самых узнаваемых, которые прямо ассоциируются именно с Гданьском, а не с любым европейским городом вообще:

**E1. Фонтан Нептуна** *(главный символ Гданьска, стоит на Длугом Тарге)*
```
single isometric ornate bronze fountain of the sea god Neptune holding a trident, standing atop a decorative stone basin with cherub figures and wave/shell motifs, based on the historic Neptune's Fountain in Gdańsk, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette accented with weathered bronze-green patina, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

**E2. Гданьский Журав (Żuraw)** *(средневековый портовый кран на набережной Мотлавы — таких больше нигде нет, самый узнаваемый силуэт города после Нептуна)*
```
single isometric medieval wooden port crane (żuraw) landmark, twin brick gate towers flanking a large wooden hoisting mechanism jutting out toward the water, dark timber and warm brick facade, based on the historic Gdańsk Crane on the waterfront, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, vertical portrait image, taller than wide (roughly 2:3 aspect ratio)
```

**E3. Зелёные ворота (Zielona Brama)** *(парадный въезд в город со стороны реки, узнаваемый нидерландский маньеристский фасад)*
```
single isometric Dutch mannerist city gate landmark, wide arched brick gateway with a tall flat rectangular facade above it and small decorative corner turrets, warm brick and cream stone tones, based on the historic Green Gate of Gdańsk, isometric game asset, 2:1 dimetric perspective, soft painterly cel-shaded render, warm terracotta cream and wood-brown color palette, soft ambient occlusion, soft drop shadow, cozy mobile city-builder game art style, clean edges, plain white background, no text, no watermark, square image, 1:1 aspect ratio
```

Так как это реальные, всё ещё существующие достопримечательности, Nano Banana обычно узнаёт их по названию само по себе — но всё равно прикрепляй `cottage_01.png`/`market_01.png` как референс стиля, иначе он может съехать в сторону фотореализма (это же настоящие места).

---

## Что делать дальше

1. Сгенерируй всё, что понравится (не обязательно всё за раз — можно партиями).
2. Пришли мне готовые картинки прямо в чат.
3. Я вырежу фон, подгоню размер под движок и впишу их в `www/js/render/assets.js` по той же схеме, что уже используется для домов (`drawRealBuilding`) — там всё уже готово принять новые "слоты" спрайтов.
4. Достопримечательности (раздел E) пойдут в новую вкладку "Украшение города" отдельным, штучным пунктом — не как обычная декорация, которую можно ставить многократно.

---

## F. Промты на амбиентный звук города (не музыка, а фоновый шум)

Основная мелодия (которая играет с самого начала игры) остаётся как есть — эти промты только для звуков, которые звучат при открытии карты города (море/чайки/птицы/улица). Инструмент — **ElevenLabs Sound Effects** (elevenlabs.io/sound-effects), не Suno/Udio — там нужны короткие зацикленные шумовые эмбиенты, а не музыка.

**F1. Море (`amb_sea.mp3`)**
```
Gentle ocean waves rolling and lapping onto a sandy shore, realistic natural sea ambience, calm Baltic coast, soft foam hiss, no music, no voices, seamless loopable field recording
```

**F2. Чайки (`amb_seagulls.mp3`)**
```
Seagulls calling and crying over a coastal harbor, occasional distant flapping wings, realistic natural ambience, no music, no voices, seamless loopable field recording
```

**F3. Птицы в городе (`amb_birds.mp3`)**
```
Gentle songbirds chirping in a quiet early 20th century town garden, soft rustling leaves, occasional distant church bell, calm daytime ambience, no music, no voices, seamless loopable field recording
```

**F4. Уличный шум эпохи (`amb_traffic.mp3`)**
```
Early 20th century Eastern European town street ambience, distant horse-drawn carriage wheels and hooves on cobblestone, faint muffled market chatter and footsteps, occasional wooden cart creak, no engines, no cars, no music, no voices, period-accurate historical soundscape, seamless loopable field recording
```

Готовые файлы кладутся в `www/assets/audio/` под теми же именами (перезаписывают текущие) — код их уже подхватывает через `pauseMusicForBackground()`/`resumeMusicFromBackground()`.
