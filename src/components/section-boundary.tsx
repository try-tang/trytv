'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 局部错误边界。
 *
 * 首页推荐位依赖豆瓣 / Bangumi 这类外部接口，抖一下就会在渲染期抛错。
 * 之前没有边界，一处出错整个首页被 error.tsx 接管（「页面出了点问题」），
 * 用户看到的是一整页报错 —— 现在只把这一个区块降级成一句提示，
 * 其余内容（搜索框、其它片单）照常可用。
 */
interface Props {
  /** 区块名，用于提示文案与日志定位 */
  name: string;
  children: ReactNode;
  /** 出错时展示的紧凑占位（可选，默认一句话） */
  fallback?: ReactNode;
}

interface State {
  failed: boolean;
  /** 重试次数：用于给 children 换 key，强制重新挂载 */
  attempt: number;
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] 区块渲染失败:`, error, info.componentStack);
  }

  private reset = () => {
    this.setState((prev) => ({ failed: false, attempt: prev.attempt + 1 }));
  };

  render() {
    if (this.state.failed) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-0">
          <div className="rounded-xl border border-line bg-card px-4 py-6 text-center">
            <p className="text-sm text-muted">「{this.props.name}」暂时没加载出来</p>
            <button type="button" onClick={this.reset} className="btn btn-ghost btn-sm mt-3">
              重新加载
            </button>
          </div>
        </div>
      );
    }
    // 用 key 让重试真的重建子树
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

export default SectionBoundary;
