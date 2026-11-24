import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/api-guard';
import {
  addShort,
  getSettings,
  listAllTips,
  listRequests,
  listShorts,
  removeRequest,
  removeShort,
  removeTip,
  replaceShorts,
  setNotice,
  stats,
  updateRequest,
  updateSettings,
  updateShort,
  updateTip,
} from '@/lib/site-data';
import { SECRET_PLACEHOLDER, parseConfig, toEditableConfig } from '@/lib/admin-config';
import {
  countUsers,
  createUser,
  hashPassword,
  listUsers,
  removeUser,
  resetUserPassword,
  setUserDisabled,
} from '@/lib/users';

export const runtime = 'nodejs';

/**
 * 管理端接口（/admin 页面用）。
 *
 * 鉴权只认站长密码（guardAdmin），注册用户即使已登录也进不来。
 *
 * GET  ?res=stats|requests|tips|users|settings|shorts|config|all
 * POST { action:
 *   'request.status' | 'request.reply' | 'request.delete'
 * | 'tip.status' | 'tip.delete'
 * | 'notice.save'
 * | 'settings.save'          // { accessMode?, allowRegister?, siteName?, slogan?, banner?, adultFilter? }
 * | 'shorts.save'            // { enabled?, password? }  口令走 scrypt 哈希，only-hash-落盘
 * | 'shorts.add' | 'shorts.update' | 'shorts.delete'     // 私密短剧清单维护
 * | 'config.save'            // { json } 整段 JSON，仅 settings + shorts 两字段
 * | 'user.create'            // { username, password, nick? }
 * | 'user.disable' | 'user.enable' | 'user.password' | 'user.delete'
 * }
 */

