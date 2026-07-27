const fp = require('fastify-plugin');
const { Forbidden, BadRequest, NotFound } = require('http-errors');
const { ensureRemotesCatalogs } = require('../ai/catalog');
const { createStreamJob, takeStreamJob } = require('../ai/stream-store');
const { runAiStream } = require('../ai/run');

module.exports = fp(async (fastify, options) => {
  const isAiEnabledForSite = site => {
    if (typeof options.ai?.getAIModel !== 'function') {
      return false;
    }
    const siteOptions = site?.options && typeof site.options === 'object' ? site.options : {};
    return siteOptions.aiEnabled !== false;
  };

  const getInfo = async authenticatePayload => {
    const site = authenticatePayload.site;
    return {
      name: site.name,
      status: site.status,
      defaultPermission: site.defaultPermission,
      aiEnabled: isAiEnabledForSite(site)
    };
  };

  const start = async (authenticatePayload, body = {}) => {
    if (!isAiEnabledForSite(authenticatePayload.site)) {
      throw new Forbidden('站点未开启 AI 生成');
    }
    if (typeof options.ai?.getAIModel !== 'function') {
      throw new Forbidden('AI 未配置');
    }

    const mode = body.mode === 'generate' ? 'generate' : 'refine';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const remotes = Array.isArray(body.remotes) ? body.remotes : [];
    const libs = Array.isArray(body.libs) ? body.libs.map(String) : [];
    const scope = body.scope && typeof body.scope === 'object' ? body.scope : {};
    const props = body.props && typeof body.props === 'object' ? body.props : {};
    const content = typeof body.content === 'string' ? body.content : '';
    const selection = body.selection && typeof body.selection === 'object' ? body.selection : null;

    if (mode === 'refine' && !messages.length) {
      throw new BadRequest('messages 不能为空');
    }

    // 不在 start 阻塞拉文档索引（易触发网关/代理 504）；在 stream 阶段再确保
    const streamToken = createStreamJob({
      mode,
      messages,
      remotes,
      libs,
      scope,
      props,
      content,
      selection,
      catalogs: null,
      catalogOptions: options,
      getAIModel: options.ai.getAIModel
    });

    return { streamToken };
  };

  const stream = async (authenticatePayload, { token }, reply) => {
    if (!isAiEnabledForSite(authenticatePayload.site)) {
      throw new Forbidden('站点未开启 AI 生成');
    }
    if (!token) {
      throw new BadRequest('token 不能为空');
    }
    const job = takeStreamJob(token);
    if (!job) {
      throw new NotFound('stream token 无效或已过期');
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    try {
      if (!job.catalogs) {
        job.catalogs = await ensureRemotesCatalogs(job.remotes, job.catalogOptions || options);
      }
      await runAiStream(job, reply);
    } catch (e) {
      reply.raw.write(`data: ${JSON.stringify({ text: e.message || 'AI 流式失败', done: true })}\n\n`);
    }
    reply.raw.end();
  };

  Object.assign(fastify[options.name].services, {
    ai: {
      getInfo,
      start,
      stream,
      isAiEnabledForSite
    }
  });
});
