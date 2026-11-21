import { NextResponse } from 'next/server';
import { getNotice } from '@/lib/site-data';

export const runtime = 'nodejs';

/**
 * 站长通知（公开读）：前端拿 version 判断是否弹窗。
 * 写入在 /api/admin/notice，需要登录。
 */
export async function GET() {
  return NextResponse.json({ ok: true, notice: getNotice() });
}
