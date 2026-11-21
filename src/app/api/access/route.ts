import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/site-data';
import { currentActor } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 访问策略的轻量出口：middleware（Edge）读不到 fs，靠这里拿「谁可以看」。
 * 只暴露判断需要的最小信息，不含任何用户数据。
 */
export async function GET(req: Request) {
  const settings = getSettings();
  const actor = currentActor(req);
  return NextResponse.json(
    {
      accessMode: settings.accessMode,
      actor: actor.kind,
      allowRegister: settings.allowRegister,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
