import View from './view';

// 访问门槛（后台「站点设置 → 谁可以看」）由 middleware 在请求时判定。
// 页面若被整页预渲染成静态 HTML，命中静态缓存后就不再经过 middleware，
// 门槛会失效；这里由服务端组件显式声明按请求渲染，业务逻辑仍在 view.tsx（客户端）。
export const dynamic = 'force-dynamic';

export default function Page() {
  return <View />;
}
