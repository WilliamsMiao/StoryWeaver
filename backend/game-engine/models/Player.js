export class Player {
  constructor({ id, username, role = 'player', stats = {} }) {
    this.id = id;
    this.username = username;
    this.role = role;
    this.stats = {
      totalStories: stats.totalStories || 0,
      totalChapters: stats.totalChapters || 0,
      ...stats
    };
    this.joinedAt = new Date();
    this.isOnline = true;
    this.lastActiveAt = new Date();
  }
  
  /**
   * 更新在线状态
   */
  updateOnlineStatus(isOnline) {
    this.isOnline = isOnline;
    if (isOnline) {
      this.lastActiveAt = new Date();
    }
  }
  
  /**
   * 更新最后活动时间
   */
  updateLastActive() {
    this.lastActiveAt = new Date();
    this.isOnline = true;
  }
  
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      role: this.role,
      stats: this.stats,
      joinedAt: this.joinedAt,
      isOnline: this.isOnline,
      lastActiveAt: this.lastActiveAt
    };
  }
}

