'use client';

import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { BottomTabs } from '@/components/bottom-tabs';
import { SITE } from '@/lib/site';

/**
 * 关于页。文案全部跟 SITE 走，换站名不用改这里。
 * 「隐私与数据」这一节说清了两件用户真的关心的事：记录只在本地、搜索走服务端代理。
 */
function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col pb-16 sm:pb-0">
      <Header />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-8">
        <section>
          <h1 className="text-xl font-bold text-content mb-3">关于 {SITE.name}</h1>
          <p className="text-sm text-muted leading-relaxed">
            {SITE.name} 是一个免费的在线影视聚合平台，{SITE.slogan}。输入片名即可在多个点播源中聚合搜索，
            无需注册、无内嵌广告、不存储任何视频文件。所有播放内容均来自第三方公开接口。
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">怎么用</h2>
          <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
            <li>首页顶部搜索框输入片名，或者点「榜单」按分类逛</li>
            <li>点海报看详情，选一条线路、一集开播</li>
            <li>「我的」里能看到观看记录和待看，进度会自动记住</li>
            <li>找不到的片，用「求片」提交，上线后按昵称查进度</li>
            <li>手机用 Safari/浏览器「添加到主屏幕」，体验和 App 一样</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">播放器快捷键</h2>
          <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
            <li>
              <code className="text-accent">空格</code> 播放 / 暂停
            </li>
            <li>
              <code className="text-accent">←</code> / <code className="text-accent">→</code> 快退 / 快进 5 秒
            </li>
            <li>
              <code className="text-accent">↑</code> / <code className="text-accent">↓</code> 音量调节
            </li>
            <li>
              <code className="text-accent">F</code> 切换全屏
            </li>
            <li>
              <code className="text-accent">Alt + ←/→</code> 上一集 / 下一集
            </li>
            <li>移动端长按视频可 3 倍速播放</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">隐私与数据</h2>
          <p className="text-sm text-muted leading-relaxed">
            你的搜索历史、观看记录、待看清单等数据仅保存在本设备浏览器中（IndexedDB / localStorage），
            不会上传到服务器。聚合搜索请求由服务端代理转发，第三方数据源不会看到你的 IP 地址。
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">免责声明</h2>
          <p className="text-sm text-faint leading-relaxed">
            本站不存储、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力。
            请尊重版权，所有内容的合法性由对应数据源负责。
          </p>
        </section>
      </main>
      <SiteFooter />
      <BottomTabs />
    </div>
  );
}

export default function View() {
  return <AboutPage />;
}
