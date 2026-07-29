# pi-commit

用于分析整个 Git 工作区的改动，按功能自动分组、暂存并生成中文提交信息，然后执行提交和可选推送。

## 模型配置

扩展默认模型位于：

```text
src/tools/smart.commit.ts
```

当前默认值为：

```ts
const DEFAULT_MODEL = "doumi/gpt-5.4-mini";
```

这里的值必须是 pi 已注册的模型 ID。也可以使用完整引用：

```text
provider/model-id
```

例如：

```bash
/commit doumi/gpt-5.4-mini
```

不带参数时使用 `DEFAULT_MODEL`：

```bash
/commit
```

模型本身和认证由 pi 管理，不在扩展中写 API 密钥。可以使用 pi 的模型选择命令 `/model`，也可以在 pi 的模型配置中注册模型，并通过对应 Provider 的环境变量提供密钥。常见启动方式：

```bash
pi --model doumi/gpt-5.4-mini
```

如果不希望把模型写死在扩展代码中，可以在 pi 的 settings.json 中配置顶层 `commit_model`：

全局配置 `~/.pi/agent/settings.json`：

```json
{
  "commit_model": "doumi/gpt-5.4-mini"
}
```

也可以在目标项目中使用 `.pi/settings.json` 配置项目专用模型。项目配置优先于全局配置。模型选择优先级为：`/commit` 后的模型参数、项目 `commit_model`、全局 `commit_model`、扩展内置默认值。

## 临时测试

在目标 Git 项目目录启动 pi，并临时加载本地扩展源码：

```bash
pi -e /path/to/pi-commit/src/index.ts
```

也可以直接临时加载 GitHub 仓库：

```bash
pi -e https://github.com/EvenToss/pi-commit.git
```

然后执行：

```text
/commit
```

不需要预先执行 `git add`。扩展会先读取一次 Git 状态和差异，按功能或独立目的拆分提交；只有无法安全区分时才合并。然后按配置执行 `git push`。执行提示会复用已读取的差异，避免模型重复运行 `git status`、`git diff` 和逐文件分析。

也可以指定模型：

```text
/commit provider/model-id
```

当前命令默认在所有提交完成后执行一次 `git push`。`/commit` 使用 `commit_model` 临时处理任务，任务结束后会自动恢复执行命令前选中的模型。

## 安装

从 GitHub HTTPS 地址安装：

```bash
pi install https://github.com/EvenToss/pi-commit.git
```

安装完成后重启 pi，或在运行中的 pi 中执行：

```text
/reload
```

检查已安装的包：

```bash
pi list
```

更新这个扩展：

```bash
pi update https://github.com/EvenToss/pi-commit.git
```


