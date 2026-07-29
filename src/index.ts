import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  getCommitModel,
  findModel,
  registerSmartCommitTool,
} from "./tools/smart.commit.js";

export default function (pi: ExtensionAPI): void {
  let modelToRestore: NonNullable<ExtensionContext["model"]> | undefined;

  pi.on("agent_settled", async (_event, ctx) => {
    const previousModel = modelToRestore;
    modelToRestore = undefined;
    if (!previousModel) return;

    const restored = await pi.setModel(previousModel);
    if (restored) {
      ctx.ui.notify(`已恢复原模型：${previousModel.provider}/${previousModel.id}`, "info");
    } else {
      ctx.ui.notify(
        `原模型无法恢复：${previousModel.provider}/${previousModel.id}。请检查该模型的认证配置。`,
        "warning",
      );
    }
  });

  registerSmartCommitTool(pi);

  pi.on("resources_discover", () => ({
    skillPaths: [fileURLToPath(new URL("../skills", import.meta.url))],
  }));

  pi.registerCommand("commit", {
    description: "分析整个工作区的改动，按功能分组、自动暂存并创建规范的 Git 提交。",
    handler: async (args, ctx) => {
      const modelReference = args.trim() || getCommitModel(ctx);
      const model = findModel(ctx, modelReference);
      if (!model) {
        ctx.ui.notify(
          `模型不可用：${modelReference}。请检查 provider/model 模型引用以及对应的认证配置。`,
          "error",
        );
        return;
      }

      const previousModel = ctx.model;
      const selected = await pi.setModel(model);
      if (!selected) {
        ctx.ui.notify(
          `模型无法用于请求：${model.provider}/${model.id}。请检查该模型的认证配置。`,
          "error",
        );
        return;
      }

      modelToRestore = previousModel;
      pi.sendUserMessage(
        [
          "立即调用 smart_commit 工具，完成工作区提交并推送：",
          JSON.stringify({
            model: `${model.provider}/${model.id}`,
            auto_push: true,
          }),
          "工具已提供状态和差异；按其精简规则执行，不要重复读取差异。完成后用中文简要报告。",
        ].join("\n"),
      );
    },
  });
}