export async function GET(req: Request) {
  const guarded = guardAdmin(req);
  if (guarded) return guarded;

  const res = new URL(req.url).searchParams.get('res') || 'all';

  if (res === 'stats') {
    return NextResponse.json({ ok: true, stats: { ...stats(), users: countUsers() } });
  }
  if (res === 'requests') return NextResponse.json({ ok: true, requests: listRequests() });
  if (res === 'tips') return NextResponse.json({ ok: true, tips: listAllTips() });
  if (res === 'users') return NextResponse.json({ ok: true, users: listUsers(), count: countUsers() });
  if (res === 'settings') return NextResponse.json({ ok: true, settings: getSettings() });
  if (res === 'shorts') return NextResponse.json({ ok: true, shorts: listShorts() });
  if (res === 'config') {
    const settings = getSettings();
    return NextResponse.json({
      ok: true,
      config: toEditableConfig(settings, listShorts()),
      /** 给编辑器做「哪些字段可以改」的提示与只读元信息 */
      meta: {
        file: 'site.json',
        editable: ['settings', 'shorts'],
        readOnly: ['requests', 'tips', 'notice'],
        updatedAt: settings.updatedAt,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    stats: { ...stats(), users: countUsers() },
    requests: listRequests(),
    tips: listAllTips(),
    users: listUsers(),
    settings: getSettings(),
    shorts: listShorts(),
  });
}

export async function POST(req: Request) {
  const guarded = guardAdmin(req);
  if (guarded) return guarded;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const action = String(body.action || '');
  const id = typeof body.id === 'string' ? body.id : '';

  switch (action) {
    case 'request.status': {
      const status = body.status;
      if (status !== 'pending' && status !== 'done' && status !== 'rejected') {
        return NextResponse.json({ error: '状态不合法' }, { status: 400 });
      }
      const item = await updateRequest(id, { status });
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: '没找到这条求片' }, { status: 404 });
    }

    case 'request.reply': {
      const item = await updateRequest(id, { reply: String(body.reply ?? '') });
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: '没找到这条求片' }, { status: 404 });
    }

    case 'request.delete': {
      const ok = await removeRequest(id);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: '没找到这条求片' }, { status: 404 });
    }

    case 'tip.status': {
      const status = body.status;
      if (status !== 'pending' && status !== 'shown' && status !== 'hidden') {
        return NextResponse.json({ error: '状态不合法' }, { status: 400 });
      }
      const item = await updateTip(id, status);
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: '没找到这条留言' }, { status: 404 });
    }

    case 'tip.delete': {
      const ok = await removeTip(id);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: '没找到这条留言' }, { status: 404 });
    }

    case 'notice.save': {
      const notice = await setNotice({
        body: typeof body.body === 'string' ? body.body : undefined,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      });
      return NextResponse.json({ ok: true, notice });
    }

    case 'settings.save': {
      const mode = body.accessMode;
      if (mode !== undefined && mode !== 'open' && mode !== 'login' && mode !== 'members') {
        return NextResponse.json({ error: '访问模式不合法' }, { status: 400 });
      }
      const settings = await updateSettings({
        accessMode: mode as 'open' | 'login' | 'members' | undefined,
        allowRegister:
          typeof body.allowRegister === 'boolean' ? body.allowRegister : undefined,
        siteName: typeof body.siteName === 'string' ? body.siteName : undefined,
        slogan: typeof body.slogan === 'string' ? body.slogan : undefined,
        banner: typeof body.banner === 'string' ? body.banner : undefined,
        adultFilter: typeof body.adultFilter === 'boolean' ? body.adultFilter : undefined,
      });
      return NextResponse.json({ ok: true, settings });
    }

    case 'shorts.save': {
      // 口令只存 scrypt 哈希；传空串表示「清除口令」，undefined 表示「不动」
      const rawPw = body.password;
      const patch: Parameters<typeof updateSettings>[0] = {};
      if (typeof body.enabled === 'boolean') patch.shortsEnabled = body.enabled;
      if (typeof rawPw === 'string') {
        const pw = rawPw.trim();
        if (!pw) {
          patch.shortsPasswordHash = undefined;
          patch.shortsPasswordAt = undefined;
        } else {
          if (pw.length < 4) {
            return NextResponse.json({ error: '短剧口令至少 4 位' }, { status: 400 });
          }
          patch.shortsPasswordHash = hashPassword(pw);
          patch.shortsPasswordAt = Date.now();
        }
      }
      const settings = await updateSettings(patch);
      return NextResponse.json({
        ok: true,
        settings,
        envPassword: Boolean(process.env.SHORTS_PASSWORD),
      });
    }

    case 'config.save': {
      // 后台「配置」页签：整段 JSON 保存。
      // 只接受 settings / shorts 两个字段（见 lib/admin-config.ts 的校验），
      // 求片、赞赏、通知有各自的表单页签，绝不能被一次整体覆盖清空。
      const text = typeof body.json === 'string' ? body.json : '';
      const parsed = parseConfig(text);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error, line: parsed.line, column: parsed.column },
          { status: 400 }
        );
      }

      const incoming = parsed.value.settings;
      const current = getSettings();
      const patch: Parameters<typeof updateSettings>[0] = {};

      if (incoming.accessMode !== undefined) patch.accessMode = incoming.accessMode;
      if (incoming.allowRegister !== undefined) patch.allowRegister = incoming.allowRegister;
      if (incoming.siteName !== undefined) patch.siteName = incoming.siteName;
      if (incoming.slogan !== undefined) patch.slogan = incoming.slogan;
      if (incoming.banner !== undefined) patch.banner = incoming.banner;
      if (incoming.adultFilter !== undefined) patch.adultFilter = incoming.adultFilter;
      if (incoming.shortsEnabled !== undefined) patch.shortsEnabled = incoming.shortsEnabled;

      // 口令：占位符 = 保持原哈希；空串/缺省 = 清除；其它 = 当新口令重新哈希
      const incomingHash = incoming.shortsPasswordHash;
      if (incomingHash === SECRET_PLACEHOLDER) {
        // 保持原口令，不动
      } else {
        const pw = String(incomingHash ?? '').trim();
        if (!pw) {
          if (current.shortsPasswordHash) {
            patch.shortsPasswordHash = undefined;
            patch.shortsPasswordAt = undefined;
          }
        } else if (pw.length < 4) {
          return NextResponse.json(
            { error: `settings.shortsPasswordHash：新口令至少 4 位（想保留原口令请填 "${SECRET_PLACEHOLDER}"）` },
            { status: 400 }
          );
        } else {
          patch.shortsPasswordHash = hashPassword(pw);
          patch.shortsPasswordAt = Date.now();
        }
      }

      const settings = await updateSettings(patch);
      const shorts = await replaceShorts(parsed.value.shorts ?? []);
      const dropped = (parsed.value.shorts ?? []).length - shorts.length;
      return NextResponse.json({
        ok: true,
        config: toEditableConfig(settings, shorts),
        // dropped > 0 说明有条目缺 title 或既没 url 又没分集，被静默丢弃了
        stats: { total: shorts.length, dropped },
      });
    }

    case 'shorts.add': {
      const short = await addShort({
        title: String(body.title || ''),
        url: String(body.url || ''),
        poster: typeof body.poster === 'string' ? body.poster : undefined,
        desc: typeof body.desc === 'string' ? body.desc : undefined,
      });
      return short
        ? NextResponse.json({ ok: true, short, shorts: listShorts() })
        : NextResponse.json({ error: '片名必填，直链地址与分集至少给一个' }, { status: 400 });
    }

    case 'shorts.update': {
      const short = await updateShort(id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        url: typeof body.url === 'string' ? body.url : undefined,
        poster: typeof body.poster === 'string' ? body.poster : undefined,
        desc: typeof body.desc === 'string' ? body.desc : undefined,
      });
      return short
        ? NextResponse.json({ ok: true, short, shorts: listShorts() })
        : NextResponse.json({ error: '更新失败：条目不存在或片名/地址为空' }, { status: 400 });
    }

    case 'shorts.delete': {
      const removed = await removeShort(id);
      return NextResponse.json({ ok: removed, shorts: listShorts() });
    }

    case 'user.create': {
      const created = await createUser({
        username: String(body.username || ''),
        password: String(body.password || ''),
        nick: typeof body.nick === 'string' ? body.nick : undefined,
        role: 'user',
      });
      return created.ok
        ? NextResponse.json({ ok: true, user: created.user, count: countUsers() })
        : NextResponse.json({ error: created.error }, { status: 400 });
    }

    case 'user.disable':
    case 'user.enable': {
      const user = await setUserDisabled(id, action === 'user.disable');
      return user
        ? NextResponse.json({ ok: true, user })
        : NextResponse.json({ error: '没找到这个账号' }, { status: 404 });
    }

    case 'user.password': {
      const ok = await resetUserPassword(id, String(body.password || ''));
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: '密码太短（至少 6 位）或账号不存在' }, { status: 400 });
    }

    case 'user.delete': {
      const ok = await removeUser(id);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: '没找到这个账号' }, { status: 404 });
    }

    default:
      return NextResponse.json({ error: `未知操作：${action}` }, { status: 400 });
  }
}
