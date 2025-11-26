import { io } from 'socket.io-client';

class SocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.messageQueue = [];
    this.listeners = new Map();
    this.serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
  }
  
  connect() {
    if (this.socket?.connected) {
      return;
    }
    
    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity, // 无限重试
      timeout: 20000, // 连接超时20秒
      forceNew: false, // 复用连接
      autoConnect: true
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('✅ Socket连接成功');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.trigger('connection_status', { connected: true });
      this.flushMessageQueue();
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket断开连接:', reason);
      this.isConnected = false;
      
      // 某些断开原因不应该触发错误状态（如主动断开、ping超时等会自动重连）
      const shouldShowError = !['io server disconnect', 'ping timeout', 'transport close'].includes(reason);
      
      this.trigger('connection_status', { 
        connected: false, 
        reason,
        reconnecting: !shouldShowError // 如果是可自动重连的原因，显示重连状态
      });
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Socket连接错误:', error);
      this.reconnectAttempts++;
      // 连接错误时，Socket.io会自动重连，所以这里只记录，不设置connected=false
      // 避免在重连过程中显示错误状态
      this.trigger('connection_error', error);
    });
    
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Socket重连成功 (尝试 ${attemptNumber})`);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.trigger('connection_status', { connected: true, reconnected: true });
      // 重连后清空消息队列
      this.flushMessageQueue();
    });
    
    // 监听重连尝试
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 正在尝试重连 (第 ${attemptNumber} 次)...`);
      this.trigger('connection_status', { connected: false, reconnecting: true, attempt: attemptNumber });
    });
    
    this.socket.on('reconnect_failed', () => {
      console.error('❌ Socket重连失败');
      this.trigger('connection_error', new Error('重连失败'));
    });
  }
  
  // 注册事件监听器
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }
  
  // 移除事件监听器
  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
    
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
  
  // 发送Socket事件
  emit(event, data, callback) {
    if (this.isConnected && this.socket) {
      this.socket.emit(event, data, callback);
    } else {
      // 将消息加入队列
      this.messageQueue.push({ event, data, callback });
      console.warn('Socket未连接，消息已加入队列');
    }
  }
  
  // 清空消息队列
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const { event, data, callback } = this.messageQueue.shift();
      if (this.isConnected && this.socket) {
        this.socket.emit(event, data, callback);
      }
    }
  }
  
  // 触发自定义事件（用于通知React组件）
  trigger(eventName, data) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.messageQueue = [];
    }
  }
  
  getSocket() {
    return this.socket;
  }
  
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

export default new SocketManager();

