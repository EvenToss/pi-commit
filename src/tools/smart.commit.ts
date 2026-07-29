import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_MODEL = "doumi/gpt-5.4-mini";

export interface SmartCommitParams {
  model?: string;
  auto_push?: boolean;
}

function configuredCommitModel(settingsPath: string): string | undefined {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      commit_model?: unknown;
    };
    return typeof settings.commit_model === "string" && settings.commit_model.trim()
      ? settings.commit_model.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export function getCommitModel(ctx: Pick<ExtensionContext, "cwd">): string {
  const globalModel = configuredCommitModel(join(homedir(), ".pi", "agent", "settings.json"));
  const projectModel = configuredCommitModel(join(ctx.cwd, ".pi", "settings.json"));
  return projectModel || globalModel || DEFAULT_MODEL;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findModel(
  ctx: ExtensionContext,
  modelReference: string,
): NonNullable<ExtensionContext["model"]> | undefined {
  const models = ctx.modelRegistry.getAll();
  const exactReference = models.find(
    (candidate) => `${candidate.provider}/${candidate.id}` === modelReference,
  );
  if (exactReference) return exactReference;

  const sameId = models.filter((candidate) => candidate.id === modelReference);
  if (sameId.length === 1) return sameId[0];

  return undefined;
}

function availableModelHint(ctx: ExtensionContext): string {
  const models = ctx.modelRegistry.getAll();
  const ids = models.slice(0, 12).map((model) => `${model.provider}/${model.id}`);
  return ids.length > 0 ? `\n\n当前可用模型示例：${ids.join(", ")}` : "";
}

export function registerSmartCommitTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "smart_commit",
    label: "智能提交",
    description: "分析整个工作区的改动，按功能分组、自动暂存并创建规范的 Git 提交。",
    promptSnippet: "按功能拆分工作区改动并自动提交。",
    parameters: Type.Object({
      model: Type.Optional(
        Type.String({
          default: DEFAULT_MODEL,
          description: "用于生成本次提交信息的模型 ID 或 provider/model 引用；未指定时读取 settings.json 的 commit_model。",
        }),
      ),
      auto_push: Type.Optional(
        Type.Boolean({
          default: false,
          description: "提交完成后是否推送到远程仓库。",
        }),
      ),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params: SmartCommitParams, signal, onUpdate, ctx) {
      const modelReference = params.model || getCommitModel(ctx);
      const autoPush = params.auto_push === true;

      try {
        const model = findModel(ctx, modelReference);
        if (!model) {
          return {
            content: [
              {
                type: "text",
                text: `模型不可用：${modelReference}。请检查 provider/model 模型引用以及对应的认证配置。${availableModelHint(ctx)}`,
              },
            ],
            details: { error: "model_not_found", model_requested: modelReference },
          };
        }

        onUpdate?.({
          content: [{ type: "text", text: "正在检查工作区改动..." }],
          details: {},
        });
        const status = await pi.exec("git", ["status", "--short"], {
          cwd: ctx.cwd,
          signal,
        });
        if (status.code !== 0) {
          throw new Error(status.stderr.trim() || "当前目录不是 Git 仓库。");
        }
        if (!status.stdout.trim()) {
          return {
            content: [{ type: "text", text: "工作区没有改动，无需提交。" }],
            details: { has_changes: false, model_used: modelReference },
          };
        }

        onUpdate?.({
          content: [{ type: "text", text: "正在读取工作区差异..." }],
          details: {},
        });
        const diff = await pi.exec("git", ["diff", "HEAD", "--no-ext-diff"], {
          cwd: ctx.cwd,
          signal,
        });
        if (diff.code !== 0) {
          throw new Error(diff.stderr.trim() || `git diff 执行失败，退出码：${diff.code}。`);
        }

        const pushInstruction = autoPush
          ? "完成提交后执行一次 `git push`。"
          : "不要执行 git push。";
        const instruction = [
          `使用模型 ${model.provider}/${model.id}。`,
          "根据下面已经提供的状态和差异，按功能或独立目的拆分提交，不要再次执行 git status 或 git diff。",
          "先判断每个文件属于哪个功能分组；不同功能必须拆分，只有同一功能的必要改动才合并。若同一文件混有多个功能且无法安全按行暂存，则保留在同一提交并说明原因。",
          "每个分组只包含完成该功能所需的文件，依次执行 `git add <分组文件>` 和 `git commit --only <分组文件>`；使用 `--only` 避免把用户预先暂存的其他功能带入当前提交。不要使用交互式暂存，也不要为了拆分增加无意义的提交。",,
          "提交信息遵循 commit-style-guide：使用 feat/fix/refactor/docs/style/test/chore 前缀，scope 可选，冒号后用简洁中文动词标题（建议不超过 50 个字符），较大改动再添加中文正文。",
          "执行规则：保留已有暂存内容，不得 reset/restore/checkout 丢弃改动；未跟踪文件按状态列表纳入对应分组。",
          pushInstruction,
          "尽量只调用一次 bash 完成每个分组的 add/commit，全部提交成功后再 push 一次；不要读取已经提供的差异。最后用中文简要报告各提交哈希、提交信息、文件和推送结果。某个分组失败时停止后续操作并说明原因。",
          "",
          "工作区状态：",
          status.stdout,
          "",
          "差异：",
          diff.stdout || "（没有已跟踪文件差异，可能只有未跟踪文件；仅在必要时读取状态中列出的未跟踪文件。）",
        ].join("\n");

        return {
          content: [{ type: "text", text: instruction }],
          details: {
            has_changes: true,
            model_used: `${model.provider}/${model.id}`,
            auto_push: autoPush,
          },
        };
      } catch (error) {
        const message = errorText(error);
        return {
          content: [{ type: "text", text: `提交准备失败：${message}` }],
          details: { error: message, model_requested: modelReference },
        };
      }
    },
  });
}

export { DEFAULT_MODEL, findModel };
