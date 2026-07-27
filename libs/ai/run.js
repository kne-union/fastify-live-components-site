const { streamText, tool, stepCountIs } = require('ai');
const { z } = require('zod');
const { buildRefineSystemPrompt, buildGenerateSystemPrompt } = require('./prompts');
const { getExampleCode } = require('./catalog');
const { mergeSuggestedProps } = require('./extract-props');

const writeSse = (reply, data) => {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
};

const buildUserMessages = job => {
  const messages = Array.isArray(job.messages) ? job.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content).map(m => ({ role: m.role, content: String(m.content) })) : [];

  if (job.mode === 'generate') {
    const parts = [];
    if (job.selection?.code) {
      parts.push(`[选中片段]\n${job.selection.code}`);
    } else if (job.content) {
      parts.push(`[当前 content]\n${job.content}`);
    }
    if (job.scope && Object.keys(job.scope).length) {
      parts.push(`[当前 scope]\n${JSON.stringify(job.scope, null, 2)}`);
    }
    if (job.props && Object.keys(job.props).length) {
      parts.push(`[当前 props]\n${JSON.stringify(job.props, null, 2)}`);
    }
    if (parts.length) {
      messages.push({ role: 'user', content: parts.join('\n\n') });
    }
  } else if (job.selection?.code) {
    messages.push({ role: 'user', content: `[当前选中片段参考]\n${job.selection.code}` });
  }

  if (!messages.length) {
    messages.push({ role: 'user', content: job.mode === 'generate' ? '请根据对话生成代码。' : '请帮助完善需求。' });
  }

  return messages;
};

const propDefSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'function']),
  defaultValue: z.any().optional()
});

const runAiStream = async (job, reply) => {
  const model = await job.getAIModel();
  if (!model) {
    writeSse(reply, { text: 'AI model 未配置', done: true });
    return;
  }

  const ctx = {
    mode: job.mode,
    hasSelection: !!(job.selection?.code || job.selection?.startLine),
    selectionLabel: job.selection?.label,
    scopeKeys: Object.keys(job.scope || {}),
    libKeys: job.libs || [],
    catalogs: job.catalogs || [],
    messages: job.messages || [],
    scope: job.scope || {},
    props: job.props || {}
  };

  const system = job.mode === 'generate' ? buildGenerateSystemPrompt(ctx) : buildRefineSystemPrompt(ctx);
  let suggestedScope = {};
  let suggestedProps = {};
  let streamedText = '';

  const exampleTool = tool({
    description: job.mode === 'generate' ? '按示例 id 读取远程组件文档中的完整示例代码' : '可选：查看某示例代码以便更准确描述需求（refine 阶段仍不要输出业务实现代码）',
    inputSchema: z.object({
      remote: z.string(),
      version: z.string().optional(),
      component: z.string(),
      exampleId: z.string()
    }),
    execute: async ({ remote, version, component, exampleId }) => {
      return getExampleCode(job.catalogs, { remote, version, component, exampleId });
    }
  });

  const tools =
    job.mode === 'generate'
      ? {
          getComponentExample: exampleTool,
          suggestScope: tool({
            description: '声明需要合并进编辑器「组件域」的 scope（远程组件 token）',
            inputSchema: z.object({
              scope: z.record(z.string())
            }),
            execute: async ({ scope }) => {
              suggestedScope = Object.assign({}, suggestedScope, scope || {});
              return { ok: true, suggestedScope };
            }
          }),
          suggestProps: tool({
            description: '声明需要合并进编辑器「组件参数」的 props；content 使用 props.xxx 时必须调用。形如 { title: { type: "string", defaultValue: "标题" } }',
            inputSchema: z.object({
              props: z.record(propDefSchema)
            }),
            execute: async ({ props }) => {
              suggestedProps = Object.assign({}, suggestedProps, props || {});
              return { ok: true, suggestedProps };
            }
          })
        }
      : {
          getComponentExample: exampleTool
        };

  const result = streamText({
    model,
    system,
    messages: buildUserMessages(job),
    tools,
    stopWhen: stepCountIs(job.mode === 'generate' ? 8 : 4)
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      const text = part.text || part.delta || part.textDelta || '';
      if (text) {
        streamedText += text;
        writeSse(reply, { text, done: false });
      }
    }
  }

  let finalText = streamedText;
  try {
    const fromResult = await result.text;
    if (typeof fromResult === 'string' && fromResult) {
      if (!streamedText) {
        finalText = fromResult;
        writeSse(reply, { text: fromResult, done: false });
      } else if (fromResult.length > streamedText.length && fromResult.startsWith(streamedText)) {
        const rest = fromResult.slice(streamedText.length);
        finalText = fromResult;
        if (rest) {
          writeSse(reply, { text: rest, done: false });
        }
      } else if (!streamedText.trim() && fromResult.trim()) {
        finalText = fromResult;
        writeSse(reply, { text: fromResult, done: false });
      }
    }
  } catch (e) {
    // ignore text aggregation errors; streamedText may still be enough
  }

  const donePayload = { done: true };
  if (!streamedText.trim() && finalText.trim()) {
    donePayload.text = finalText;
  }
  if (Object.keys(suggestedScope).length) {
    donePayload.suggestedScope = suggestedScope;
  }
  // 即使模型未调 suggestProps，也从生成代码扫描 props.xxx 补齐声明
  if (job.mode === 'generate' && finalText.trim()) {
    suggestedProps = mergeSuggestedProps(finalText, suggestedProps, job.props || {});
  }
  if (Object.keys(suggestedProps).length) {
    donePayload.suggestedProps = suggestedProps;
  }
  writeSse(reply, donePayload);
};

module.exports = {
  runAiStream,
  buildUserMessages
};
