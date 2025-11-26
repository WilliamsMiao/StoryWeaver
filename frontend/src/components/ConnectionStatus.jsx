import { useState, useEffect } from 'react';
import socketManager from '../utils/socket';

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    // 初始检查连接状态
    const checkConnection = () => {
      const status = socketManager.getConnectionStatus();
      setConnected(status.connected);
    };
    
    // 初始检查（延迟一点，等待Socket初始化）
    const initialCheck = setTimeout(checkConnection, 500);
    
    const handleStatus = (status) => {
      setConnected(status.connected);
      // 如果状态显示正在重连，或者有reconnecting标志，显示重连状态
      setReconnecting(status.reconnecting || status.reconnected || false);
    };

    const handleError = (error) => {
      console.error('连接错误:', error);
      setConnected(false);
      setReconnecting(true); // 错误时显示重连状态
    };

    socketManager.on('connection_status', handleStatus);
    socketManager.on('connection_error', handleError);

    return () => {
      clearTimeout(initialCheck);
      socketManager.off('connection_status', handleStatus);
      socketManager.off('connection_error', handleError);
    };
  }, []);

  if (connected) {
    return null;
  }

  return (
    <div className="bg-pixel-accent-yellow border-b-4 border-pixel-wood-dark text-pixel-text px-4 py-2 text-center text-sm font-bold shadow-pixel">
      {reconnecting ? '🔄 正在重连...' : '❌ 连接断开，正在尝试重连...'}
    </div>
  );
}

