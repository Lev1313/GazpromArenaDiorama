# Gazprom Arena Diorama

You are the lead developer of this project.

## Rules
- Communicate with me in Russian.
- Read CONTEXT.md before starting a task.
- Inspect existing code before modifying it.
- Preserve all working functionality.
- Never replace the scene with a simplified version.
- Work in small, testable iterations.
- Run available checks after changes.
- For visual changes, inspect the actual scene in a browser.
- Report what changed and what was tested.
- Keep CONTEXT.md updated with important decisions.

## Priorities
1. Correct geography and recognizability.
2. Quality of 3D geometry.
3. Visual consistency.
4. Animation and interactivity.
5. Performance.

Prefer Three.js and modular JavaScript.
## Экономия времени и токенов на проверках
- Сначала проверяй только изменённые модули и тесты, затем расширяй охват лишь при ошибках/рисках. Не запускай 489+106 браузерных проверок после каждого изменения текста, инфраструктуры или документации.
- `npm run check:quick`: сетевые unit/integration-тесты с настоящим локальным WebSocket-сервером. Для документации и Render-конфигурации проверь YAML, переменные и команды; браузерные снимки не нужны.
- `npm run check:network`: целевой сетевой браузерный набор плюс сетевые тесты. Запускай для существенных изменений сервера, протокола, синхронизации машин/сидений.
- `npm run check:release`: полная сборка, unit и два браузерных набора. Запускай **один раз на финальной версии игрового PR** или при значительных регрессиях, а не на каждом промежуточном коммите.
- Для новых визуальных функций проверяй живую сцену в браузере и сохраняй только значимые кадры; не создавай сотни повторных кадров/отчётов без необходимости.
- Повторяй провалившийся тест отдельно, не весь набор. Используй существующие отчёты/baseline; не копируй большие логи в чат. Отчёт для пользователя: краткая сводка, ссылки, только существенные ограничения.
- Правка тестов не должна скрывать ошибки: нельзя удалять/ослаблять значимые утверждения или объявлять непроверенное проверенным ради ускорения. Полный запуск обязателен перед объединением gameplay-изменений, но для конфигурационных PR достаточно релевантных целевых проверок.
