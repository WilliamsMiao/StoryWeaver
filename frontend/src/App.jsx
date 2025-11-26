import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import RoomCreation from './components/RoomCreation';
import GameRoom from './components/GameRoom';
import ConnectionStatus from './components/ConnectionStatus';
import ErrorBoundary from './components/ErrorBoundary';

/**
 * 路由守卫组件
 * 检查用户是否已设置用户名
 */
function ProtectedRoute({ children }) {
  const location = useLocation();
  const player = JSON.parse(localStorage.getItem('storyweaver_player') || 'null');
  
  // 如果访问房间页面但未设置用户名，重定向到首页
  if (location.pathname.startsWith('/room') && !player) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <GameProvider>
        <div className="min-h-screen bg-dark-bg">
          <ConnectionStatus />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<RoomCreation />} />
              <Route 
                path="/room/:roomId?" 
                element={
                  <ProtectedRoute>
                    <GameRoom />
                  </ProtectedRoute>
                } 
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </GameProvider>
    </ErrorBoundary>
  );
}

export default App;

