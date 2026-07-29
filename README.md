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



在目标 Git 项目目录执行：

```bash
pi -e /Users/even/Downloads/Code/pi-agent/pi-commit/src/index.ts
```

然后直接执行：

```bash
/commit
```

不需要预先执行 `git add`。扩展会分析已暂存、未暂存和未跟踪的改动，按功能分组后自动执行 `git add <相关文件>` 和多次提交。

也可以指定模型：

```bash
/commit provider/model-id
```

当前命令默认在提交后执行 `git push`。

## 全局安装测试

将扩展目录放到 pi 的全局扩展目录：

```bash
mkdir -p ~/.pi/agent/extensions
cp -R /Users/even/Downloads/Code/pi-agent/pi-commit ~/.pi/agent/extensions/
```

pi 会自动发现目录中的 `index.ts`。本项目根目录已经提供了入口文件，它会加载 `src/index.ts`。

```bash
npm install --prefix /Users/even/Downloads/Code/pi-agent/pi-commit
npm run build --prefix /Users/even/Downloads/Code/pi-agent/pi-commit
```

然后将目录复制到全局扩展目录，并在 pi 中执行：

```text
/reload
```

如果扩展使用目录自动发现，入口文件就是项目根目录的 `index.ts`。临时测试时也可以直接使用 `src/index.ts`。

## 检查构建

```bash
npm run build --prefix /Users/even/Downloads/Code/pi-agent/pi-commit
```
