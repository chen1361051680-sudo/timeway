import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import COS from 'cos-nodejs-sdk-v5';
import { check } from './common.mjs';

export class OfferCovers {
  constructor(store, environment, directory) {
    this.store = store;
    this.environment = environment;
    this.directory = directory || `data/${environment}-offer-covers`;
  }
  cloud() {
    const { COS_BUCKET: Bucket, COS_REGION: Region, COS_SECRET_ID: SecretId, COS_SECRET_KEY: SecretKey } = process.env;
    check(Bucket && Region && SecretId && SecretKey, '图片存储尚未配置，请联系机构管理员', 503);
    return { client: new COS({ SecretId, SecretKey }), Bucket, Region };
  }
  async save(user, body) {
    check(typeof body.content === 'string' && body.content.length <= 4194304, '图片不能超过 3 MB', 413);
    const input = Buffer.from(body.content, 'base64');
    check(input.length && input.toString('base64') === body.content, '图片内容无效');
    const source = sharp(input, { limitInputPixels: 25000000, failOn: 'warning' });
    const metadata = await source.metadata();
    check(['jpeg', 'png', 'webp'].includes(metadata.format), '请选择 JPG、PNG 或 WebP 图片');
    check(!metadata.pages || metadata.pages === 1, '请选择静态图片');
    const { data, info } = await source.autoOrient().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const id = createHash('sha256').update(user.id).update(data).digest('hex');
    if (!this.store.get('offer-cover', id)) {
      const key = `offer-covers/${id}.webp`;
      const storage = this.environment === 'production' ? 'cos' : 'local';
      if (storage === 'cos') {
        const { client, Bucket, Region } = this.cloud();
        await client.putObject({ Bucket, Region, Key: key, Body: data, ContentType: 'image/webp' });
      } else {
        await mkdir(this.directory, { recursive: true });
        await writeFile(join(this.directory, `${id}.webp`), data);
      }
      this.store.put('offer-cover', { id, owner: user.id, storage, key, width: info.width, height: info.height });
    }
    return { id, url: `/api/offer-covers/${id}` };
  }
  async read(user, id) {
    const cover = this.store.get('offer-cover', id);
    check(cover, '图片不存在', 404);
    check(
      cover.owner === user.id ||
        this.store.all('task').some((task) => task.kind === 'redeem' && task.status !== 'deleted' && task.coverId === id) ||
        this.store.all('booking').some((booking) => booking.coverId === id && [booking.owner, booking.userId].includes(user.id)),
      '无权访问图片',
      403,
    );
    if (cover.storage === 'cos') {
      const { client, Bucket, Region } = this.cloud();
      return (await client.getObject({ Bucket, Region, Key: cover.key })).Body;
    }
    return readFile(join(this.directory, `${cover.id}.webp`));
  }
}
