/**
 * 开发环境用的内存版 Redis。
 *
 * 没配 Upstash 凭据时顶上，让账户、算力、限流这些逻辑在本地能真跑起来，
 * 不用为了点一下登录就去找线上 Token。只实现本项目用到的那些命令。
 *
 * 只在 NODE_ENV !== 'production' 时启用：生产环境没凭据就该老老实实报错，
 * 不能悄悄把数据写进一个进程重启就没的地方。
 */

type Value = string | number | Record<string, unknown> | unknown[];

interface Slot {
  value: unknown;
  expiresAt?: number;
}

export class MemoryRedis {
  private store = new Map<string, Slot>();

  private live(key: string): Slot | undefined {
    const slot = this.store.get(key);
    if (!slot) return undefined;
    if (slot.expiresAt && slot.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return slot;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.live(key)?.value as T) ?? null;
  }

  async set(
    key: string,
    value: Value,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<'OK' | null> {
    if (opts?.nx && this.live(key)) return null;
    this.store.set(key, {
      value,
      expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : undefined,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const slot = this.live(key);
    if (!slot) return 0;
    slot.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async incrby(key: string, by: number): Promise<number> {
    const next = Number(this.live(key)?.value ?? 0) + by;
    this.store.set(key, { value: next, expiresAt: this.live(key)?.expiresAt });
    return next;
  }

  async decrby(key: string, by: number): Promise<number> {
    return this.incrby(key, -by);
  }

  async incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = new Set((this.live(key)?.value as string[]) ?? []);
    const before = set.size;
    for (const m of members) set.add(m);
    this.store.set(key, { value: [...set] });
    return set.size - before;
  }

  async smembers(key: string): Promise<string[]> {
    return [...((this.live(key)?.value as string[]) ?? [])];
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = (this.live(key)?.value as string[]) ?? [];
    list.unshift(...values);
    this.store.set(key, { value: list });
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    const list = (this.live(key)?.value as string[]) ?? [];
    this.store.set(key, { value: list.slice(start, stop + 1) });
    return 'OK';
  }

  async lrange<T = string>(key: string, start: number, stop: number): Promise<T[]> {
    const list = (this.live(key)?.value as T[]) ?? [];
    return list.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async hincrby(key: string, field: string, by: number): Promise<number> {
    const hash = ((this.live(key)?.value as Record<string, number>) ?? {});
    hash[field] = Number(hash[field] ?? 0) + by;
    this.store.set(key, { value: hash, expiresAt: this.live(key)?.expiresAt });
    return hash[field];
  }

  async hgetall<T = Record<string, unknown>>(key: string): Promise<T | null> {
    return (this.live(key)?.value as T) ?? null;
  }
}
