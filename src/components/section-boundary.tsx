'use client';

import { Component, type ReactNode } from 'react';
import { ErrorState } from './states';

/**
 * 区块级错误边界。
 *
 * 为什么需要它：Next 的 error.tsx 是「路由段」粒度的，一旦触发就把整页换掉。
 * 首页的轮播、横滑榜单都依赖豆瓣接口，接口抖动本应只影响自己那一条，
 * 却会把整页打成「页面出了点问题」。这里把每个区块单独包起来，
 * 崩溃只降级成该区块的一行提示，并允许单独重试。
 *
 * 同时把错误原文折叠显示出来（「查看原因」），
 * 线上排查时不用再翻浏览器控制台也能知道是哪一步炸的、报的什么错。
 */

interface Props {
  name: string;
  children: ReactNode;
  /** 自定义兜底内容，传了就不显示默认提示 */
  fallback?: ReactNode;
}

interface State {
  failed: boolean;
  /** 每次重试自增，作为子树 key，保证真的重建而不是复用坏掉的树 */
  attempt: number;
  message: string;
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0, message: '' };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
    return { failed: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error(`[${this.props.name}] 区块渲染失败:`, error, info.componentStack);
  }

  reset = () => {
    this.setState((prev) => ({ failed: false, attempt: prev.attempt + 1, message: '' }));
  };

  render() {
    if (!this.state.failed) {
      return <div key={this.state.attempt}>{this.props.children}</div>;
    }
    if (this.props.fallback) return <>{this.props.fallback}</>;

    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <ErrorState
          message={`「${this.props.name}」暂时没加载出来`}
          onRetry={this.reset}
          retryLabel="重新加载"
        />
        {this.state.message && (
          <details className="mt-1 text-center">
            <summary className="text-[11px] text-faint cursor-pointer hover:text-muted">
              查看原因
            </summary>
            <p className="mt-1 text-[11px] text-faint break-all max-w-xl mx-auto whitespace-pre-wrap">
              {this.state.message}
            </p>
          </details>
        )}
      </div>
    );
  }
}
