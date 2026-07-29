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
          ? "所有分组提交成功后，只执行一次 `git push`，并报告推送错误。"
          : "除非用户明确要求，否则不要推送。";
        const instruction = [
          `本次使用的模型是 ${model.provider}/${model.id}。`,
          "请分析整个 Git 工作区，而不只是暂存区，并按功能或独立目的将改动拆分成尽可能清晰的提交。",
          "先使用 `git status --short` 和下面的 `git diff HEAD` 了解已修改、已暂存和未跟踪的文件；未跟踪文件需要自行读取内容并纳入对应功能分组。",
          "每个功能分组只包含完成该功能所需的相关文件。不要把互不相关的功能合并到一个提交，也不要为了拆分而拆开同一功能的必要改动。",
          "对每个分组依次执行 `git add <相关文件>`，然后立即执行 `git commit`。可以使用 git add 的文件路径形式进行文件级分组，但不要使用 `git add .` 或 `git add -A` 一次性提交所有改动。",
          "保留用户已有的暂存内容，不要执行 `git reset`、`git restore`、`git checkout` 或其他丢弃改动的操作；如果某个文件同时包含多个功能，必须谨慎判断是否能安全地使用交互式暂存，否则保留在同一提交中并说明原因。",
          "每条提交信息都遵循 commit-style-guide：保留 feat、fix 等英文类型前缀，scope 可选，冒号后的标题主体必须使用中文并简洁明确。较大的改动用中文正文说明原因和实现方式。",
          pushInstruction,
          "全部操作完成后，返回每个提交的提交哈希、提交信息、包含的文件，以及推送结果。遇到某个分组失败时停止后续提交并报告原因。",
          "",
          "工作区状态：",
          status.stdout,
          "",
          "当前差异（包含已暂存和未暂存的已跟踪文件）：",
          diff.stdout || "（没有已跟踪文件差异，可能只有未跟踪文件；请根据 status 读取它们。）",
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
