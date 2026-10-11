# Repository Guidelines

## 项目结构

- `index.html`：页面结构、菜单、玩法说明和游戏 HUD。
- `styles.css`：响应式布局、主题和弹层样式。
- `game-data.js`：静态数据表（遗物、进化、协同、反协同、地形、成就、悬赏）。必须在 `game.js` 之前加载，两者共享全局词法作用域。
- `game.js`：Canvas 游戏循环、状态机、敌人、地形、遗物、存档和输入处理。
- `test.js`：基于 jsdom 的逻辑回归测试。
- `browser_checks.py`：使用本机浏览器执行测试并检查桌面/移动端布局。
- `敌人与地形遗物扩展说明.md`：扩展系统的实现说明。

## 开发与测试命令

项目无需构建或网络依赖，直接打开 `index.html` 即可运行。

```powershell
D:\NODE\node.exe --check game-data.js
D:\NODE\node.exe --check game.js
D:\NODE\node.exe --check test.js
python browser_checks.py
```

`--check` 用于语法检查；`browser_checks.py` 会加载真实页面，执行回归测试并验证桌面、手机窗口没有横向溢出。完整 `test.js` 需要本机已安装 `jsdom`。

## 编码风格与命名

使用原生 ES6+，缩进保持现有文件风格（两格或紧凑单行函数均可，但同一段保持一致）。状态常量使用大写对象键，数据定义使用小驼峰 ID，例如 `terrainDefs`、`spawnEnemy`、`riftkey`。新增敌人伤害必须经过 `damageEnemy`，死亡必须经过 `killEnemy`；不要绕过统一状态机新增布尔状态。

## 测试规范

新增玩法应在 `test.js` 增加行为断言，覆盖输入、暂停/弹层状态、存档迁移和实际效果。测试标签使用现有 `T<number> 描述` 格式。修改 UI 后运行浏览器检查，确认 HUD 不遮挡棋盘，并检查 390px 移动端宽度。

## 提交与合并请求

提交消息使用简短中文动词开头，例如 `修复玩法说明乱码`、`新增地形敌人系统`。合并请求应说明用户可见变化、涉及文件和验证命令；涉及布局或交互时附桌面与移动端截图，并注明是否修改存档结构。

## 存档与配置

存档键为 `rogue_snake_save_v1`。新增字段必须在 `defaultSave()` 和 `loadSave()` 中提供默认值，确保旧存档可以读取。不要提交真实用户存档、浏览器缓存或外部资源。
