import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getCommitModel,
  findModel,
  registerSmartCommitTool,
} from "./tools/smart.commit.js";

export default function (pi: ExtensionAPI): void {
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

      const selected = await pi.setModel(model);
      if (!selected) {
        ctx.ui.notify(
          `模型无法用于请求：${model.provider}/${model.id}。请检查该模型的认证配置。`,
          "error",
        );
        return;
      }

      pi.sendUserMessage(
        [
          "请立即调用 smart_commit 工具：",
          JSON.stringify({
            model: `${model.provider}/${model.id}`,
            auto_push: true,
          }),
          "",
          "使用 commit-style-guide Skill，完成工具要求的提交操作，并用中文报告结果。",
        ].join("\n"),
      );
    },
  });
}
