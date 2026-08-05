# FBL Roll Dialog Plus

Расширенный менеджер бросков для **Foundry VTT 13.351** и **Forbidden Lands 13.0.5**.

Модуль сохраняет системный `FBLRollHandler` как backend броска, но заменяет его интерфейс более удобным shell. Это сохраняет штатные Push, gear damage, attack metadata, consumables и интеграцию с foundry-year-zero-roller.

## Возможности 0.7.0

- выбор любого атрибута для броска навыка;
- системные, быстрые и пользовательские модификаторы;
- профили особых бросков с отдельными контекстными вариантами;
- Dodge как отдельный Move-бросок: падение/остаться стоя, рубящий удар и `Огнестрел −2`;
- Parry как отдельный Melee-бросок с контекстными вариантами для оружия и щита без лишнего варианта Other/Ranged;
- взаимоисключающие Difficulty, Range и Light;
- счётчик Help/Hindrance;
- artifact dice d8/d10/d12, включая таланты и другие внешние Roll Modifiers без дублирующихся строк;
- отдельный режим брони и `БП ×0.5`;
- GM-only анализ вероятности с учётом negative dice;
- шанс после Push, ожидаемые успехи, 0/1/2/3+;
- риск урона атрибуту и снаряжению при Push;
- русский и английский интерфейс;
- компактный интерфейс шириной 600 px, наследующий шрифт Forbidden Lands;
- заметная, но светлая окраска всего окна цветом выбранной характеристики и анимированная волна по контуру центральной кнопки броска;
- автоматически закрывающаяся панель Quick после выбора обычной позиции;
- нативные карточки бросков в чате без изменений;
- API для регистрации quick-групп и интеграционных hooks.

## Изменения архитектуры 0.7.0

- патч системного окна выполняется транзакционно и откатывается при ошибке;
- ручное значение Gear синхронизируется с `app.gear.value`, а исходное состояние восстанавливается до подтверждённого ChatMessage;
- нативные Roll Modifiers читают официальный `data-id`, поэтому DOM и actor API связываются по Item identity, а не только по подписи;
- unresolved Actor больше не заменяется единственным контролируемым токеном: модуль сохраняет нативные значения и не подмешивает чужие таланты;
- два одновременных броска одного Actor сопоставляются по actor/token/scene/item/type/skill/attribute/title metadata;
- неизвестная характеристика больше не превращается молча в Strength;
- сохраняется остаточный системный modifier, не представленный чекбоксами;
- armor-roll учитывает gear-bonus modifiers;
- submit блокируется от повторного клика и подтверждается созданием ChatMessage;
- состояние восстанавливается при Cancel, Escape, `app.close()` и удалении окна;
- вероятность кэшируется, вычисляется только после открытия Chance и не рассчитывается для аномально больших пулов, не блокируя сам бросок;
- разметка строк модификаторов имеет одного владельца;
- CSS разделён на compatibility, tokens, component owner-файлы и variants; декоративная рамка Forbidden Lands изолированно отключается compatibility-файлом;
- цветовые значения принадлежат только `styles/tokens.css`; JavaScript выбирает характеристику через data-attribute без дублирования hex-значений;
- скрытые overlay и эффекты ROLL не выходят за layout и не создают горизонтальную прокрутку;
- нижний toolbar модификаторов прижат к низу колонки через flex-layout и не создаёт пустых зон;
- module-owned CSS загружается без cascade layers и строго scoped к `.fblrp-shell`, чтобы unlayered системные правила Foundry/FBL не могли его перекрыть;
- `!important` оставлены только в compatibility-файле для системного окна;
- static check запрещает unscoped selectors, дубли owner-селекторов и возврат cascade layers.

## Установка

Распаковать каталог `fbl-roll-dialog-plus` в:

```text
FoundryVTT/Data/modules/
```

После запуска мира включить модуль в Manage Modules.

## Настройки

- включение модуля;
- debug logging;
- Push preview;
- округление `БП ×0.5`: вниз, вверх или математически.

## API

```js
const api = game.modules.get("fbl-roll-dialog-plus")?.api;
```

Доступно:

```js
api.calculateChanceAnalysis(payload);
api.calculateSuccessChance(payload);
api.calculateSuccessDistribution(payload);
api.getQuickModifierGroups("skill");
api.registerQuickModifierGroup(group, { type: "skill" });
api.listSpecialRollProfiles();
api.getSpecialRollProfile("dodge");
api.getSpecialRollProfile("parry");
api.registerSpecialRollProfile(profile);
```

Hooks:

```text
fblRollDialogPlusPrepare
fblRollDialogPlusBeforeRoll
fblRollDialogPlusSubmissionAttempted
fblRollDialogPlusRollSubmitted
```

`SubmissionAttempted` вызывается сразу после запуска нативного submit. `RollSubmitted` вызывается только после создания подходящего ChatMessage и содержит `message`, нормализованный `context` и metadata сопоставления.

## Разработка и проверки

```bash
npm test
npm run check
npm run smoke
```

`npm run smoke` запускает реальный Chromium через Playwright и проверяет computed background, ширину окна, отсутствие горизонтального overflow, центрирование ROLL и закрытое состояние Quick.

Подробное ревью и roadmap находятся в `REVIEW-AND-ROADMAP.md`. Ручная матрица проверки Foundry находится в `docs/TEST-MATRIX.md`.

## Ограничения

Модуль рассчитан на точную связку Foundry 13.351 + Forbidden Lands 13.0.5. Браузерный smoke-тест проверяет реальный CSS layout, но после установки всё равно требуется live-проверка в мире Foundry: permissions, synthetic token Actor, асинхронный `FBLRollHandler`, Dice So Nice и сторонние Roll Modifier providers не моделируются полностью.

### Упрощения 0.7.0

Кнопки Reset и Last Quick Setup удалены вместе с сохранением быстрых модификаторов. Крестик системного заголовка скрыт; закрытие без броска выполняется кнопкой Cancel.
