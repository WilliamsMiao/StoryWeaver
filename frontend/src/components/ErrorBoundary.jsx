import React from 'react';

/**
 * 错误边界组件
 * 捕获React组件树中的错误，显示友好的错误页面
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }
  
  static getDerivedStateFromError(error) {
    // 更新state，使下一次渲染能够显示降级后的UI
    return { hasError: true };
  }
  
  componentDidCatch(error, errorInfo) {
    // 记录错误信息
    console.error('错误边界捕获到错误:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });
    
    // 可以在这里将错误报告到错误监控服务
    // reportError(error, errorInfo);
  }
  
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };
  
  render() {
    if (this.state.hasError) {
      // 自定义降级后的UI
      return (
        <div className="min-h-screen bg-pixel-bg flex items-center justify-center p-4">
          <div className="card max-w-md w-full text-center bg-pixel-panel">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold mb-4 text-pixel-wood-dark">出现了一些问题</h1>
            <p className="text-dark-muted mb-6">
              应用程序遇到了一个错误。我们已经记录了这个问题，请尝试刷新页面。
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4 text-left">
                <summary className="cursor-pointer text-sm text-dark-muted mb-2">
                  错误详情（开发模式）
                </summary>
                <div className="bg-dark-card p-3 rounded text-xs overflow-auto max-h-40">
                  <div className="text-red-400 mb-2">
                    {this.state.error.toString()}
                  </div>
                  {this.state.errorInfo && (
                    <pre className="text-dark-muted whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="btn-primary flex-1"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn-secondary flex-1"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    return this.props.children;
  }
}

export default ErrorBoundary;
