/**
 * 像素风格加载组件
 */
export default function PixelLoader({ text = '加载中', size = 'md' }) {
  const sizeClasses = {
    sm: 'w-4 h-1',
    md: 'w-6 h-1.5',
    lg: 'w-8 h-2'
  };
  
  const dotSize = sizeClasses[size] || sizeClasses.md;
  
  return (
    <div className="flex flex-col items-center gap-3">
      {/* 像素风格进度条 */}
      <div className="flex gap-1">
        <div 
          className={`${dotSize} bg-pixel-accent-blue animate-pulse`}
          style={{ animationDelay: '0ms', animationDuration: '0.6s' }}
        ></div>
        <div 
          className={`${dotSize} bg-pixel-accent-blue animate-pulse`}
          style={{ animationDelay: '150ms', animationDuration: '0.6s' }}
        ></div>
        <div 
          className={`${dotSize} bg-pixel-accent-blue animate-pulse`}
          style={{ animationDelay: '300ms', animationDuration: '0.6s' }}
        ></div>
        <div 
          className={`${dotSize} bg-pixel-accent-yellow animate-pulse`}
          style={{ animationDelay: '450ms', animationDuration: '0.6s' }}
        ></div>
        <div 
          className={`${dotSize} bg-pixel-accent-green animate-pulse`}
          style={{ animationDelay: '600ms', animationDuration: '0.6s' }}
        ></div>
      </div>
      
      {/* 加载文字 */}
      {text && (
        <p className="text-pixel-wood-dark font-bold text-sm flex items-center gap-1">
          {text}
          <span className="inline-flex">
            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '200ms' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '400ms' }}>.</span>
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * 全屏像素加载器
 */
export function FullPagePixelLoader({ text = '加载中', icon = '📖' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-pixel-bg">
      <div className="text-center card bg-pixel-panel p-8">
        {/* 图标动画 */}
        <div className="text-5xl mb-4 animate-bounce" style={{ animationDuration: '1.5s' }}>
          {icon}
        </div>
        
        {/* 像素进度条 */}
        <div className="mb-4">
          
          {/* 进度条容器 */}
          <div className="w-48 h-3 bg-pixel-wood-dark/30 border-2 border-pixel-wood-dark mx-auto overflow-hidden">
            <div 
              className="h-full bg-pixel-accent-blue"
              style={{
                animation: 'pixelProgress 1.5s ease-in-out infinite'
              }}
            ></div>
          </div>
        </div>
        
        {/* 加载文字 */}
        <div className="text-lg font-bold text-pixel-wood-dark">
          {text}
        </div>
      </div>
      
      {/* 动画样式 */}
      <style>{`
        @keyframes pixelProgress {
          0% { 
            width: 0%; 
            margin-left: 0;
          }
          50% { 
            width: 60%; 
            margin-left: 20%;
          }
          100% { 
            width: 0%; 
            margin-left: 100%;
          }
        }
      `}</style>
    </div>
  );
}
