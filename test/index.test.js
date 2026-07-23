const { expect } = require('chai');
const { createFastify } = require('./helpers/app');

describe('@kne/fastify-live-components-site', function () {
  this.timeout(10000);

  let fastify;
  const prefix = '/api/v1/live-components-site';

  beforeEach(async () => {
    fastify = await createFastify();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  describe('插件注册测试', () => {
    it('should add namespace decorator with default options', async () => {
      expect(fastify.liveComponentsSite).to.exist;
      expect(fastify.liveComponentsSite.services.site).to.exist;
      expect(fastify.liveComponentsSite.services.node).to.exist;
      expect(fastify.liveComponentsSite.models.site).to.exist;
      expect(fastify.liveComponentsSite.models.node).to.exist;
    });
  });

  describe('站点管理', () => {
    it('should create site with shorten host', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: `${prefix}/site/create`,
        payload: { name: 'Demo Site' }
      });

      expect(res.statusCode).to.equal(200);
      const body = res.json();
      expect(body.name).to.equal('Demo Site');
      expect(body.status).to.equal('open');
      expect(body.shorten).to.be.a('string').and.have.length.greaterThan(0);
      expect(body.host).to.equal(`${prefix}/${body.shorten}`);
    });

    it('should list filter by status and toggle site', async () => {
      const created = (
        await fastify.inject({
          method: 'POST',
          url: `${prefix}/site/create`,
          payload: { name: 'Toggle Site' }
        })
      ).json();

      let list = (
        await fastify.inject({
          method: 'GET',
          url: `${prefix}/site/list?filter[status]=open`
        })
      ).json();
      expect(list.totalCount).to.equal(1);

      const saveRes = await fastify.inject({
        method: 'POST',
        url: `${prefix}/site/save`,
        payload: { id: created.id, status: 'closed' }
      });
      expect(saveRes.statusCode).to.equal(200);
      expect(saveRes.json()).to.deep.equal({});

      list = (
        await fastify.inject({
          method: 'GET',
          url: `${prefix}/site/list?filter[status]=closed`
        })
      ).json();
      expect(list.totalCount).to.equal(1);
      expect(list.pageData[0].shorten).to.equal(created.shorten);
      expect(list.pageData[0].host).to.equal(created.host);
    });

    it('should remove site', async () => {
      const created = (
        await fastify.inject({
          method: 'POST',
          url: `${prefix}/site/create`,
          payload: { name: 'Remove Site' }
        })
      ).json();

      const removeRes = await fastify.inject({
        method: 'POST',
        url: `${prefix}/site/remove`,
        payload: { id: created.id }
      });
      expect(removeRes.statusCode).to.equal(200);

      const detailRes = await fastify.inject({
        method: 'GET',
        url: `${prefix}/site/detail?id=${created.id}`
      });
      expect(detailRes.statusCode).to.equal(404);
    });
  });

  describe('公开文件 API', () => {
    let site;

    beforeEach(async () => {
      site = (
        await fastify.inject({
          method: 'POST',
          url: `${prefix}/site/create`,
          payload: { name: 'File Site' }
        })
      ).json();
    });

    it('should reject invalid shorten', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: `${prefix}/INVALID/getFolderTree`
      });
      expect(res.statusCode).to.equal(401);
    });

    it('should reject closed site with 403', async () => {
      await fastify.inject({
        method: 'POST',
        url: `${prefix}/site/save`,
        payload: { id: site.id, status: 'closed' }
      });

      const res = await fastify.inject({
        method: 'GET',
        url: `${site.host}/getFolderTree`
      });
      expect(res.statusCode).to.equal(403);
    });

    it('should support folder tree file operations', async () => {
      let res = await fastify.inject({
        method: 'GET',
        url: `${site.host}/getFolderTree`
      });
      expect(res.statusCode).to.equal(200);
      expect(res.json()).to.deep.equal([]);

      const folder = (
        await fastify.inject({
          method: 'POST',
          url: `${site.host}/createFolder`,
          payload: { name: 'docs' }
        })
      ).json();
      expect(folder.type).to.equal('directory');
      expect(folder.children).to.deep.equal([]);

      const file = (
        await fastify.inject({
          method: 'POST',
          url: `${site.host}/create`,
          payload: { parentId: folder.id, name: 'a.js', content: 'hello' }
        })
      ).json();
      expect(file.type).to.equal('file');

      const dup = await fastify.inject({
        method: 'POST',
        url: `${site.host}/create`,
        payload: { parentId: folder.id, name: 'a.js', content: 'x' }
      });
      expect(dup.statusCode).to.equal(400);

      const got = (
        await fastify.inject({
          method: 'GET',
          url: `${site.host}/get?id=${file.id}`
        })
      ).json();
      expect(got.content).to.equal('hello');

      const share = (
        await fastify.inject({
          method: 'POST',
          url: `${site.host}/content-share/create`,
          payload: { id: file.id, expiresIn: 3600 }
        })
      ).json();
      expect(share.shorten).to.be.a('string');
      expect(share.url).to.equal(`${prefix}/content/${share.shorten}`);
      expect(share.expires).to.be.ok;

      const rawContent = await fastify.inject({
        method: 'GET',
        url: share.url
      });
      expect(rawContent.statusCode).to.equal(200);
      expect(rawContent.headers['content-type']).to.include('text/plain');
      expect(rawContent.body).to.equal('hello');
      expect(share.url).to.not.include(site.shorten);

      const listed = (
        await fastify.inject({
          method: 'GET',
          url: `${site.host}/content-share/list?id=${file.id}`
        })
      ).json();
      expect(listed).to.have.length(1);
      expect(listed[0].shorten).to.equal(share.shorten);

      await fastify.inject({
        method: 'POST',
        url: `${site.host}/save`,
        payload: { id: file.id, content: 'world' }
      });

      const rawAfterSave = await fastify.inject({
        method: 'GET',
        url: share.url
      });
      expect(rawAfterSave.body).to.equal('world');

      await fastify.inject({
        method: 'POST',
        url: `${site.host}/content-share/remove`,
        payload: { shorten: share.shorten }
      });
      const afterRemove = await fastify.inject({
        method: 'GET',
        url: share.url
      });
      expect(afterRemove.statusCode).to.equal(401);

      const renamed = (
        await fastify.inject({
          method: 'POST',
          url: `${site.host}/rename`,
          payload: { id: file.id, name: 'b.js' }
        })
      ).json();
      expect(renamed.name).to.equal('b.js');

      const tree = (
        await fastify.inject({
          method: 'GET',
          url: `${site.host}/getFolderTree`
        })
      ).json();
      expect(tree).to.have.length(1);
      expect(tree[0].name).to.equal('docs');
      expect(tree[0].children).to.have.length(1);
      expect(tree[0].children[0].name).to.equal('b.js');

      const removeFolder = await fastify.inject({
        method: 'POST',
        url: `${site.host}/remove`,
        payload: { ids: [folder.id] }
      });
      expect(removeFolder.statusCode).to.equal(400);

      await fastify.inject({
        method: 'POST',
        url: `${site.host}/remove`,
        payload: { ids: [file.id] }
      });

      await fastify.inject({
        method: 'POST',
        url: `${site.host}/remove`,
        payload: { ids: [folder.id] }
      });

      res = await fastify.inject({
        method: 'GET',
        url: `${site.host}/getFolderTree`
      });
      expect(res.json()).to.deep.equal([]);
    });

    it('should reopen closed site and keep same host', async () => {
      await fastify.inject({
        method: 'POST',
        url: `${prefix}/site/save`,
        payload: { id: site.id, status: 'closed' }
      });

      await fastify.inject({
        method: 'POST',
        url: `${prefix}/site/save`,
        payload: { id: site.id, status: 'open' }
      });

      const res = await fastify.inject({
        method: 'GET',
        url: `${site.host}/getFolderTree`
      });
      expect(res.statusCode).to.equal(200);
    });

    it('should allow any-origin CORS on public entry and content, not on site admin', async () => {
      const origin = 'https://evil.example.com';
      const tree = await fastify.inject({
        method: 'GET',
        url: `${site.host}/getFolderTree`,
        headers: { origin }
      });
      expect(tree.statusCode).to.equal(200);
      expect(tree.headers['access-control-allow-origin']).to.equal('*');

      const preflightEntry = await fastify.inject({
        method: 'OPTIONS',
        url: `${site.host}/save`,
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type'
        }
      });
      expect(preflightEntry.statusCode).to.equal(204);
      expect(preflightEntry.headers['access-control-allow-origin']).to.equal('*');
      expect(preflightEntry.headers['access-control-allow-methods']).to.include('POST');

      const created = (
        await fastify.inject({
          method: 'POST',
          url: `${site.host}/create`,
          payload: { parentId: null, name: 'cors.js', content: 'cors' }
        })
      ).json();
      const share = (
        await fastify.inject({
          method: 'POST',
          url: `${site.host}/content-share/create`,
          payload: { id: created.id }
        })
      ).json();

      const content = await fastify.inject({
        method: 'GET',
        url: share.url,
        headers: { origin }
      });
      expect(content.statusCode).to.equal(200);
      expect(content.headers['access-control-allow-origin']).to.equal('*');

      const preflightContent = await fastify.inject({
        method: 'OPTIONS',
        url: share.url,
        headers: {
          origin,
          'access-control-request-method': 'GET'
        }
      });
      expect(preflightContent.statusCode).to.equal(204);
      expect(preflightContent.headers['access-control-allow-origin']).to.equal('*');

      const adminList = await fastify.inject({
        method: 'GET',
        url: `${prefix}/site/list`,
        headers: { origin }
      });
      expect(adminList.headers['access-control-allow-origin']).to.not.equal('*');
    });
  });
});
